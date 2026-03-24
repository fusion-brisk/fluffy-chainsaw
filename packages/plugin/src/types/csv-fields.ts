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
  | 'Organic_Adv'
  | 'ESnippet'
  | 'Snippet'
  | 'ImagesGrid'
  | 'EQuickFilters'
  | 'EAsideFilters';

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
  /** Платформа источника (desktop/touch) */
  '#platform'?: 'desktop' | 'touch';
  
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
  /** Флаг наличия скидки (legacy) */
  '#Discount'?: 'true' | 'false';
  /** Префикс скидки */
  '#DiscountPrefix'?: string;
  
  // === EPriceGroup ===
  /** Есть ли скидка */
  '#EPriceGroup_Discount'?: 'true' | 'false';
  /** Есть ли старая цена */
  '#EPriceGroup_OldPrice'?: 'true' | 'false';
  /** Включен ли Fintech */
  '#EPriceGroup_Fintech'?: 'true' | 'false';
  /** Размер EPriceGroup (m, l, L2) */
  '#EPriceGroup_Size'?: string;
  /** Есть ли барометр в EPriceGroup (из BEM-класса EPriceGroup_withBarometer) */
  '#EPriceGroup_Barometer'?: 'true' | 'false';
  /** Есть ли дисклеймер цены ("Цена, доставка от Маркета") */
  '#PriceDisclaimer'?: 'true' | 'false';
  /** Есть ли кэшбек Plus */
  '#PlusCashback'?: 'true' | 'false';
  /** Есть ли расчёт ([EXP] Calculation) */
  '#ExpCalculation'?: 'true' | 'false';
  /** Combining Elements variant (None, Discount, etc.) */
  '#CombiningElements'?: string;
  
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
  /** Группа лейблов (рейтинг и т.д.) */
  '#ELabelGroup'?: 'true' | 'false';
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
  /** Флаг checkout */
  '#isCheckout'?: 'true' | 'false';
  /** Кнопка Market Checkout */
  '#MarketCheckoutButton'?: 'true' | 'false';

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
  /** Изображение 1 (EThumbGroup) */
  '#Image1'?: string;
  /** Изображение 2 (EThumbGroup) */
  '#Image2'?: string;
  /** Изображение 3 (EThumbGroup) */
  '#Image3'?: string;
  
  // === Цитата из отзывов (EQuote) ===
  /** Текст цитаты ("«Отличный магазин...»") */
  '#EQuote-Text'?: string;
  /** URL аватара автора цитаты (retina если есть) */
  '#EQuote-AuthorAvatar'?: string;
  /** Текст цитаты (legacy) */
  '#QuoteText'?: string;
  /** URL изображения автора (legacy) */
  '#QuoteImage'?: string;
  
  // === Промо-сниппеты (Organic_Adv / ESnippet) ===
  /** Это промо-сниппет */
  '#isPromo'?: 'true' | 'false';
  /** Это рекламный сниппет (из AdvProductGallery) */
  '#isAdv'?: 'true' | 'false';
  /** Заголовок рекламной галереи */
  '#AdvGalleryTitle'?: string;
  /** ID родительского serp-item (<li data-cid="...">) для группировки */
  '#serpItemId'?: string;
  /** Тип контейнера (EntityOffers, ProductsTiles, AdvProductGallery) */
  '#containerType'?: string;
  /** Заголовок EntityOffers блока */
  '#EntityOffersTitle'?: string;
  /** Заголовок EShopList блока */
  '#EShopListTitle'?: string;
  /** Заголовок ProductsTiles блока (напр. «Избранное») */
  '#ProductsTilesTitle'?: string;
  /** Наличие кнопки «Показать все» в ProductsTiles */
  '#ProductsTilesShowAll'?: 'true' | 'false';
  /** Текст кнопки «Показать все» в ProductsTiles */
  '#ProductsTilesShowAllText'?: string;
  /** URL кнопки «Показать все» */
  '#ProductsTilesShowAllHref'?: string;
  /** Наличие картинки в сниппете */
  '#withThumb'?: 'true' | 'false';
  /** Есть ли сайтлинки */
  '#Sitelinks'?: 'true' | 'false';
  /** Количество сайтлинков */
  '#SitelinksCount'?: string;
  /** Сайтлинк 1 */
  '#Sitelink_1'?: string;
  /** Сайтлинк 2 */
  '#Sitelink_2'?: string;
  /** Сайтлинк 3 */
  '#Sitelink_3'?: string;
  /** Сайтлинк 4 */
  '#Sitelink_4'?: string;
  /** Текст промо-блока (полный) */
  '#Promo'?: string;
  /** Текст промо-лейбла */
  '#PromoLabel'?: string;
  /** Текст ссылки промо-блока */
  '#PromoLink'?: string;
  /** Есть ли промо-блок */
  '#withPromo'?: 'true' | 'false';
  /** Текст рекламной метки */
  '#AdvLabel'?: string;
  /** Тип верификации (goods, etc.) */
  '#VerifiedType'?: string;
  /** Сайт прошёл верификацию */
  '#isVerified'?: 'true' | 'false';
  
  // === Валюта ===
  /** Символ валюты (₽, $, €) */
  '#Currency'?: string;
  
  // === Изображения (доп.) ===
  /** Тип изображения (EThumb, EThumbGroup) */
  '#imageType'?: string;
  /** Количество картинок в EThumbGroup */
  '#ThumbGroupCount'?: string;
  /** Есть ли цитата из отзывов */
  '#withQuotes'?: 'true' | 'false';
  /** Есть ли цена (для Organic_Adv) */
  '#withPrice'?: 'true' | 'false';
  
  // === Каталожные страницы ===
  /** Это страница каталога (без цены) */
  '#isCatalogPage'?: 'true' | 'false';
  /** Целевой тип сниппета для каталожных страниц */
  '#TargetSnippetType'?: string;
  /** Скрыть блок цены (каталожные страницы) */
  '#hidePriceBlock'?: 'true' | 'false';
  
  // === Доставка (доп.) ===
  /** Количество вариантов доставки */
  '#EDeliveryGroup-Count'?: string;
  /** Вариант доставки 1 */
  '#EDeliveryGroup-Item-1'?: string;
  /** Вариант доставки 2 */
  '#EDeliveryGroup-Item-2'?: string;
  /** Вариант доставки 3 */
  '#EDeliveryGroup-Item-3'?: string;
  /** Доставка из-за границы */
  '#EDelivery_abroad'?: 'true' | 'false';
  
  // === BNPL (доп.) ===
  /** Количество BNPL опций (EBnpl) */
  '#EBnpl-Count'?: string;
  /** BNPL опция 1 */
  '#EBnpl-Item-1'?: string;
  /** BNPL опция 2 */
  '#EBnpl-Item-2'?: string;
  /** BNPL опция 3 */
  '#EBnpl-Item-3'?: string;
  /** ShopInfo-Bnpl (Organic/ESnippet BNPL) */
  '#ShopInfo-Bnpl'?: 'true' | 'false';
  /** Количество ShopInfo-Bnpl опций */
  '#ShopInfo-Bnpl-Count'?: string;
  /** ShopInfo-Bnpl опция 1 */
  '#ShopInfo-Bnpl-Item-1'?: string;
  /** ShopInfo-Bnpl опция 2 */
  '#ShopInfo-Bnpl-Item-2'?: string;
  /** ShopInfo-Bnpl опция 3 */
  '#ShopInfo-Bnpl-Item-3'?: string;
  
  // === Адрес и контакты ===
  /** Есть ли офлайн адрес магазина */
  '#hasShopOfflineRegion'?: 'true' | 'false';
  /** Текст адреса (город, метро) */
  '#addressText'?: string;
  /** Адрес (legacy, snippet-parser) */
  '#Address'?: string;
  /** Ссылка адреса (текст) */
  '#addressLink'?: string;
  /** Телефон магазина */
  '#Phone'?: string;
  /** Контакты (альтернативное поле) */
  '#Contacts'?: string;
  
  // === InfoIcon ===
  /** Наличие иконки "Инфо" в Fintech */
  '#InfoIcon'?: 'true' | 'false';

  // === EQuickFilters (панель быстрых фильтров) ===
  /** Количество кнопок фильтров */
  '#FilterButtonsCount'?: string;
  /** Кнопка фильтра 1 */
  '#FilterButton_1'?: string;
  /** Кнопка фильтра 2 */
  '#FilterButton_2'?: string;
  /** Кнопка фильтра 3 */
  '#FilterButton_3'?: string;
  /** Кнопка фильтра 4 */
  '#FilterButton_4'?: string;
  /** Кнопка фильтра 5 */
  '#FilterButton_5'?: string;
  /** Кнопка фильтра 6 */
  '#FilterButton_6'?: string;
  /** Кнопка фильтра 7 */
  '#FilterButton_7'?: string;
  /** Кнопка фильтра 8 */
  '#FilterButton_8'?: string;
  /** Кнопка фильтра 9 */
  '#FilterButton_9'?: string;
  /** Кнопка фильтра 10 */
  '#FilterButton_10'?: string;
  /** Показывать кнопку "Все фильтры" */
  '#AllFiltersButton'?: 'true' | 'false';
  /** Тип кнопки фильтра 1 (dropdown/sort/suggest) */
  '#FilterButtonType_1'?: string;
  /** Тип кнопки фильтра 2 */
  '#FilterButtonType_2'?: string;
  /** Тип кнопки фильтра 3 */
  '#FilterButtonType_3'?: string;
  /** Тип кнопки фильтра 4 */
  '#FilterButtonType_4'?: string;
  /** Тип кнопки фильтра 5 */
  '#FilterButtonType_5'?: string;
  /** Тип кнопки фильтра 6 */
  '#FilterButtonType_6'?: string;
  /** Тип кнопки фильтра 7 */
  '#FilterButtonType_7'?: string;
  /** Тип кнопки фильтра 8 */
  '#FilterButtonType_8'?: string;
  /** Тип кнопки фильтра 9 */
  '#FilterButtonType_9'?: string;
  /** Тип кнопки фильтра 10 */
  '#FilterButtonType_10'?: string;

  // === ImagesGrid (блок «Картинки» в выдаче) ===
  /** Заголовок блока картинок */
  '#ImagesGrid_title'?: string;
  /** JSON-массив картинок: [{url, width, height, row}] */
  '#ImagesGrid_data'?: string;
  /** Количество картинок в блоке */
  '#ImagesGrid_count'?: string;

  // === EAsideFilters (боковые фильтры) ===
  /** JSON-данные боковых фильтров: {filters: [{title, type, items, ...}]} */
  '#AsideFilters_data'?: string;

  // === EOfferItem дополнительные ===
  /** EOfferItem Fintech flag */
  '#EOfferItem_Fintech'?: 'true' | 'false';
  /** Заголовок оффера (alias для #OrganicTitle) */
  '#OfferTitle'?: string;
  /** Заголовок (generic alias) */
  '#Title'?: string;
  /** Информация о цене (legacy) */
  '#PriceInfo'?: string;

  // === Legacy / Parser-specific fields ===
  /** Список лейблов (legacy) */
  '#LabelsList'?: string;
  /** Список финтех-опций (legacy) */
  '#FintechList'?: string;
  /** Наличие товара (legacy) */
  '#Availability'?: string;
  /** Варианты самовывоза (legacy) */
  '#PickupOptions'?: string;
  /** Срок доставки (legacy) */
  '#DeliveryETA'?: string;

  // === Internal (runtime-only, не приходят из парсера) ===
  /** ID контейнера Figma (записывается в data-assignment, используется в image-handlers) */
  '#_containerId'?: string;
}

