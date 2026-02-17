/**
 * Yandex Shared — единый источник правды для логики, общей между
 * extension/content.js и src/utils/snippet-parser.ts.
 *
 * ВАЖНО: При изменении этого файла обновляйте extension/content.js!
 * content.js не проходит через Rollup и содержит свою копию этой логики.
 */

// Re-exports для удобства (plugin-сторона импортирует отсюда)
export { formatPriceWithThinSpace } from './price-extractor';
export {
  PRICE_DIGITS_REGEX,
  CURRENCY_RUB_REGEX,
  CURRENCY_USD_REGEX,
  CURRENCY_EUR_REGEX,
  DISCOUNT_VALUE_REGEX,
  RATING_REGEX,
  REVIEWS_REGEX,
  RATING_INVALID_START_REGEX
} from './regex';

/**
 * CSS-селекторы контейнеров сниппетов.
 * Desktop: <li class="serp-item">
 * Touch: <div class="serp-item serp-list__card">
 */
export const CONTAINER_SELECTORS = [
  'li.serp-item',
  'div.serp-item.serp-list__card'
];

/**
 * CSS-селекторы рекламных сниппетов (пропускаются при парсинге).
 */
export const ADV_SELECTORS = [
  '.Organic-Label_type_advertisement',
  '.Organic-Subtitle_type_advertisement',
  '.AdvLabel',
  '.OrganicAdvLabel',
  '.AdvProductGallery',
  '.AdvProductGalleryCard'
];

/**
 * Определяет тип сниппета по className контейнера.
 *
 * Чистая функция без зависимости на DOM — querySelector передаётся как callback.
 * Порядок проверок критичен (EOfferItem первым, Organic последним).
 *
 * @param className — className контейнера
 * @param hasChild — callback: проверяет наличие элемента по CSS-селектору внутри контейнера
 * @returns тип сниппета (SnippetType)
 *
 * Используется в:
 * - extension/content.js → getSnippetType(container)
 * - src/utils/snippet-parser.ts → extractRowData()
 */
export function getSnippetType(
  className: string,
  hasChild: (selector: string) => boolean
): string {
  // EOfferItem — оффер с ценой (проверяем ПЕРВЫМ, может быть вложен)
  if (className.includes('EOfferItem')) return 'EOfferItem';

  // AdvProductGallery — рекламная галерея товаров
  if (className.includes('AdvProductGallery') && !className.includes('AdvProductGalleryCard')) {
    return 'AdvProductGallery';
  }

  // AdvProductGalleryCard — карточка внутри галереи
  if (className.includes('AdvProductGalleryCard')) return 'EProductSnippet2_Adv';

  // EProductSnippet2 — карточка товара
  if (className.includes('EProductSnippet2')) return 'EProductSnippet2';

  // EShopItem — магазин
  if (className.includes('EShopItem')) return 'EShopItem';

  // ProductTile — плитка товара
  if (className.includes('ProductTile-Item')) return 'ProductTile-Item';

  // ESnippet — товарный сниппет (по классу или вложенным элементам)
  if (className.includes('ESnippet') ||
      hasChild('.ESnippet, .ESnippet-Title, .ESnippet-Price')) {
    return 'ESnippet';
  }

  // Organic_Adv — промо-сниппет с AdvLabel
  if (className.includes('Organic_withAdvLabel') ||
      className.includes('Organic_withPromoOffer')) {
    return 'Organic_Adv';
  }

  // Промо по наличию AdvLabel внутри
  if (className.includes('Organic') &&
      hasChild('.AdvLabel, .OrganicAdvLabel')) {
    return 'Organic_Adv';
  }

  // Organic_withOfferInfo — органика с офферами
  if (className.includes('Organic_withOfferInfo')) return 'Organic_withOfferInfo';

  // Organic — обычный органический сниппет (fallback)
  return 'Organic';
}

/**
 * Определяет платформу по DOM-маркерам.
 *
 * @param hasElement — callback: проверяет наличие элемента по CSS-селектору в document
 * @returns 'desktop' | 'touch'
 */
export function detectPlatform(hasElement: (selector: string) => boolean): 'desktop' | 'touch' {
  if (hasElement('.HeaderPhone')) return 'touch';
  if (hasElement('.HeaderDesktop')) return 'desktop';
  if (hasElement('.Header_preset_phone') || hasElement('.HeaderTouch')) return 'touch';
  return 'desktop';
}
