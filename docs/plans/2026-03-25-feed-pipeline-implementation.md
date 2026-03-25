# Feed Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Plugin-side feed pipeline — import FeedCardRow[] data and render masonry grid of DC Feed library components in Figma.

**Architecture:** New `apply-feed-payload` message in code.ts → `feed-page-builder/` module (parallel to `page-builder/`) → masonry layout of imported library instances. Reuses existing handler registry, instance cache, image loader, progress messages.

**Tech Stack:** TypeScript (ES5 in sandbox), Figma Plugin API, Vitest

**Design doc:** `docs/plans/2026-03-25-feed-pipeline-design.md`

---

### Task 1: Add FeedCardRow Types

**Files:**
- Create: `packages/plugin/src/types/feed-card-types.ts`
- Modify: `packages/plugin/src/types/index.ts`

**Step 1: Create feed-card-types.ts**

Copy the prepared file from `/Users/shchuchkin/Downloads/files 6/feed-card-types.ts` to `packages/plugin/src/types/feed-card-types.ts`.

**Step 2: Export from types/index.ts**

Add to the existing exports in `packages/plugin/src/types/index.ts`:

```typescript
export type { FeedCardRow, FeedCardFields, FeedCardType, FeedCardSize, FeedPlatform, FeedComponentVariant, VariantSelector, FeedMasonryConfig } from './feed-card-types';
export { FEED_REQUIRED_FIELDS, FEED_IMAGE_FIELDS, FEED_BOOLEAN_FIELDS, DEFAULT_MASONRY_CONFIG } from './feed-card-types';
```

**Step 3: Run typecheck**

Run: `npm run typecheck -w packages/plugin`
Expected: PASS (no new errors)

**Step 4: Commit**

```bash
git add packages/plugin/src/types/feed-card-types.ts packages/plugin/src/types/index.ts
git commit -m "feat: add FeedCardRow types for feed pipeline"
```

---

### Task 2: Feed Component Map

**Files:**
- Create: `packages/plugin/src/sandbox/feed-page-builder/feed-component-map.ts`

**Step 1: Write test for variant selector**

Create `packages/plugin/tests/feed/variant-selector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { selectFeedVariant } from '../../src/sandbox/feed-page-builder/feed-component-map';
import type { FeedCardRow } from '../../src/types/feed-card-types';

function makeRow(overrides: Partial<FeedCardRow>): FeedCardRow {
  return {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '0',
    ...overrides,
  };
}

describe('selectFeedVariant', () => {
  describe('market cards', () => {
    it('returns variant 1-2 range for xs size', () => {
      const row = makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'xs' });
      const result = selectFeedVariant(row);
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(2);
      expect(result!.platform).toBe('desktop');
      expect(result!.key).toBeTruthy();
    });

    it('returns variant 3-6 range for m size', () => {
      const row = makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'm' });
      const result = selectFeedVariant(row);
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(3);
      expect(result!.variant).toBeLessThanOrEqual(6);
    });

    it('returns variant 7-8 range for xl size', () => {
      const row = makeRow({ '#Feed_CardType': 'market', '#Feed_CardSize': 'xl' });
      const result = selectFeedVariant(row);
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(7);
      expect(result!.variant).toBeLessThanOrEqual(8);
    });
  });

  describe('video cards', () => {
    it('returns a variant for ml size', () => {
      const row = makeRow({ '#Feed_CardType': 'video', '#Feed_CardSize': 'ml' });
      const result = selectFeedVariant(row);
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(5);
    });
  });

  describe('post cards', () => {
    it('returns a variant for m size with carousel', () => {
      const row = makeRow({
        '#Feed_CardType': 'post',
        '#Feed_CardSize': 'm',
        '#Feed_CarouselCount': '4',
      });
      const result = selectFeedVariant(row);
      expect(result).not.toBeNull();
    });
  });

  describe('advert cards', () => {
    it('returns production variant by default', () => {
      const row = makeRow({ '#Feed_CardType': 'advert', '#Feed_CardSize': 'm' });
      const result = selectFeedVariant(row);
      expect(result).not.toBeNull();
      expect(result!.variant).toBeGreaterThanOrEqual(1);
      expect(result!.variant).toBeLessThanOrEqual(6);
    });
  });

  describe('mobile platform', () => {
    it('returns mobile variant key', () => {
      const row = makeRow({ '#Feed_Platform': 'mobile' });
      const result = selectFeedVariant(row);
      expect(result).not.toBeNull();
      expect(result!.platform).toBe('mobile');
    });
  });

  describe('unknown type fallback', () => {
    it('returns null for unknown type', () => {
      const row = makeRow({ '#Feed_CardType': 'collection' as any });
      const result = selectFeedVariant(row);
      // collection not implemented yet — null is acceptable
      // OR returns a variant if implemented
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/feed/variant-selector.test.ts`
Expected: FAIL — module not found

