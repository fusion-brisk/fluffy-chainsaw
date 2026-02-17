/**
 * EShopItem Schema — декларативное описание маппинга данных для карточки магазина
 *
 * Заменяет:
 * - handleEShopItem (snippet-handlers.ts)
 * - handleBrandLogic для EShopItem
 * - handleMarketCheckoutButton для EShopItem
 * - handleOfficialShop для EShopItem
 * - handleShopInfoDeliveryBnplContainer для EShopItem
 */

import type { ComponentSchema } from './types';
import {
  computeWithButton,
  computeWithReviews,
  computeWithDelivery,
  computeWithMeta,
  computeWithData
} from './transforms';

export var ESHOP_ITEM_SCHEMA: ComponentSchema = {
  containerNames: ['EShopItem'],

  containerProperties: [
    // brand (boolean) — есть ли значение бренда
    {
      propertyNames: ['brand', 'Brand'],
      fieldName: '#Brand',
      hasValue: '#Brand'
    },
    // withButton (boolean) — Desktop OR checkout
    {
      propertyNames: ['withButton', 'buttons', 'BUTTONS'],
      fieldName: '#BUTTON',
      compute: function(row, container) { return computeWithButton(row, container); }
    },
    // withReviews (boolean) — есть рейтинг или отзывы
    {
      propertyNames: ['withReviews'],
      fieldName: '#withReviews',
      compute: function(row) { return computeWithReviews(row); }
    },
    // withDelivery (boolean) — есть данные доставки
    {
      propertyNames: ['withDelivery', 'delivery', 'Delivery'],
      fieldName: '#withDelivery',
      compute: function(row) { return computeWithDelivery(row); }
    },
    // withFintech (boolean) — финтех включён
    {
      propertyNames: ['withFintech', 'fintech', 'Fintech'],
      fieldName: '#withFintech',
      equals: { field: '#EPriceGroup_Fintech', value: 'true' }
    },
    // priceDisclaimer (boolean) — "Цена, доставка от Маркета"
    {
      propertyNames: ['priceDisclaimer', 'Price Disclaimer'],
      fieldName: '#PriceDisclaimer',
      equals: { field: '#PriceDisclaimer', value: 'true' }
    },
    // withMeta (boolean) — доставка ИЛИ BNPL
    {
      propertyNames: ['withMeta', 'deliveryFintech'],
      fieldName: '#withMeta',
      compute: function(row) { return computeWithMeta(row); }
    },
    // withData (boolean) — отзывы ИЛИ доставка ИЛИ BNPL
    {
      propertyNames: ['withData'],
      fieldName: '#EShopItem_withData',
      compute: function(row) { return computeWithData(row); }
    },
    // favoriteBtn (boolean) — кнопка "В избранное"
    {
      propertyNames: ['favoriteBtn', 'Favorite Btn', '[EXP] Favotite Btn'],
      fieldName: '#FavoriteBtn',
      equals: { field: '#FavoriteBtn', value: 'true' }
    },
    // organicTitle (string) — название товара
    {
      propertyNames: ['organicTitle'],
      fieldName: '#OrganicTitle',
      stringValue: '#OrganicTitle',
      skipIfEmpty: true
    },
    // organicText (string) — описание товара
    {
      propertyNames: ['organicText'],
      fieldName: '#OrganicText',
      stringValue: '#OrganicText',
      skipIfEmpty: true
    }
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
          skipIfEmpty: true
        },
        // isOfficial (boolean) — официальный магазин
        {
          propertyNames: ['isOfficial'],
          fieldName: '#OfficialShop',
          equals: { field: '#OfficialShop', value: 'true' }
        }
      ]
    }
  ],

  replacesHandlers: [
    'BrandLogic',
    'MarketCheckoutButton',
    'OfficialShop',
    'ShopInfoDeliveryBnplContainer',
    'EShopItem'
  ]
};