/**
 * CSVRow — типизированная строка данных сниппета.
 * Все поля явно объявлены в CSVFields.
 */
export type CSVRow = CSVFields;

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
  'Organic_Adv': ['#SnippetType', '#OrganicTitle'],
  'ESnippet': ['#SnippetType'],
  'Snippet': ['#SnippetType'],
  'ImagesGrid': ['#SnippetType'],
  'EQuickFilters': ['#SnippetType'],
  'EAsideFilters': ['#SnippetType']
};

/**
 * Поля-изображения (для определения типа обработки)
 */
export const IMAGE_FIELDS: (keyof CSVFields)[] = [
  '#FaviconImage',
  '#OrganicImage',
  '#ThumbImage',
  '#Image1',
  '#Image2',
  '#Image3',
  '#EQuote-AuthorAvatar',
  '#QuoteImage'
];

/**
 * Булевы поля (для нормализации значений)
 */
export const BOOLEAN_FIELDS: (keyof CSVFields)[] = [
  '#withThumb',
  '#OfficialShop',
  '#EPriceGroup_Discount',
  '#EPriceGroup_OldPrice',
  '#EPriceGroup_Fintech',
  '#EPriceGroup_Barometer',
  '#PriceDisclaimer',
  '#PlusCashback',
  '#ExpCalculation',
  '#ELabelGroup_Barometer',
  '#EPriceBarometer_isCompact',
  '#BUTTON',
  '#EButton_visible',
  '#EMarketCheckoutLabel',
  '#EDeliveryGroup',
  '#EDelivery_abroad',
  '#EBnpl',
  '#EOfferItem_defaultOffer',
  '#EOfferItem_hasButton',
  '#EOfferItem_hasReviews',
  '#EOfferItem_hasDelivery',
  '#isPromo',
  '#isAdv',
  '#isVerified',
  '#Sitelinks',
  '#withPromo',
  '#PromoLabel',
  '#PromoLink',
  '#withQuotes',
  '#withPrice',
  '#isCatalogPage',
  '#hidePriceBlock',
  '#ShopInfo-Bnpl',
  '#hasShopOfflineRegion',
  '#InfoIcon',
  '#ProductsTilesShowAll',
  '#ProductsTilesShowAllText',
  '#ProductsTilesShowAllHref'
];

/**
 * Числовые поля (рейтинги, цены)
 */
export const NUMERIC_FIELDS: (keyof CSVFields)[] = [
  '#ProductRating',
  '#DiscountPercent'
];