**Step 3: Implement feed-component-map.ts**

Create `packages/plugin/src/sandbox/feed-page-builder/feed-component-map.ts`.

This file needs:
1. `FEED_VARIANT_MAP` — Record of variant keys per card type, keyed by `{type}_{variant}_{platform}`
2. `selectFeedVariant(row: FeedCardRow): FeedComponentVariant | null` — selector function

Variant keys come from the DC Feed library (file `0dr1G4gFr6q8enaEOR1YUW`). The key component sets and their structure:

| Card Type | Component Set | Set Key | Variants × Platform |
|-----------|--------------|---------|---------------------|
| post | Posts | `0fdaa4594724de9e5aca70b24697acfe99c47069` | 1–14 × Desktop/Mobile (28 total) |
| video | Videos | `012cb3e9e93ac64676b2ba3e5f33ff3ac9b99061` | 1–5 × Desktop/Mobile (10 total) |
| market | Market Production Snippet | `3b7e0b1f54a2cc8843efb69597158fd1ba0a1858` | 1–8 × Desktop/Mobile (16 total) |
| advert (prod) | Ads Production Snippets | `66df545c9090c6776444d39306af1e3b34e7da41` | 1–6 × Desktop/Mobile (12 total) |
| advert (examples) | Ads Examples | `fa33e1ca52751009197bba25340780694e977cdf` | 1–9 × Desktop/Mobile (18 total) |
| product | Products Examples | `862ed09175edc1b277dd67b9686e753e5c51212d` | 1–21 × Independent/Market × Desktop/Mobile (56 total) |
| collection | Collections | `0a973790f90a010df34a9f6509256b176bd611b3` | 1–4 × Desktop/Mobile (8 total) |

**IMPORTANT:** These are COMPONENT_SET keys (parent). For `importComponentByKeyAsync` we need individual VARIANT keys. We need to resolve them.

**Approach:** Use `figma.importComponentSetByKeyAsync(setKey)` to import the component set, then find the matching variant child by property values (`Variant`, `Platform`). This avoids hardcoding 100+ individual variant keys.

