/**
 * ProductCard Processor — рендеринг сайдбара товарной карточки
 *
 * Использует опубликованный Figma-компонент EProductCard.
 *
 * IMPORTANT: Sublayer instances inside component instances have fragile IDs.
 * Modifying text in one sublayer can invalidate IDs of sibling sublayers.
 * All findOne/findAll callbacks MUST use try-catch to handle stale nodes.
 * ItemsList (SLOT with multiple EOfferItem sublayers) must be processed LAST.
 */

import { Logger } from '../../logger';
import { safeSetTextNode } from '../../utils/node-search';
import { fetchAndApplyImage } from '../image-apply';
import type { ProductCardPayload } from '../../types/wizard-types';

const EPRODUCT_CARD_KEY = '0dc66339607f6612b33cfb4fea50673c7ffc937f';

const EOFFER_ITEM_KEY = 'ad30904f3637a4c14779a366e56b8d6173bbd78b';

// Safe wrappers for findOne/findAll that handle stale sublayer nodes
function safeFindOne(parent: InstanceNode, predicate: (n: SceneNode) => boolean): SceneNode | null {
  try {
    return parent.findOne(function (n: SceneNode) {
      try {
        return predicate(n);
      } catch (_e) {
        return false;
      }
    });
  } catch (_e) {
    return null;
  }
}

function safeFindAll(parent: InstanceNode, predicate: (n: SceneNode) => boolean): SceneNode[] {
  try {
    return parent.findAll(function (n: SceneNode) {
      try {
        return predicate(n);
      } catch (_e) {
        return false;
      }
    });
  } catch (_e) {
    return [];
  }
}

/**
 * Рендерит ProductCard сайдбар используя опубликованный Figma-компонент.
 */
export async function renderProductCard(
  data: ProductCardPayload,
  platform: 'desktop' | 'touch',
): Promise<InstanceNode | null> {
  if (!data) {
    Logger.error('[ProductCard] No data provided, skipping');
    return null;
  }
  if (!data.title) {
    Logger.error('[ProductCard] Empty title, skipping. Keys: ' + Object.keys(data).join(', '));
    return null;
  }

  Logger.info('[ProductCard] Rendering: "' + data.title.substring(0, 40) + '"');

  let instance: InstanceNode;
  try {
    const component = await figma.importComponentByKeyAsync(EPRODUCT_CARD_KEY);
    instance = component.createInstance();
    instance.name = 'EProductCard — ' + data.title.substring(0, 30);
  } catch (e) {
    Logger.error('[ProductCard] importComponentByKeyAsync failed: ' + String(e));
    return null;
  }

  try {
    instance.setProperties({ platform: platform });
  } catch (_e) {
    Logger.debug('[ProductCard] Failed to set platform variant');
  }

  // === Boolean properties FIRST — toggles slot visibility ===
  setBooleanProperties(instance, data);

  // === Title ===
  try {
    const titleInst = findDirectChild(instance, 'Title');
    if (titleInst && titleInst.type === 'INSTANCE') {
      titleInst.setProperties({ 'titleText#31652:0': data.title });
    }
  } catch (_e) {
    Logger.debug('[ProductCard] Failed to set titleText');
  }

  // === PreviewGallery (images) ===
  if (data.images && data.images.length > 0) {
    try {
      const gallery = findDirectChild(instance, 'PreviewGallery');
      if (gallery && 'children' in gallery) {
        await fillPreviewGallery(gallery, data.images);
      }
    } catch (e) {
      Logger.error('[ProductCard] Gallery failed: ' + String(e));
    }
  }

  // === Default offer (EOfferItem — direct child) ===
  if (data.defaultOffer) {
    try {
      const defaultOffer = findDirectChild(instance, 'EOfferItem');
      if (defaultOffer && defaultOffer.type === 'INSTANCE') {
        await fillOfferDirect(defaultOffer, data.defaultOffer as Record<string, string>, false);
      }
    } catch (e) {
      Logger.error('[ProductCard] Default offer failed: ' + String(e));
    }
  }

  // === Specs (use direct child — name is literally "EProductSpecs, EProductSpecsFull") ===
  if (data.specs && data.specs.length > 0) {
    try {
      const specsInst = findDirectChild(instance, 'EProductSpecs, EProductSpecsFull');
      if (specsInst) {
        await fillSpecs(specsInst, data.specs);
      } else {
        Logger.info('[ProductCard] Specs node not found among direct children');
      }
    } catch (e) {
      Logger.error('[ProductCard] Specs failed: ' + String(e));
    }
  }

  // === Reviews ===
  if (data.reviewCount) {
    try {
      const reviewInst = findDirectChild(instance, 'ReviewSummarization');
      if (reviewInst) {
        await fillReviewTitle(reviewInst, data.reviewCount);
      }
    } catch (e) {
      Logger.error('[ProductCard] Reviews failed: ' + String(e));
    }
  }

  // === Average Price ===
  if (data.avgPriceRange && data.avgPriceRange.from) {
    try {
      await fillAvgPrice(instance, data.avgPriceRange);
    } catch (e) {
      Logger.error('[ProductCard] AvgPrice failed: ' + String(e));
    }
  }

  // === ItemsList LAST — modifying sublayer offers invalidates sibling IDs ===
  if (data.offers && data.offers.length > 0) {
    try {
      await fillItemsList(instance, data.offers);
    } catch (e) {
      Logger.error('[ProductCard] ItemsList failed: ' + String(e));
    }
  }

  return instance;
}

