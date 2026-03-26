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
import { fetchAndApplyImage } from '../image-apply';

// ============================================================================
// CHILD INSTANCE SEARCH
// ============================================================================

/**
 * Find first child INSTANCE with a given name (recursive, depth-limited).
 */
function findChildInstance(node: SceneNode, name: string, maxDepth: number): InstanceNode | null {
  if (maxDepth <= 0) return null;
  if (!('children' in node)) return null;

  var children = (node as ChildrenMixin).children;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.type === 'INSTANCE' && child.name === name) {
      return child;
    }
  }
  // Recurse
  for (var j = 0; j < children.length; j++) {
    var found = findChildInstance(children[j], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Find first RECTANGLE named "Img" inside a named container (for image fills).
 */
function findImgRect(node: SceneNode, containerName: string, maxDepth: number): RectangleNode | null {
  var container = findChildByName(node, containerName, maxDepth);
  if (!container) return null;
  return findRectByName(container, 'Img', 4);
}

/**
 * Find first child node with a given name (any type, recursive).
 */
function findChildByName(node: SceneNode, name: string, maxDepth: number): SceneNode | null {
  if (maxDepth <= 0) return null;
  if (!('children' in node)) return null;

  var children = (node as ChildrenMixin).children;
  for (var i = 0; i < children.length; i++) {
    if (children[i].name === name) return children[i];
  }
  for (var j = 0; j < children.length; j++) {
    var found = findChildByName(children[j], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Find first RECTANGLE with a given name inside a subtree.
 */
function findRectByName(node: SceneNode, name: string, maxDepth: number): RectangleNode | null {
  if (maxDepth <= 0) return null;
  if (node.type === 'RECTANGLE' && node.name === name) return node as RectangleNode;
  if (!('children' in node)) return null;

  var children = (node as ChildrenMixin).children;
  for (var i = 0; i < children.length; i++) {
    var found = findRectByName(children[i], name, maxDepth - 1);
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
  label: string
): void {
  var inst = findChildInstance(parent, childName, 6);
  if (!inst) {
    Logger.debug('[FeedApplicator] ' + label + ': child "' + childName + '" not found');
    return;
  }
  try {
    inst.setProperties(props);
  } catch (e) {
    var msg = e instanceof Error ? e.message : String(e);
    Logger.debug('[FeedApplicator] ' + label + ': setProperties failed on "' + childName + '": ' + msg);
  }
}

// ============================================================================
// SHARED APPLICATORS
// ============================================================================

/**
 * Apply source info (Source Feed instance) — shared across all card types.
 */
function applySource(instance: InstanceNode, card: FeedCardRow): void {
  var sourceName = card['#Feed_SourceName'] || '';
  var sourceDomain = card['#Feed_SourceDomain'] || '';

  var props: Record<string, string | boolean> = {};
  if (sourceName) {
    props['Source Name#3435:2'] = sourceName;
  }
  if (sourceDomain) {
    props['Subtitle2#3435:3'] = sourceDomain;
    props['Subtitle#3435:1'] = true;
  } else {
    props['Subtitle#3435:1'] = false;
  }

  setPropsOnChild(instance, 'Source Feed', props, 'source');
}

/**
 * Apply price info — shared Price instance pattern.
 */
function applyPrice(parent: SceneNode, card: FeedCardRow, label: string): void {
  var price = card['#Feed_Price'] || '';
  var oldPrice = card['#Feed_OldPrice'] || '';

  if (!price) return;

  var props: Record<string, string | boolean> = {};
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

  // Placeholder off when image is available
  var hasImage = !!card['#Feed_ImageUrl'];
  if (hasImage) {
    setPropsOnChild(instance, 'Image', { 'Placeholder#4004:1': false }, 'market/thumb');
  }
}

function applyVideoData(instance: InstanceNode, card: FeedCardRow): void {
  applySource(instance, card);

  // Description text
  var description = card['#Feed_Title'] || '';
  if (description) {
    // Description is on Media Meta, which is deep — search for any instance with this prop
    applyPropToAnyChild(instance, 'Description#2984:0', description);
  }

  // Product info
  var productTitle = card['#Feed_Title'] || '';
  var hasProduct = !!(card['#Feed_Price'] || productTitle);

  // Find Tile / Media Content for Product toggle
  var tile = findChildInstance(instance, 'Tile / Media Content', 4);
  if (tile) {
    try {
      tile.setProperties({ 'Product#2773:26': hasProduct });
    } catch (e) { /* prop may not exist */ }

    // Product title
    var product = findChildInstance(tile, 'Product', 4);
    if (product && productTitle) {
      try {
        product.setProperties({ 'Product Title#2773:20': productTitle });
      } catch (e) { /* */ }
    }

    // Price inside Product
    if (product) {
      applyPrice(product, card, 'video/product');
    }
  }

  // Placeholder off when image is available
  var hasImage = !!card['#Feed_ImageUrl'];
  if (hasImage) {
    setPropsOnChild(instance, 'Image', { 'Placeholder#4004:1': false }, 'video/thumb');
  }
}

function applyPostData(instance: InstanceNode, card: FeedCardRow): void {
  // Posts share same structure as Videos
  applyVideoData(instance, card);
}

function applyAdsData(instance: InstanceNode, card: FeedCardRow): void {
  // Description
  var title = card['#Feed_Title'] || '';
  if (title) {
    applyPropToAnyChild(instance, 'Description#2984:0', title);
  }

  // Placeholder
  var hasImage = !!card['#Feed_ImageUrl'];
  if (hasImage) {
    setPropsOnChild(instance, 'Image', { 'Placeholder#4004:1': false }, 'ads/thumb');
  }
}

/**
 * Apply a TEXT property to any child instance that has it.
 * Walks the subtree trying setProperties on each INSTANCE.
 */
function applyPropToAnyChild(node: SceneNode, propKey: string, value: string): void {
  if (node.type === 'INSTANCE') {
    var props = node.componentProperties;
    if (props && props[propKey] !== undefined) {
      try {
        var patch: Record<string, string> = {};
        patch[propKey] = value;
        node.setProperties(patch);
        return;
      } catch (e) { /* continue searching */ }
    }
  }
  if (!('children' in node)) return;
  var children = (node as ChildrenMixin).children;
  for (var i = 0; i < children.length; i++) {
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
function applyImages(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  var imageUrl = card['#Feed_ImageUrl'] || '';
  var avatarUrl = card['#Feed_SourceAvatarUrl'] || '';
  var chain = Promise.resolve();

  // Main image — find "Img" RECTANGLE inside "Thumb"
  if (imageUrl) {
    chain = chain.then(function() {
      var thumbFrame = findChildByName(instance, 'Thumb', 4);
      if (!thumbFrame) {
        Logger.debug('[FeedApplicator] Thumb not found');
        return;
      }
      var imgRect = findRectByName(thumbFrame, 'Img', 4);
      if (!imgRect) {
        Logger.debug('[FeedApplicator] Img rect not found in Thumb');
        return;
      }
      return fetchAndApplyImage(imgRect, imageUrl, 'FILL', '[Feed/thumb]').then(function() {});
    });
  }

  // Source avatar — find "Img" RECTANGLE inside "Source Feed / Icon"
  if (avatarUrl) {
    chain = chain.then(function() {
      var sourceIcon = findChildByName(instance, 'Source Feed / Icon', 6);
      if (!sourceIcon) return;
      var imgRect = findRectByName(sourceIcon, 'Img', 3);
      if (!imgRect) return;
      return fetchAndApplyImage(imgRect, avatarUrl, 'FILL', '[Feed/avatar]').then(function() {});
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
  var title = card['#Feed_Title'] || '';
  if (!title) return Promise.resolve();

  var descFrame = findChildByName(instance, 'Description', 6);
  if (!descFrame || !('children' in descFrame)) return Promise.resolve();

  // Find first TEXT child in Description
  var textNode: TextNode | null = null;
  var children = (descFrame as ChildrenMixin).children;
  for (var i = 0; i < children.length; i++) {
    if (children[i].type === 'TEXT') {
      textNode = children[i] as TextNode;
      break;
    }
  }
  if (!textNode) return Promise.resolve();

  var fn = textNode.fontName;
  if (!fn || fn === figma.mixed) return Promise.resolve();

  return figma.loadFontAsync(fn as FontName).then(function() {
    if (textNode) {
      textNode.characters = title;
    }
  }).catch(function(e) {
    Logger.debug('[FeedApplicator] Market description font load failed: ' + (e instanceof Error ? e.message : String(e)));
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
export function applyFeedData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  var cardType = card['#Feed_CardType'] || '';
  Logger.debug('[FeedApplicator] Applying data: type=' + cardType + ', title="' + (card['#Feed_Title'] || '').substring(0, 30) + '"');

  // Step 1: Apply text/boolean properties by card type
  switch (cardType) {
    case 'market':
      applyMarketData(instance, card);
      break;
    case 'video':
      applyVideoData(instance, card);
      break;
    case 'post':
      applyPostData(instance, card);
      break;
    case 'advert':
      applyAdsData(instance, card);
      break;
    default:
      Logger.debug('[FeedApplicator] Unknown card type: ' + cardType);
  }

  // Step 2: Apply images (async)
  var chain = applyImages(instance, card);

  // Step 3: Market description (direct text edit, needs font loading)
  if (cardType === 'market') {
    chain = chain.then(function() {
      return applyMarketDescription(instance, card);
    });
  }

  return chain;
}