```typescript
import type { FeedCardRow, FeedCardType, FeedCardSize, FeedPlatform, FeedComponentVariant } from '../../types/feed-card-types';
import { Logger } from '../../logger';

// Component SET keys (parent sets, not individual variants)
const FEED_COMPONENT_SET_KEYS: Record<string, string> = {
  'post':           '0fdaa4594724de9e5aca70b24697acfe99c47069',
  'video':          '012cb3e9e93ac64676b2ba3e5f33ff3ac9b99061',
  'market':         '3b7e0b1f54a2cc8843efb69597158fd1ba0a1858',
  'advert_prod':    '66df545c9090c6776444d39306af1e3b34e7da41',
  'advert_examples':'fa33e1ca52751009197bba25340780694e977cdf',
  'product':        '862ed09175edc1b277dd67b9686e753e5c51212d',
  'collection':     '0a973790f90a010df34a9f6509256b176bd611b3',
};

// Cache imported component sets
const componentSetCache: Record<string, ComponentSetNode> = {};

async function importComponentSet(setKey: string): Promise<ComponentSetNode | null> {
  if (componentSetCache[setKey]) return componentSetCache[setKey];
  try {
    const set = await figma.importComponentSetByKeyAsync(setKey);
    componentSetCache[setKey] = set;
    return set;
  } catch (e) {
    Logger.warn('[FeedComponentMap] Failed to import set: ' + setKey + ' — ' + e);
    return null;
  }
}

function findVariantInSet(
  set: ComponentSetNode,
  variantNum: number,
  platform: FeedPlatform
): ComponentNode | null {
  const platformValue = platform === 'desktop' ? 'Desktop' : 'Mobile';
  for (const child of set.children) {
    if (child.type !== 'COMPONENT') continue;
    const props = child.variantProperties;
    if (!props) continue;
    if (props['Variant'] === String(variantNum) && props['Platform'] === platformValue) {
      return child;
    }
  }
  return null;
}

// Size → variant range mapping
function getVariantRange(type: FeedCardType, size: FeedCardSize, row: FeedCardRow): { min: number; max: number } {
  switch (type) {
    case 'market':
      if (size === 'xs') return { min: 1, max: 2 };
      if (size === 'xl') return { min: 7, max: 8 };
      return { min: 3, max: 6 };
    case 'video':
      return { min: 1, max: 5 };
    case 'post':
      // Posts have 14 desktop variants — select based on content
      if (row['#Feed_CarouselCount']) return { min: 1, max: 4 };
      return { min: 5, max: 14 };
    case 'advert':
      return { min: 1, max: 6 }; // production range
    case 'product':
      return { min: 1, max: 7 }; // independent range
    case 'collection':
      return { min: 1, max: 4 };
    default:
      return { min: 1, max: 1 };
  }
}

export function selectFeedVariant(row: FeedCardRow): FeedComponentVariant | null {
  const type = row['#Feed_CardType'];
  const size = row['#Feed_CardSize'];
  const platform = row['#Feed_Platform'] || 'desktop';

  const range = getVariantRange(type, size, row);
  // Pick first variant in range (deterministic for now)
  const variant = range.min;

  // Determine which component set to use
  let setKeyName: string = type;
  if (type === 'advert') {
    setKeyName = row['#Feed_AdStyle'] === 'branded' ? 'advert_examples' : 'advert_prod';
  }

  const setKey = FEED_COMPONENT_SET_KEYS[setKeyName];
  if (!setKey) {
    Logger.warn('[FeedComponentMap] No component set for type: ' + type);
    return null;
  }

  return {
    key: setKey, // Will be resolved to variant at import time
    variant,
    platform,
    nodeId: '', // Resolved at import time
  };
}

/** Import a feed component variant — returns instance-ready ComponentNode */
export async function importFeedComponent(
  row: FeedCardRow
): Promise<ComponentNode | null> {
  const selected = selectFeedVariant(row);
  if (!selected) return null;

  const set = await importComponentSet(selected.key);
  if (!set) return null;

  const variant = findVariantInSet(set, selected.variant, selected.platform);
  if (!variant) {
    Logger.warn('[FeedComponentMap] Variant not found: ' + selected.variant + '/' + selected.platform);
    // Fallback: first child
    const firstChild = set.children.find(c => c.type === 'COMPONENT');
    return (firstChild as ComponentNode) || null;
  }
  return variant;
}

export function clearFeedComponentCache(): void {
  for (const key in componentSetCache) {
    delete componentSetCache[key];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/feed/variant-selector.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/plugin/src/sandbox/feed-page-builder/feed-component-map.ts packages/plugin/tests/feed/variant-selector.test.ts
git commit -m "feat: add feed component map with variant selection"
```

---

### Task 3: Masonry Layout Algorithm

