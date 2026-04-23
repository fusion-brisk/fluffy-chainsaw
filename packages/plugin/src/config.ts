// Конфигурация плагина EProductSnippet

// ============================================
// CLOUD RELAY — hardcoded production URL
// ============================================
/**
 * Cloud relay base URL (Yandex Cloud API Gateway).
 * Baked into the bundle; no env override.
 * Paths: /push /peek /ack /reject /status /clear /health
 */
export const CLOUD_RELAY_URL = 'https://d5dtufo5i8flvjqbfak6.628pfjdx.apigw.yandexcloud.net';

/** figma.clientStorage key for the user's session code (6-char A-Z0-9). */
export const SESSION_CODE_KEY = 'contentify-session-code';

// Версия плагина для What's New экрана
// Формат: MAJOR.MINOR.PATCH
// Увеличивайте при каждом релизе с изменениями, достойными показа пользователю
export const PLUGIN_VERSION = '3.0.0';

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
  // URL страницы расширений Chrome (для копирования в буфер)
  EXTENSIONS_PAGE: 'chrome://extensions',
};

// ============================================
// UI STRINGS
// ============================================

// Метки этапов обработки
