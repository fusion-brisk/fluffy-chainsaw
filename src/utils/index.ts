// Re-export all utilities from modules

// Regex utilities
export { 
  getCachedRegex, 
  escapeRegex 
} from './regex';

// Encoding utilities
export { 
  fixEncoding, 
  getTextContent 
} from './encoding';

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
  applyFigmaTheme, 
  sendMessageToPlugin, 
  closePlugin,
  loadPagesList,
  loadSheetsList,
  shuffleArray
} from './plugin-bridge';

// DOM utilities
export { 
  findSnippetContainers, 
  filterTopLevelContainers, 
  isInsideAdvProductGallery,
  extractProductURL,
  getStyleTags
} from './dom-utils';

// DOM Cache utilities (Phase 5 optimization)
export {
  buildContainerCache,
  buildDOMCache,
  findSnippetContainersOptimized,
  queryFromCache,
  queryAllFromCache,
  queryFirstMatch,
  hasClass,
  getTextByClass
} from './dom-cache';
export type { ContainerCache, DOMCache } from './dom-cache';

// Price extraction utilities
export { 
  extractPrices,
  formatPriceWithThinSpace
} from './price-extractor';
export type { PriceResult } from './price-extractor';

// MHTML parsing utilities
export { 
  parseMhtmlFile 
} from './mhtml-parser';

// JSON parsing utilities
export { 
  parseJsonFromNoframes,
  extractFaviconFromJson,
  collectAllFields,
  extractSnippetsFromJson
} from './json-parser';

// CSS Cache utilities (Phase 4 optimization)
export { 
  buildCSSCache,
  getRulesByClass,
  getRuleByClasses,
  getRuleByClassPattern,
  getFirstSpriteUrl,
  getPositionForClass,
  getSizeForClass
} from './css-cache';
export type { CSSCache, CSSRuleEntry } from './css-cache';

// Favicon extraction utilities
export { 
  extractFavicon 
} from './favicon-extractor';
export type { SpriteState } from './favicon-extractor';

// Snippet parsing utilities
export { 
  extractRowData,
  deduplicateRows,
  parseYandexSearchResults
} from './snippet-parser';

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
