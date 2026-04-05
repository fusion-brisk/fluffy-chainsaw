# Feed Data Applicator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fill imported feed card instances with real data (titles, prices, source names, images) parsed from the ya.ru rhythm feed DOM.

**Architecture:** Create a `feed-data-applicator.ts` module in `feed-page-builder/` that traverses each instance's subtree, finds named child instances, and applies `FeedCardRow` fields via `setProperties()` for text/boolean props and `fetchAndApplyImage()` for image rectangles. Wire it into `feed-page-creator.ts` after `createInstance()`.

**Tech Stack:** Figma Plugin API (ES5 sandbox), existing `fetchAndApplyImage`, `preloadInstanceFonts`

---

## Property Map (from Figma inspection)

### Shared across all types

| Child Instance Name | Property Key         | Type | Feed Field                   |
| ------------------- | -------------------- | ---- | ---------------------------- |
| `Source Feed`       | `Source Name#3435:2` | TEXT | `#Feed_SourceName`           |
| `Source Feed`       | `Subtitle2#3435:3`   | TEXT | `#Feed_SourceDomain`         |
| `Source Feed`       | `Subtitle#3435:1`    | BOOL | show if `#Feed_SourceDomain` |
| `Source Feed`       | `Follow Icon#3435:0` | BOOL | false                        |

### Image layers (by node name, RECTANGLE type)

| Path Pattern               | Feed Field              | scaleMode |
| -------------------------- | ----------------------- | --------- |
| `Thumb > Image > Img`      | `#Feed_ImageUrl`        | `FILL`    |
| `Source Feed / Icon > Img` | `#Feed_SourceAvatarUrl` | `FILL`    |

### Market Production Snippet

| Child Instance     | Property Key         | Type | Feed Field                   |
| ------------------ | -------------------- | ---- | ---------------------------- |
| `Price`            | `Price#6097:0`       | TEXT | `#Feed_Price`                |
| `Price`            | `Old Price#6127:0`   | BOOL | has `#Feed_OldPrice`         |
| `Image` (in Thumb) | `Placeholder#4004:1` | BOOL | false when image URL present |

TEXT node (direct `characters` edit — needs `loadFontAsync`):

- `Description > *` (first TEXT child) ← `#Feed_Title`

### Videos / Posts

| Child Instance                      | Property Key            | Type | Feed Field                   |
| ----------------------------------- | ----------------------- | ---- | ---------------------------- |
| `Description` (in Media Meta)       | `Description#2984:0`    | TEXT | `#Feed_Title`                |
| `Product` (in Tile / Media Content) | `Product Title#2773:20` | TEXT | `#Feed_Title` (product)      |
| `Product` (in Tile / Media Content) | `Product#2773:26`       | BOOL | show if has products         |
| Price (in Product)                  | `Price#6097:0`          | TEXT | `#Feed_Price`                |
| Price (in Product)                  | `Old Price#6127:0`      | BOOL | has `#Feed_OldPrice`         |
| Media Meta                          | `Sound#3389:6`          | BOOL | `#Feed_HasSound`             |
| `Image` (in Thumb)                  | `Placeholder#4004:1`    | BOOL | false when image URL present |

### Ads Production Snippets

| Child Instance             | Property Key         | Type | Feed Field                   |
| -------------------------- | -------------------- | ---- | ---------------------------- |
| `Description` (in Product) | `Description#2984:0` | TEXT | `#Feed_Title`                |
| `Image` (in Product)       | `Placeholder#4004:1` | BOOL | false when image URL present |

---

## Task 1: Create feed-data-applicator.ts with text/boolean property mapping

**Files:**

- Create: `packages/plugin/src/sandbox/feed-page-builder/feed-data-applicator.ts`

**Step 1: Create the module with `applyFeedData` function**

