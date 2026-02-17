/**
 * Schema Transforms — вычисляемые трансформы для schema engine
 *
 * Чистые функции, извлечённые из handleEShopItem.
 * Переиспользуются в схемах EShopItem, EOfferItem, ESnippet и др.
 */

import type { CSVRow } from '../types/csv-fields';

/**
 * Читает Platform property из Figma-инстанса.
 * @returns true если Desktop (или не задано), false если Touch
 */
export function isDesktopPlatform(instance: InstanceNode): boolean {
  var props = instance.componentProperties;
  for (var key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    var keyLower = key.toLowerCase();
    if (keyLower === 'platform' || keyLower.indexOf('platform#') === 0) {
      var prop = props[key];
      if (prop && typeof prop === 'object' && 'value' in prop) {
        return String((prop as { value: unknown }).value).toLowerCase() === 'desktop';
      }
    }
  }
  return true;
}

/**
 * withButton: показывать кнопку если Desktop ИЛИ есть checkout.
 * Используется в EShopItem и ESnippet.
 */
export function computeWithButton(row: CSVRow, container: InstanceNode): boolean {
  var isCheckout = row['#isCheckout'] === 'true' || row['#MarketCheckoutButton'] === 'true';
  var isDesktop = isDesktopPlatform(container);
  return isDesktop || isCheckout;
}

/**
 * withReviews: есть рейтинг или отзывы.
 */
export function computeWithReviews(row: CSVRow): boolean {
  return !!((row['#ReviewsNumber'] || row['#ShopInfo-Ugc'] || '') as string).trim();
}

/**
 * withDelivery: есть данные доставки.
 */
export function computeWithDelivery(row: CSVRow): boolean {
  var hasDeliveryList = !!((row['#DeliveryList'] || '') as string).trim();
  var hasDeliveryGroup = row['#EDeliveryGroup'] === 'true';
  return hasDeliveryList || hasDeliveryGroup;
}

/**
 * withMeta: есть доставка ИЛИ BNPL.
 */
export function computeWithMeta(row: CSVRow): boolean {
  var hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
  return computeWithDelivery(row) || hasBnpl;
}

/**
 * withData: есть отзывы ИЛИ доставка ИЛИ BNPL.
 */
export function computeWithData(row: CSVRow): boolean {
  var hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
  return computeWithReviews(row) || computeWithDelivery(row) || hasBnpl;
}

// ============================================================================
// EOfferItem-специфичные трансформы
// ============================================================================

/**
 * EOfferItem withReviews: #EOfferItem_hasReviews ИЛИ #ReviewsNumber.
 */
export function computeOfferWithReviews(row: CSVRow): boolean {
  return row['#EOfferItem_hasReviews'] === 'true' ||
    !!((row['#ReviewsNumber'] || '') as string).trim();
}

/**
 * EOfferItem withDelivery: #EOfferItem_hasDelivery ИЛИ #DeliveryList ИЛИ #EDeliveryGroup.
 */
export function computeOfferWithDelivery(row: CSVRow): boolean {
  return row['#EOfferItem_hasDelivery'] === 'true' || computeWithDelivery(row);
}

/**
 * EOfferItem withFintech: #EOfferItem_Fintech ИЛИ #EPriceGroup_Fintech.
 */
export function computeOfferWithFintech(row: CSVRow): boolean {
  return row['#EOfferItem_Fintech'] === 'true' || row['#EPriceGroup_Fintech'] === 'true';
}

/**
 * EOfferItem withMeta: delivery ИЛИ BNPL (использует Offer-специфичный delivery).
 */
export function computeOfferWithMeta(row: CSVRow): boolean {
  var hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
  return computeOfferWithDelivery(row) || hasBnpl;
}

/**
 * EOfferItem withData: reviews ИЛИ delivery ИЛИ BNPL.
 */
export function computeOfferWithData(row: CSVRow): boolean {
  var hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
  return computeOfferWithReviews(row) || computeOfferWithDelivery(row) || hasBnpl;
}

/**
 * withTitle: есть #OrganicTitle ИЛИ #OfferTitle.
 */
