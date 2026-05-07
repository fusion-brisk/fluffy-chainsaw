/**
 * Feed Component Map — FeedCardType -> Figma component set keys + variant selector
 *
 * Maps feed card data to the correct component variant in the DC Feed library
 * (file key: 0dr1G4gFr6q8enaEOR1YUW).
 *
 * ES5 sandbox: no optional chaining, no nullish coalescing.
 */

import { Logger } from '../../logger';
import {
  FeedCardRow,
  FeedCardSize,
  FeedCardType,
  FeedPlatform,
  FeedComponentVariant,
} from '../../types/feed-card-types';

// ============================================================================
// COMPONENT SET KEYS — DC Feed library
// ============================================================================

/**
 * Component SET keys (parent containers).
 * Individual variants are children with properties like Variant=N, Platform=Desktop|Mobile.
 */
const FEED_COMPONENT_SET_KEYS: Record<string, string> = {
  post: '0fdaa4594724de9e5aca70b24697acfe99c47069',
  video: '012cb3e9e93ac64676b2ba3e5f33ff3ac9b99061',
  market: '3b7e0b1f54a2cc8843efb69597158fd1ba0a1858',
  advert_prod: '66df545c9090c6776444d39306af1e3b34e7da41',
  advert_examples: 'fa33e1ca52751009197bba25340780694e977cdf',
  product: '862ed09175edc1b277dd67b9686e753e5c51212d',
  collection: '0a973790f90a010df34a9f6509256b176bd611b3',
  /**
   * Unified Feed Card shell — used for advert (and future post/video migration).
   * Variants are addressed by `State` (Default/…) + `Platform` (Desktop/Mobile).
   * Media Tile + Content slots are filled via INSTANCE_SWAP component properties.
   */
  feed_card: '74489a31b31e7015b931f0678eb8b65cd8ad81aa',
};

/**
 * Tile component KEYS for INSTANCE_SWAP into Feed Card slots.
 * Used by the data-applicator side after a Feed Card instance is created.
 *
 * IMPORTANT: these are VARIANT keys (the specific component children inside
 * a set), not set keys. `figma.importComponentByKeyAsync(setKey)` rejects
 * with "Could not find a published component" — we hit that bug for ads/video
 * when the user originally pasted set keys instead of variant keys.
 */
export const FEED_TILE_KEYS = {
  /** Tile / Ads, Type=Default — variant key (NOT the set key) */
  ads_default: 'a7ec037a98be6c99d3343f973609e350ad3df173',
  /** Tile / Media Content, Type=Actions On, Style=Default — variant key.
   * Used for `post` cards (Like + Save actions baked in). */
  media_content_actions_on: '81cacd122553f08f8f13b14f10eafc766b0a1619',
  /** Tile / Media Content, Type=Concept, Style=Default — variant key.
   * Used for `video` cards (Concept variant has Action/Product/Stroke
   * booleans the applicator can flip on per-card data). */
  media_content_concept: '074dd4b23b673109be3ce2d6edcef367ab3395e9',
  /** Tile / Product variant key (placeholder, not yet wired) */
  product: '4e507c526db823f9a073678a4a22014ad73f743c',
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

// Legacy variant-range helpers for Post/Video have been retired now that
// post/video route through the unified Feed Card shell (Tile is swapped
// in by applyPostData/applyVideoData via INSTANCE_SWAP).

/**
 * Product: type -> variant range
 *   independent -> 1-7
 *   market      -> 8-21
 */
function getProductVariantRange(row: FeedCardRow): VariantRange {
  const productType = row['#Feed_ProductType'];
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
  const adStyle = row['#Feed_AdStyle'];
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
  const cardType: FeedCardType = row['#Feed_CardType'];
  const size: FeedCardSize = row['#Feed_CardSize'];
  const platform: FeedPlatform = row['#Feed_Platform'] || 'desktop';

  let setKey: string;
  let range: VariantRange;

  switch (cardType) {
    case 'market': {
      setKey = FEED_COMPONENT_SET_KEYS['market'];
      range = getMarketVariantRange(size);
      break;
    }
    case 'video':
    case 'post':
    case 'advert': {
      // Unified Feed Card shell — type-specific Tile is swapped into the
      // Media Tile slot by the corresponding apply*Data function.
      return {
        key: FEED_COMPONENT_SET_KEYS['feed_card'],
        state: 'Default',
        platform: platform,
        nodeId: '',
      };
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
  const variant = range.min;

  return {
    key: setKey,
    variant: variant,
    platform: platform,
    nodeId: '', // resolved at import time
  };
}

// Helper to remove the now-unused getAdvertConfig variant config — kept for
// reference until the advert flow is fully validated end-to-end.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _legacyAdvertConfig = getAdvertConfig;

// ============================================================================
// FIGMA IMPORT — async, uses Figma API
// ============================================================================

/** Cache for imported component sets (setKey -> ComponentSetNode) */
const componentSetCache = new Map<string, ComponentSetNode>();

/** Timeout for component set loading (ms) */
const IMPORT_TIMEOUT = 15000;

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
    new Promise<never>(function (_, reject) {
      setTimeout(function () {
        reject(new Error('Import timeout after ' + IMPORT_TIMEOUT + 'ms'));
      }, IMPORT_TIMEOUT);
    }),
  ])
    .then(function (componentSet) {
      componentSetCache.set(setKey, componentSet);
      Logger.debug(
        '[FeedComponentMap] Imported set: ' + componentSet.name + ' (key=' + setKey + ')',
      );
      return componentSet;
    })
    .catch(function (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.error('[FeedComponentMap] Failed to import set (key=' + setKey + '): ' + msg);
      return null;
    });
}

/**
 * Find a variant child inside a component set by matching variantProperties.
 *
 * Selection axis is polymorphic:
 *  - if `selection.state` is set → match `State=<state>` + `Platform=<platform>` (Feed Card shell)
 *  - else if `selection.variant` is set → match `Variant=<n>` + `Platform=<platform>` (legacy Posts/Videos/Market/Ads)
 */
function findVariantChild(
  componentSet: ComponentSetNode,
  selection: FeedComponentVariant,
): ComponentNode | null {
  const platformValue = selection.platform === 'desktop' ? 'Desktop' : 'Mobile';
  const children = componentSet.children;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== 'COMPONENT') continue;

    const props = (child as ComponentNode).variantProperties;
    if (!props) continue;

    const platformMatch = props['Platform'] === platformValue;
    if (!platformMatch) continue;

    if (selection.state !== undefined) {
      if (props['State'] === selection.state) {
        return child as ComponentNode;
      }
    } else if (selection.variant !== undefined) {
      if (props['Variant'] === String(selection.variant)) {
        return child as ComponentNode;
      }
    }
  }

  const axis =
    selection.state !== undefined
      ? 'State=' + selection.state
      : 'Variant=' + String(selection.variant);
  Logger.debug(
    '[FeedComponentMap] Variant not found: ' +
      axis +
      ', Platform=' +
      platformValue +
      ' in set ' +
      componentSet.name,
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
  const selection = selectFeedVariant(row);
  if (!selection) {
    return Promise.resolve(null);
  }

  // Capture values before closure to satisfy TypeScript narrowing
  const selKey = selection.key;
  const sel = selection;

  return importComponentSet(selKey).then(function (componentSet) {
    if (!componentSet) return null;
    return findVariantChild(componentSet, sel);
  });
}