// ============================================================================
// PREVIEW GALLERY
// ============================================================================

async function fillPreviewGallery(gallery: SceneNode, images: string[]): Promise<void> {
  if (!('children' in gallery)) return;

  let thumbContainer: SceneNode | null = null;
  for (const child of (gallery as FrameNode).children) {
    if (child.type === 'FRAME') {
      thumbContainer = child;
      break;
    }
  }
  if (!thumbContainer) thumbContainer = gallery;
  if (!('findAll' in thumbContainer)) return;

  const thumbInstances = safeFindAll(thumbContainer as InstanceNode, function (n) {
    return n.type === 'INSTANCE' && n.name === 'EThumb';
  }) as InstanceNode[];

  Logger.info(
    '[ProductCard] Gallery: ' + thumbInstances.length + ' EThumb, ' + images.length + ' images',
  );

  const maxImages = Math.min(images.length, thumbInstances.length);
  let applied = 0;
  for (let i = 0; i < maxImages; i++) {
    try {
      await applyImageToNode(thumbInstances[i], images[i]);
      applied++;
    } catch (e) {
      Logger.error('[ProductCard] Thumb ' + i + ' failed: ' + String(e));
    }
  }
  Logger.info('[ProductCard] Gallery applied: ' + applied + '/' + maxImages);
}

// ============================================================================
// ITEMS LIST — create offers in SLOT, reorder between Title and Button, hide old
// ============================================================================

async function fillItemsList(
  rootInstance: InstanceNode,
  offers: Array<Record<string, string>>,
): Promise<void> {
  const slot = findDirectChild(rootInstance, 'ItemsList');
  if (!slot || !('children' in slot)) {
    Logger.error('[ProductCard] ItemsList slot not found');
    return;
  }

  const slotFrame = slot as FrameNode;

  // Read slot dimensions for sizing
  let slotWidth = 0;
  try {
    slotWidth = slotFrame.width;
  } catch (_e) {
    /* fallback */
  }

  // 1. Import EOfferItem from library
  let offerComponent: ComponentNode;
  try {
    offerComponent = await figma.importComponentByKeyAsync(EOFFER_ITEM_KEY);
  } catch (e) {
    Logger.error('[ProductCard] Failed to load EOfferItem: ' + String(e));
    return;
  }

  // 2. Append fresh instances to SLOT (while it's still valid!)
  const newInstances: InstanceNode[] = [];
  for (let i = 0; i < offers.length; i++) {
    try {
      const inst = offerComponent.createInstance();
      slotFrame.appendChild(inst);

      if (slotWidth > 0) {
        try {
          inst.resize(slotWidth, inst.height);
        } catch (_e) {
          /* skip */
        }
      }
      try {
        inst.layoutSizingHorizontal = 'FILL';
      } catch (_e) {
        /* no auto-layout */
      }

      await fillOfferDirect(inst, offers[i], false);
      newInstances.push(inst);
    } catch (e) {
      Logger.error('[ProductCard] Offer ' + i + ' failed: ' + String(e));
      break;
    }
  }

  // 3. Reorder: move new instances right after Title (index 0)
  //    Insert in reverse so they end up in correct order at index 1
  let reordered = 0;
  for (let i = newInstances.length - 1; i >= 0; i--) {
    try {
      slotFrame.insertChild(1, newInstances[i]);
      reordered++;
    } catch (_e) {
      break;
    }
  }

  // 4. Hide old sublayer children: "list" and anything else before our offers
  //    (Title stays visible, Control/Button stays at end)
  let hidden = 0;
  for (const child of slotFrame.children) {
    try {
      if (child.name === 'list') {
        child.visible = false;
        hidden++;
      }
    } catch (_e) {
      /* sublayer invalidated */
    }
  }

  Logger.info(
    '[ProductCard] ItemsList: created=' +
      newInstances.length +
      '/' +
      offers.length +
      ', reordered=' +
      reordered +
      ', listHidden=' +
      hidden,
  );
}

