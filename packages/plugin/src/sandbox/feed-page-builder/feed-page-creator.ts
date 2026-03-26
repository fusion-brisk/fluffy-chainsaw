/**
 * Feed Page Creator — creates a Figma frame with masonry-positioned feed card instances.
 *
 * ES5 sandbox: no optional chaining, no nullish coalescing, no modern APIs.
 * Uses Figma API (figma.createFrame, figma.viewport, etc.).
 */

import { Logger } from '../../logger';
import { FeedCardRow, FeedPlatform, FeedMasonryConfig, DEFAULT_MASONRY_CONFIG } from '../../types/feed-card-types';
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
  overrides: Partial<FeedMasonryConfig> | undefined
): FeedMasonryConfig {
  var defaults = DEFAULT_MASONRY_CONFIG[platform];
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
  var currentWidth = instance.width;
  var currentHeight = instance.height;

  if (currentWidth <= 0 || currentHeight <= 0) {
    return 200; // fallback height
  }

  var scale = columnWidth / currentWidth;
  var newHeight = Math.round(currentHeight * scale);

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
  options?: FeedPageOptions
): Promise<FeedPageResult> {
  var platform: FeedPlatform = (options && options.platform) ? options.platform : 'desktop';
  var frameName: string = (options && options.frameName) ? options.frameName : 'Feed Page';
  var masonryOverrides = options && options.masonry;
  var config = buildMasonryConfig(platform, masonryOverrides);

  var errors: string[] = [];
  var total = cards.length;

  /**
   * Step 1: Import components and create instances
   */
  function importAllCards(): Promise<Array<{ instance: InstanceNode | FrameNode; index: number }>> {
    var results: Array<{ instance: InstanceNode | FrameNode; index: number }> = [];
    var chain = Promise.resolve();

    for (var i = 0; i < cards.length; i++) {
      (function(idx) {
        chain = chain.then(function() {
          var card = cards[idx];
          var cardType = card['#Feed_CardType'] || 'unknown';
          postProgress(idx + 1, total, 'Importing ' + cardType + ' (' + (idx + 1) + '/' + total + ')');

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
          }).catch(function(e) {
            var msg = e instanceof Error ? e.message : String(e);
            errors.push('Card ' + idx + ' (' + cardType + '): ' + msg);

            return createPlaceholder(cardType, config.columnWidth, 200).then(function(placeholder) {
              results.push({ instance: placeholder, index: idx });
            }).catch(function() {
              // Even placeholder failed — skip this card entirely
              errors.push('Card ' + idx + ': placeholder creation also failed');
            });
          });
        });
      })(i);
    }

    return chain.then(function() {
      return results;
    });
  }

  return importAllCards().then(function(items) {
    if (items.length === 0) {
      return {
        success: false,
        frame: null,
        createdCount: 0,
        errors: errors.length > 0 ? errors : ['No cards to process'],
      };
    }

    /**
     * Step 2: Build MasonryItem[] from collected instances
     */
    var masonryItems: MasonryItem[] = [];
    for (var i = 0; i < items.length; i++) {
      masonryItems.push({
        id: String(i),
        width: items[i].instance.width,
        height: items[i].instance.height,
      });
    }

    /**
     * Step 3: Compute masonry positions
     */
    var layoutConfig: MasonryConfig = {
      columns: config.columns,
      columnWidth: config.columnWidth,
      gap: config.gap,
    };
    var layout = assignMasonryPositions(masonryItems, layoutConfig);

    /**
     * Step 4: Create parent frame (no auto-layout — manual positioning)
     */
    var frame = figma.createFrame();
    frame.name = frameName;
    frame.resize(config.feedWidth, Math.max(layout.totalHeight, 1));
    frame.clipsContent = true;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    /**
     * Step 5: Place instances at their masonry positions
     */
    for (var p = 0; p < layout.positions.length; p++) {
      var pos = layout.positions[p];
      var itemIndex = parseInt(pos.id, 10);
      var item = items[itemIndex];
      if (!item) continue;

      item.instance.x = pos.x;
      item.instance.y = pos.y;
      frame.appendChild(item.instance);
    }

    /**
     * Step 6: Position at viewport center
     */
    var viewport = figma.viewport.center;
    frame.x = Math.round(viewport.x - config.feedWidth / 2);
    frame.y = Math.round(viewport.y - layout.totalHeight / 2);

    Logger.debug(
      '[FeedPageCreator] Created feed page: ' + frameName +
      ' (' + items.length + ' cards, ' +
      config.columns + ' columns, ' +
      Math.round(layout.totalHeight) + 'px tall)'
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
