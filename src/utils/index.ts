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