// ============================================================================
// SPECS
// ============================================================================

async function fillSpecs(
  specsInst: SceneNode,
  specs: Array<{ name: string; value: string }>,
): Promise<void> {
  if (!('children' in specsInst)) return;

  // Find the "Parameters" frame — it's a direct child of the specs component
  let parametersFrame: FrameNode | null = null;
  for (const child of (specsInst as FrameNode).children) {
    try {
      if (child.name === 'Parameters' && child.type === 'FRAME') {
        parametersFrame = child as FrameNode;
        break;
      }
    } catch (_e) {
      /* stale */
    }
  }

  if (!parametersFrame) {
    Logger.info('[ProductCard] Specs: Parameters frame not found');
    return;
  }

  // Find "-line" instances inside Parameters
  const specLines: InstanceNode[] = [];
  for (const child of parametersFrame.children) {
    try {
      if (child.type === 'INSTANCE' && child.name.indexOf('-line') !== -1) {
        specLines.push(child);
      }
    } catch (_e) {
      /* stale */
    }
  }

  const maxSpecs = Math.min(specs.length, specLines.length);
  Logger.info('[ProductCard] Specs: ' + specLines.length + ' lines, ' + specs.length + ' specs');

  for (let i = 0; i < maxSpecs; i++) {
    try {
      const line = specLines[i];

      // Make hidden lines visible
      if (!line.visible) {
        try {
          line.visible = true;
        } catch (_e) {
          /* skip */
        }
      }

      // Structure: Name(FRAME) > Row(FRAME) > Text(TEXT) and Value(TEXT)
      let nameSet = false;
      let valueSet = false;

      for (const child of line.children) {
        try {
          if (child.name === 'Value' && child.type === 'TEXT') {
            await safeSetTextNode(child as TextNode, specs[i].value);
            valueSet = true;
          } else if (child.name === 'Name' && 'children' in child) {
            const nameFrame = child as FrameNode;
            for (const nameChild of nameFrame.children) {
              try {
                if (nameChild.name === 'Row' && 'children' in nameChild) {
                  for (const rowChild of (nameChild as FrameNode).children) {
                    try {
                      if (rowChild.type === 'TEXT') {
                        await safeSetTextNode(rowChild as TextNode, specs[i].name);
                        nameSet = true;
                        break;
                      }
                    } catch (_e) {
                      /* stale */
                    }
                  }
                }
              } catch (_e) {
                /* stale */
              }
              if (nameSet) break;
            }
          }
        } catch (_e) {
          /* stale */
        }
      }

      if (!nameSet || !valueSet) {
        Logger.debug('[ProductCard] Spec ' + i + ': name=' + nameSet + ', value=' + valueSet);
      }
    } catch (_e) {
      Logger.debug('[ProductCard] Spec ' + i + ' failed');
    }
  }
}

// ============================================================================
// REVIEWS
// ============================================================================

