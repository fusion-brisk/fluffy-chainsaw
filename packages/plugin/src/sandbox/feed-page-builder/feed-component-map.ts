/**
 * Feed Component Map — FeedCardType -> Figma component set keys + variant selector
 *
 * Maps feed card data to the correct component variant in the DC Feed library
 * (file key: 0dr1G4gFr6q8enaEOR1YUW).
 *
 * ES5 sandbox: no optional chaining, no nullish coalescing.
 */

import { Logger } from '../../logger';
import { FeedCardRow, FeedCardSize, FeedCardType, FeedPlatform, FeedComponentVariant } from '../../types/feed-card-types';

// ============================================================================
// COMPONENT SET KEYS — DC Feed library
// ============================================================================

/**
 * Component SET keys (parent containers).
 * Individual variants are children with properties like Variant=N, Platform=Desktop|Mobile.
 */
var FEED_COMPONENT_SET_KEYS: Record<string, string> = {
  'post':            '0fdaa4594724de9e5aca70b24697acfe99c47069',
  'video':           '012cb3e9e93ac64676b2ba3e5f33ff3ac9b99061',
  'market':          '3b7e0b1f54a2cc8843efb69597158fd1ba0a1858',
  'advert_prod':     '66df545c9090c6776444d39306af1e3b34e7da41',
  'advert_examples': 'fa33e1ca52751009197bba25340780694e977cdf',
  'product':         '862ed09175edc1b277dd67b9686e753e5c51212d',
  'collection':      '0a973790f90a010df34a9f6509256b176bd611b3',
};

// ============================================================================
// VARIANT RANGE DEFINITIONS
// ============================================================================

interface VariantRange {
  min: number;
  max: number;
}

/**
 * Market: size -> variant range
 *   xs, s    -> 1-2  (small card, no description)
 *   m, ml    -> 3-6  (medium)
 *   l, xl    -> 7-8  (large with description)
 */
function getMarketVariantRange(size: FeedCardSize): VariantRange {
  if (size === 'xs' || size === 's') {
    return { min: 1, max: 2 };
  }
  if (size === 'm' || size === 'ml') {
    return { min: 3, max: 6 };
  }
  // l, xl
  return { min: 7, max: 8 };
}

/**
 * Post: carousel presence -> variant range
 *   with carousel    -> 1-4  (dots visible)
 *   without carousel -> 5-14
 */
function getPostVariantRange(row: FeedCardRow): VariantRange {
  var hasCarousel = row['#Feed_CarouselImages'] && row['#Feed_CarouselImages'] !== '[]';
  if (hasCarousel) {
    return { min: 1, max: 4 };
  }
  return { min: 5, max: 14 };
}

/**
 * Video: all sizes -> 1-5
 */
function getVideoVariantRange(): VariantRange {
  return { min: 1, max: 5 };
}

/**
 * Product: type -> variant range
 *   independent -> 1-7
 *   market      -> 8-21
 */
function getProductVariantRange(row: FeedCardRow): VariantRange {
  var productType = row['#Feed_ProductType'];
  if (productType === 'market') {
    return { min: 8, max: 21 };
  }
  // default to independent
  return { min: 1, max: 7 };
}

/**
 * Collection: all -> 1-4
 */
function getCollectionVariantRange(): VariantRange {
  return { min: 1, max: 4 };
}

/**
 * Advert: style determines which component set to use
 *   production (default) -> advert_prod, 1-6
 *   branded              -> advert_examples, 1-9
 * Returns { setKey, range }
 */
function getAdvertConfig(row: FeedCardRow): { setKey: string; range: VariantRange } {
  var adStyle = row['#Feed_AdStyle'];
  if (adStyle === 'branded') {
    return {
      setKey: FEED_COMPONENT_SET_KEYS['advert_examples'],
      range: { min: 1, max: 9 },
    };
  }
  // default: production
  return {
    setKey: FEED_COMPONENT_SET_KEYS['advert_prod'],
    range: { min: 1, max: 6 },
  };
}

// ============================================================================
// PUBLIC API — pure function (no Figma API)
// ============================================================================

/**
 * Select the correct feed variant based on card data.
 * Returns null if the card type is unknown.
 *
 * This is a pure function — no Figma API calls, safe for unit testing.
 */
