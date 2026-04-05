/**
 * Feed Page Builder — barrel index
 *
 * Public API for creating Figma feed pages from FeedCardRow data.
 */

export { createFeedPage, clearFeedComponentCache } from './feed-page-creator';
export type { FeedPageOptions, FeedPageResult } from './feed-page-creator';

export { selectFeedVariant, importFeedComponent } from './feed-component-map';

export { assignMasonryPositions } from './feed-masonry-layout';
export type {
  MasonryItem,
  MasonryConfig,
  MasonryPosition,
  MasonryResult,
} from './feed-masonry-layout';