**Files:**
- Create: `packages/plugin/src/sandbox/feed-page-builder/feed-masonry-layout.ts`
- Create: `packages/plugin/tests/feed/masonry-layout.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { assignMasonryPositions, type MasonryItem, type MasonryResult } from '../../src/sandbox/feed-page-builder/feed-masonry-layout';

describe('assignMasonryPositions', () => {
  it('assigns items to shortest column', () => {
    const items: MasonryItem[] = [
      { id: '0', width: 250, height: 300 },
      { id: '1', width: 250, height: 200 },
      { id: '2', width: 250, height: 350 },
      { id: '3', width: 250, height: 250 },
      { id: '4', width: 250, height: 180 },
      { id: '5', width: 250, height: 280 },
    ];

    const result = assignMasonryPositions(items, {
      columns: 3,
      columnWidth: 250,
      gap: 16,
    });

    expect(result.positions).toHaveLength(6);
    // First 3 items go to columns 0, 1, 2
    expect(result.positions[0].column).toBe(0);
    expect(result.positions[1].column).toBe(1);
    expect(result.positions[2].column).toBe(2);
    // Item 0 at x=0, item 1 at x=266, item 2 at x=532
    expect(result.positions[0].x).toBe(0);
    expect(result.positions[1].x).toBe(266); // 250 + 16
    expect(result.positions[2].x).toBe(532); // 2 * (250 + 16)
    // All first-row items at y=0
    expect(result.positions[0].y).toBe(0);
    expect(result.positions[1].y).toBe(0);
    expect(result.positions[2].y).toBe(0);
    // 4th item goes to shortest column (col 1: height 200)
    expect(result.positions[3].column).toBe(1);
    expect(result.positions[3].y).toBe(200 + 16); // 216
  });

  it('calculates total dimensions', () => {
    const items: MasonryItem[] = [
      { id: '0', width: 250, height: 100 },
      { id: '1', width: 250, height: 200 },
    ];
    const result = assignMasonryPositions(items, {
      columns: 2,
      columnWidth: 250,
      gap: 16,
    });
    expect(result.totalWidth).toBe(516); // 2 * 250 + 1 * 16
    expect(result.totalHeight).toBe(200); // max column height
  });

  it('handles single column', () => {
    const items: MasonryItem[] = [
      { id: '0', width: 250, height: 100 },
      { id: '1', width: 250, height: 200 },
    ];
    const result = assignMasonryPositions(items, {
      columns: 1,
      columnWidth: 250,
      gap: 16,
    });
    expect(result.positions[0].y).toBe(0);
    expect(result.positions[1].y).toBe(116); // 100 + 16
    expect(result.totalHeight).toBe(316); // 100 + 16 + 200
  });

  it('handles empty input', () => {
    const result = assignMasonryPositions([], { columns: 5, columnWidth: 250, gap: 16 });
    expect(result.positions).toHaveLength(0);
    expect(result.totalHeight).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/feed/masonry-layout.test.ts`
Expected: FAIL

**Step 3: Implement masonry layout**

Create `packages/plugin/src/sandbox/feed-page-builder/feed-masonry-layout.ts`:

