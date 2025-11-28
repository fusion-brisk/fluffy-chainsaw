// Parsing Rules Configuration
// Этот файл содержит правила парсинга для DOM и JSON, которые могут обновляться удаленно.

export interface FieldRule {
  // Приоритет поиска в DOM (CSS селекторы)
  domSelectors: string[];
  
  // Приоритет поиска в JSON (ключи объекта)
  jsonKeys: string[];
  
  // Опционально: тип данных для пост-обработки
  type?: 'text' | 'image' | 'price' | 'html' | 'attribute' | 'boolean';
  
  // Опционально: атрибут для извлечения (если type === 'attribute' или для изображений/ссылок)
  domAttribute?: string;
}

export interface ParsingSchema {
  version: number;
  rules: Record<string, FieldRule>;
}

export const DEFAULT_PARSING_RULES: ParsingSchema = {
  version: 1,
  rules: {
    '#SnippetType': {
      domSelectors: [], // Определяется логикой классов контейнера
      jsonKeys: ['type', 'snippetType'],
      type: 'text'
    },
    '#ProductURL': {
      domSelectors: [], // Извлекается специализированной функцией extractProductURL
      jsonKeys: ['url', 'link', 'href', 'productUrl'],
      type: 'attribute',
      domAttribute: 'href'
    },
    '#OrganicTitle': {
      domSelectors: [
        '.OrganicTitle',
        '[class*="OrganicTitle"]',
        '.EProductSnippet2-Title',
        '[class*="EProductSnippet2-Title"]',
        '.EProductSnippet2-Title a', 
        '[class*="EProductSnippet2-Title"] a'
      ],
      jsonKeys: ['title', 'name', 'headline', 'text'],
      type: 'text'
    },
    '#ShopName': {
      domSelectors: [
        '.EShopName',
        '[class*="EShopName"]',
        '[class*="ShopName"]'
      ],
      jsonKeys: ['shopName', 'shop', 'vendor', 'domain'],
      type: 'text'
    },
    '#OrganicPath': {
      domSelectors: [
        '.Path',
        '[class*="Path"]'
      ],
      jsonKeys: ['path', 'breadcrumbs'],
      type: 'text'
    },
    '#OrganicText': {
      domSelectors: [
        '.OrganicTextContentSpan',
        '[class*="OrganicTextContentSpan"]',
        '.EProductSnippet2-Text',
        '[class*="EProductSnippet2-Text"]'
      ],
      jsonKeys: ['description', 'text', 'snippet'],
      type: 'text'
    },
    '#OrganicImage': {
      domSelectors: [
        '.Organic-OfferThumbImage',
        '[class*="Organic-OfferThumbImage"]',
        '.EProductSnippet2-Thumb img', 
        '[class*="EProductSnippet2-Thumb"] img', 
        'img'
      ],
      jsonKeys: ['image', 'thumbnail', 'thumb', 'img'],
      type: 'image',
      domAttribute: 'src'
    },
    '#ThumbImage': {
      domSelectors: [], // Обычно совпадает с OrganicImage
      jsonKeys: ['thumbnail', 'thumb', 'image'],
      type: 'image'
    },
    '#OrganicPrice': {
      domSelectors: [], // Сложная логика в extractPrices, но здесь можно задать базовые селекторы
      jsonKeys: ['price', 'currentPrice', 'value'],
      type: 'price'
    },
    '#OldPrice': {
      domSelectors: [], 
      jsonKeys: ['oldPrice'],
      type: 'price'
    },
    '#DiscountPercent': {
      domSelectors: [
        '.Price-DiscountPercent',
        '[class*="Price-DiscountPercent"]',
        '.EProductSnippet2-Discount', 
        '[class*="Discount"]'
      ],
      jsonKeys: ['discount', 'discountPercent'],
      type: 'text'
    },
    '#ShopRating': {
      domSelectors: [
        '.Rating',
        '[class*="Rating"]',
        '[aria-label*="рейтинг" i]'
      ],
      jsonKeys: ['rating', 'stars'],
      type: 'text'
    },
    '#ReviewsNumber': {
      domSelectors: [
        '[class*="Review"]',
        '.Reviews',
        '[class*="Reviews"]',
        '[aria-label*="отзыв" i]'
      ],
      jsonKeys: ['reviews', 'reviewsCount'],
      type: 'text'
    },
    '#ProductRating': {
      domSelectors: [
        '.ELabelRating',
        '[class*="ELabelRating"]',
        '[class*="LabelRating"]',
        '[class*="label-rating"]'
      ],
      jsonKeys: ['productRating'],
      type: 'text'
    },
    // Специальные селекторы для логики EPriceGroup
    'EPriceGroup_Pair': {
        domSelectors: ['.EPriceGroup-Pair', '[class*="EPriceGroup-Pair"]'],
        jsonKeys: [],
        type: 'boolean'
    },
    'EPriceGroup_Container': {
        domSelectors: ['.EPriceGroup', '[class*="EPriceGroup"]'],
        jsonKeys: [],
        type: 'attribute'
    },
    'EPriceGroup_Price': {
        domSelectors: [
          '.EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Value', 
          '[class*="EPriceGroup-Price"]:not([class*="EPrice_view_old"]) .EPrice-Value'
        ],
        jsonKeys: [],
        type: 'price'
    },
     'EPriceGroup_Currency': {
        domSelectors: [
          '.EPriceGroup-Price:not(.EPrice_view_old) .EPrice-Currency', 
          '[class*="EPriceGroup-Price"]:not([class*="EPrice_view_old"]) .EPrice-Currency'
        ],
        jsonKeys: [],
        type: 'text'
    },
    'EPrice_Old': {
        domSelectors: [
          '.EPrice_view_old .EPrice-Value', 
          '[class*="EPrice_view_old"] .EPrice-Value', 
          '.EPrice_view_old [class*="EPrice-Value"]', 
          '.EPrice_view_old', 
          '[class*="EPrice_view_old"]'
        ],
        jsonKeys: [],
        type: 'price'
    },
    'LabelDiscount_Content': {
        domSelectors: [
          '.LabelDiscount .Label-Content', 
          '[class*="LabelDiscount"] .Label-Content', 
          '.LabelDiscount [class*="Label-Content"]', 
          '.LabelDiscount', 
          '[class*="LabelDiscount"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
     'EPriceBarometer': {
        domSelectors: ['.EPriceBarometer', '[class*="EPriceBarometer"]'],
        jsonKeys: [],
        type: 'attribute'
    }
  }
};

