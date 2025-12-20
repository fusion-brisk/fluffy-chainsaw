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
  version: 6,  // Updated: EButton view logic (primaryShort/white/secondary) + Button_view_* selectors
  rules: {
    '#query': {
      domSelectors: ['.HeaderForm-Input'],
      jsonKeys: ['query', 'searchQuery', 'q'],
      type: 'attribute',
      domAttribute: 'value'
    },
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
        // Organic_withOfferInfo — приоритет
        '.OrganicTitle',
        '[class*="OrganicTitle"]',
        '.Organic-Title',
        '[class*="Organic-Title"]',
        // EProductSnippet2
        '.EProductSnippet2-Title',
        '[class*="EProductSnippet2-Title"]',
        '.EProductSnippet2-Title a', 
        '[class*="EProductSnippet2-Title"] a',
        // EShopItem
        '.EShopItem-Title',
        '[class*="EShopItem-Title"]'
      ],
      jsonKeys: ['title', 'name', 'headline', 'text'],
      type: 'text'
    },
    '#ShopName': {
      domSelectors: [
        '.EShopName .Line-AddonContent',
        '[class*="EShopName"] .Line-AddonContent',
        '.EShopName',
        '[class*="EShopName"]',
        '[class*="ShopName"]',
        // EShopItem
        '.EShopItem-ShopName .Line-AddonContent',
        '[class*="EShopItem-ShopName"] .Line-AddonContent',
        '.EShopItem-ShopName .EShopName',
        '[class*="EShopItem-ShopName"] [class*="EShopName"]',
        // EProductSnippet2 (Яндекс Маркет формат)
        '.EProductSnippet2-ShopInfoTitle',
        '[class*="EProductSnippet2-ShopInfoTitle"]',
        '.EProductSnippet2-ShopInfo',
        '[class*="EProductSnippet2-ShopInfo"]'
      ],
      jsonKeys: ['shopName', 'shop', 'vendor', 'domain'],
      type: 'text'
    },
    // OfficialShop - метка официального магазина внутри EShopName
    'OfficialShop': {
      domSelectors: [
        '.EShopName .OfficialShop',
        '[class*="EShopName"] .OfficialShop',
        '[class*="EShopName"] [class*="OfficialShop"]'
      ],
      jsonKeys: [],
      type: 'boolean'
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
        '[class*="EProductSnippet2-Text"]',
        // EShopItem — описание товара
        '.EShopItem-Description',
        '[class*="EShopItem-Description"]'
      ],
      jsonKeys: ['description', 'text', 'snippet'],
      type: 'text'
    },
    '#OrganicImage': {
      domSelectors: [
        // Organic_withOfferInfo — приоритет для сниппетов с ценой
        '.Organic-OfferThumb img',
        '.Organic-OfferThumbImage',
        '[class*="Organic-OfferThumb"] img',
        '[class*="Organic-OfferThumbImage"]',
        '[class*="OfferThumb"] img',
        // EProductSnippet2
        '.EProductSnippet2-Thumb img', 
        '[class*="EProductSnippet2-Thumb"] img',
        // EShopItem — наиболее специфичные селекторы
        '.EShopItem-Image img',
        '[class*="EShopItem-Image"] img',
        '.EShopItem-Left img',
        'img.EThumb-Image',
        // Общий fallback
        '.EThumb-Image',
        '[class*="EThumb"] img'
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
    // #ShopRating — рейтинг магазина (legacy поле, используется редко)
    '#ShopRating': {
      domSelectors: [
        // Fallback — извлекаем первое встретившееся значение
        '.RatingOneStar .Line-AddonContent',
        '[class*="RatingOneStar"] .Line-AddonContent',
        '.RatingOneStar',
        '[aria-label*="рейтинг" i]'
      ],
      jsonKeys: ['rating', 'stars'],
      type: 'text'
    },
    // #ShopInfo-Ugc — рейтинг магазина (основное поле для Figma слоя #ShopInfo-Ugc)
    // Парсится из разных контейнеров в порядке приоритета
    '#ShopInfo-Ugc': {
      domSelectors: [
        // OrganicUgcReviews — рейтинг магазина в блоке отзывов
        '.OrganicUgcReviews-RatingContainer .RatingOneStar .Line-AddonContent',
        '.OrganicUgcReviews .RatingOneStar .Line-AddonContent',
        '[class*="OrganicUgcReviews"] .RatingOneStar .Line-AddonContent',
        // EReviewsLabel — рейтинг в кнопке отзывов
        '.EReviewsLabel-Rating .Line-AddonContent',
        '.EReviewsLabel .RatingOneStar .Line-AddonContent',
        '[class*="EReviewsLabel"] .RatingOneStar .Line-AddonContent',
        // EShopItemMeta — рейтинг в метаданных магазина
        '.EShopItemMeta-UgcLine .RatingOneStar .Line-AddonContent',
        '.EShopItemMeta-ReviewsContainer .RatingOneStar .Line-AddonContent',
        '[class*="EShopItemMeta"] .RatingOneStar .Line-AddonContent',
        // ShopInfo-Ugc — рейтинг в блоке информации о магазине
        '.ShopInfo-Ugc .RatingOneStar .Line-AddonContent',
        '[class*="ShopInfo-Ugc"] .RatingOneStar .Line-AddonContent',
        // Fallback — любой RatingOneStar (но НЕ ELabelRating — это рейтинг товара!)
        '.RatingOneStar .Line-AddonContent',
        '[class*="RatingOneStar"] .Line-AddonContent'
      ],
      jsonKeys: ['shopRating', 'storeRating'],
      type: 'text'
    },
    // #EReviews_shopText — текст отзывов магазина ("62,8K отзывов на магазин")
    '#EReviews_shopText': {
      domSelectors: [
        // OrganicUgcReviews-Text — полный формат с "на магазин"
        '.OrganicUgcReviews-Text',
        '[class*="OrganicUgcReviews-Text"]',
        // EReviewsLabel-Text — кнопка с отзывами
        '.EReviewsLabel-Text',
        '.EReviewsLabel .EReviews',
        '[class*="EReviewsLabel-Text"]',
        // EShopItemMeta-Reviews — метаданные магазина
        '.EShopItemMeta-Reviews .Line-AddonContent',
        '[class*="EShopItemMeta-Reviews"] .Line-AddonContent',
        '.EShopItemMeta-Reviews',
        // Legacy fallback
        '.EReviews_shopText',
        '.EReviews-ShopText',
        '[class*="EReviews_shopText"]',
        '[class*="EReviews-ShopText"]'
      ],
      jsonKeys: ['shopReviews', 'reviewsText'],
      type: 'text'
    },
    '#ReviewsNumber': {
      domSelectors: [
        // EShopItem — отзывы (специфичные селекторы, приоритет)
        '.EShopItemMeta-ReviewsContainer .Line_inlineBlock',
        '.EShopItemMeta-Reviews .EReviews',
        '[class*="EShopItemMeta-Reviews"] .EReviews',
        '.EShopItemMeta-Reviews',
        // Organic — отзывы в блоке UGC
        '.OrganicUgcReviews .EReviews',
        '[class*="OrganicUgcReviews"] .EReviews',
        // Общий fallback
        '.EReviews',
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
        // ВАЖНО: Используем ТОЧНЫЙ класс .ELabelRating, а не подстроку [class*="ELabelRating"]
        // Потому что LabelDiscount имеет класс ELabelRating_size_3xs (подстрока совпадает!)
        // но НЕ имеет точного класса ELabelRating
        '.ELabelRating:not(.LabelDiscount)',
        '.ELabelRating:not([class*="LabelDiscount"])',
        // НЕ используем [class*="ELabelRating"] — он захватывает LabelDiscount с ELabelRating_size_*
        '.ELabelRating'
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
          // EShopItem — основная цена в EPrice_size_l (не old)
          '.EPrice_size_l:not(.EPrice_view_old) .EPrice-Value',
          '[class*="EPrice_size_l"]:not([class*="EPrice_view_old"]) .EPrice-Value',
          // Fallback к EPriceGroup-Price
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
          // EPriceGroup — скидка на товар
          '.EPriceGroup-LabelDiscount .Label-Content',
          '[class*="EPriceGroup-LabelDiscount"] .Label-Content',
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
    },
    // EPriceBarometer view types — определяется по классам
    'EPriceBarometer_Cheap': {
        domSelectors: ['.EPriceBarometer-Cheap', '[class*="EPriceBarometer-Cheap"]'],
        jsonKeys: [],
        type: 'boolean'  // below-market
    },
    'EPriceBarometer_Average': {
        domSelectors: ['.EPriceBarometer-Average', '[class*="EPriceBarometer-Average"]'],
        jsonKeys: [],
        type: 'boolean'  // in-market
    },
    'EPriceBarometer_Expensive': {
        domSelectors: ['.EPriceBarometer-Expensive', '[class*="EPriceBarometer-Expensive"]'],
        jsonKeys: [],
        type: 'boolean'  // above-market
    },
    // EMarketCheckoutLabel - лейбл "Покупки" в сниппетах маркетплейса
    'EMarketCheckoutLabel': {
        domSelectors: [
          '.EMarketCheckoutLabel',
          '[class*="EMarketCheckoutLabel"]',
          // EShopItem — кнопка "Покупки" (EMarketCheckoutButton)
          '.EMarketCheckoutButton',
          '[class*="EMarketCheckoutButton"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // EDeliveryGroup - блок с вариантами доставки
    'EDeliveryGroup': {
        domSelectors: [
          '.EDeliveryGroup:not(.EDeliveryGroup-Item)',
          '[class*="EDeliveryGroup"]:not([class*="EDeliveryGroup-Item"])',
          // MerchantDelivery тоже может содержать доставку
          '.MerchantDelivery-MoBlock'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // EDeliveryGroup-Item - отдельный вариант доставки внутри EDeliveryGroup
    'EDeliveryGroup-Item': {
        domSelectors: [
          '.EDeliveryGroup-Item',
          '[class*="EDeliveryGroup-Item"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
    // EPrice_view_special - специальный вид цены (зелёная)
    'EPrice_view_special': {
        domSelectors: [
          '.EPrice_view_special',
          '[class*="EPrice_view_special"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // Label_view_outlineSpecial - скидка с outline и словом "Вам"
    'Label_view_outlineSpecial': {
        domSelectors: [
          '.Label_view_outlineSpecial',
          '[class*="Label_view_outlineSpecial"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // Fintech - блок рассрочки/оплаты (Сплит/Пэй)
    'Fintech': {
        domSelectors: [
          '.Fintech:not(.Fintech-Icon)',
          '[class*="EPriceGroup-Fintech"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // Fintech_type - тип (split/pay)
    'Fintech_type_split': {
        domSelectors: ['.Fintech_type_split', '[class*="Fintech_type_split"]'],
        jsonKeys: [],
        type: 'boolean'
    },
    'Fintech_type_pay': {
        domSelectors: ['.Fintech_type_pay', '[class*="Fintech_type_pay"]'],
        jsonKeys: [],
        type: 'boolean'
    },
    // Fintech_view - вид (extra-short, short)
    'Fintech_view_extra-short': {
        domSelectors: ['.Fintech_view_extra-short', '[class*="Fintech_view_extra-short"]'],
        jsonKeys: [],
        type: 'boolean'
    },
    // EBnpl - блок BNPL (Buy Now Pay Later) в EShopItem
    'EBnpl': {
        domSelectors: [
          '.EShopItem-Bnpl',
          '[class*="EShopItem-Bnpl"]',
          '.EBnpl',
          '[class*="EBnpl"]:not([class*="EBnpl-Icon"])'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // EBnpl-Item - отдельный элемент BNPL (Сплит, Долями)
    'EBnpl-Item': {
        domSelectors: [
          '.EShopItem-BnplItem',
          '[class*="EShopItem-BnplItem"]',
          '.EBnpl .Line-AddonContent',
          '[class*="EBnpl"] .Line-AddonContent'
        ],
        jsonKeys: [],
        type: 'text'
    },
    // Quote - цитата из отзыва (ESnippet)
    // ВАЖНО: НЕ используем OrganicUgcReviews-Text — это количество отзывов, не цитата!
    'Quote': {
        domSelectors: [
          // EQuote — контейнер цитаты
          '.EQuote',
          '.OrganicUgcReviews-QuoteWrapper',
          '[class*="EQuote"]',
          '[class*="OrganicUgcReviews-QuoteWrapper"]',
          // Текст внутри цитаты
          '.EQuote-Text',
          '[class*="EQuote-Text"]'
        ],
        jsonKeys: ['quote', 'review'],
        type: 'text'
    },
    // QuoteImage - изображение пользователя в цитате
    'QuoteImage': {
        domSelectors: [
          '.OrganicUgcReviews img',
          '[class*="OrganicUgcReviews"] img',
          '.EQuote-Image',
          '[class*="EQuote-Image"]'
        ],
        jsonKeys: [],
        type: 'image',
        domAttribute: 'src'
    },
    // Sitelinks - ссылки на страницы сайта (ESnippet)
    'Sitelinks': {
        domSelectors: [
          '.Sitelinks',
          '[class*="Sitelinks"]',
          '.Organic-Sitelinks',
          '[class*="Organic-Sitelinks"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // Sitelinks-Item - отдельная ссылка
    'Sitelinks-Item': {
        domSelectors: [
          '.Sitelinks-Item',
          '[class*="Sitelinks-Item"]',
          '.Sitelinks-Title',
          '[class*="Sitelinks-Title"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
    // Phone - телефон (ESnippet)
    'Phone': {
        domSelectors: [
          '.CoveredPhone',
          '[class*="CoveredPhone"]',
          '.Organic-Phone',
          '[class*="Organic-Phone"]',
          '[class*="phone" i]'
        ],
        jsonKeys: ['phone', 'telephone'],
        type: 'text'
    },
    // PromoOffer - промо-предложение (ESnippet)
    'PromoOffer': {
        domSelectors: [
          '.PromoOffer',
          '[class*="PromoOffer"]',
          '.Organic-Promo',
          '[class*="Organic-Promo"]'
        ],
        jsonKeys: ['promo', 'promotion'],
        type: 'text'
    },
    // Address - адрес (ESnippet)
    'Address': {
        domSelectors: [
          '.Organic-Address',
          '[class*="Organic-Address"]',
          '.Address',
          '[class*="Address"]',
          '.Geo',
          '[class*="Geo"]',
          // Meta блок в Organic может содержать адрес в .Meta-Item
          '.Organic-Meta .Meta-Item'
        ],
        jsonKeys: ['address', 'location'],
        type: 'text'
    },
    // WorkHours - часы работы (ESnippet)
    'WorkHours': {
        domSelectors: [
          '.Organic-Meta .Meta-Item'
        ],
        jsonKeys: ['workHours', 'schedule'],
        type: 'text'
    },
    // Metro - станция метро (ESnippet)
    'Metro': {
        domSelectors: [
          '.Organic-Meta .Meta-Item'
        ],
        jsonKeys: ['metro', 'station'],
        type: 'text'
    },
    
    // ========== НОВЫЕ КОМПОНЕНТЫ (iPhone 17 HTML анализ) ==========
    
    // EReviews - отзывы магазина (текст + рейтинг)
    'EReviews': {
        domSelectors: [
          '.EReviews-ShopText',
          '[class*="EReviews-ShopText"]',
          '.EReviews',
          '[class*="EReviews"]'
        ],
        jsonKeys: ['reviews', 'shopReviews'],
        type: 'text'
    },
    
    // EQuote - цитата из отзыва
    'EQuote': {
        domSelectors: [
          '.EQuote',
          '.OrganicUgcReviews-QuoteWrapper',
          '[class*="EQuote"]',
          '[class*="OrganicUgcReviews-QuoteWrapper"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // #EQuote-Text — текст цитаты ("«Отличный магазин...»")
    '#EQuote-Text': {
        domSelectors: [
          '.EQuote-Text',
          '[class*="EQuote-Text"]'
        ],
        jsonKeys: ['quoteText'],
        type: 'text'
    },
    // #EQuote-AuthorAvatar — аватар автора цитаты (предпочтительно retina из srcset)
    '#EQuote-AuthorAvatar': {
        domSelectors: [
          '.EQuote-AuthorAvatar',
          '[class*="EQuote-AuthorAvatar"]',
          '.EQuote-AvatarWrapper img',
          '[class*="EQuote-AvatarWrapper"] img'
        ],
        jsonKeys: [],
        type: 'image',
        domAttribute: 'srcset'  // Предпочитаем srcset для retina
    },
    // Legacy aliases
    'EQuote_Text': {
        domSelectors: [
          '.EQuote-Text',
          '[class*="EQuote-Text"]'
        ],
        jsonKeys: ['quoteText'],
        type: 'text'
    },
    'EQuote_Avatar': {
        domSelectors: [
          '.EQuote-AuthorAvatar',
          '[class*="EQuote-AuthorAvatar"]',
          '.EQuote-AvatarWrapper img'
        ],
        jsonKeys: [],
        type: 'image',
        domAttribute: 'src'
    },
    
    // EProductSpecs - характеристики товара
    'EProductSpecs': {
        domSelectors: [
          '.EProductSpecs',
          '[class*="EProductSpecs"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    'EProductSpecs_Property': {
        domSelectors: [
          '.EProductSpecs-Property',
          '[class*="EProductSpecs-Property"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
    'EProductSpecs_PropertyName': {
        domSelectors: [
          '.EProductSpecs-PropertyName',
          '[class*="EProductSpecs-PropertyName"]',
          '.EProductSpecs-PropertyNameText'
        ],
        jsonKeys: [],
        type: 'text'
    },
    'EProductSpecs_PropertyValue': {
        domSelectors: [
          '.EProductSpecs-PropertyValue',
          '[class*="EProductSpecs-PropertyValue"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
    
    // EShopSplitDiscount - Сплит со скидкой (новый формат отображения)
    'EShopSplitDiscount': {
        domSelectors: [
          '.EShopSplitDiscount',
          '[class*="EShopSplitDiscount"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    'EShopSplitDiscount_Price': {
        domSelectors: [
          '.EShopSplitDiscount-Price',
          '[class*="EShopSplitDiscount-Price"]'
        ],
        jsonKeys: [],
        type: 'price'
    },
    'EShopSplitDiscount_DiscountLabel': {
        domSelectors: [
          '.EShopSplitDiscount-DiscountLabel',
          '[class*="EShopSplitDiscount-DiscountLabel"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
    'EShopSplitDiscount_PayMethod': {
        domSelectors: [
          '.EShopSplitDiscount-PayMethod',
          '[class*="EShopSplitDiscount-PayMethod"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
    
    // EntityCard - карточка сущности (похожие товары, характеристики)
    'EntityCard': {
        domSelectors: [
          '.EntityCard',
          '[class*="EntityCard"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    'EntityCard_Item': {
        domSelectors: [
          '.EntityCard-Item',
          '[class*="EntityCard-Item"]',
          '.EntityCardItem'
        ],
        jsonKeys: [],
        type: 'text'
    },
    
    // EProductTabs - вкладки товара (Отзывы, Характеристики, и т.д.)
    'EProductTabs': {
        domSelectors: [
          '.EProductTabs',
          '[class*="EProductTabs"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    'EProductTabs_Tab': {
        domSelectors: [
          '.EProductTabs-Tab',
          '[class*="EProductTabs-Tab"]'
        ],
        jsonKeys: [],
        type: 'text'
    },
    'EProductTabs_Tab_active': {
        domSelectors: [
          '.EProductTabs-Tab_active',
          '[class*="EProductTabs-Tab_active"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    
    // EThumb - миниатюра изображения (универсальный компонент)
    'EThumb': {
        domSelectors: [
          '.EThumb-Image',
          '[class*="EThumb-Image"]',
          '.EThumb img'
        ],
        jsonKeys: [],
        type: 'image',
        domAttribute: 'src'
    },
    
    // Extralinks - дополнительные ссылки (поделиться, пожаловаться)
    'Extralinks': {
        domSelectors: [
          '.Extralinks',
          '[class*="Extralinks"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    
    // MarketCheckoutButton - кнопка "Купить в 1 клик" / "Купить" (для разных форматов сниппетов)
    // Эвристика: ищем по data-атрибуту, классу или ID кнопки Маркета
    // Форматы: Organic (Поиск), EShopItem (Товары), EProductSnippet2 (сетка), EOfferItem (попап)
    'MarketCheckoutButton': {
        domSelectors: [
          // === Формат Organic (вкладка "Поиск") ===
          '[data-market-url-type="market_checkout"]',  // ⭐ Самый надёжный
          '.MarketCheckout-Button',
          '[class*="MarketCheckout-Button"]',
          '[id^="MarketCheckoutButtonBase__"]',
          
          // === Формат EShopItem (вкладка "Товары") ===
          '.EMarketCheckoutButton-Container',
          '.EMarketCheckoutButton-Button',
          '.EShopItem_withCheckout',  // Модификатор-индикатор наличия кнопки
          
          // === Формат EProductSnippet2 (товарная сетка/карусель) ===
          '.EMarketCheckoutLabel',
          '.EThumb-LabelsCheckoutContainer',
          
          // === Формат EOfferItem (попап "Цены в магазинах") ===
          '.EOfferItem-Button[href*="/cart"]',
          '.EOfferItem-Button[href*="/express"]',
          
          // === Универсальные fallback ===
          '[class*="MarketCheckout"]',
          'a[href*="market.yandex.ru/my/cart"]',
          'a[href*="checkout.kit.yandex.ru/express"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    
    // Button_view_white - белая кнопка "В магазин" в EOfferItem
    'Button_view_white': {
        domSelectors: [
          '.Button_view_white',
          '[class*="Button_view_white"]',
          '.EOfferItem-Button.Button_view_white'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    
    // Button_view_default - дефолтная кнопка "В магазин" в EShopItem
    'Button_view_default': {
        domSelectors: [
          '.Button_view_default',
          '[class*="Button_view_default"]',
          '.EShopItem-ButtonLink.Button_view_default'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    
    // Button_view_primary - красная кнопка чекаута (primaryShort)
    'Button_view_primary': {
        domSelectors: [
          '.Button_view_primary',
          '[class*="Button_view_primary"]',
          '.MarketCheckout-Button.Button_view_primary'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    
    // ========== EOfferItem — карточка предложения магазина в попапе ==========
    
    // EOfferItem - контейнер предложения магазина
    'EOfferItem': {
        domSelectors: [
          '.EOfferItem',
          '[class*="EOfferItem"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
    // EOfferItem модификаторы
    'EOfferItem_defaultOffer': {
        domSelectors: ['.EOfferItem_defaultOffer', '[class*="EOfferItem_defaultOffer"]'],
        jsonKeys: [],
        type: 'boolean'  // Основное предложение (первое в списке)
    },
    'EOfferItem_button': {
        domSelectors: ['.EOfferItem_button', '[class*="EOfferItem_button"]'],
        jsonKeys: [],
        type: 'boolean'  // С кнопкой
    },
    'EOfferItem_reviews': {
        domSelectors: ['.EOfferItem_reviews', '[class*="EOfferItem_reviews"]'],
        jsonKeys: [],
        type: 'boolean'  // С отзывами
    },
    'EOfferItem_delivery': {
        domSelectors: ['.EOfferItem_delivery', '[class*="EOfferItem_delivery"]'],
        jsonKeys: [],
        type: 'boolean'  // С доставкой
    },
    'EOfferItem_title': {
        domSelectors: ['.EOfferItem_title', '[class*="EOfferItem_title"]'],
        jsonKeys: [],
        type: 'boolean'  // С отдельным названием товара
    },
    // EOfferItem данные
    'EOfferItem_ShopName': {
        domSelectors: [
          '.EOfferItem-ShopName',
          '[class*="EOfferItem-ShopName"]'
        ],
        jsonKeys: ['shopName'],
        type: 'text'
    },
    'EOfferItem_Price': {
        domSelectors: [
          '.EOfferItem-PriceContainer .EPrice-Value',
          '.EOfferItem .EPrice-Value',
          '[class*="EOfferItem-PriceContainer"] .EPrice-Value'
        ],
        jsonKeys: ['price'],
        type: 'price'
    },
    'EOfferItem_PriceNum': {
        domSelectors: [
          '.EOfferItem-PriceContainer .EPrice-A11yValue',
          '.EOfferItem .EPrice-A11yValue'
        ],
        jsonKeys: [],
        type: 'text'
    },
    'EOfferItem_Reviews': {
        domSelectors: [
          '.EOfferItem-Reviews',
          '[class*="EOfferItem-Reviews"]'
        ],
        jsonKeys: ['rating', 'reviews'],
        type: 'text'
    },
    'EOfferItem_Delivery': {
        domSelectors: [
          '.EOfferItem-Deliveries',
          '[class*="EOfferItem-Deliveries"]',
          '.EOfferItem-DeliveriesBnpl'
        ],
        jsonKeys: ['delivery'],
        type: 'text'
    },
    'EOfferItem_Title': {
        domSelectors: [
          '.EOfferItem-Title',
          '[class*="EOfferItem-Title"]'
        ],
        jsonKeys: ['title'],
        type: 'text'
    },
    'EOfferItem_Button': {
        domSelectors: [
          '.EOfferItem-Button',
          '[class*="EOfferItem-Button"]',
          '.EOfferItem-ButtonContainer'
        ],
        jsonKeys: [],
        type: 'attribute',
        domAttribute: 'href'
    }
  }
};