```typescript
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
import { preloadInstanceFonts } from '../page-builder/image-operations';

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
  for (var i = 0; i < children.length; i++) {
    var found = findChildInstance(children[i], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Find first RECTANGLE named "Img" inside a named container (for image fills).
 */
function findImgRect(
  node: SceneNode,
  containerName: string,
  maxDepth: number,
): RectangleNode | null {
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
  for (var i = 0; i < children.length; i++) {
    var found = findChildByName(children[i], name, maxDepth - 1);
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
  label: string,
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
    var descProps: Record<string, string | boolean> = { 'Description#2984:0': description };
    // Description is on Media Meta, which is deep — search for any instance with this prop
    applyPropToAnyChild(instance, 'Description#2984:0', description);
  }

  // Product info
  var hasProduct = !!(card['#Feed_Price'] || card['#Feed_ProductTitle']);
  var productTitle = card['#Feed_ProductTitle'] || card['#Feed_Title'] || '';

  // Find Tile / Media Content for Product toggle
  var tile = findChildInstance(instance, 'Tile / Media Content', 4);
  if (tile) {
    try {
      tile.setProperties({ 'Product#2773:26': hasProduct });
    } catch (e) {
      /* prop may not exist */
    }

    // Product title
    var product = findChildInstance(tile, 'Product', 4);
    if (product && productTitle) {
      try {
        product.setProperties({ 'Product Title#2773:20': productTitle });
      } catch (e) {
        /* */
      }
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
      } catch (e) {
        /* continue searching */
      }
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
    chain = chain.then(function () {
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
      return fetchAndApplyImage(imgRect, imageUrl, 'FILL', '[Feed/thumb]').then(function () {});
    });
  }

  // Source avatar — find "Img" RECTANGLE inside "Source Feed / Icon"
  if (avatarUrl) {
    chain = chain.then(function () {
      var sourceIcon = findChildByName(instance, 'Source Feed / Icon', 6);
      if (!sourceIcon) return;
      var imgRect = findRectByName(sourceIcon, 'Img', 3);
      if (!imgRect) return;
      return fetchAndApplyImage(imgRect, avatarUrl, 'FILL', '[Feed/avatar]').then(function () {});
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
export function applyFeedData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  var cardType = card['#Feed_CardType'] || '';
  Logger.debug(
    '[FeedApplicator] Applying data: type=' +
      cardType +
      ', title="' +
      (card['#Feed_Title'] || '').substring(0, 30) +
      '"',
  );

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
    chain = chain.then(function () {
      return applyMarketDescription(instance, card);
    });
  }

  return chain;
}
```

**Step 2: Verify it compiles**

Run: `npm run typecheck -w packages/plugin`
Expected: No new errors in feed-data-applicator.ts

---

## Task 2: Wire applicator into feed-page-creator.ts

**Files:**

- Modify: `packages/plugin/src/sandbox/feed-page-builder/feed-page-creator.ts`

**Step 1: Add import**

At top of file, add:

```typescript
import { applyFeedData } from './feed-data-applicator';
```

**Step 2: Call applyFeedData after createInstance**

In `importAllCards()` function, after line 131 (`resizeToColumnWidth`), add data application:

```typescript
// Inside the .then(function(component) { ... }) block, after resizeToColumnWidth:
return applyFeedData(instance, card).then(function () {
  results.push({ instance: instance, index: idx });
});
```

The full modified block (lines ~128-132) becomes:

```typescript
return importFeedComponent(card).then(function(component) {
  if (component) {
    var instance = component.createInstance();
    resizeToColumnWidth(instance, config.columnWidth);
    return applyFeedData(instance, card).then(function() {
      results.push({ instance: instance, index: idx });
    });
  } else {
    return createPlaceholder(cardType, config.columnWidth, 200).then(function(placeholder) {
      results.push({ instance: placeholder, index: idx });
      errors.push('Card ' + idx + ' (' + cardType + '): component not found, using placeholder');
    });
  }
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build passes

**Step 4: Commit**

```bash
git add packages/plugin/src/sandbox/feed-page-builder/feed-data-applicator.ts packages/plugin/src/sandbox/feed-page-builder/feed-page-creator.ts
git commit -m "feat: add feed data applicator — fill cards with titles, prices, sources, images"
```

---

## Task 3: Add missing extension fields for complete data extraction

**Files:**

- Modify: `packages/extension/src/feed-parser.ts`

The extension parser already extracts most fields but may be missing some. Verify these fields are extracted:

- `#Feed_Title` — card title/description
- `#Feed_Price` — price value (digits only)
- `#Feed_OldPrice` — old price (if present)
- `#Feed_ImageUrl` — main card image
- `#Feed_SourceName` — source name
- `#Feed_SourceAvatarUrl` — source avatar image
- `#Feed_SourceDomain` — source domain
- `#Feed_HasSound` — for video cards
- `#Feed_ProductTitle` — product title in product preview

