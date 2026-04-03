/**
 * Snippet handlers — re-export orchestrator
 *
 * All handler functions are split into focused modules:
 * - image-handlers.ts — image loading, EThumb/EThumbGroup switching
 * - text-content-handlers.ts — text content filling (titles, paths, ratings, quotes, addresses)
 * - visibility-handlers.ts — visibility management (price block, EcomMeta, empty groups)
 *
 * This file re-exports all public handlers so existing imports from
 * './snippet-handlers' continue to work unchanged.
 */

// Image handlers
export { handleImageType } from './image-handlers';

// Text content handlers
export {
  handleESnippetOrganicTextFallback,
  handleESnippetOrganicHostFromFavicon,
  handleShopInfoUgcAndEReviewsShopText,
  handleOfficialShop,
  handleQuoteText,
  handleOrganicPath,
  handleShopOfflineRegion,
} from './text-content-handlers';

// Visibility handlers
export {
  handleHidePriceBlock,
  handleEcomMetaVisibility,
  handleEmptyGroups,
} from './visibility-handlers';

// handleEOfferItem — DELETED (replaced by schema engine, see eoffer-item.ts)
// handleEShopItem — DELETED (replaced by schema engine, see eshop-item.ts)
// handleESnippetProps — DELETED (replaced by schema engine, see esnippet.ts)
// handleMetaVisibility — DELETED (deprecated wrapper for handleEmptyGroups)
// handleEProductSnippet — DELETED (replaced by schema engine, see eproduct-snippet.ts)
