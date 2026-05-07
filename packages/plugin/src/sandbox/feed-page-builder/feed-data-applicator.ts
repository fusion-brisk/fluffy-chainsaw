/**
 * Feed Data Applicator — fills feed card instances with parsed data.
 *
 * Traverses instance subtree, finds named child instances,
 * applies FeedCardRow fields via setProperties().
 *
 * ES5 sandbox: no optional chaining, no nullish coalescing.
 */

import { Logger } from '../../logger';
import { FeedCardRow } from '../../types/feed-card-types';
import { safeSetVisible } from '../handlers/visibility-handlers';
import { fetchAndApplyImage } from '../image-apply';
import { FEED_TILE_KEYS } from './feed-component-map';

// ============================================================================
// CHILD INSTANCE SEARCH
// ============================================================================

/**
 * Find first child INSTANCE with a given name (recursive, depth-limited).
 */
function findChildInstance(node: SceneNode, name: string, maxDepth: number): InstanceNode | null {
  if (maxDepth <= 0) return null;
  if (!('children' in node)) return null;

  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'INSTANCE' && child.name === name) {
      return child;
    }
  }
  // Recurse
  for (let j = 0; j < children.length; j++) {
    const found = findChildInstance(children[j], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Find first child node with a given name (any type, recursive).
 */
function findChildByName(node: SceneNode, name: string, maxDepth: number): SceneNode | null {
  if (maxDepth <= 0) return null;
  if (!('children' in node)) return null;

  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].name === name) return children[i];
  }
  for (let j = 0; j < children.length; j++) {
    const found = findChildByName(children[j], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Find the first INSTANCE descendant whose name starts with "Tile /".
 * Used to locate a Feed Card's swapped Media Tile slot after INSTANCE_SWAP,
 * regardless of whether Figma labels the child with the set name
 * ("Tile / Media Content") or the variant name ("Type=Actions On, …").
 */
function findFirstTileInSubtree(node: SceneNode, maxDepth: number): InstanceNode | null {
  if (maxDepth <= 0) return null;
  if (node.type === 'INSTANCE' && node.name.indexOf('Tile /') === 0) {
    return node;
  }
  if (!('children' in node)) return null;
  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    const found = findFirstTileInSubtree(children[i], maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Find first node with a given name that supports image fills.
 * Matches any node type that has a `fills` property (RECTANGLE, FRAME, ELLIPSE, etc.).
 */
function findFillableByName(node: SceneNode, name: string, maxDepth: number): SceneNode | null {
  if (maxDepth <= 0) return null;
  if (node.name === name && 'fills' in node) return node;
  if (!('children' in node)) return null;

  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    const found = findFillableByName(children[i], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

// ============================================================================
// SAFE PROPERTY SETTER
// ============================================================================

/**
 * Set properties on a child instance, catching errors for missing props.
 */
function setPropsOnChild(
  parent: SceneNode,
  childName: string,
  props: Record<string, string | boolean>,
  label: string,
): void {
  const inst = findChildInstance(parent, childName, 6);
  if (!inst) {
    Logger.debug('[FeedApplicator] ' + label + ': child "' + childName + '" not found');
    return;
  }
  try {
    inst.setProperties(props);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.debug(
      '[FeedApplicator] ' + label + ': setProperties failed on "' + childName + '": ' + msg,
    );
  }
}

// ============================================================================
// SHARED APPLICATORS
// ============================================================================

/**
 * Apply source info (Source Feed instance) — shared across all card types.
 *
 * `subtitleOverride`, when provided, replaces the auto-domain Subtitle with
 * a literal string (used by advert cards to show the "Реклама" label
 * regardless of whether the parser produced a domain).
 */
function applySource(instance: InstanceNode, card: FeedCardRow, subtitleOverride?: string): void {
  const sourceName = (card['#Feed_SourceName'] || '').trim();
  const sourceDomain = (card['#Feed_SourceDomain'] || '').trim();

  let subtitleText = '';
  if (subtitleOverride !== undefined) {
    subtitleText = subtitleOverride;
  } else if (sourceDomain.length > 0 && sourceDomain.toLowerCase() !== sourceName.toLowerCase()) {
    // Hide Subtitle when it would just echo the title — saves the visual
    // duplicate `bentsony.mebel / bentsony.mebel` and matches the designer's
    // edited reference where empty/redundant subtitles are collapsed.
    subtitleText = sourceDomain;
  }

  const props: Record<string, string | boolean> = {};
  if (sourceName) {
    props['Source Name#3435:2'] = sourceName;
  }
  if (subtitleText.length > 0) {
    props['Subtitle2#3435:3'] = subtitleText;
    props['Subtitle#3435:1'] = true;
  } else {
    props['Subtitle#3435:1'] = false;
  }

  setPropsOnChild(instance, 'Source Feed', props, 'source');
}

/**
 * Switch the Source Feed / Icon child to its compact 24px / single-source
 * variant — matches the designer's edited reference where Feed Card uses a
 * smaller avatar + 12px title + tighter padding. Tile / Ads has the same
 * compact icon by default; we still call this for symmetry.
 *
 * Best-effort: if the icon variant axes don't match (older library version)
 * the call silently no-ops via try/catch.
 */
function applySourceCompact(instance: InstanceNode, label: string): void {
  const icons = collectInstancesByName(instance, 'Source Feed / Icon', 8);
  for (let i = 0; i < icons.length; i++) {
    try {
      icons[i].setProperties({
        Size: '24 px',
        'Number of sources': 'One',
      });
    } catch (e) {
      Logger.debug(
        '[FeedApplicator] ' +
          label +
          ': source-icon compact swap failed: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
}

/**
 * Walk subtree and collect every INSTANCE child with a given name.
 * Used by helpers that need to apply a setting to all matching nested
 * components (e.g. multiple Source Feed / Icon instances when the Card
 * Source row contains more than one).
 */
function collectInstancesByName(node: SceneNode, name: string, maxDepth: number): InstanceNode[] {
  const out: InstanceNode[] = [];
  function walk(n: SceneNode, depth: number) {
    if (depth <= 0) return;
    if (n.type === 'INSTANCE' && n.name === name) {
      out.push(n);
    }
    if ('children' in n) {
      const children = (n as ChildrenMixin).children;
      for (let i = 0; i < children.length; i++) {
        walk(children[i], depth - 1);
      }
    }
  }
  walk(node, maxDepth);
  return out;
}

/**
 * Apply price info — shared Price instance pattern.
 */
function applyPrice(parent: SceneNode, card: FeedCardRow, label: string): void {
  const price = card['#Feed_Price'] || '';
  const oldPrice = card['#Feed_OldPrice'] || '';

  if (!price) return;

  const props: Record<string, string | boolean> = {};
  props['Price#6097:0'] = price;
  if (oldPrice) {
    props['Old Price#6127:0'] = true;
  }

  setPropsOnChild(parent, 'Price', props, label + '/price');
}

// ============================================================================
// TYPE-SPECIFIC APPLICATORS
// ============================================================================

function applyMarketData(instance: InstanceNode, card: FeedCardRow): void {
  applySource(instance, card);
  applyPrice(instance, card, 'market');
  // Placeholder is turned off in applyImages (shared across all card types)
}

function applyVideoData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  // Per the designer: video cards use Tile / Media Content with the Concept
  // variant (separate from the post variant which is Actions On). Concept
  // exposes Stroke / Action / Product BOOLEAN props the applicator flips
  // based on card data — the Product=true case below adds the price row.
  return applyFeedCardShell(
    instance,
    FEED_TILE_KEYS.media_content_concept,
    { Type: 'Concept', Style: 'Default' },
    true,
    'video',
  ).then(function () {
    applySource(instance, card);
    applySourceCompact(instance, 'video');

    // Description text
    const description = card['#Feed_Title'] || '';
    if (description) {
      applyPropToAnyChild(instance, 'Description#2984:0', description);
    }

    // Product info — only show Product section when there is a price
    // (enabling it with only a title shows the component's default price)
    const productTitle = card['#Feed_Title'] || '';
    const hasProduct = !!card['#Feed_Price'];

    // Tile is now Tile / Video — search by either name (helper resolves both)
    const tile =
      findChildInstance(instance, 'Tile / Video', 4) ||
      findChildInstance(instance, 'Tile / Media Content', 4);
    if (tile) {
      try {
        tile.setProperties({ 'Product#2773:26': hasProduct });
      } catch (_e) {
        /* prop may not exist on this Tile variant */
      }

      const product = findChildInstance(tile, 'Product', 4);
      if (product && productTitle) {
        try {
          product.setProperties({ 'Product Title#2773:20': productTitle });
        } catch (_e) {
          /* */
        }
      }
      if (product) {
        applyPrice(product, card, 'video/product');
      }
    }
  });
}

function applyPostData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  return applyFeedCardShell(
    instance,
    FEED_TILE_KEYS.media_content_actions_on,
    { Type: 'Actions On', Style: 'Default' },
    true,
    'post',
  ).then(function () {
    applySource(instance, card);
    applySourceCompact(instance, 'post');

    const description = card['#Feed_Title'] || '';
    if (description) {
      applyPropToAnyChild(instance, 'Description#2984:0', description);
    }
  });
}

/**
 * Cache for slot-tile components imported via INSTANCE_SWAP.
 * Keyed by component key (32-char hex).
 */
const tileComponentCache: Record<string, ComponentNode> = {};

function importTileByKey(key: string): Promise<ComponentNode | null> {
  const cached = tileComponentCache[key];
  if (cached) {
    try {
      if (!(cached as SceneNode).removed) return Promise.resolve(cached);
    } catch (_e) {
      // fall through and re-import
    }
    delete tileComponentCache[key];
  }
  return figma
    .importComponentByKeyAsync(key)
    .then(function (comp) {
      tileComponentCache[key] = comp;
      return comp;
    })
    .catch(function (e) {
      Logger.error(
        '[FeedApplicator] importComponentByKeyAsync failed (key=' +
          key +
          '): ' +
          (e instanceof Error ? e.message : String(e)),
      );
      return null;
    });
}

/**
 * Find the property name on a Feed Card instance that matches a given prefix.
 * Figma INSTANCE_SWAP property keys carry a hash suffix (e.g. "Media Tile SA#4900:6"),
 * so we resolve by prefix to be resilient to set re-publishes.
 */
function findPropertyByPrefix(instance: InstanceNode, prefix: string): string | null {
  let props: ComponentProperties;
  try {
    props = instance.componentProperties;
  } catch (_e) {
    return null;
  }
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(prefix) === 0) return keys[i];
  }
  return null;
}

/**
 * Generic Feed Card shell setup:
 *  - Imports the type-specific Tile and swaps it into the `Media Tile SA` slot
 *  - Forces the variant axes on the swapped Tile (defensive — the slot's
 *    INSTANCE_SWAP can silently coerce to the slot's default variant when
 *    its preferredValues constrain the set; an explicit setProperties on the
 *    swapped child guarantees the variant we asked for)
 *  - Toggles the `Source` BOOLEAN row on/off
 */
function applyFeedCardShell(
  instance: InstanceNode,
  tileKey: string,
  variantProps: Record<string, string> | null,
  sourceOn: boolean,
  label: string,
): Promise<void> {
  return importTileByKey(tileKey).then(function (tile) {
    if (tile) {
      const mediaProp = findPropertyByPrefix(instance, 'Media Tile SA');
      if (mediaProp) {
        try {
          const patch: Record<string, string> = {};
          patch[mediaProp] = tile.id;
          instance.setProperties(patch);
        } catch (e) {
          Logger.debug(
            '[FeedApplicator] ' +
              label +
              ': Media Tile swap failed: ' +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      } else {
        Logger.debug('[FeedApplicator] ' + label + ': Media Tile property not found on Feed Card');
      }

      // Re-affirm variant axes on the swapped Tile so an Actions-On variant
      // doesn't fall back to e.g. Type=Concept after the swap. The slot's
      // INSTANCE_SWAP can silently coerce the variant when the imported key
      // doesn't survive setProperties — explicitly applying the variant
      // afterwards is the only reliable way to lock it.
      //
      // Subtree match strategy: walk every INSTANCE descendant and pick the
      // first one whose name starts with "Tile /" (matches "Tile / Media
      // Content", "Tile / Video", "Tile / Ads", "Tile / Product", etc).
      // Earlier we matched by exact name which missed cases where Figma
      // labels the swapped child with the variant string instead of the
      // set name.
      if (variantProps) {
        const swapped = findFirstTileInSubtree(instance, 8);
        if (swapped) {
          try {
            swapped.setProperties(variantProps);
          } catch (e) {
            Logger.debug(
              '[FeedApplicator] ' +
                label +
                ': swapped-tile variant set failed (props=' +
                JSON.stringify(variantProps) +
                ', tile=' +
                swapped.name +
                '): ' +
                (e instanceof Error ? e.message : String(e)),
            );
          }
        } else {
          Logger.debug(
            '[FeedApplicator] ' + label + ': could not locate swapped tile to set variant',
          );
        }
      }
    }

    const sourceProp = findPropertyByPrefix(instance, 'Source#');
    if (sourceProp) {
      try {
        const patch: Record<string, boolean> = {};
        patch[sourceProp] = sourceOn;
        instance.setProperties(patch);
      } catch (e) {
        Logger.debug(
          '[FeedApplicator] ' +
            label +
            ': Source toggle failed: ' +
            (e instanceof Error ? e.message : String(e)),
        );
      }
    }
  });
}

/**
 * Advert flow — Feed Card shell + Tile / Ads Type=Default in the Media Tile slot.
 * Image (creative) and title (description) flow through the existing applyImages
 * + applyPropToAnyChild paths after the shell is set up.
 */
function applyAdsData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  return applyFeedCardShell(
    instance,
    FEED_TILE_KEYS.ads_default,
    { Type: 'Default' },
    true,
    'advert',
  ).then(function () {
    // Show "Реклама" in the Subtitle row instead of the auto-domain heuristic.
    // SourceLabel comes from the parser (defaults to "Реклама"), so it stays
    // localised if the live page ever changes the wording.
    const adLabel = (card['#Feed_SourceLabel'] || 'Реклама').trim();
    applySource(instance, card, adLabel);
    applySourceCompact(instance, 'advert');

    // Description text (without the trailing price — parser strips it).
    const title = card['#Feed_Title'] || '';
    if (title) {
      applyPropToAnyChild(instance, 'Description#2984:0', title);
    }

    // Tile / Ads Bottom > Price / v2 — set the numeric price the parser
    // peeled off the title. Try the standard `Price` instance setter first
    // (Tile / Ads embeds an inner Price/v2 instance with a `Price#…` text
    // property); fall back to the generic any-child applicator with the
    // common property name in case the slot uses a different prefix.
    const price = (card['#Feed_Price'] || '').trim();
    if (price) {
      applyPrice(instance, card, 'advert');
      applyPropToAnyChild(instance, 'Price#6097:0', price);
    }
  });
}

/**
 * Apply a TEXT property to any child instance that has it.
 * Walks the subtree trying setProperties on each INSTANCE.
 */
function applyPropToAnyChild(node: SceneNode, propKey: string, value: string): void {
  if (node.type === 'INSTANCE') {
    const props = node.componentProperties;
    if (props && props[propKey] !== undefined) {
      try {
        const patch: Record<string, string> = {};
        patch[propKey] = value;
        node.setProperties(patch);
        return;
      } catch (e) {
        /* continue searching */
      }
    }
  }
  if (!('children' in node)) return;
  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    applyPropToAnyChild(children[i], propKey, value);
  }
}

// ============================================================================
// IMAGE APPLICATOR
// ============================================================================

/**
 * Apply images (thumbnail + source avatar) to a feed card instance.
 * Returns a Promise chain (ES5-safe).
 */
function applyImages(instance: InstanceNode, card: FeedCardRow, relayUrl?: string): Promise<void> {
  const imageUrl = card['#Feed_ImageUrl'] || '';
  const avatarUrl = card['#Feed_SourceAvatarUrl'] || '';
  // Diagnostic: trace advert specifically — the user can spot at a glance
  // whether images are reaching the apply step or being dropped earlier.
  if (card['#Feed_CardType'] === 'advert') {
    Logger.info(
      '[advert-img] card "' +
        (card['#Feed_SourceName'] || '?') +
        '" imageUrl=' +
        (imageUrl
          ? imageUrl.slice(0, 80) + (imageUrl.length > 80 ? '…' : '')
          : 'EMPTY (placeholder will show)'),
    );
  }
  let chain = Promise.resolve();

  // Main image — path: instance > ... > Thumb > Image (INSTANCE) > Img (fill target)
  if (imageUrl) {
    chain = chain.then(function () {
      const thumb = findChildByName(instance, 'Thumb', 8);

      // Step 1: Find Image instance and set properties.
      //
      // Order matters: set the variant axis (Ratio) FIRST in its own call,
      // then the boolean (Placeholder=false) in a second call.
      //
      // Why: when a single setProperties() call combines a variant change
      // with a boolean, Figma swaps the variant first, which resets ALL
      // boolean component properties on the new variant to their defaults
      // (Placeholder default is `true`). The boolean we asked to set is
      // applied to the OLD variant, which then gets discarded. Result —
      // every imported card shows the placeholder over our Img fill.
      const imageInst = findChildInstance(instance, 'Image', 8);
      if (imageInst) {
        const ratio = card['#Feed_ImageRatio'];
        if (ratio) {
          try {
            imageInst.setProperties({ Ratio: ratio });
          } catch (e) {
            Logger.debug(
              '[FeedApplicator] Image Ratio: ' + (e instanceof Error ? e.message : String(e)),
            );
          }
        }
        try {
          imageInst.setProperties({ 'Placeholder#4004:1': false });
        } catch (e) {
          Logger.debug(
            '[FeedApplicator] Image Placeholder: ' + (e instanceof Error ? e.message : String(e)),
          );
        }
      }

      // Step 2: Find Img fill target — try multiple paths
      let imgNode: SceneNode | null = null;

      // Path A: inside Image instance
      if (imageInst) {
        imgNode = findFillableByName(imageInst, 'Img', 4);
      }
      // Path B: inside Thumb
      if (!imgNode && thumb) {
        imgNode = findFillableByName(thumb, 'Img', 6);
      }
      // Path C: any child named Img from root
      if (!imgNode) {
        imgNode = findFillableByName(instance, 'Img', 10);
      }

      if (!imgNode) {
        const msg = '[FeedApplicator] Img not found in ' + instance.name;
        if (card['#Feed_CardType'] === 'advert') {
          Logger.info('[advert-img] FAIL: ' + msg);
        } else {
          Logger.debug(msg);
        }
        return;
      }

      Logger.debug('[FeedApplicator] Applying image to ' + imgNode.name + ' in ' + instance.name);
      return fetchAndApplyImage(imgNode, imageUrl, 'FILL', '[Feed/thumb]', relayUrl).then(
        function (success) {
          if (card['#Feed_CardType'] === 'advert') {
            Logger.info(
              '[advert-img] ' +
                (success ? 'APPLIED' : 'FETCH-RETURNED-FALSE') +
                ' on ' +
                instance.name +
                ' for ' +
                imageUrl.substring(0, 80),
            );
          }
        },
        function (err) {
          if (card['#Feed_CardType'] === 'advert') {
            Logger.info(
              '[advert-img] THROWN ' +
                instance.name +
                ': ' +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        },
      );
    });
  }

  // Source avatar — find "Img" inside "Source Feed / Icon"
  if (avatarUrl) {
    chain = chain.then(function () {
      const sourceIcon = findChildByName(instance, 'Source Feed / Icon', 8);
      if (!sourceIcon) {
        Logger.debug('[FeedApplicator] Source Feed / Icon not found in ' + instance.name);
        return;
      }
      const imgNode = findFillableByName(sourceIcon, 'Img', 4);
      if (!imgNode) return;
      // Hide "Placeholder" child layer inside Source Feed / Icon
      const placeholder = findChildByName(sourceIcon, 'Placeholder', 2);
      if (placeholder) {
        safeSetVisible(placeholder, false, sourceIcon);
      }
      return fetchAndApplyImage(imgNode, avatarUrl, 'FILL', '[Feed/avatar]', relayUrl).then(
        function () {},
      );
    });
  }

  return chain;
}

// ============================================================================
// MARKET DESCRIPTION (direct TEXT node edit)
// ============================================================================

/**
 * For Market cards, the description/title is a direct TEXT node, not a component property.
 * We need loadFontAsync + characters = value.
 */
function applyMarketDescription(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  const title = card['#Feed_Title'] || '';
  if (!title) return Promise.resolve();

  const descFrame = findChildByName(instance, 'Description', 6);
  if (!descFrame || !('children' in descFrame)) return Promise.resolve();

  // Find first TEXT child in Description
  let textNode: TextNode | null = null;
  const children = (descFrame as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].type === 'TEXT') {
      textNode = children[i] as TextNode;
      break;
    }
  }
  if (!textNode) return Promise.resolve();

  const fn = textNode.fontName;
  if (!fn || fn === figma.mixed) return Promise.resolve();

  return figma
    .loadFontAsync(fn as FontName)
    .then(function () {
      if (textNode) {
        textNode.characters = title;
      }
    })
    .catch(function (e) {
      Logger.debug(
        '[FeedApplicator] Market description font load failed: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Apply feed card data to a Figma instance.
 *
 * 1. Sets text/boolean properties on child instances
 * 2. Loads and applies images (thumbnail + avatar)
 *
 * @param instance  The feed card instance (already created)
 * @param card      Parsed feed card data from extension
 */
export function applyFeedData(
  instance: InstanceNode,
  card: FeedCardRow,
  relayUrl?: string,
): Promise<void> {
  const cardType = card['#Feed_CardType'] || '';
  Logger.debug(
    '[FeedApplicator] Applying data: type=' +
      cardType +
      ', title="' +
      (card['#Feed_Title'] || '').substring(0, 30) +
      '"',
  );

  // Step 1: Apply text/boolean properties by card type.
  // post/video/advert all import a slot Tile via INSTANCE_SWAP into the
  // unified Feed Card shell (returns Promise). Market is the only legacy
  // synchronous path.
  let chain: Promise<void>;
  switch (cardType) {
    case 'market':
      applyMarketData(instance, card);
      chain = Promise.resolve();
      break;
    case 'video':
      chain = applyVideoData(instance, card);
      break;
    case 'post':
      chain = applyPostData(instance, card);
      break;
    case 'advert':
      chain = applyAdsData(instance, card);
      break;
    default:
      Logger.debug('[FeedApplicator] Unknown card type: ' + cardType);
      chain = Promise.resolve();
  }

  // Step 2: Apply images (async) — pass relayUrl for CORS-blocked proxy fallback
  chain = chain.then(function () {
    return applyImages(instance, card, relayUrl);
  });

  // Step 3: Market description (direct text edit, needs font loading)
  if (cardType === 'market') {
    chain = chain.then(function () {
      return applyMarketDescription(instance, card);
    });
  }

  return chain;
}
