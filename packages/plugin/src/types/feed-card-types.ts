/**
 * FeedCardRow — схема данных для карточек ритм-фида ya.ru
 *
 * Аналог CSVRow из SERP-пайплайна, но для фида.
 * Парсер (extension) извлекает данные из DOM → FeedCardRow[],
 * плагин маппит FeedCardRow → Figma-компонент из DC Feed.
 *
 * Naming: '#Feed_' prefix отличает от SERP-полей '#Organic', '#EPrice' и т.д.
 */

// ============================================================================
// CARD TYPES — маппинг на секции DC Feed библиотеки
// ============================================================================

/**
 * Тип карточки фида.
 * Каждый тип соответствует секции компонентов в DC Feed (0dr1G4gFr6q8enaEOR1YUW).
 *
 * DOM → FeedCardType маппинг:
 *   - EcomFeedMarketCard                       → 'market'
 *   - rythm-card + card-content__sound (video) → 'video'
 *   - rythm-card + EcomFeedSlider/PRODS        → 'post'
 *   - rythm-card (products, no media)          → 'product'
 *   - advert-card                              → 'advert'
 *   - collection-card (если появится)          → 'collection'
 */
export type FeedCardType =
  | 'post' // Posts (18 desktop variants) — контент с товарами/каруселью
  | 'video' // Videos (5 desktop variants) — видео-контент
  | 'market' // Market Production Snippet (8 desktop variants) — Яндекс Маркет
  | 'advert' // Ads Production/Examples (6+9 desktop variants) — реклама
  | 'product' // Products Examples (7 Independent + 21 Market) — товарные карточки
  | 'collection'; // Collections (4 desktop variants) — подборки

/**
 * Размер карточки в masonry-сетке.
 * Определяется CSS-классом `masonry-feed__item-size_{size}`.
 */
export type FeedCardSize = 'xs' | 's' | 'm' | 'ml' | 'l' | 'xl';

/**
 * Платформа (влияет на выбор варианта компонента).
 */
export type FeedPlatform = 'desktop' | 'mobile';

// ============================================================================
// FEED CARD ROW
// ============================================================================

export interface FeedCardFields {
  // --- Мета (обязательные) ---

  /** Тип карточки — определяет целевой компонент Figma */
  '#Feed_CardType': FeedCardType;

  /** Размер в masonry-сетке */
  '#Feed_CardSize': FeedCardSize;

  /** Платформа */
  '#Feed_Platform': FeedPlatform;

  /** Позиция в фиде (0-based) */
  '#Feed_Index': string;

  // --- Изображения ---

  /** Основное изображение (thumbnail/cover) */
  '#Feed_ImageUrl'?: string;

  /** Массив URL каруселя (JSON: string[]) */
  '#Feed_CarouselImages'?: string;

  /** Количество слайдов каруселя (для dots-индикатора) */
  '#Feed_CarouselCount'?: string;

  /** Aspect ratio изображения (напр. "3:4", "1:1", "16:9") */
  '#Feed_ImageRatio'?: string;

  /**
   * CSS Grid row span — сколько строк ya.ru masonry-сетки занимает карточка
   * (напр. `"14"` для tier `m`, `"17"` для `ml`). Самый стабильный сигнал
   * пропорций: не зависит от lazy-load изображений и одинаков для всех
   * карточек одного tier'а. Если есть — `#Feed_ImageRatio` вычисляется из
   * него, иначе из naturalWidth/Height картинки.
   */
  '#Feed_GridRowSpan'?: string;

  // --- Контент (общие для post/video/product/market) ---

  /** Название товара / заголовок поста */
  '#Feed_Title'?: string;

  /** Текст описания (для advert, post) */
  '#Feed_Description'?: string;

  /** Цена (форматированная строка, напр. "5 999") */
  '#Feed_Price'?: string;

  /** Старая цена (зачёркнутая) */
  '#Feed_OldPrice'?: string;

  /** Валюта (по умолчанию "₽") */
  '#Feed_Currency'?: string;

  /** Скидка (напр. "–10%") */
  '#Feed_Discount'?: string;

  /** Бейдж "Ещё N" (количество доп. товаров) */
  '#Feed_MoreCount'?: string;

  // --- Источник (Card Source) ---

  /** Имя источника (belleyou.ru, BORK, Яндекс Маркет) */
  '#Feed_SourceName'?: string;

  /** URL аватара источника */
  '#Feed_SourceAvatarUrl'?: string;

  /** Домен (для рекламы: start.practicum.yandex) */
  '#Feed_SourceDomain'?: string;

  /** Лейбл источника ("Реклама") */
  '#Feed_SourceLabel'?: string;

  // --- Бейджи и флаги ---

