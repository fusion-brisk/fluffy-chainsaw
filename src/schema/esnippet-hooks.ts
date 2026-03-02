/**
 * ESnippet Structural Hooks — императивные операции, которые нельзя
 * выразить декларативно через schema engine.
 *
 * Запускается ПОСЛЕ schema engine для ESnippet/Snippet контейнеров.
 */

import { Logger } from '../logger';
import {
  findFirstNodeByName,
  findTextLayerByName,
  safeSetTextNode
} from '../utils/node-search';
import type { HandlerContext } from '../handlers/types';
import type { CSVRow } from '../types/csv-fields';

/**
 * ESnippet structural hook — сайтлинки, промо-текст, EThumb fallback, clipsContent.
 */
export function handleESnippetStructural(context: HandlerContext): void {
  var container = context.container;
  var row = context.row;
  if (!container || !row) return;

  var containerName = (container && 'name' in container) ? String(container.name) : '';
  if (containerName !== 'ESnippet' && containerName !== 'Snippet') return;
  if (container.type !== 'INSTANCE' || container.removed) return;

  var instance = container as InstanceNode;

  // 1. EThumb visibility fallback
  applyThumbFallback(instance, row);

  // 2. Sitelinks: visibility + text filling
  applySitelinks(instance, row);

  // 3. Force-reset boolean properties that schema computed as false
  //    Workaround: setProperties silently fails for some booleans on certain variants
  //    IMPORTANT: only reset properties NOT managed by the schema engine to avoid
  //    variant conflicts that can break favicon/greenurl visibility
  forceResetBooleans(instance, row);

  // 4. Promo: visibility + text filling
  applyPromoSection(instance, row);

  // 5. Address link text
  applyAddressLink(instance, row);

  // 6. Title: limit to 3 lines with ellipsis
  applyTitleMaxLines(instance);

  // 7. content__left clipsContent
  applyClipsContentFix(instance);
}

/**
 * Если withThumb=false, принудительно скрываем EThumb-слой
 * (серый placeholder может оставаться видимым даже после свойства)
 */