```typescript
/**
 * Masonry Layout Algorithm
 *
 * Greedy shortest-column placement.
 * Pure function — no Figma API dependency.
 */

export interface MasonryItem {
  id: string;
  width: number;
  height: number;
}

export interface MasonryConfig {
  columns: number;
  columnWidth: number;
  gap: number;
}

export interface MasonryPosition {
  id: string;
  x: number;
  y: number;
  column: number;
}

export interface MasonryResult {
  positions: MasonryPosition[];
  totalWidth: number;
  totalHeight: number;
}

export function assignMasonryPositions(
  items: MasonryItem[],
  config: MasonryConfig
): MasonryResult {
  var columnHeights: number[] = [];
  for (var c = 0; c < config.columns; c++) {
    columnHeights.push(0);
  }

  var positions: MasonryPosition[] = [];

  for (var i = 0; i < items.length; i++) {
    // Find shortest column
    var minCol = 0;
    var minHeight = columnHeights[0];
    for (var col = 1; col < config.columns; col++) {
      if (columnHeights[col] < minHeight) {
        minHeight = columnHeights[col];
        minCol = col;
      }
    }

    var x = minCol * (config.columnWidth + config.gap);
    var y = columnHeights[minCol];

    positions.push({
      id: items[i].id,
      x: x,
      y: y,
      column: minCol,
    });

    // Advance column height
    columnHeights[minCol] += items[i].height + config.gap;
  }

  // Total dimensions
  var maxHeight = 0;
  for (var h = 0; h < columnHeights.length; h++) {
    // Subtract trailing gap from last item in each column
    var colH = columnHeights[h] > 0 ? columnHeights[h] - config.gap : 0;
    if (colH > maxHeight) maxHeight = colH;
  }
  var totalWidth = config.columns * config.columnWidth + (config.columns - 1) * config.gap;

  return {
    positions: positions,
    totalWidth: totalWidth,
    totalHeight: maxHeight,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/feed/masonry-layout.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/plugin/src/sandbox/feed-page-builder/feed-masonry-layout.ts packages/plugin/tests/feed/masonry-layout.test.ts
git commit -m "feat: add masonry layout algorithm for feed grid"
```

---

### Task 4: Feed Page Creator

**Files:**
- Create: `packages/plugin/src/sandbox/feed-page-builder/feed-page-creator.ts`
- Create: `packages/plugin/src/sandbox/feed-page-builder/index.ts`

**Step 1: Create feed-page-creator.ts**

This is the core module — it takes `FeedCardRow[]` and produces a Figma frame with masonry-positioned instances.