  /** Есть AI-бейдж на изображении */
  '#Feed_HasAiBadge'?: 'true' | 'false';

  /** Карточка — видео (play icon) */
  '#Feed_HasVideo'?: 'true' | 'false';

  /** Есть звук (для видео) */
  '#Feed_HasSound'?: 'true' | 'false';

  /** Есть кэшбек / Плюс */
  '#Feed_HasCashback'?: 'true' | 'false';

  /** Лейбл кэшбека */
  '#Feed_CashbackLabel'?: string;

  // --- Collection-specific ---

  /** Подзаголовок коллекции ("Коллекция автора") */
  '#Feed_CollectionSubtitle'?: string;

  /** Кол-во просмотров ("12,2 тыс.") */
  '#Feed_ViewCount'?: string;

  /** Кол-во постов ("5 постов") */
  '#Feed_PostCount'?: string;

  /** Изображения коллекции — JSON: string[] (сетка 2×2) */
  '#Feed_CollectionImages'?: string;

  // --- Product-specific ---

  /** Тип товарной карточки (Independent / Market) */
  '#Feed_ProductType'?: 'independent' | 'market';

  // --- Advert-specific ---

  /** Стиль рекламной карточки (production / dark / branded) */
  '#Feed_AdStyle'?: string;

  // --- Source layout (for column-faithful import) ---

  /**
   * 1-based source column index derived from the live CSS Grid layout
   * (`Math.round((cardLeft - feedLeft) / colWidth) + 1`). The plugin uses
   * this to bin cards into the same column they occupied on ya.ru, instead
   * of running its own greedy shortest-column masonry.
   */
  '#Feed_SourceCol'?: string;

  /**
   * 0-based source order in the parser's items array. Used to preserve
   * top-to-bottom order within a column when source-col binning is active.
   */
  '#Feed_SourceOrder'?: string;

  // --- Title structure (added Apr 2026) ---

  /** Префикс A11y-заголовка («Галерея», «Видео», …) */
  '#Feed_TitlePrefix'?: string;

  /** Часть заголовка после двоеточия (имя автора) */
  '#Feed_AuthorFromTitle'?: string;

  /** «Содержит ссылки на товары» — affiliate-product label */
  '#Feed_HasProductLinks'?: 'true' | 'false';

  /** Полный текст поста (длиннее, чем visible description) */
  '#Feed_DescriptionFull'?: string;

  /** Название товара из post-products-preview (отдельно от Feed_Title) */
  '#Feed_PreviewProductTitle'?: string;

  // --- Carousel state ---

  /** Индекс активного слайда (0-based) */
  '#Feed_ActiveSlideIndex'?: string;

  // --- Video-specific (split from #Feed_ImageUrl) ---

  /** Кадр-постер видео */
  '#Feed_VideoPosterUrl'?: string;

  /** Длительность видео в формате M:SS */
  '#Feed_VideoDuration'?: string;

  // --- Header / overlay badges ---

  /** Есть бейдж «быстрая покупка» (ECheckoutTooltip) */
  '#Feed_HasCheckoutBadge'?: 'true' | 'false';

  /** Есть бейдж в шапке карточки */
  '#Feed_HasHeaderBadge'?: 'true' | 'false';

  /** Текст бейджа в шапке */
  '#Feed_HeaderBadgeText'?: string;

  // --- Footer buttons (designer flags) ---

  /** Есть кнопка «Подписаться» */
  '#Feed_HasSubscribeBtn'?: 'true' | 'false';

  /** Есть меню «…» (post-menu) */
  '#Feed_HasMoreMenu'?: 'true' | 'false';

  // --- Style modifiers ---

  /** Market-карточка использует redesign-стиль */
  '#Feed_MarketCardRedesign'?: 'true' | 'false';

  /** Режим обрезки заголовка Market: one-line vs multi-line */
  '#Feed_TitleLineMode'?: 'one-line' | 'multi-line';

  // --- Tracking / dedup ---

  /** Yandex post id (data-test-post-id) */
  '#Feed_PostId'?: string;

  // --- Internal (runtime) ---

  /** ID Figma-контейнера (заполняется при создании) */
  '#Feed_ContainerId'?: string;

  /** Ключ варианта компонента Figma (резолвится при маппинге) */
  '#Feed_ComponentKey'?: string;
}

/**
 * FeedCardRow — типизированная строка данных карточки фида.
 */
export type FeedCardRow = FeedCardFields;

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Обязательные поля для каждого типа карточки.
 */
