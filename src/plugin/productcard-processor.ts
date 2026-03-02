/**
 * ProductCard Processor — рендеринг сайдбара товарной карточки
 *
 * Создаёт фрейм с заголовком, галереей и EOfferItem инстансами,
 * заполненными через существующий handler pipeline.
 */

import { Logger } from '../logger';
import { handlerRegistry } from '../handlers/registry';
import type { HandlerContext } from '../handlers/types';
import { buildInstanceCache } from '../utils/instance-cache';
import type { ProductCardPayload } from '../types/wizard-types';
import type { CSVRow } from '../types/csv-fields';

// EOfferItem component key (desktop, View=Btn Right)
var EOFFER_ITEM_KEY = 'ad30904f3637a4c14779a366e56b8d6173bbd78b';

// Sidebar width matching production (approx 420px)
var SIDEBAR_WIDTH = 420;

/**
 * Рендерит ProductCard сайдбар — основной фрейм с предложениями.
 */
export async function renderProductCard(
  data: ProductCardPayload,
  platform: 'desktop' | 'touch'
): Promise<FrameNode | null> {
  if (!data || !data.title) {
    Logger.debug('[ProductCard] No data or title, skipping');
    return null;
  }

  Logger.info('[ProductCard] Rendering sidebar: "' + data.title.substring(0, 40) + '"');

  // Main sidebar frame
  var sidebarFrame = figma.createFrame();
  sidebarFrame.name = 'EProductCard — ' + data.title.substring(0, 30);
  sidebarFrame.layoutMode = 'VERTICAL';
  sidebarFrame.primaryAxisSizingMode = 'AUTO';
  sidebarFrame.counterAxisSizingMode = 'FIXED';
  sidebarFrame.resize(SIDEBAR_WIDTH, 100);
  sidebarFrame.itemSpacing = 0;
  sidebarFrame.paddingTop = 16;
  sidebarFrame.paddingBottom = 16;
  sidebarFrame.paddingLeft = 16;
  sidebarFrame.paddingRight = 16;
  sidebarFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  sidebarFrame.cornerRadius = 16;

  // Load font for text nodes
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  } catch (_e) {
    try {
      await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
      await figma.loadFontAsync({ family: 'Roboto', style: 'Bold' });
    } catch (_e2) {
      Logger.debug('[ProductCard] Font loading failed, using defaults');
    }
  }

  // === Title ===
  var titleNode = figma.createText();
  titleNode.characters = data.title;
  titleNode.fontSize = 18;
  try { titleNode.fontName = { family: 'Inter', style: 'Bold' }; } catch (_e) { /* ignore */ }
  titleNode.fills = [{ type: 'SOLID', color: { r: 0.07, g: 0.07, b: 0.07 } }];
  sidebarFrame.appendChild(titleNode);
  titleNode.layoutSizingHorizontal = 'FILL';

  // === Rating ===
  if (data.rating) {
    var ratingNode = figma.createText();
    ratingNode.characters = '\u2605 ' + data.rating;
    ratingNode.fontSize = 14;
    ratingNode.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    sidebarFrame.appendChild(ratingNode);
    ratingNode.layoutSizingHorizontal = 'FILL';
  }

  // === Gallery (horizontal scroll of images) ===
  if (data.images && data.images.length > 0) {
    var galleryFrame = figma.createFrame();
    galleryFrame.name = 'Gallery';
    galleryFrame.layoutMode = 'HORIZONTAL';
    galleryFrame.primaryAxisSizingMode = 'AUTO';
    galleryFrame.counterAxisSizingMode = 'FIXED';
    galleryFrame.resize(SIDEBAR_WIDTH - 32, 80);
    galleryFrame.itemSpacing = 8;
    galleryFrame.fills = [];
    galleryFrame.clipsContent = true;

    var maxImages = Math.min(data.images.length, 6);
    for (var gi = 0; gi < maxImages; gi++) {
      try {
        var imgRect = figma.createRectangle();
        imgRect.name = 'Image ' + (gi + 1);
        imgRect.resize(80, 80);
        imgRect.cornerRadius = 8;
        var response = await figma.createImageAsync(data.images[gi]);
        imgRect.fills = [{ type: 'IMAGE', imageHash: response.hash, scaleMode: 'FILL' }];
        galleryFrame.appendChild(imgRect);
      } catch (_e) {
        Logger.debug('[ProductCard] Failed to load image ' + (gi + 1));
      }
    }

    sidebarFrame.appendChild(galleryFrame);
    galleryFrame.layoutSizingHorizontal = 'FILL';
  }

  // === Spacer ===
  appendSpacer(sidebarFrame, 16);

  // === Default Offer ===
  if (data.defaultOffer) {
    var defLabel = createSectionLabel('Лучшее предложение');
    sidebarFrame.appendChild(defLabel);
    defLabel.layoutSizingHorizontal = 'FILL';

    var defInstance = await createAndFillOffer(data.defaultOffer as CSVRow, platform);
    if (defInstance) {
      sidebarFrame.appendChild(defInstance);
      defInstance.layoutSizingHorizontal = 'FILL';
    }
  }

  // === Other Offers ===
  if (data.offers && data.offers.length > 0) {
    appendSpacer(sidebarFrame, 8);
    var offersLabel = createSectionLabel('Цены в магазинах (' + data.offers.length + ')');
    sidebarFrame.appendChild(offersLabel);
    offersLabel.layoutSizingHorizontal = 'FILL';

    for (var oi = 0; oi < data.offers.length; oi++) {
      var offerInstance = await createAndFillOffer(data.offers[oi] as CSVRow, platform);
      if (offerInstance) {
        sidebarFrame.appendChild(offerInstance);
        offerInstance.layoutSizingHorizontal = 'FILL';
      }
    }
  }

  // === Specs ===
  if (data.specs && data.specs.length > 0) {
    appendSpacer(sidebarFrame, 16);
    var specsLabel = createSectionLabel('Характеристики');
    sidebarFrame.appendChild(specsLabel);
    specsLabel.layoutSizingHorizontal = 'FILL';

    for (var si = 0; si < data.specs.length; si++) {
      var specText = figma.createText();
      specText.characters = data.specs[si].name + ': ' + data.specs[si].value;
      specText.fontSize = 12;
      specText.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
      sidebarFrame.appendChild(specText);
      specText.layoutSizingHorizontal = 'FILL';
    }
  }

  // === Reviews summary ===
  if (data.reviewCount) {
    appendSpacer(sidebarFrame, 16);
    var reviewLabel = createSectionLabel('Отзывы: ' + data.reviewCount);
    sidebarFrame.appendChild(reviewLabel);
    reviewLabel.layoutSizingHorizontal = 'FILL';

    if (data.aspects) {
      var prosText = data.aspects.pros.map(function(a) { return '+ ' + a.text + ' (' + a.count + ')'; }).join('\n');
      var consText = data.aspects.cons.map(function(a) { return '− ' + a.text + ' (' + a.count + ')'; }).join('\n');
      var aspectsStr = (prosText + '\n' + consText).trim();
      if (aspectsStr) {
        var aspectsNode = figma.createText();
        aspectsNode.characters = aspectsStr;
        aspectsNode.fontSize = 11;
        aspectsNode.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
        sidebarFrame.appendChild(aspectsNode);
        aspectsNode.layoutSizingHorizontal = 'FILL';
      }
    }
  }

  Logger.info('[ProductCard] Sidebar created: ' +
    (data.defaultOffer ? '1' : '0') + ' default + ' +
    (data.offers?.length || 0) + ' offers + ' +
    (data.specs?.length || 0) + ' specs');

  return sidebarFrame;
}