```typescript
/**
 * Feed Page Creator — creates masonry grid of feed cards in Figma
 *
 * Parallel to page-builder/page-creator.ts but for DC Feed library.
 */

import { Logger } from '../../logger';
import type { FeedCardRow, FeedPlatform, FeedMasonryConfig } from '../../types/feed-card-types';
import { DEFAULT_MASONRY_CONFIG } from '../../types/feed-card-types';
import { importFeedComponent, selectFeedVariant, clearFeedComponentCache } from './feed-component-map';
import { assignMasonryPositions, type MasonryItem } from './feed-masonry-layout';
import { buildInstanceCache } from '../../utils/instance-cache';
import { createPlaceholder } from '../page-builder/component-import';

export interface FeedPageOptions {
  platform?: FeedPlatform;
  frameName?: string;
  masonry?: Partial<FeedMasonryConfig>;
}

export interface FeedPageResult {
  success: boolean;
  frame: FrameNode | null;
  createdCount: number;
  errors: string[];
}

/**
 * Create a feed page from FeedCardRow array.
 */
export async function createFeedPage(
  cards: FeedCardRow[],
  options: FeedPageOptions = {}
): Promise<FeedPageResult> {
  var platform: FeedPlatform = options.platform || 'desktop';
  var masonryDefaults = DEFAULT_MASONRY_CONFIG[platform];
  var config = {
    columns: (options.masonry && options.masonry.columns) || masonryDefaults.columns,
    columnWidth: (options.masonry && options.masonry.columnWidth) || masonryDefaults.columnWidth,
    gap: (options.masonry && options.masonry.gap) || masonryDefaults.gap,
    feedWidth: (options.masonry && options.masonry.feedWidth) || masonryDefaults.feedWidth,
  };

  var errors: string[] = [];
  var createdCount = 0;

  Logger.info('[FeedPageCreator] Creating feed page: ' + cards.length + ' cards, ' +
    config.columns + ' columns, platform=' + platform);

  // 1. Import all components and create instances
  var instances: Array<{ instance: InstanceNode | FrameNode; row: FeedCardRow }> = [];

  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    try {
      figma.ui.postMessage({
        type: 'progress',
        current: Math.round((i / cards.length) * 80) + 10,
        total: 100,
        message: 'Импорт карточки ' + (i + 1) + '/' + cards.length + ' (' + card['#Feed_CardType'] + ')',
        operationType: 'feed-import',
      });

      var component = await importFeedComponent(card);
      if (!component) {
        Logger.warn('[FeedPageCreator] No component for card ' + i + ' (' + card['#Feed_CardType'] + ')');
        var placeholder = createPlaceholder(card['#Feed_CardType'], config.columnWidth, 200);
        if (placeholder) {
          instances.push({ instance: placeholder, row: card });
        }
        errors.push('Card ' + i + ': no component for type ' + card['#Feed_CardType']);
        continue;
      }

      var instance = component.createInstance();
      // Resize to column width
      var ratio = config.columnWidth / instance.width;
      instance.resize(config.columnWidth, instance.height * ratio);

      instances.push({ instance: instance, row: card });
      createdCount++;
    } catch (e) {
      var errMsg = e instanceof Error ? e.message : String(e);
      errors.push('Card ' + i + ': ' + errMsg);
      Logger.error('[FeedPageCreator] Error creating card ' + i + ':', e);
    }
  }

  if (instances.length === 0) {
    return { success: false, frame: null, createdCount: 0, errors: ['No cards created'] };
  }

  // 2. Measure heights and run masonry layout
  var masonryItems: MasonryItem[] = [];
  for (var j = 0; j < instances.length; j++) {
    masonryItems.push({
      id: String(j),
      width: instances[j].instance.width,
      height: instances[j].instance.height,
    });
  }

  var layout = assignMasonryPositions(masonryItems, config);

  // 3. Create parent frame
  var pageFrame = figma.createFrame();
  pageFrame.name = options.frameName || 'Feed Page';
  pageFrame.resize(config.feedWidth, Math.max(layout.totalHeight, 100));
  pageFrame.clipsContent = true;

  // Position in viewport
  pageFrame.x = Math.round(figma.viewport.center.x - config.feedWidth / 2);
  pageFrame.y = Math.round(figma.viewport.center.y);

  // 4. Place instances at masonry positions
  for (var k = 0; k < instances.length; k++) {
    var pos = layout.positions[k];
    var inst = instances[k].instance;
    pageFrame.appendChild(inst);
    inst.x = pos.x;
    inst.y = pos.y;
  }

  Logger.info('[FeedPageCreator] Created feed page: ' + createdCount + '/' + cards.length +
    ' cards, ' + layout.totalWidth + 'x' + layout.totalHeight + 'px');

  return {
    success: true,
    frame: pageFrame,
    createdCount: createdCount,
    errors: errors,
  };
}

export { clearFeedComponentCache };
```

**Step 2: Create index.ts barrel**

Create `packages/plugin/src/sandbox/feed-page-builder/index.ts`:

```typescript
export { createFeedPage, clearFeedComponentCache } from './feed-page-creator';
export type { FeedPageOptions, FeedPageResult } from './feed-page-creator';
export { selectFeedVariant, importFeedComponent } from './feed-component-map';
export { assignMasonryPositions } from './feed-masonry-layout';
export type { MasonryItem, MasonryConfig, MasonryPosition, MasonryResult } from './feed-masonry-layout';
```

**Step 3: Run typecheck**

Run: `npm run typecheck -w packages/plugin`
Expected: PASS (no new errors beyond pre-existing ones)

**Step 4: Commit**

```bash
git add packages/plugin/src/sandbox/feed-page-builder/
git commit -m "feat: add feed page creator with masonry layout"
```

---

### Task 5: Wire Up Message Handler

**Files:**
- Modify: `packages/plugin/src/sandbox/code.ts`

**Step 1: Add apply-feed-payload handler**

In `packages/plugin/src/sandbox/code.ts`, add a new handler block AFTER the `apply-relay-payload` handler (after line 512, before the catch block):

