// Re-export all utilities from modules

// Network utilities
export {
  CONFIG,
  SPREADSHEET_ID,
  APPS_SCRIPT_URL,
  fetchWithRetry,
  convertImageToBase64,
  processCSVRows,
  createSheetFromParsedData
} from './network';

// Plugin bridge utilities
export {
  log,
  sendMessageToPlugin,
  closePlugin,
  shuffleArray
  // loadPagesList, loadSheetsList - not used, kept internal for future use
} from './plugin-bridge';

// DOM utilities
export {
  isInsideAdvProductGallery
} from './dom-utils';

// Price extraction utilities
export {
  extractPrices,
  formatPriceWithThinSpace
} from './price-extractor';
export type { PriceResult } from './price-extractor';

// Component properties cache (property lookup optimization)
export {
  getOrBuildPropertyCache,
  findPropertyKey,
  getPropertyMetadata,
  validateVariantValue,
  resetComponentCache,
  logComponentCacheStats,
  getCachedPropertyNames
} from './component-cache';
export type { PropertyMetadata, ComponentPropertyInfo } from './component-cache';

// Yandex shared parsing logic (single source of truth for extension + plugin)
export {
  getSnippetType,
  detectPlatform,
  CONTAINER_SELECTORS,
  ADV_SELECTORS
} from './yandex-shared';

// Layer search utilities
export { findFillableLayer } from './layer-search';

// Relay payload parsing
export { extractRowsFromPayload } from './relay-payload';
export type { ParsedRelayData } from './relay-payload';

// ============================================
// UI Utilities
// ============================================

/**
 * Creates a debounced version of a function
 * @param fn Function to debounce
 * @param delay Delay in milliseconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}
