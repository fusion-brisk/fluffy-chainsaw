/**
 * Строго типизированные поля CSV/HTML данных
 * 
 * Этот файл определяет все известные поля данных, которые могут быть
 * извлечены из HTML-сниппетов и применены к Figma-компонентам.
 */

/**
 * Тип сниппета в HTML
 */
export type SnippetType = 
  | 'EShopItem'
  | 'EOfferItem'
  | 'EProductSnippet2'
  | 'EProductSnippet'
  | 'ProductTile-Item'
  | 'Organic_withOfferInfo'
  | 'Organic'
  | 'ESnippet'
  | 'Snippet';

/**
 * Все известные поля данных
 */
export interface CSVFields {
  // === Идентификация ===
  /** Тип сниппета */
  '#SnippetType'?: SnippetType;
  /** URL страницы товара */
  '#ProductURL'?: string;
  /** Поисковый запрос */
  '#query'?: string;
  
  // === Основной контент ===
  /** Заголовок сниппета */
  '#OrganicTitle'?: string;
  /** Описание/текст сниппета */
  '#OrganicText'?: string;
  /** Хост/домен магазина */
  '#OrganicHost'?: string;
  /** Путь URL */
  '#OrganicPath'?: string;
  /** Изображение товара */
  '#OrganicImage'?: string;
  
  // === Магазин ===
  /** Название магазина */
  '#ShopName'?: string;
  /** Фавиконка магазина */
  '#FaviconImage'?: string;
  /** Официальный магазин */
  '#OfficialShop'?: 'true' | 'false';
  /** Рейтинг магазина (основное поле для Figma слоя #ShopInfo-Ugc) */
  '#ShopInfo-Ugc'?: string;
  /** Рейтинг магазина (legacy поле) */
  '#ShopRating'?: string;
  /** Текст отзывов магазина ("62,8K отзывов на магазин") */
  '#EReviews_shopText'?: string;
  
  // === Рейтинг товара ===
  /** Рейтинг товара (0-5) */
  '#ProductRating'?: string;
  /** Количество отзывов */
  '#ReviewsNumber'?: string;
  /** Количество отзывов (альт.) */
  '#ReviewCount'?: string;
  
  // === Цены ===
  /** Текущая цена */
  '#OrganicPrice'?: string;
  /** Старая цена */
  '#OldPrice'?: string;
  /** Процент скидки */
  '#DiscountPercent'?: string;
  /** Текст скидки (форматированный) */
  '#discount'?: string;
  /** Префикс скидки */
  '#DiscountPrefix'?: string;
  
  // === EPriceGroup ===
  /** Есть ли скидка */
  '#EPriceGroup_Discount'?: 'true' | 'false';
  /** Есть ли старая цена */
  '#EPriceGroup_OldPrice'?: 'true' | 'false';
  /** Включен ли Fintech */
  '#EPriceGroup_Fintech'?: 'true' | 'false';
  
  // === EPrice ===
  /** View EPrice (default/special) */
  '#EPrice_View'?: 'default' | 'special';
  
  // === Fintech ===
  /** Тип Fintech */
  '#Fintech_Type'?: string;
  /** View Fintech */
  '#Fintech_View'?: string;
  
  // === LabelDiscount ===
  /** View LabelDiscount */
  '#LabelDiscount_View'?: string;
  
  // === ELabelGroup ===
  /** Есть ли барометр */
  '#ELabelGroup_Barometer'?: 'true' | 'false';
  /** View барометра */
  '#EPriceBarometer_View'?: string;
  /** isCompact барометра */
  '#EPriceBarometer_isCompact'?: 'true' | 'false';
  
  // === Brand ===
  /** Бренд товара */
  '#Brand'?: string;
  
  // === Кнопки ===
  /** Есть ли кнопка checkout */
  '#BUTTON'?: 'true' | 'false';
  /** View кнопки */
  '#ButtonView'?: string;
  /** Тип кнопки */
  '#ButtonType'?: 'checkout' | 'shop' | string;
  /** Видимость EButton */
  '#EButton_visible'?: 'true' | 'false';
  /** Лейбл checkout */
  '#EMarketCheckoutLabel'?: 'true' | 'false';
  