```typescript
// === Apply Feed Payload (from Browser Extension — Feed mode) ===
if (msg.type === 'apply-feed-payload') {
  const feedPayload = msg.payload as {
    cards: import('../../types/feed-card-types').FeedCardRow[];
    platform?: import('../../types/feed-card-types').FeedPlatform;
  };

  Logger.info('[Feed] Payload: ' + (feedPayload.cards?.length || 0) + ' cards');

  try {
    if (!feedPayload.cards || feedPayload.cards.length === 0) {
      throw new Error('No feed cards in payload');
    }

    figma.ui.postMessage({
      type: 'progress',
      current: 5,
      total: 100,
      message: 'Импорт Feed карточек...',
      operationType: 'feed-import',
    });

    const { createFeedPage } = await import('./feed-page-builder');
    const result = await createFeedPage(feedPayload.cards, {
      platform: feedPayload.platform || 'desktop',
    });

    figma.ui.postMessage({
      type: 'progress',
      current: 100,
      total: 100,
      message: 'Готово!',
      operationType: 'feed-import',
    });

    if (result.success && result.frame) {
      figma.currentPage.selection = [result.frame];
      figma.viewport.scrollAndZoomIntoView([result.frame]);

      figma.ui.postMessage({
        type: 'relay-payload-applied',
        success: true,
        itemCount: result.createdCount,
        frameName: result.frame.name,
      });

      Logger.info('[Feed] Created "' + result.frame.name + '": ' + result.createdCount + ' cards');
    } else {
      throw new Error(result.errors.length > 0 ? result.errors.join('; ') : 'Failed to create feed page');
    }
  } catch (error) {
    Logger.error('[Feed] Error:', error);
    figma.ui.postMessage({
      type: 'relay-payload-applied',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    figma.notify('❌ Feed import error');
  }

  return;
}
```

**Step 2: Add import at top of code.ts**

No static import needed — using dynamic `import()` for lazy loading.

**Step 3: Run typecheck**

Run: `npm run typecheck -w packages/plugin`
Expected: PASS

**Step 4: Run build**

Run: `npm run build`
Expected: PASS — Rollup bundles the new modules

**Step 5: Commit**

```bash
git add packages/plugin/src/sandbox/code.ts
git commit -m "feat: wire apply-feed-payload message handler"
```

---

### Task 6: Mock Data for Testing

**Files:**
- Create: `packages/plugin/tests/feed/fixtures/mock-feed-cards.ts`

**Step 1: Create mock data fixture**

Based on the 28-card dataset from the spec:

```typescript
import type { FeedCardRow } from '../../../src/types/feed-card-types';

export const MOCK_FEED_CARDS: FeedCardRow[] = [
  {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'xs',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '0',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/example1.jpg',
    '#Feed_Title': 'Кресло офисное',
    '#Feed_Price': '5999',
    '#Feed_Currency': '₽',
    '#Feed_SourceName': 'Яндекс Маркет',
  },
  {
    '#Feed_CardType': 'post',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '1',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/example2.jpg',
    '#Feed_Title': 'Стильный диван для гостиной',
    '#Feed_Price': '45999',
    '#Feed_Currency': '₽',
    '#Feed_CarouselCount': '4',
    '#Feed_SourceName': 'skdesign.ru',
  },
  {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'xl',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '2',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/example3.jpg',
    '#Feed_Title': 'Кровать двуспальная с подъёмным механизмом',
    '#Feed_Price': '24990',
    '#Feed_OldPrice': '34990',
    '#Feed_Currency': '₽',
    '#Feed_Discount': '–29%',
    '#Feed_SourceName': 'Яндекс Маркет',
  },
  {
    '#Feed_CardType': 'advert',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '3',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/example4.jpg',
    '#Feed_SourceDomain': 'start.practicum.yandex',
    '#Feed_SourceLabel': 'Реклама',
    '#Feed_Description': 'Начните карьеру в IT',
  },
  {
    '#Feed_CardType': 'video',
    '#Feed_CardSize': 'ml',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '4',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/example5.jpg',
    '#Feed_HasVideo': 'true',
    '#Feed_SourceName': 'samsonite',
  },
  {
    '#Feed_CardType': 'market',
    '#Feed_CardSize': 'm',
    '#Feed_Platform': 'desktop',
    '#Feed_Index': '5',
    '#Feed_ImageUrl': 'https://avatars.mds.yandex.net/example6.jpg',
    '#Feed_Title': 'Стул барный',
    '#Feed_Price': '8999',
    '#Feed_Currency': '₽',
    '#Feed_SourceName': 'Яндекс Маркет',
    '#Feed_HasCashback': 'true',
  },
];
```