export const FEED_REQUIRED_FIELDS: Record<FeedCardType, (keyof FeedCardFields)[]> = {
  post: ['#Feed_CardType', '#Feed_ImageUrl', '#Feed_SourceName'],
  video: ['#Feed_CardType', '#Feed_ImageUrl', '#Feed_SourceName'],
  market: ['#Feed_CardType', '#Feed_ImageUrl', '#Feed_Title', '#Feed_Price'],
  advert: ['#Feed_CardType', '#Feed_ImageUrl', '#Feed_SourceDomain'],
  product: ['#Feed_CardType', '#Feed_ImageUrl', '#Feed_Title', '#Feed_Price'],
  collection: ['#Feed_CardType', '#Feed_SourceName'],
};

/**
 * Поля-изображения (для скачивания и заливки в Figma).
 */
export const FEED_IMAGE_FIELDS: (keyof FeedCardFields)[] = [
  '#Feed_ImageUrl',
  '#Feed_SourceAvatarUrl',
  // JSON-массивы обрабатываются отдельно:
  // '#Feed_CarouselImages',
  // '#Feed_CollectionImages',
];

/**
 * Булевы поля.
 */
export const FEED_BOOLEAN_FIELDS: (keyof FeedCardFields)[] = [
  '#Feed_HasAiBadge',
  '#Feed_HasVideo',
  '#Feed_HasSound',
  '#Feed_HasCashback',
];

// ============================================================================
// COMPONENT VARIANT MAP — DC Feed (0dr1G4gFr6q8enaEOR1YUW)
// ============================================================================

/**
 * Маппинг FeedCardType → variant keys компонентов Figma.
 *
 * Variant axes в DC Feed:
 *   Posts:      Variant=1..18, Platform=Desktop|Mobile
 *   Videos:     Variant=1..5,  Platform=Desktop|Mobile
 *   Market:     Variant=1..8,  Platform=Desktop|Mobile
 *   Ads Prod:   Variant=1..6,  Platform=Desktop|Mobile
 *   Ads Ex:     Variant=1..9,  Platform=Desktop|Mobile
 *   Products:   Variant=1..21, Type=Independent|Market, Platform=Desktop|Mobile
 *   Collections: Variant=1..4, Platform=Desktop|Mobile
 *
 * Node IDs (section frames) для справки:
 *   Posts:       3086:34741
 *   Videos:      3086:34758
 *   Collections: 3086:34767
 *   Market:      3453:87507
 *   Ads Prod:    3086:34824
 *   Ads Ex:      5868:71590
 *   Products:    5618:44663
 *
 * Keys filled in feed-component-map.ts (FEED_COMPONENT_SET_KEYS).
 */
export interface FeedComponentVariant {
  /** Figma component SET key (для importComponentSetByKeyAsync) */
  key: string;
  /**
   * Variant number for the legacy `Variant` axis (Posts/Videos/Market/Ads Prod/Ads Ex/…).
   * Mutually exclusive with `state` — advert на Feed Card shell использует `state="Default"`.
   */
  variant?: number;
  /** State value for the Feed Card shell (axis `State`, e.g. "Default"). */
  state?: string;
  /** Platform */
  platform: FeedPlatform;
  /** Node ID в файле DC Feed (для отладки) */
  nodeId: string;
}

/**
 * Правило выбора варианта на основе данных карточки.
 *
 * Примеры:
 *   - market xs → Variant 1-2 (маленькая карточка без описания)
 *   - market xl → Variant 7-8 (большая с описанием)
 *   - post с каруселью → Variant 1,2,4,10 (dots visible)
 *   - video → Videos section Variant 1-5
 *   - advert → Ads Prod или Ads Ex в зависимости от стиля
 */
export type VariantSelector = (row: FeedCardRow) => FeedComponentVariant | null;

// ============================================================================
// MASONRY LAYOUT CONFIG
// ============================================================================

/**
 * Конфигурация masonry-сетки.
 * Извлекается из CSS-переменной `--masonry-feed-columns-count`.
 */
export interface FeedMasonryConfig {
  /** Количество колонок (обычно 5 для desktop, 2 для mobile) */
  columns: number;
  /** Ширина колонки в px (250 desktop, 200 mobile) */
  columnWidth: number;
  /** Gap между карточками */
  gap: number;
  /** Общая ширина фида */
  feedWidth: number;
}

export const DEFAULT_MASONRY_CONFIG: Record<FeedPlatform, FeedMasonryConfig> = {
  desktop: {
    columns: 5,
    columnWidth: 250,
    // Designer-confirmed gap: 16px between columns and between cards within
    // a column (auto-layout itemSpacing on both axes). Prod ya.ru uses
    // tighter packing, but our Figma layout favours readability of the
    // imported masonry over byte-for-byte fidelity.
    gap: 16,
    feedWidth: 1314, // 5 * 250 + 4 * 16
  },
  mobile: {
    columns: 2,
    columnWidth: 200,
    gap: 8,
    feedWidth: 408, // 2 * 200 + 1 * 8
  },
};