export function computeWithTitle(row: CSVRow): boolean {
  return !!((row['#OrganicTitle'] || row['#OfferTitle'] || '') as string).trim();
}

/**
 * withButton для EOfferItem: кнопка показывается ВСЕГДА.
 */
export function computeOfferWithButton(): boolean {
  return true;
}

// ============================================================================
// EProductSnippet-специфичные трансформы
// ============================================================================

/**
 * EProductSnippet withButton: #EMarketCheckoutLabel ИЛИ #BUTTON.
 */
export function computeProductWithButton(row: CSVRow): boolean {
  return row['#EMarketCheckoutLabel'] === 'true' || row['#BUTTON'] === 'true';
}

// ============================================================================
// ESnippet-специфичные трансформы
// ============================================================================

/** Проверка: plain Organic (fallback на ESnippet, товарные фичи отключены). */
function isPlainOrganic(row: CSVRow): boolean {
  return row['#SnippetType'] === 'Organic';
}

/** ESnippet withQuotes: #withQuotes ИЛИ #QuoteText ИЛИ #EQuote-Text. */
export function computeWithQuotes(row: CSVRow): boolean {
  return row['#withQuotes'] === 'true' ||
    !!((row['#QuoteText'] || row['#EQuote-Text'] || '') as string).trim();
}

/** ESnippet withDelivery: #EDeliveryGroup ИЛИ #EDelivery_abroad. */
export function computeSnippetWithDelivery(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  return row['#EDeliveryGroup'] === 'true' || row['#EDelivery_abroad'] === 'true';
}

/** ESnippet withAddress: #hasShopOfflineRegion ИЛИ #addressText. */
export function computeWithAddress(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  return row['#hasShopOfflineRegion'] === 'true' ||
    !!((row['#addressText'] || '') as string).trim();
}

/** ESnippet withContacts: #Phone ИЛИ #Contacts. */
export function computeWithContacts(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  return !!((row['#Phone'] || row['#Contacts'] || '') as string).trim();
}

/** ESnippet withButton: (BUTTON AND Desktop) OR checkout; false for Organic. */
export function computeSnippetWithButton(row: CSVRow, container: InstanceNode): boolean {
  if (isPlainOrganic(row)) return false;
  var hasButtonData = row['#BUTTON'] === 'true';
  var isDesktop = isDesktopPlatform(container);
  var isCheckout = row['#isCheckout'] === 'true' || row['#MarketCheckoutButton'] === 'true';
  return (hasButtonData && isDesktop) || isCheckout;
}

/** ESnippet withMeta: delivery ИЛИ BNPL. */
export function computeSnippetWithMeta(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  var hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
  return computeSnippetWithDelivery(row) || hasBnpl;
}

/** ESnippet withData: reviews ИЛИ delivery ИЛИ BNPL. */
export function computeSnippetWithData(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  var hasBnpl = row['#ShopInfo-Bnpl'] === 'true';
  return computeWithReviews(row) || computeSnippetWithDelivery(row) || hasBnpl;
}

/** ESnippet withPrice: #OrganicPrice непустое. */
export function computeSnippetWithPrice(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  return !!((row['#OrganicPrice'] || '') as string).trim();
}

/** ESnippet withEcomMeta: есть рейтинг/цена/барометр/лейблы. */
export function computeSnippetWithEcomMeta(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  var fields = [
    row['#ProductRating'], row['#ReviewCount'], row['#OrganicPrice'],
    row['#OldPrice'], row['#EPriceBarometer_View'], row['#ELabelGroup']
  ];
  for (var i = 0; i < fields.length; i++) {
    var v = fields[i];
    if (v !== undefined && v !== null && v !== '' && v !== 'false') return true;
  }
  return false;
}

/** ESnippet withFintech (с Organic-проверкой). */
export function computeSnippetWithFintech(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  return row['#EPriceGroup_Fintech'] === 'true';
}

/** ESnippet withPromo: #Promo непустое. */
export function computeSnippetWithPromo(row: CSVRow): boolean {
  if (isPlainOrganic(row)) return false;
  return !!((row['#Promo'] || '') as string).trim();
}