  // === Доставка ===
  /** Есть ли группа доставки */
  '#EDeliveryGroup'?: 'true' | 'false';
  /** Список элементов доставки */
  '#DeliveryList'?: string;
  
  // === BNPL ===
  /** Есть ли BNPL */
  '#EBnpl'?: 'true' | 'false';
  
  // === EOfferItem специфичные ===
  /** Дефолтное предложение */
  '#EOfferItem_defaultOffer'?: 'true' | 'false';
  /** Есть ли кнопка в EOfferItem */
  '#EOfferItem_hasButton'?: 'true' | 'false';
  /** Есть ли отзывы в EOfferItem */
  '#EOfferItem_hasReviews'?: 'true' | 'false';
  /** Есть ли доставка в EOfferItem */
  '#EOfferItem_hasDelivery'?: 'true' | 'false';
  
  // === Изображения ===
  /** Thumbnail изображение */
  '#ThumbImage'?: string;
<<<<<<< HEAD
  /** Изображение 1 (EThumbGroup) */
  '#Image1'?: string;
  /** Изображение 2 (EThumbGroup) */
  '#Image2'?: string;
  /** Изображение 3 (EThumbGroup) */
  '#Image3'?: string;
=======
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
  
  // === Цитата из отзывов (EQuote) ===
  /** Текст цитаты ("«Отличный магазин...»") */
  '#EQuote-Text'?: string;
  /** URL аватара автора цитаты (retina если есть) */
  '#EQuote-AuthorAvatar'?: string;
  /** Текст цитаты (legacy) */
  '#QuoteText'?: string;
  /** URL изображения автора (legacy) */
  '#QuoteImage'?: string;
}

/**
 * CSVRow с поддержкой как типизированных, так и произвольных полей
 * Это позволяет постепенную миграцию без breaking changes
 */
export type CSVRow = CSVFields & {
  [key: string]: string | undefined;
};

/**
 * Строгий CSVRow только с известными полями
 */
export type StrictCSVRow = CSVFields;

/**
 * Список обязательных полей для разных типов сниппетов
 */
export const REQUIRED_FIELDS: Record<SnippetType, (keyof CSVFields)[]> = {
  'EShopItem': ['#SnippetType', '#ShopName', '#OrganicPrice'],
  'EOfferItem': ['#SnippetType', '#ShopName', '#OrganicPrice'],
  'EProductSnippet2': ['#SnippetType', '#OrganicTitle', '#OrganicPrice'],
  'EProductSnippet': ['#SnippetType', '#OrganicTitle', '#OrganicPrice'],
  'ProductTile-Item': ['#SnippetType', '#OrganicTitle'],
  'Organic_withOfferInfo': ['#SnippetType', '#OrganicTitle', '#OrganicPrice'],
  'Organic': ['#SnippetType', '#OrganicTitle'],
  'ESnippet': ['#SnippetType'],
  'Snippet': ['#SnippetType']
};

/**
 * Поля-изображения (для определения типа обработки)
 */
export const IMAGE_FIELDS: (keyof CSVFields)[] = [
  '#FaviconImage',
  '#OrganicImage',
  '#ThumbImage',
<<<<<<< HEAD
  '#Image1',
  '#Image2',
  '#Image3',
=======
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
  '#EQuote-AuthorAvatar',
  '#QuoteImage'
];

/**
 * Булевы поля (для нормализации значений)
 */
export const BOOLEAN_FIELDS: (keyof CSVFields)[] = [
  '#OfficialShop',
  '#EPriceGroup_Discount',
  '#EPriceGroup_OldPrice',
  '#EPriceGroup_Fintech',
  '#ELabelGroup_Barometer',
  '#EPriceBarometer_isCompact',
  '#BUTTON',
  '#EButton_visible',
  '#EMarketCheckoutLabel',
  '#EDeliveryGroup',
  '#EBnpl',
  '#EOfferItem_defaultOffer',
  '#EOfferItem_hasButton',
  '#EOfferItem_hasReviews',
  '#EOfferItem_hasDelivery'
];

/**
 * Числовые поля (рейтинги, цены)
 */
export const NUMERIC_FIELDS: (keyof CSVFields)[] = [
  '#ProductRating',
  '#DiscountPercent'
];