/**
 * Создаёт EOfferItem инстанс и заполняет через handler pipeline.
 */
async function createAndFillOffer(
  row: CSVRow,
  platform: 'desktop' | 'touch'
): Promise<InstanceNode | null> {
  try {
    var component = await figma.importComponentByKeyAsync(EOFFER_ITEM_KEY);
    var instance = component.createInstance();
    instance.name = 'EOfferItem';

    // Apply default variant
    try {
      instance.setProperties({
        'Platform': platform === 'desktop' ? 'Desktop' : 'Touch',
        'View': 'Btn Right',
        'withButton': true,
        'withMeta': true
      });
    } catch (_e) {
      Logger.debug('[ProductCard] Default variant set failed');
    }

    // Fill via existing handler pipeline
    var instanceCache = buildInstanceCache(instance);
    var context: HandlerContext = {
      container: instance,
      containerKey: instance.id,
      row: row,
      instanceCache: instanceCache
    };

    await handlerRegistry.executeAll(context);

    return instance;
  } catch (e) {
    Logger.debug('[ProductCard] Failed to create EOfferItem: ' + String(e));
    return null;
  }
}

function createSectionLabel(text: string): TextNode {
  var node = figma.createText();
  node.characters = text;
  node.fontSize = 14;
  try { node.fontName = { family: 'Inter', style: 'Bold' }; } catch (_e) { /* ignore */ }
  node.fills = [{ type: 'SOLID', color: { r: 0.07, g: 0.07, b: 0.07 } }];
  return node;
}

function appendSpacer(parent: FrameNode, height: number): void {
  var spacer = figma.createFrame();
  spacer.name = 'Spacer';
  spacer.resize(1, height);
  spacer.fills = [];
  parent.appendChild(spacer);
  spacer.layoutSizingHorizontal = 'FILL';
}
