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
  version: 3,  // Updated: new components from iPhone 17 HTML analysis (EQuote, EProductSpecs, EShopSplitDiscount, etc.)
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
    '#ShopRating': {
      domSelectors: [
        // EShopItem — рейтинг магазина в формате одной звезды (приоритет)
        // ВАЖНО: извлекаем .Line-AddonContent для чистого числа (не "Рейтинг: X из 5")
        '.EShopItemMeta-UgcLine .RatingOneStar .Line-AddonContent',
        '.EShopItemMeta-ReviewsContainer .RatingOneStar .Line-AddonContent',
        '[class*="EShopItemMeta"] .RatingOneStar .Line-AddonContent',
        // Organic_withOfferInfo — рейтинг магазина в RatingOneStar
        '.ShopInfo-Ugc .RatingOneStar .Line-AddonContent',
        '[class*="ShopInfo"] .RatingOneStar .Line-AddonContent',
        '.OrganicUgcReviews .RatingOneStar .Line-AddonContent',
        '[class*="OrganicUgcReviews"] .RatingOneStar .Line-AddonContent',
        // Общий RatingOneStar — извлекаем .Line-AddonContent
        '.RatingOneStar .Line-AddonContent',
        '[class*="RatingOneStar"] .Line-AddonContent',
        // Fallback на весь RatingOneStar (если нет Line-AddonContent)
        '.RatingOneStar',
        '[class*="RatingOneStar"]',
        // Общий fallback
        '.Rating',
        '[class*="Rating"]',
        '[aria-label*="рейтинг" i]'
      ],
      jsonKeys: ['rating', 'stars'],
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
    'Quote': {
        domSelectors: [
          // Organic сниппет — текст отзывов в EReviews
          '.OrganicUgcReviews .EReviews',
          '[class*="OrganicUgcReviews"] .EReviews',
          '.OrganicUgcReviews-Text',
          '[class*="OrganicUgcReviews-Text"]',
          '.EQuote',
          '[class*="EQuote"]',
          '.OrganicUgcReviews',
          '[class*="OrganicUgcReviews"]'
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
          '[class*="EQuote"]',
          '.OrganicUgcReviews-QuoteWrapper'
        ],
        jsonKeys: [],
        type: 'boolean'
    },
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
          '.EQuote-AuthorAvatar img',
          '[class*="EQuote-AuthorAvatar"] img',
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
    
    // MarketCheckoutButton - кнопка "Купить в 1 клик" (для ESnippet)
    // Эвристика: ищем по data-атрибуту, классу или ID кнопки Маркета
    'MarketCheckoutButton': {
        domSelectors: [
          '[data-market-url-type="market_checkout"]',
          '.MarketCheckout-Button',
          '[class*="MarketCheckout-Button"]',
          '[id^="MarketCheckoutButtonBase__"]',
          '[id*="MarketCheckoutButton"]'
        ],
        jsonKeys: [],
        type: 'boolean'
    }
  }
};