function applyThumbFallback(instance: InstanceNode, row: CSVRow): void {
  if (row['#withThumb'] === 'true') return;

  var names = ['EThumb', 'Organic-OfferThumb', 'Thumb'];
  for (var i = 0; i < names.length; i++) {
    var layer = findFirstNodeByName(instance, names[i]);
    if (layer && 'visible' in layer) {
      try {
        (layer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug('   [ESnippet-hook] EThumb hidden (fallback)');
      } catch (_e) { Logger.debug('[ESnippet-hook] EThumb visibility toggle failed'); }
      return;
    }
  }
}

/**
 * Сайтлинки: visibility + text filling
 */
function applySitelinks(instance: InstanceNode, row: CSVRow): void {
  var sitelinksContainer =
    findFirstNodeByName(instance, 'Sitelinks') ||
    findFirstNodeByName(instance, 'Block / Snippet-staff / Sitelinks');

  // Hide sitelinks section when #Sitelinks is not 'true'
  if (row['#Sitelinks'] !== 'true') {
    // Try direct container first
    if (sitelinksContainer && 'visible' in sitelinksContainer) {
      try {
        (sitelinksContainer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug('   [ESnippet-hook] Sitelinks hidden (#Sitelinks!=true)');
      } catch (_e) { Logger.debug('[ESnippet-hook] Sitelinks container visibility toggle failed'); }
    }
    // Broader search: hide any descendant frame/instance with 'Sitelink' or 'sitelink' in name
    if ('findAll' in instance) {
      var sitelinkNodes = instance.findAll(function(n) {
        return n.name.indexOf('itelink') !== -1 && n.type !== 'TEXT';
      });
      for (var si = 0; si < sitelinkNodes.length; si++) {
        if ('visible' in sitelinkNodes[si]) {
          try { (sitelinkNodes[si] as SceneNode).visible = false; } catch (_e) { Logger.debug('[ESnippet-hook] Sitelink node visibility toggle failed'); }
        }
      }
    }
    return;
  }

  if (!sitelinksContainer) return;

  var texts: string[] = [];
  for (var i = 1; i <= 4; i++) {
    var text = ((row as any)['#Sitelink_' + i] || '').trim();
    if (text) texts.push(text);
  }
  if (texts.length === 0) return;

  // Named layers #Sitelink_N (after Figma rename, this is the only strategy needed)
  for (var j = 0; j < texts.length; j++) {
    var layer =
      findTextLayerByName(sitelinksContainer, '#Sitelink_' + (j + 1)) ||
      findTextLayerByName(sitelinksContainer, 'Sitelink_' + (j + 1));
    if (layer) {
      safeSetTextNode(layer, texts[j]);
    }
  }
}

/**
 * Force-reset specific boolean properties that schema engine's trySetProperty
 * silently fails to set on certain variant combinations.
 * Only targets known problematic properties — schema engine handles the rest.
 */
function forceResetBooleans(instance: InstanceNode, row: CSVRow): void {
  // Only force-set withPromo — known to silently fail via trySetProperty
  var hasPromo = !!((row['#Promo'] || '') as string).trim();
  if (hasPromo) return;

  var props = instance.componentProperties;
  for (var key in props) {
    if (key.split('#')[0] === 'withPromo' && props[key].type === 'BOOLEAN' && props[key].value !== false) {
      try {
        var obj: Record<string, boolean> = {};
        obj[key] = false;
        instance.setProperties(obj);
        Logger.debug('   [ESnippet-hook] withPromo force-set to false via ' + key);
      } catch (_e) {
        Logger.debug('   [ESnippet-hook] withPromo force-set FAILED for ' + key);
      }
      break;
    }
  }
}

/**
 * Промо-секция: visibility + text
 */
function applyPromoSection(instance: InstanceNode, row: CSVRow): void {
  var promoText = (row['#Promo'] || '').trim();
  var isPromo = row['#isPromo'] === 'true';

  // Find promo container for visibility control
  var promoContainer =
    findFirstNodeByName(instance, 'Promo') ||
    findFirstNodeByName(instance, 'PromoOffer') ||
    findFirstNodeByName(instance, 'InfoSection');

  // Hide promo section when no promo content
  if (!promoText && !isPromo) {
    if (promoContainer && 'visible' in promoContainer) {
      try {
        (promoContainer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug('   [ESnippet-hook] Promo hidden (no promo data)');
      } catch (_e) { Logger.debug('[ESnippet-hook] Promo container visibility toggle failed'); }
    }
    // Broader search: hide any descendant with 'Promo' or 'promo' in name
    if ('findAll' in instance) {
      var promoNodes = instance.findAll(function(n) {
        return (n.name.indexOf('romo') !== -1 || n.name.indexOf('InfoSection') !== -1) && n.type !== 'TEXT';
      });
      for (var pi = 0; pi < promoNodes.length; pi++) {
        if ('visible' in promoNodes[pi]) {
          try { (promoNodes[pi] as SceneNode).visible = false; } catch (_e) { Logger.debug('[ESnippet-hook] Promo node visibility toggle failed'); }
        }
      }
    }
    return;
  }

  // Set promo text if available (after Figma rename: #PromoText is the direct layer name)
  if (promoText) {
    var layer = findTextLayerByName(instance, '#PromoText');
    if (layer) {
      safeSetTextNode(layer, promoText);
      Logger.debug('   [ESnippet-hook] Promo text set');
    }
  }
}

/**
 * Address link: set #addressLink text on the address layer
 */
function applyAddressLink(instance: InstanceNode, row: CSVRow): void {
  var addressLink = (row['#addressLink'] || '').trim();
  if (!addressLink) return;

  // Direct text layer lookup (after Figma rename)
  var layer = findTextLayerByName(instance, '#addressLink');
  if (layer) {
    safeSetTextNode(layer, addressLink);
    Logger.debug('   [ESnippet-hook] addressLink set: "' + addressLink + '"');
    return;
  }

  // Fallback: Line instance inside Address container → set value property
  var addressContainer = findFirstNodeByName(instance, 'Address');
  if (addressContainer && 'findAll' in addressContainer) {
    var lineInstances = (addressContainer as FrameNode).findAll(function(n) {
      return n.type === 'INSTANCE' && n.name === 'Line';
    }) as InstanceNode[];

    for (var li = 0; li < lineInstances.length; li++) {
      try {
        lineInstances[li].setProperties({ value: addressLink });
        Logger.debug('   [ESnippet-hook] addressLink set via Line.value: "' + addressLink + '"');
        return;
      } catch (_e) { Logger.debug('[ESnippet-hook] addressLink Line.value set failed'); }
    }
  }
}

/**
 * Ограничение заголовка 3 строками с обрезкой
 */
function applyTitleMaxLines(instance: InstanceNode): void {
  var titleNode = findTextLayerByName(instance, '#OrganicTitle');
  if (!titleNode) return;
  try {
    titleNode.textTruncation = 'ENDING';
    titleNode.maxLines = 3;
  } catch (_e) {
    Logger.debug('[ESnippet-hook] Title maxLines set failed');
  }
}

/**
 * Отключаем clipsContent для content__left
 */
function applyClipsContentFix(instance: InstanceNode): void {
  var contentLeft = instance.findOne(function(n) { return n.name === 'content__left'; });
  if (contentLeft && contentLeft.type === 'FRAME' && !contentLeft.removed) {
    try {
      (contentLeft as FrameNode).clipsContent = false;
    } catch (_e) { Logger.debug('[ESnippet-hook] clipsContent toggle failed'); }
  }
}
