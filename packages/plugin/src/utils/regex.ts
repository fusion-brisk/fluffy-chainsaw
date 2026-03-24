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
export const PX_VALUES_REGEX = /(\d+(?:\.\d+)?)px/g;
export const PX_NEGATIVE_REGEX = /-?\d+(?:\.\d+)?px/g;

// Favicon class patterns
export const FAVICON_PAGE_CLASS_REGEX = /Favicon-Page(\d+)|favicon_page_(\d+)/i;
export const FAVICON_POS_CLASS_REGEX = /Favicon-Page\d+_pos_(\d+)/;
export const FAVICON_ENTRY_CLASS_REGEX = /Favicon-Entry(\d+)|favicon_entry_(\d+)/i;

// Favicon sprite URL patterns
export const FAVICON_SPRITE_URL_REGEX = /favicon\.yandex\.net\/favicon\/v2\/(.+?)(\?|$)/;
export const FAVICON_V2_URL_REGEX = /favicon\.yandex\.net\/favicon\/v2\/(.+)/i;
export const FAVICON_HOST_REGEX = /\/favicon\/v2\/([^?/;]+)/;

// CSS sprite rules
export const SPRITE_URL_REGEX = /url\s*\(\s*["']?([^"')]*favicon\.yandex\.net\/favicon\/v2\/[^"')]+)["']?\s*\)/gi;

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

// Price/number extraction
export const PRICE_DIGITS_REGEX = /[^0-9]/g;
export const CURRENCY_RUB_REGEX = /₽|руб/i;
export const CURRENCY_USD_REGEX = /\$/i;
export const CURRENCY_EUR_REGEX = /€/;
// DISCOUNT_VALUE_REGEX требует наличие минуса ИЛИ процента, чтобы не захватить цену
// Минусы: U+2212 (−), U+002D (-), U+2013 (–), U+2014 (—)
export const DISCOUNT_VALUE_REGEX = /[\u2212\u002D\u2013\u2014]\s*([\d\s\u2009\u00A0,]+)\s*%?|([\d\s\u2009\u00A0,]+)\s*%/;
export const RATING_REGEX = /([\d,]+)/;
export const REVIEWS_REGEX = /([\d\s,]+)\s*К?\s*(?:отзыв|review)/i;

// JSON parsing from noframes
export const NOFRAMES_JSON_REGEX = /<noframes[^>]*id=["']lazy-react-state-post-search["'][^>]*>([\s\S]*?)<\/noframes>/i;

// Rating validation (should not start with minus signs)
export const RATING_INVALID_START_REGEX = /^[\u2212\u002D\u2013\u2014]/;

// Favicon path extraction (different from FAVICON_HOST_REGEX - captures full path)
export const FAVICON_V2_PATH_REGEX = /\/favicon\/v2\/([^?]+)/;

// Price numbers extraction for JSON parsing
export const PRICE_NUMBERS_REGEX = /([\d\s,]+)/;
