// Конфигурация плагина EProductSnippet

// ============================================
// PORT CONSTANTS — single source of truth
// ============================================
export const PORTS = {
  /** Contentify relay server (HTTP + WebSocket) */
  RELAY: 3847,
};

// Версия плагина для What's New экрана
// Формат: MAJOR.MINOR.PATCH
// Увеличивайте при каждом релизе с изменениями, достойными показа пользователю
export const PLUGIN_VERSION = '2.7.0';

// Build hash — injected by Rollup at build time. Used for stale-build detection.
// Format: "<short-git-hash>-<timestamp>"
export const BUILD_HASH = '__BUILD_HASH__';

// Список изменений для What's New экрана
// Последние изменения сверху
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.4.0',
    date: '2025-12-20',
    title: 'Адрес магазина, доставка из-за границы, Fintech',
    highlights: [
      '🏠 Адрес магазина: парсинг ShopOfflineRegion → #addressText и #addressLink',
      '✈️ Доставка из-за границы: Crossborder → resetOverrides() + abroad=true',
      '💳 Fintech: исправлена обработка type=ozon, yandexPay и других',
      '💰 Цены: явный сброс EPrice view=undefined, чтобы цена не оставалась красной',
      '🛒 EShopItem: скрытие UgcLine без рейтинга, скрытие ButtonWrapper без checkout',
      '🔧 Улучшена обработка exposed properties в Figma',
    ],
    type: 'feature',
  },
  {
    version: '2.3.0',
    date: '2025-12-16',
    title: 'Умные кнопки и сброс сниппетов',
    highlights: [
      'Новая функция: сброс сниппетов к исходному состоянию (resetOverrides)',
      'EShopItem Touch: кнопка скрывается без checkout, контейнер тоже',
      'ESnippet: кнопка скрывается если нет реального checkout в данных',
      'EPriceBarometer: isCompact автоматически по ширине сниппета',
      'Поддержка base64 favicon и TTL кэша изображений (7 дней)',
      'Рефакторинг: handlers вынесены в отдельные модули',
    ],
    type: 'feature',
  },
  {
    version: '2.2.0',
    date: '2025-12-13',
    title: 'Новый бренд и аккуратный UI',
    highlights: [
      'Плагин переименован в EProductSnippet',
      'Теперь плагин подставляет заголовок запроса в текстовый слой с именем #query',
      'Обновлена шапка и навигация (более нативный вид UI3)',
      'Dropzone: добавлен фокус и управление с клавиатуры',
      'Logs: улучшены стили поиска и футера со статистикой',
    ],
    type: 'improvement',
  },
  {
    version: '2.1.0',
    date: '2024-12-10',
    title: 'Улучшенный парсинг кнопок',
    highlights: [
      'Поддержка кнопки «Купить в 1 клик» во всех типах сниппетов',
      'Автоматическое определение вида кнопки (primary, white, secondary)',
      'Улучшенный парсинг EShopItem и EOfferItem',
      'Оптимизация DOM-обхода для больших файлов',
    ],
    type: 'feature',
  },
  {
    version: '2.0.0',
    date: '2024-11-15',
    title: 'EProductSnippet — Новый интерфейс',
    highlights: [
      'Полностью переработанный UI в стиле Figma UI3',
      'Live-прогресс обработки',
      'Удалённые правила парсинга с автообновлением',
      'Продвинутый просмотр логов с фильтрацией',
    ],
    type: 'major',
  },
];

// Тип записи в changelog
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  type: 'major' | 'feature' | 'fix' | 'improvement';
}

// Имена контейнеров, которые считаются сниппетами (карточками)
// Главный критерий: наличие цены в сниппете
export const SNIPPET_CONTAINER_NAMES = [
  // Основные типы карточек с ценой
  'EShopItem', // Карточки магазинов Яндекс.Маркета
  'EProductSnippet2', // Сниппеты товаров (новый формат)
  'ESnippet', // Общий сниппет
  'EProductSnippet', // Устаревший формат
  'EOfferItem', // Офер
  'Snippet', // Базовый сниппет

  // Organic сниппеты с ценой
  'Organic_withOfferInfo', // Органик с офером (цена, магазин, доставка)

  // ProductTile - карточки товаров в сетке
  'ProductTile-Item', // Карточка товара в плитке
];

// Имена текстовых полей, которые могут быть внутри инстансов
export const TEXT_FIELD_NAMES = [
  '#organicTitle',
  '#shoptitle',
  '#shopname',
  '#brand',
  '#organicprice',
  '#oldprice',
  '#organictext',
  '#query',
  '#ProductRating',
  '#EPriceBarometer_View',
];

// COMPONENT_CONFIG удалён — значения инлайнены в handlers
// (handleEPriceGroup, handleELabelGroup, handleEPriceBarometer)

// ============================================
// EXTERNAL URLS
// ============================================

// URL для установки расширения
export const EXTENSION_URLS = {
  // GitHub Releases страница расширения
  EXTENSION_DOWNLOAD:
    'https://github.com/fusion-brisk/fluffy-chainsaw/releases/latest/download/contentify.crx',
  // One-line installer для Relay
  RELAY_INSTALL_SCRIPT:
    'https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/tools/install-relay.sh',
  // URL страницы расширений Chrome (для копирования в буфер)
  EXTENSIONS_PAGE: 'chrome://extensions',
};

// ============================================
// UI STRINGS
// ============================================

// Метки этапов обработки