export function selectFeedVariant(row: FeedCardRow): FeedComponentVariant | null {
  var cardType: FeedCardType = row['#Feed_CardType'];
  var size: FeedCardSize = row['#Feed_CardSize'];
  var platform: FeedPlatform = row['#Feed_Platform'] || 'desktop';

  var setKey: string;
  var range: VariantRange;

  switch (cardType) {
    case 'market': {
      setKey = FEED_COMPONENT_SET_KEYS['market'];
      range = getMarketVariantRange(size);
      break;
    }
    case 'video': {
      setKey = FEED_COMPONENT_SET_KEYS['video'];
      range = getVideoVariantRange();
      break;
    }
    case 'post': {
      setKey = FEED_COMPONENT_SET_KEYS['post'];
      range = getPostVariantRange(row);
      break;
    }
    case 'advert': {
      var advertCfg = getAdvertConfig(row);
      setKey = advertCfg.setKey;
      range = advertCfg.range;
      break;
    }
    case 'product': {
      setKey = FEED_COMPONENT_SET_KEYS['product'];
      range = getProductVariantRange(row);
      break;
    }
    case 'collection': {
      setKey = FEED_COMPONENT_SET_KEYS['collection'];
      range = getCollectionVariantRange();
      break;
    }
    default:
      Logger.debug('[FeedComponentMap] Unknown card type: ' + cardType);
      return null;
  }

  // Deterministic: always pick the first variant in range
  var variant = range.min;

  return {
    key: setKey,
    variant: variant,
    platform: platform,
    nodeId: '', // resolved at import time
  };
}

// ============================================================================
// FIGMA IMPORT — async, uses Figma API
// ============================================================================

/** Cache for imported component sets (setKey -> ComponentSetNode) */
var componentSetCache = new Map<string, ComponentSetNode>();

/** Timeout for component set import (ms) */
var IMPORT_TIMEOUT = 15000;

/**
 * Clear the feed component cache.
 */
export function clearFeedComponentCache(): void {
  componentSetCache.clear();
}

/**
 * Import a component set by key with timeout and caching.
 */
function importComponentSet(setKey: string): Promise<ComponentSetNode | null> {
  if (componentSetCache.has(setKey)) {
    return Promise.resolve(componentSetCache.get(setKey)!);
  }

  return Promise.race([
    figma.importComponentSetByKeyAsync(setKey),
    new Promise<never>(function(_, reject) {
      setTimeout(function() {
        reject(new Error('Import timeout after ' + IMPORT_TIMEOUT + 'ms'));
      }, IMPORT_TIMEOUT);
    }),
  ]).then(function(componentSet) {
    componentSetCache.set(setKey, componentSet);
    Logger.debug('[FeedComponentMap] Imported set: ' + componentSet.name + ' (key=' + setKey + ')');
    return componentSet;
  }).catch(function(e) {
    var msg = e instanceof Error ? e.message : String(e);
    Logger.error('[FeedComponentMap] Failed to import set (key=' + setKey + '): ' + msg);
    return null;
  });
}

/**
 * Find a variant child inside a component set by matching variantProperties.
 */
function findVariantChild(
  componentSet: ComponentSetNode,
  variantNum: number,
  platform: FeedPlatform
): ComponentNode | null {
  var platformValue = platform === 'desktop' ? 'Desktop' : 'Mobile';
  var children = componentSet.children;

  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.type !== 'COMPONENT') continue;

    var props = (child as ComponentNode).variantProperties;
    if (!props) continue;

    var variantMatch = props['Variant'] === String(variantNum);
    var platformMatch = props['Platform'] === platformValue;

    if (variantMatch && platformMatch) {
      return child as ComponentNode;
    }
  }

  Logger.debug(
    '[FeedComponentMap] Variant not found: Variant=' + variantNum +
    ', Platform=' + platformValue +
    ' in set ' + componentSet.name
  );
  return null;
}

/**
 * Import the correct feed component for a given card row.
 *
 * 1. Selects variant via selectFeedVariant (pure)
 * 2. Imports the component set from DC Feed library
 * 3. Finds the matching variant child
 *
 * Returns null if selection fails or component is unavailable.
 */
export function importFeedComponent(row: FeedCardRow): Promise<ComponentNode | null> {
  var selection = selectFeedVariant(row);
  if (!selection) {
    return Promise.resolve(null);
  }

  // Capture values before closure to satisfy TypeScript narrowing
  var selKey = selection.key;
  var selVariant = selection.variant;
  var selPlatform = selection.platform;

  return importComponentSet(selKey).then(function(componentSet) {
    if (!componentSet) return null;
    return findVariantChild(componentSet, selVariant, selPlatform);
  });
}
