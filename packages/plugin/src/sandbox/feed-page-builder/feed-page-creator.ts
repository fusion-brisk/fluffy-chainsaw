/**
 * Feed Page Creator — creates a Figma frame with masonry-positioned feed card instances.
 *
 * ES5 sandbox: no optional chaining, no nullish coalescing, no modern APIs.
 * Uses Figma API (figma.createFrame, figma.viewport, etc.).
 */

import { Logger } from '../../logger';
import {
  FeedCardRow,
  FeedPlatform,
  FeedMasonryConfig,
  DEFAULT_MASONRY_CONFIG,
} from '../../types/feed-card-types';
import { importFeedComponent, clearFeedComponentCache } from './feed-component-map';
import { assignMasonryPositions, MasonryItem, MasonryConfig } from './feed-masonry-layout';
import { createPlaceholder } from '../page-builder/component-import';
import { applyFeedData } from './feed-data-applicator';

// Re-export so barrel can re-export from a single module
export { clearFeedComponentCache };

// ============================================================================
// TYPES
// ============================================================================

export interface FeedPageOptions {
  platform?: FeedPlatform;
  frameName?: string;
  masonry?: Partial<FeedMasonryConfig>;
  relayUrl?: string;
}

export interface FeedPageResult {
  success: boolean;
  frame: FrameNode | null;
  createdCount: number;
  errors: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Merge user-provided masonry overrides with platform defaults.
 */
function buildMasonryConfig(
  platform: FeedPlatform,
  overrides: Partial<FeedMasonryConfig> | undefined,
): FeedMasonryConfig {
  const defaults = DEFAULT_MASONRY_CONFIG[platform];
  if (!overrides) {
    return defaults;
  }
  return {
    columns: overrides.columns !== undefined ? overrides.columns : defaults.columns,
    columnWidth: overrides.columnWidth !== undefined ? overrides.columnWidth : defaults.columnWidth,
    gap: overrides.gap !== undefined ? overrides.gap : defaults.gap,
    feedWidth: overrides.feedWidth !== undefined ? overrides.feedWidth : defaults.feedWidth,
  };
}

/**
 * Resize an instance to fit the target column width while maintaining aspect ratio.
 * Returns the new height after resizing.
 */
function resizeToColumnWidth(instance: SceneNode, columnWidth: number): number {
  const currentWidth = instance.width;
  const currentHeight = instance.height;

  if (currentWidth <= 0 || currentHeight <= 0) {
    return 200; // fallback height
  }

  const scale = columnWidth / currentWidth;
  const newHeight = Math.round(currentHeight * scale);

  (instance as InstanceNode | FrameNode).resize(columnWidth, newHeight);
  return newHeight;
}

/**
 * Post progress message to the UI.
 */
function postProgress(current: number, total: number, message: string): void {
  figma.ui.postMessage({
    type: 'progress',
    current: current,
    total: total,
    message: message,
    operationType: 'feed-import',
  });
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Create a Figma frame containing masonry-positioned feed card instances.
 *
 * Flow:
 *  1. Import or create placeholder for each card
 *  2. Resize instances to column width (maintain aspect ratio)
 *  3. Compute masonry layout positions
 *  4. Create parent frame and place instances
 */
export function createFeedPage(
  cards: FeedCardRow[],
  options?: FeedPageOptions,
): Promise<FeedPageResult> {
  const platform: FeedPlatform = options && options.platform ? options.platform : 'desktop';
  const frameName: string = options && options.frameName ? options.frameName : 'Feed Page';
  const masonryOverrides = options && options.masonry;
  const relayUrl = options && options.relayUrl;
  const config = buildMasonryConfig(platform, masonryOverrides);

  const errors: string[] = [];
  const total = cards.length;

  /**
   * Step 1: Import components and create instances
   */
  function importAllCards(): Promise<
    Array<{ instance: InstanceNode | FrameNode; index: number; card: FeedCardRow }>
  > {
    const results: Array<{
      instance: InstanceNode | FrameNode;
      index: number;
      card: FeedCardRow;
    }> = [];
    let chain = Promise.resolve();

    // Per-card timing instrumentation. We capture (importMs, applyMs, totalMs)
    // per card and emit a single summary at the end. See `.claude/rules/
    // performance.md` §1 — measure before optimizing. Helps spot whether
    // wall-clock goes into component import (cache miss + network) or data
    // application (image fetches, setProperties calls).
    interface CardTiming {
      idx: number;
      cardType: string;
      importMs: number;
      applyMs: number;
      totalMs: number;
    }
    const timings: CardTiming[] = [];

    for (let i = 0; i < cards.length; i++) {
      (function (idx) {
        chain = chain.then(function () {
          const card = cards[idx];
          const cardType = card['#Feed_CardType'] || 'unknown';
          const tCardStart = Date.now();
          let tImportEnd = 0;

          // Advert cards: RTB iframes are usually empty in the DOM (no title,
          // no image). Previously we skipped them, but the unified Feed Card
          // shell now ships a default Tile / Ads placeholder, so an empty
          // advert still materialises as a visible slot in the masonry —
          // preserving layout fidelity with the live page.
          // (No skip — let importFeedComponent + applyAdsData run.)
          postProgress(
            idx + 1,
            total,
            'Importing ' + cardType + ' (' + (idx + 1) + '/' + total + ')',
          );

          return importFeedComponent(card)
            .then(function (component) {
              tImportEnd = Date.now();
              if (component) {
                const instance = component.createInstance();
                resizeToColumnWidth(instance, config.columnWidth);
                return applyFeedData(instance, card, relayUrl).then(function () {
                  results.push({ instance: instance, index: idx, card: card });
                  const tEnd = Date.now();
                  timings.push({
                    idx: idx,
                    cardType: cardType,
                    importMs: tImportEnd - tCardStart,
                    applyMs: tEnd - tImportEnd,
                    totalMs: tEnd - tCardStart,
                  });
                });
              } else {
                return createPlaceholder(cardType, config.columnWidth, 200).then(
                  function (placeholder) {
                    results.push({ instance: placeholder, index: idx, card: card });
                    errors.push(
                      'Card ' + idx + ' (' + cardType + '): component not found, using placeholder',
                    );
                    const tEnd = Date.now();
                    timings.push({
                      idx: idx,
                      cardType: cardType + '/placeholder',
                      importMs: tImportEnd - tCardStart,
                      applyMs: tEnd - tImportEnd,
                      totalMs: tEnd - tCardStart,
                    });
                  },
                );
              }
            })
            .catch(function (e) {
              const msg = e instanceof Error ? e.message : String(e);
              errors.push('Card ' + idx + ' (' + cardType + '): ' + msg);
              // The import threw before tImportEnd was set — fall back to
              // tCardStart for importMs so the summary's totalMs math is
              // consistent even on the error path.
              const tErr = Date.now();
              const importMsErr = (tImportEnd || tErr) - tCardStart;

              return createPlaceholder(cardType, config.columnWidth, 200)
                .then(function (placeholder) {
                  results.push({ instance: placeholder, index: idx, card: card });
                  const tEnd = Date.now();
                  timings.push({
                    idx: idx,
                    cardType: cardType + '/error',
                    importMs: importMsErr,
                    applyMs: tEnd - (tImportEnd || tErr),
                    totalMs: tEnd - tCardStart,
                  });
                })
                .catch(function () {
                  // Even placeholder failed — skip this card entirely
                  errors.push('Card ' + idx + ': placeholder creation also failed');
                  const tEnd = Date.now();
                  timings.push({
                    idx: idx,
                    cardType: cardType + '/skip',
                    importMs: importMsErr,
                    applyMs: tEnd - (tImportEnd || tErr),
                    totalMs: tEnd - tCardStart,
                  });
                });
            });
        });
      })(i);
    }

    return chain.then(function () {
      // Emit a single timing summary: per-cardType aggregate (count, total,
      // avg, max), plus the top-5 slowest cards. Done at INFO level so it
      // ships in the user's exported Logs panel automatically.
      if (timings.length > 0) {
        interface Agg {
          count: number;
          totalMs: number;
          importMs: number;
          applyMs: number;
          maxMs: number;
        }
        const byType: Record<string, Agg> = {};
        let grandTotalMs = 0;
        let grandImportMs = 0;
        let grandApplyMs = 0;
        for (let i = 0; i < timings.length; i++) {
          const t = timings[i];
          grandTotalMs += t.totalMs;
          grandImportMs += t.importMs;
          grandApplyMs += t.applyMs;
          const a = byType[t.cardType];
          if (a) {
            a.count++;
            a.totalMs += t.totalMs;
            a.importMs += t.importMs;
            a.applyMs += t.applyMs;
            if (t.totalMs > a.maxMs) a.maxMs = t.totalMs;
          } else {
            byType[t.cardType] = {
              count: 1,
              totalMs: t.totalMs,
              importMs: t.importMs,
              applyMs: t.applyMs,
              maxMs: t.totalMs,
            };
          }
        }
        Logger.info(
          '[FeedTiming] grand: ' +
            grandTotalMs +
            'ms (' +
            timings.length +
            ' cards, avg ' +
            Math.round(grandTotalMs / timings.length) +
            'ms/card; import ' +
            grandImportMs +
            'ms, apply ' +
            grandApplyMs +
            'ms)',
        );
        const typeKeys = Object.keys(byType);
        for (let i = 0; i < typeKeys.length; i++) {
          const k = typeKeys[i];
          const a = byType[k];
          Logger.info(
            '[FeedTiming] ' +
              k +
              ': ' +
              a.count +
              '× total=' +
              a.totalMs +
              'ms (avg=' +
              Math.round(a.totalMs / a.count) +
              'ms, max=' +
              a.maxMs +
              'ms, import=' +
              a.importMs +
              'ms, apply=' +
              a.applyMs +
              'ms)',
          );
        }
        // Top-5 slowest cards (drives drill-down when one type doesn't
        // explain the wall-clock).
        const sorted = timings.slice().sort(function (a, b) {
          return b.totalMs - a.totalMs;
        });
        const topN = Math.min(5, sorted.length);
        for (let i = 0; i < topN; i++) {
          const t = sorted[i];
          Logger.info(
            '[FeedTiming] slow#' +
              (i + 1) +
              ': idx=' +
              t.idx +
              ' type=' +
              t.cardType +
              ' total=' +
              t.totalMs +
              'ms (import=' +
              t.importMs +
              'ms, apply=' +
              t.applyMs +
              'ms)',
          );
        }
      }
      return results;
    });
  }

  return importAllCards().then(function (items) {
    if (items.length === 0) {
      return {
        success: false,
        frame: null,
        createdCount: 0,
        errors: errors.length > 0 ? errors : ['No cards to process'],
      };
    }

    /**
     * Step 2-3: Decide column binning.
     *
     * Preferred path — `#Feed_SourceCol` (1-based) was emitted by the parser
     * from the live CSS Grid layout. Use it directly so columns match what
     * the user sees on ya.ru (greedy shortest-column otherwise diverges and
     * lands cards in the "wrong" column compared to the source).
     *
     * Fallback — if more than half the items lack SourceCol, run the legacy
     * greedy masonry. Keeps mobile / non-feed paths working unchanged.
     */
    const haveSourceCol = items.filter(function (it) {
      return !!it.card['#Feed_SourceCol'];
    }).length;
    const useSourceLayout = haveSourceCol > items.length / 2;

    const buckets: Array<Array<{ instance: InstanceNode | FrameNode; y: number }>> = [];
    for (let c = 0; c < config.columns; c++) buckets.push([]);

    if (useSourceLayout) {
      // Source-column binning: place each card in its live column, sorted by
      // source order. y is repurposed as the source order index — column
      // sort below works on it the same way.
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rawCol = parseInt(item.card['#Feed_SourceCol'] || '0', 10);
        const col = rawCol > 0 ? rawCol - 1 : -1;
        if (col < 0 || col >= buckets.length) continue;
        const order = parseInt(item.card['#Feed_SourceOrder'] || String(item.index), 10);
        buckets[col].push({ instance: item.instance, y: order });
      }
    } else {
      const masonryItems: MasonryItem[] = [];
      for (let i = 0; i < items.length; i++) {
        masonryItems.push({
          id: String(i),
          width: items[i].instance.width,
          height: items[i].instance.height,
        });
      }
      const layoutConfig: MasonryConfig = {
        columns: config.columns,
        columnWidth: config.columnWidth,
        gap: config.gap,
      };
      const layout = assignMasonryPositions(masonryItems, layoutConfig);
      for (let p = 0; p < layout.positions.length; p++) {
        const pos = layout.positions[p];
        const itemIndex = parseInt(pos.id, 10);
        const item = items[itemIndex];
        if (!item) continue;
        const colIdx = pos.column;
        if (colIdx < 0 || colIdx >= buckets.length) continue;
        buckets[colIdx].push({ instance: item.instance, y: pos.y });
      }
    }

    // Sort cards within each column by y (source order in source-col mode,
    // computed y in masonry mode) to preserve top-to-bottom flow.
    for (let c = 0; c < buckets.length; c++) {
      buckets[c].sort(function (a, b) {
        return a.y - b.y;
      });
    }

    const frame = figma.createFrame();
    frame.name = frameName;
    frame.layoutMode = 'HORIZONTAL';
    frame.itemSpacing = config.gap;
    frame.paddingLeft = 0;
    frame.paddingRight = 0;
    frame.paddingTop = 0;
    frame.paddingBottom = 0;
    frame.clipsContent = true;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    for (let c = 0; c < buckets.length; c++) {
      const column = figma.createFrame();
      column.name = 'Column ' + (c + 1);
      column.layoutMode = 'VERTICAL';
      column.itemSpacing = config.gap;
      column.paddingLeft = 0;
      column.paddingRight = 0;
      column.paddingTop = 0;
      column.paddingBottom = 0;
      column.fills = [];
      // Set width FIRST, lock counter-axis to FIXED, THEN attach to parent.
      // Order matters: a later resize() with primaryAxisSizingMode already
      // 'AUTO' would silently reset the mode back to FIXED. We flip
      // primaryAxisSizingMode='AUTO' last (after children are appended) to
      // make the column hug its content height.
      column.resize(config.columnWidth, 1);
      column.counterAxisSizingMode = 'FIXED';
      frame.appendChild(column);
      const cards = buckets[c];
      for (let i = 0; i < cards.length; i++) {
        const cardInstance = cards[i].instance;
        column.appendChild(cardInstance);
        // Hug content vertically: card height follows its swapped Tile + Source
        // row instead of the component variant's default fixed size.
        // `layoutSizing*` only takes effect once the node lives inside an
        // auto-layout parent — must run AFTER appendChild.
        try {
          cardInstance.layoutSizingHorizontal = 'FIXED';
          cardInstance.layoutSizingVertical = 'HUG';
        } catch (e) {
          Logger.debug(
            '[FeedPageCreator] layoutSizing failed on ' +
              cardInstance.name +
              ': ' +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      }
      column.primaryAxisSizingMode = 'AUTO';
    }

    // Hug content on the outer frame AFTER columns are populated and have
    // their final heights — same reason as above.
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';

    /**
     * Step 6: Position at viewport center using the frame's now-real size.
     */
    const viewport = figma.viewport.center;
    frame.x = Math.round(viewport.x - frame.width / 2);
    frame.y = Math.round(viewport.y - frame.height / 2);

    Logger.debug(
      '[FeedPageCreator] Created feed page: ' +
        frameName +
        ' (' +
        items.length +
        ' cards, ' +
        config.columns +
        ' columns, ' +
        Math.round(frame.height) +
        'px tall, layout=' +
        (useSourceLayout ? 'source-col' : 'masonry') +
        ')',
    );

    if (errors.length > 0) {
      Logger.debug('[FeedPageCreator] Errors: ' + errors.length);
    }

    return {
      success: true,
      frame: frame,
      createdCount: items.length,
      errors: errors,
    };
  });
}