async function fillReviewTitle(reviewInst: SceneNode, reviewCount: string): Promise<void> {
  if (!('findAll' in reviewInst)) return;

  // Try component property first
  const titleChild = findDirectChild(reviewInst, 'Title');
  if (titleChild && titleChild.type === 'INSTANCE') {
    try {
      titleChild.setProperties({ 'titleText#31652:0': 'Отзывы · ' + reviewCount });
      Logger.info('[ProductCard] Reviews: set titleText property');
      return;
    } catch (_e) {
      Logger.debug('[ProductCard] Reviews: titleText property failed, trying text nodes');
    }
  }

  // Fallback: find text nodes and fill directly
  const textNodes = safeFindAll(reviewInst as InstanceNode, function (n) {
    return n.type === 'TEXT';
  }) as TextNode[];

  for (const tn of textNodes) {
    try {
      const currentText = tn.characters;
      if (/^\d/.test(currentText) || currentText === '0' || currentText.includes('Отзыв')) {
        await safeSetTextNode(tn, reviewCount);
        Logger.info('[ProductCard] Reviews: set count "' + reviewCount + '" in "' + tn.name + '"');
        return;
      }
    } catch (_e) {
      /* stale */
    }
  }

  Logger.info('[ProductCard] Reviews: ' + textNodes.length + ' text nodes, none matched for count');
}

// ============================================================================
// AVERAGE PRICE
// ============================================================================

async function fillAvgPrice(
  rootInstance: InstanceNode,
  range: { from: string; to: string },
): Promise<void> {
  // EPriceBarometerLegend is inside a "Frame" direct child of rootInstance
  // Structure: Frame > EPriceBarometerLegend > ... > #OrganicPrice (TEXT) x2
  // We need to find the two #OrganicPrice text nodes and fill them

  const priceNodes: TextNode[] = [];

  // Search through direct children for a Frame containing EPriceBarometerLegend
  for (const child of rootInstance.children) {
    try {
      if (child.type !== 'FRAME' || !('children' in child)) continue;
      const frame = child as FrameNode;
      for (const grandchild of frame.children) {
        try {
          if (grandchild.name.indexOf('PriceBarometer') === -1) continue;
          if (!('findAll' in grandchild)) continue;
          // Found EPriceBarometerLegend — search for #OrganicPrice text nodes
          const texts = (grandchild as InstanceNode).findAll(function (n) {
            try {
              return n.type === 'TEXT' && n.name === '#OrganicPrice';
            } catch (_e) {
              return false;
            }
          }) as TextNode[];
          for (const t of texts) priceNodes.push(t);
        } catch (_e) {
          /* stale */
        }
      }
    } catch (_e) {
      /* stale */
    }
  }

  if (priceNodes.length >= 2) {
    try {
      await safeSetTextNode(priceNodes[0], range.from);
    } catch (_e) {
      /* stale */
    }
    try {
      await safeSetTextNode(priceNodes[1], range.to);
    } catch (_e) {
      /* stale */
    }
    Logger.info('[ProductCard] AvgPrice: filled ' + range.from + ' — ' + range.to);
  } else if (priceNodes.length === 1) {
    try {
      await safeSetTextNode(priceNodes[0], range.from + ' — ' + range.to);
    } catch (_e) {
      /* stale */
    }
    Logger.info('[ProductCard] AvgPrice: filled 1 node with range');
  } else {
    Logger.info('[ProductCard] AvgPrice: no #OrganicPrice nodes found');
  }
}

// ============================================================================
// BOOLEAN PROPERTIES
// ============================================================================

function setBooleanProperties(instance: InstanceNode, data: ProductCardPayload): void {
  const props: Record<string, boolean> = {
    'defaultOffer#22491:4': !!data.defaultOffer,
    'prices#22491:12': !!(data.offers && data.offers.length > 0),
    'specs#22491:16': !!(data.specs && data.specs.length > 0),
    'alice#22491:20': false,
    'ugc#22491:24': !!data.reviewCount,
    'avgPrice#30292:0': !!(data.avgPriceRange && data.avgPriceRange.from),
    'findCheaper#30292:6': !!data.findCheaper,
  };

  try {
    instance.setProperties(props);
  } catch (_e) {
    Logger.debug('[ProductCard] Batch setProperties failed, trying one by one');
    for (const key of Object.keys(props)) {
      try {
        instance.setProperties({ [key]: props[key] });
      } catch (_e2) {
        Logger.debug('[ProductCard] Failed to set ' + key);
      }
    }
  }
}

// ============================================================================
// FILL OFFER
// ============================================================================

