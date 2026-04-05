/**
 * EOfferItem Schema — декларативное описание маппинга данных для карточки предложения
 *
 * Заменяет:
 * - handleEOfferItem (snippet-handlers.ts)
 * - handleBrandLogic для EOfferItem
 * - handleMarketCheckoutButton для EOfferItem (уже был no-op)
 * - handleShopInfoDeliveryBnplContainer для EOfferItem
 */

import type { ComponentSchema } from './types';
import {
  computeOfferWithReviews,
  computeOfferWithDelivery,
  computeOfferWithFintech,
  computeOfferWithMeta,
  computeOfferWithData,
  computeWithTitle,
  computeWithQuotes,
} from './transforms';

export const EOFFER_ITEM_SCHEMA: ComponentSchema = {
  containerNames: ['EOfferItem'],

  containerProperties: [
    // withButton — кнопка показывается ВСЕГДА для EOfferItem
    {
      propertyNames: ['withButton'],
      fieldName: '#EOfferItem_hasButton',
      compute: function () {
        return true;
      },
    },
    // withReviews (boolean) — рейтинг и отзывы
    {
      propertyNames: ['withReviews', 'RATING + REVIEW'],
      fieldName: '#EOfferItem_hasReviews',
      compute: function (row) {
        return computeOfferWithReviews(row);
      },
    },
    // withDelivery (boolean) — доставка
    {
      propertyNames: ['withDelivery', 'Delivery', 'DELIVERY + FINTECH'],
      fieldName: '#EOfferItem_hasDelivery',
      compute: function (row) {
        return computeOfferWithDelivery(row);
      },
    },
    // withFintech (boolean) — финтех в EPriceGroup
    {
      propertyNames: ['withFintech', 'Fintech'],
      fieldName: '#EOfferItem_Fintech',
      compute: function (row) {
        return computeOfferWithFintech(row);
      },
    },
    // priceDisclaimer (boolean) — "Цена, доставка от Маркета"
    {
      propertyNames: ['priceDisclaimer', 'Price Disclaimer'],
      fieldName: '#PriceDisclaimer',
      equals: { field: '#PriceDisclaimer', value: 'true' },
    },
    // withMeta (boolean) — доставка ИЛИ BNPL
    {
      propertyNames: ['withMeta'],
      fieldName: '#EOfferItem_withMeta',
      compute: function (row) {
        return computeOfferWithMeta(row);
      },
    },
    // withData (boolean) — отзывы ИЛИ доставка ИЛИ BNPL
    {
      propertyNames: ['withData'],
      fieldName: '#EOfferItem_withData',
      compute: function (row) {
        return computeOfferWithData(row);
      },
    },
    // withFavoritesButton (boolean) — кнопка "В избранное"
    {
      propertyNames: ['withFavoritesButton', 'Favorite Btn', '[EXP] Favotite Btn'],
      fieldName: '#FavoriteBtn',
      equals: { field: '#FavoriteBtn', value: 'true' },
    },
    // withTitle (boolean) — показать название товара
    {
      propertyNames: ['withTitle', 'Offer Title'],
      fieldName: '#withTitle',
      compute: function (row) {
        return computeWithTitle(row);
      },
    },
    // brand (boolean) — показать бренд
    {
      propertyNames: ['brand', 'Brand'],
      fieldName: '#Brand',
      hasValue: '#Brand',
    },
    // withQuotes (boolean) — цитата из отзыва
    {
      propertyNames: ['withQuotes'],
      fieldName: '#withQuotes',
      compute: function (row) {
        return computeWithQuotes(row);
      },
    },
  ],

  nestedInstances: [
    {
      instanceName: 'EShopName',
      properties: [
        // name (string) — название магазина
        {
          propertyNames: ['name'],
          fieldName: '#ShopName',
          stringValue: '#ShopName',
          skipIfEmpty: true,
        },
        // isOfficial (boolean) — официальный магазин
        {
          propertyNames: ['isOfficial'],
          fieldName: '#OfficialShop',
          equals: { field: '#OfficialShop', value: 'true' },
        },
      ],
    },
  ],

  replacesHandlers: [
    'BrandLogic',
    'MarketCheckoutButton',
    'ShopInfoDeliveryBnplContainer',
    'EOfferItem',
  ],
};
