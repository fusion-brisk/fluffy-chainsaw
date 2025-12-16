// ============================================================================
// COMPILED REGEX CONSTANTS (Фаза 1 оптимизации: компиляция 1 раз при загрузке)
// ============================================================================

// Encoding detection
export const ENCODING_BAD_CHARS_REGEX = /[ÐÑÐÐÐÐÐÐÐÐÐÐÐÐÐÐÐÐ]/;

// Style tag extraction
export const STYLE_TAG_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/gi;
export const STYLE_TAG_CONTENT_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/i;

// CSS property extraction
export const BG_IMAGE_URL_REGEX = /background-image\s*:\s*url\s*\(\s*([^)]+)\s*\)/i;
export const BG_POSITION_REGEX = /background-position(?:-y)?\s*:\s*([^;]+)/i;
export const BG_SIZE_REGEX = /background-size\s*:\s*([^;]+)/i;
export const BG_SIZE_GLOBAL_REGEX = /background-size[^}]*:\s*([^;}]+)/gi;
export const PX_VALUE_REGEX = /(\d+(?:\.\d+)?)px/i;
export const PX_VALUES_REGEX = /(\d+(?:\.\d+)?)px/g;
export const PX_WITH_SIGN_REGEX = /(?:^|\s)(-?\d+(?:\.\d+)?)px/;
export const PX_NEGATIVE_REGEX = /-?\d+(?:\.\d+)?px/g;

// Favicon class patterns
export const FAVICON_PAGE_CLASS_REGEX = /Favicon-Page(\d+)|favicon_page_(\d+)/i;
export const FAVICON_POS_CLASS_REGEX = /Favicon-Page\d+_pos_(\d+)/;
export const FAVICON_ENTRY_CLASS_REGEX = /Favicon-Entry(\d+)|favicon_entry_(\d+)/i;

// Favicon sprite URL patterns
export const FAVICON_SPRITE_URL_REGEX = /favicon\.yandex\.net\/favicon\/v2\/(.+?)(\?|$)/;
export const FAVICON_V2_URL_REGEX = /favicon\.yandex\.net\/favicon\/v2\/(.+)/i;
export const FAVICON_HOST_REGEX = /\/favicon\/v2\/([^\?\/;]+)/;