**Step 1: Check parsePostCard and parseVideoCard for missing fields**

Ensure `parseVideoCard` extracts:

```typescript
// Product preview title (from post-products-preview)
var productPreview = element.querySelector(SEL.productsPreview);
if (productPreview) {
  var productTitle = getText(productPreview, '[class*="post-products-preview__title"]');
  if (productTitle) row['#Feed_ProductTitle'] = productTitle;

  var productPrice = getText(productPreview, '.EcomFeedDiscountPrice');
  if (productPrice) row['#Feed_Price'] = extractPrice(productPrice);
}
```

**Step 2: Check parseAdvertCard extracts description**

Ads have `Description > Some kind of description text...` structure. Ensure `#Feed_Title` is populated from the visible description text.

**Step 3: Rebuild extension**

Run: `npm run build -w packages/extension`

**Step 4: Commit if changes made**

```bash
git add packages/extension/src/feed-parser.ts
git commit -m "fix: extract missing feed fields (product title, product price)"
```

---

## Task 4: Test end-to-end

**Steps:**

1. Rebuild all: `npm run build`
2. Reload extension in Chrome (`chrome://extensions`)
3. Open ya.ru (feed page)
4. Click extension icon
5. In Figma plugin, accept import
6. Verify cards show:
   - Market cards: title, price, source name, product image, source avatar
   - Video/Post cards: description, source name, product preview, avatar
   - Ads cards: description text

**Debug:** If properties don't apply, check Figma console for `[FeedApplicator]` messages. Common issues:

- Property key mismatch (hash suffix may differ between component versions)
- `setProperties` silent failure (property not exposed at that level)
- Image fetch CORS failure

---

## Task 5: Add unit test for applyFeedData property mapping

**Files:**

- Create: `packages/plugin/tests/feed/feed-data-applicator.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the imports
vi.mock('../../src/sandbox/image-apply', () => ({
  fetchAndApplyImage: vi.fn().mockResolvedValue(true),
  normalizeImageUrl: vi.fn((url: string) => url || null),
}));

vi.mock('../../src/sandbox/page-builder/image-operations', () => ({
  preloadInstanceFonts: vi.fn().mockResolvedValue(undefined),
}));

import { applyFeedData } from '../../src/sandbox/feed-page-builder/feed-data-applicator';
import type { FeedCardRow } from '../../src/types/feed-card-types';

function makeCard(overrides: Partial<Record<string, string>>): FeedCardRow {
  return {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '0',
    ...overrides,
  } as FeedCardRow;
}

describe('applyFeedData', () => {
  it('sets source name on Source Feed child', async () => {
    const setProps = vi.fn();
    const sourceFeed = {
      type: 'INSTANCE',
      name: 'Source Feed',
      componentProperties: { 'Source Name#3435:2': { type: 'TEXT', value: '' } },
      setProperties: setProps,
      children: [],
    };
    const instance = {
      type: 'INSTANCE',
      name: 'Market Production Snippet',
      componentProperties: {},
      children: [{ type: 'FRAME', name: 'wrapper', children: [sourceFeed] }],
    } as unknown as InstanceNode;

    const card = makeCard({ '#Feed_SourceName': 'Яндекс Маркет' });
    await applyFeedData(instance, card);

    expect(setProps).toHaveBeenCalledWith(
      expect.objectContaining({ 'Source Name#3435:2': 'Яндекс Маркет' }),
    );
  });
});
```

**Step 2: Run test**

Run: `npm run test -- --run tests/feed/feed-data-applicator.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/plugin/tests/feed/feed-data-applicator.test.ts
git commit -m "test: add feed data applicator unit test"
```