async function fillOfferDirect(
  offer: InstanceNode,
  row: Record<string, string>,
  skipBooleans: boolean = false,
): Promise<void> {
  const hasDiscount = !!(row['#OldPrice'] || row['#EPriceGroup_OldPrice'] === 'true');

  const textMap: Record<string, string> = {};
  if (row['#ShopName']) textMap['#ShopName'] = row['#ShopName'];
  if (row['#OrganicPrice']) textMap['#OrganicPrice'] = row['#OrganicPrice'];
  if (row['#OrganicTitle']) textMap['#OrganicTitle'] = row['#OrganicTitle'];

  // Always overwrite old price / discount — clear template values when no discount
  textMap['#OldPrice'] = hasDiscount ? row['#OldPrice'] || '' : ' ';
  textMap['#discount'] = hasDiscount ? row['#discount'] || '' : ' ';

  const names = Object.keys(textMap);
  if (names.length > 0) {
    const textNodes = safeFindAll(offer, function (n) {
      return n.type === 'TEXT' && names.indexOf(n.name) !== -1;
    }) as TextNode[];
    for (const tn of textNodes) {
      try {
        await safeSetTextNode(tn, textMap[tn.name]);
      } catch (_e) {
        /* stale node */
      }
    }
  }

  // Hide discount container when no discount
  if (!hasDiscount) {
    try {
      const discountFrame = safeFindOne(offer, function (n) {
        return n.type === 'FRAME' && n.name === 'Discount + Old Price';
      });
      if (discountFrame) {
        try {
          discountFrame.visible = false;
        } catch (_e) {
          /* sublayer */
        }
      }
    } catch (_e) {
      /* skip */
    }
  }

  // Hide fintech container when no fintech
  const hasFintech = !!row['#EPriceGroup_Fintech'];
  if (!hasFintech) {
    try {
      const fintechFrame = safeFindOne(offer, function (n) {
        return n.type === 'FRAME' && n.name === 'EPriceGroup-Fintech';
      });
      if (fintechFrame) {
        try {
          fintechFrame.visible = false;
        } catch (_e) {
          /* sublayer */
        }
      }
    } catch (_e) {
      /* skip */
    }
  }

  // Rating + review count
  try {
    const reviewsLabel = safeFindOne(offer, function (n) {
      return n.type === 'INSTANCE' && n.name === 'EReviewsLabel';
    });
    if (reviewsLabel && 'findAll' in reviewsLabel) {
      const titles = safeFindAll(reviewsLabel as InstanceNode, function (n) {
        return n.type === 'TEXT' && n.name === 'Title';
      }) as TextNode[];
      if (titles.length >= 1 && (row['#ShopRating'] || row['#ShopInfo-Ugc'])) {
        await safeSetTextNode(titles[0], row['#ShopRating'] || row['#ShopInfo-Ugc']);
      }
      if (titles.length >= 2 && row['#EReviews_shopText']) {
        await safeSetTextNode(titles[1], row['#EReviews_shopText']);
      }
    }
  } catch (_e) {
    /* skip */
  }

  // Delivery items
  try {
    const deliveryNodes = safeFindAll(offer, function (n) {
      return n.type === 'TEXT' && n.name === '#EDeliveryGroup-Item';
    }) as TextNode[];
    for (let di = 0; di < deliveryNodes.length; di++) {
      const fieldKey = '#EDeliveryGroup-Item-' + (di + 1);
      if (row[fieldKey]) {
        await safeSetTextNode(deliveryNodes[di], row[fieldKey]);
      }
    }
  } catch (_e) {
    /* skip */
  }

  // Boolean + variant properties
  if (!skipBooleans) {
    const isCheckout =
      row['#ButtonType'] === 'checkout' ||
      row['#ButtonView'] === 'primaryShort' ||
      row['#ButtonView'] === 'primaryLong';
    const boolProps: Record<string, boolean | string> = {
      'withDelivery#22266:53': !!(row['#EDeliveryGroup'] || row['#DeliveryList']),
      'withButton#22266:51': !!(row['#BUTTON'] && row['#BUTTON'] !== 'false'),
      'withReviews#22266:52': !!(
        row['#ShopRating'] ||
        row['#ShopInfo-Ugc'] ||
        row['#EReviews_shopText']
      ),
      'withFintech#22266:54': hasFintech,
      'withTitle#22448:10': !!row['#OrganicTitle'],
      'Brand#22092:0': false,
      'Price Disclaimer#22266:55': false,
      type: isCheckout ? 'offerMain' : 'offerPrices',
    };
    try {
      offer.setProperties(boolProps);
    } catch (_e) {
      for (const key of Object.keys(boolProps)) {
        try {
          offer.setProperties({ [key]: boolProps[key] });
        } catch (_) {
          /* skip */
        }
      }
    }
  }

  // Favicon image
  if (row['#FaviconImage']) {
    try {
      const faviconNode = safeFindOne(offer, function (n) {
        return n.name === '#FaviconImage' || n.name === 'Favicon';
      });
      if (faviconNode) {
        await applyImageToNode(faviconNode, row['#FaviconImage']);
      }
    } catch (_e) {
      /* skip */
    }
  }

  // EPriceBarometer view variant
  if (row['#EPriceBarometer_View']) {
    try {
      const baro = safeFindOne(offer, function (n) {
        return n.type === 'INSTANCE' && n.name === 'EPriceBarometer';
      }) as InstanceNode | null;
      if (baro) {
        try {
          baro.setProperties({ view: row['#EPriceBarometer_View'] });
        } catch (_e) {
          /* sublayer variant */
        }
      }
    } catch (_e) {
      /* skip */
    }
  }
}