// CSS sprite rules (for matchAll)
export const SPRITE_BG_IMAGE_REGEX = /background-image[^}]*url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi;
export const SPRITE_URL_REGEX = /url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi;
export const SPRITE_RULE_LOWER_REGEX = /\.favicon_page_\d+\.favicon_entry_\d+(?:\s+\.[^{]*)?\{[^}]*background-image[^}]*url\s*\(\s*["']?([^"')]+)["']?\s*\)[^}]*background-size[^}]*:([^;}]+)[^}]*\}/i;
export const SPRITE_RULE_UPPER_REGEX = /\.Favicon-Page\d+\.Favicon-Entry\d+(?:\.[^{]*)?\{[^}]*background-image[^}]*url\s*\(\s*["']?([^"')]+)["']?\s*\)[^}]*background-size[^}]*:([^;}]+)[^}]*\}/i;
export const SPRITE_BG_IMAGE_WITH_SIZE_REGEX = /background-image[^}]*url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/i;
export const SPRITE_FULL_RULE_REGEX = /[^{]*\{[^}]*background-image[^}]*url\s*\(\s*["']?[^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+["']?\s*\)[^}]*background-size[^}]*:([^;}]+)[^}]*\}/i;

// Raw HTML sprite patterns
export const RAW_HTML_SPRITE_HREF_REGEX = /href\s*=\s*["']([^"']*favicon\.yandex\.net\/favicon\/v2\/[^"']+)["']/gi;
export const RAW_HTML_SPRITE_URL_REGEX = /url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi;
export const RAW_HTML_SPRITE_QUOTED_REGEX = /["']([^"']*favicon\.yandex\.net\/favicon\/v2\/[^"']+)["']/gi;
export const RAW_HTML_SPRITE_PLAIN_REGEX = /(https?:\/\/[^\s"'>]*favicon\.yandex\.net\/favicon\/v2\/[^\s"'>]+)/gi;
export const QUERY_PARAMS_REGEX = /\?[^"')]+/;

// Text/string cleanup
export const QUOTES_REGEX = /['"]/g;
export const EDGE_QUOTES_REGEX = /^['"]|['"]$/g;
export const WHITESPACE_REGEX = /\s+/g;
export const WHITESPACE_SPLIT_REGEX = /\s+/;

// HTML entity decoding
export const HTML_AMP_REGEX = /&amp;/g;
export const HTML_LT_REGEX = /&lt;/g;
export const HTML_GT_REGEX = /&gt;/g;
export const HTML_QUOT_REGEX = /&quot;/g;

// Quoted-printable decoding
export const QP_EQUALS_REGEX = /=3D/g;
export const QP_SEMICOLON_REGEX = /=3B/g;
export const QP_LINEBREAK_REGEX = /=\r?\n/g;

// Regex special chars escape
export const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

// Price/number extraction
export const PRICE_DIGITS_REGEX = /[^0-9]/g;
export const CURRENCY_RUB_REGEX = /₽|руб/i;
export const CURRENCY_USD_REGEX = /\$/i;
export const CURRENCY_EUR_REGEX = /€/;
export const DISCOUNT_PERCENT_REGEX = /([\d,]+)\s*%/;
// DISCOUNT_VALUE_REGEX требует наличие минуса ИЛИ процента, чтобы не захватить цену
// Минусы: U+2212 (−), U+002D (-), U+2013 (–), U+2014 (—)
export const DISCOUNT_VALUE_REGEX = /[\u2212\u002D\u2013\u2014]\s*([\d\s\u2009\u00A0,]+)\s*%?|([\d\s\u2009\u00A0,]+)\s*%/;
export const RATING_REGEX = /([\d,]+)/;
export const REVIEWS_REGEX = /([\d\s,]+)\s*К?\s*(?:отзыв|review)/i;

// CSS rules with favicon
export const FAVICON_CSS_RULES_REGEX = /[^{]*\{[^}]*favicon[^}]*\}/gi;
export const FAVICON_YANDEX_CSS_RULES_REGEX = /[^{]*\{[^}]*favicon\.yandex\.net[^}]*\}/gi;

// MHTML parsing
export const MHTML_CONTENT_TYPE_REGEX = /Content-Type:\s*multipart\/related[^;\r\n]*;\s*boundary=["']?([^"'\r\n;]+)["']?/i;
export const MHTML_BOUNDARY_REGEX = /boundary=["']?([^"'\r\n;]+)["']?/i;
export const MHTML_BOUNDARY_HEADER_REGEX = /boundary=([^\s\r\n"';]+)/i;
export const MHTML_HTML_DOCTYPE_REGEX = /<!DOCTYPE[^>]*>[\s\S]*<\/html>/i;
export const MHTML_PART_CONTENT_TYPE_REGEX = /Content-Type:\s*([^;\r\n]+)/i;
export const MHTML_CONTENT_AFTER_HEADERS_REGEX = /\r?\n\r?\n([\s\S]*)$/;
export const MHTML_TRANSFER_ENCODING_REGEX = /Content-Transfer-Encoding:\s*([^\r\n]+)/i;
export const MHTML_SOFT_LINEBREAK_REGEX = /=\r?\n/g;
export const MHTML_QP_CHAR_REGEX = /=([0-9A-F]{2})/gi;

// JSON parsing from noframes
export const NOFRAMES_JSON_REGEX = /<noframes[^>]*id=["']lazy-react-state-post-search["'][^>]*>([\s\S]*?)<\/noframes>/i;

// Rating validation (should not start with minus signs)
export const RATING_INVALID_START_REGEX = /^[\u2212\u002D\u2013\u2014]/;

// Favicon path extraction (different from FAVICON_HOST_REGEX - captures full path)
export const FAVICON_V2_PATH_REGEX = /\/favicon\/v2\/([^?]+)/;

// Price numbers extraction for JSON parsing
export const PRICE_NUMBERS_REGEX = /([\d\s,]+)/;

// Link stylesheet detection
export const LINK_STYLESHEET_REGEX = /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;

// ============================================================================
// DYNAMIC REGEX CACHE (для regex с переменными)
// ============================================================================
const regexCache = new Map<string, RegExp>();

export function getCachedRegex(pattern: string, flags: string = ''): RegExp {
  const key = `${pattern}|${flags}`;
  let cached = regexCache.get(key);
  if (!cached) {
    cached = new RegExp(pattern, flags);
    regexCache.set(key, cached);
  }
  return cached;
}

export function escapeRegex(str: string): string {
  return str.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