**Step 2: Commit**

```bash
git add packages/plugin/tests/feed/fixtures/mock-feed-cards.ts
git commit -m "test: add mock feed card fixtures"
```

---

### Task 7: Build Verification & Full Test Suite

**Step 1: Run all tests**

Run: `npm run test`
Expected: All existing + new tests PASS

**Step 2: Run typecheck**

Run: `npm run typecheck -w packages/plugin`
Expected: No new errors

**Step 3: Run lint**

Run: `npm run lint -w packages/plugin`
Expected: PASS (fix any lint issues)

**Step 4: Run full build**

Run: `npm run build`
Expected: PASS — dist/code.js includes feed-page-builder modules

**Step 5: Commit any fixes**

```bash
git commit -m "chore: fix lint and build issues for feed pipeline"
```

---

### Task 8: Integration Test in Figma (Manual)

**Step 1: Load plugin in Figma**

1. Open Figma Desktop
2. Plugins → Development → Import plugin from manifest
3. Point to `packages/plugin/manifest.json`
4. Open Dev Console (Plugins → Development → Open console)

**Step 2: Send mock payload via console**

In the plugin UI console or via MCP bridge, send:

```javascript
figma.ui.postMessage({
  type: 'apply-feed-payload',
  payload: {
    cards: [
      { '#Feed_CardType': 'market', '#Feed_CardSize': 'xs', '#Feed_Platform': 'desktop', '#Feed_Index': '0', '#Feed_Title': 'Test Market', '#Feed_Price': '999' },
      { '#Feed_CardType': 'post', '#Feed_CardSize': 'm', '#Feed_Platform': 'desktop', '#Feed_Index': '1', '#Feed_Title': 'Test Post', '#Feed_SourceName': 'test.ru' },
      { '#Feed_CardType': 'video', '#Feed_CardSize': 'ml', '#Feed_Platform': 'desktop', '#Feed_Index': '2', '#Feed_HasVideo': 'true', '#Feed_SourceName': 'testchannel' },
    ],
    platform: 'desktop',
  },
});
```

**Step 3: Verify output**

Expected: A frame named "Feed Page" appears with 3 card instances arranged in a masonry grid (3 columns for 3 cards). Check:
- Cards are from DC Feed library (not placeholders)
- Masonry positioning looks correct (items fill columns left to right)
- No console errors

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | FeedCardRow types | `types/feed-card-types.ts` |
| 2 | Component map + variant selector | `feed-page-builder/feed-component-map.ts` |
| 3 | Masonry layout algorithm | `feed-page-builder/feed-masonry-layout.ts` |
| 4 | Feed page creator | `feed-page-builder/feed-page-creator.ts` |
| 5 | Message handler wiring | `sandbox/code.ts` |
| 6 | Mock test fixtures | `tests/feed/fixtures/mock-feed-cards.ts` |
| 7 | Build verification | All files |
| 8 | Manual Figma test | Plugin in Figma |

**Dependencies:** Task 1 → Task 2 → Task 4. Task 3 is independent (parallel with Task 2). Tasks 5-8 sequential after Task 4.