// ============================================================================
// IMAGE
// ============================================================================

async function applyImageToNode(node: SceneNode, url: string): Promise<void> {
  const target = findFillableTarget(node);
  if (!target) {
    Logger.info(
      '[ProductCard] Image: no fillable target in ' + node.name + ' (type=' + node.type + ')',
    );
    return;
  }
  await fetchAndApplyImage(target as unknown as SceneNode, url, 'FIT', '[ProductCard]');
}

function findFillableTarget(node: SceneNode): GeometryMixin | null {
  // Direct geometry node
  if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'POLYGON') {
    return node as unknown as GeometryMixin;
  }

  if (!('children' in node)) {
    if ('fills' in node) return node as unknown as GeometryMixin;
    return null;
  }

  const frame = node as FrameNode;

  // Priority 1: search for #OrganicImage by name (any depth, up to 3 levels)
  const named = findNodeByName(frame, '#OrganicImage', 3);
  if (named && 'fills' in named) return named as unknown as GeometryMixin;

  // Priority 2: first RECTANGLE/ELLIPSE in direct children
  for (const child of frame.children) {
    try {
      if (child.type === 'RECTANGLE') return child as unknown as GeometryMixin;
      if (child.type === 'ELLIPSE') return child as unknown as GeometryMixin;
    } catch (_e) {
      /* stale sublayer */
    }
  }

  // Priority 3: deeper search (2 levels)
  for (const child of frame.children) {
    try {
      if ('children' in child) {
        for (const grandchild of (child as FrameNode).children) {
          try {
            if (grandchild.type === 'RECTANGLE') return grandchild as unknown as GeometryMixin;
            if (grandchild.type === 'ELLIPSE') return grandchild as unknown as GeometryMixin;
          } catch (_e) {
            /* stale */
          }
        }
      }
    } catch (_e) {
      /* stale */
    }
  }

  // Fallback: use the frame itself
  if ('fills' in node) return node as unknown as GeometryMixin;
  return null;
}

function findNodeByName(parent: FrameNode, name: string, maxDepth: number): SceneNode | null {
  if (maxDepth <= 0) return null;
  for (const child of parent.children) {
    try {
      if (child.name === name) return child;
      if ('children' in child) {
        const found = findNodeByName(child as FrameNode, name, maxDepth - 1);
        if (found) return found;
      }
    } catch (_e) {
      /* stale */
    }
  }
  return null;
}

// ============================================================================
// TREE HELPERS
// ============================================================================

function findDirectChild(parent: SceneNode, name: string): SceneNode | null {
  if (!('children' in parent)) return null;
  for (const child of (parent as FrameNode).children) {
    try {
      if (child.name === name) return child;
    } catch (_e) {
      /* stale sublayer */
    }
  }
  return null;
}
