/**
 * Pure masonry layout algorithm (greedy shortest-column).
 * ES5-safe: no optional chaining, no nullish coalescing, no modern APIs.
 * No Figma API, no side effects.
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

/**
 * Find the index of the column with the minimum height.
 * On tie, returns the first (leftmost) column.
 */
function findShortestColumn(columnHeights: number[]): number {
  var minIndex = 0;
  for (var i = 1; i < columnHeights.length; i++) {
    if (columnHeights[i] < columnHeights[minIndex]) {
      minIndex = i;
    }
  }
  return minIndex;
}

/**
 * Assign masonry positions to items using a greedy shortest-column algorithm.
 *
 * 1. Initialize N column height trackers (all 0)
 * 2. For each item: place in the column with minimum height
 * 3. x = col * (columnWidth + gap), y = columnHeights[col]
 * 4. Advance: columnHeights[col] += item.height + gap
 * 5. totalHeight = max(columnHeights) - gap
 * 6. totalWidth = columns * columnWidth + (columns - 1) * gap
 */
export function assignMasonryPositions(
  items: MasonryItem[],
  config: MasonryConfig
): MasonryResult {
  var columns = config.columns;
  var columnWidth = config.columnWidth;
  var gap = config.gap;

  var totalWidth = columns * columnWidth + (columns - 1) * gap;

  if (items.length === 0) {
    return {
      positions: [],
      totalWidth: totalWidth,
      totalHeight: 0,
    };
  }

  // Initialize column heights to 0
  var columnHeights: number[] = [];
  for (var c = 0; c < columns; c++) {
    columnHeights.push(0);
  }

  var positions: MasonryPosition[] = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var col = findShortestColumn(columnHeights);
    var x = col * (columnWidth + gap);
    var y = columnHeights[col];

    positions.push({
      id: item.id,
      x: x,
      y: y,
      column: col,
    });

    columnHeights[col] = y + item.height + gap;
  }

  // Total height = max column height minus trailing gap
  var maxHeight = 0;
  for (var h = 0; h < columnHeights.length; h++) {
    if (columnHeights[h] > maxHeight) {
      maxHeight = columnHeights[h];
    }
  }

  return {
    positions: positions,
    totalWidth: totalWidth,
    totalHeight: maxHeight - gap,
  };
}
