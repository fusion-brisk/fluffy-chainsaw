/**
 * EProductSnippet Schema — карточка товара в grid (EProductSnippet / EProductSnippet2)
 *
 * Заменяет:
 * - handleEProductSnippet (snippet-handlers.ts)
 * - handleBrandLogic для EProductSnippet/EProductSnippet2
 * - handleMarketCheckoutButton для EProductSnippet/EProductSnippet2
 */

import type { ComponentSchema } from './types';
import { computeProductWithButton, computeWithReviews } from './transforms';

export const EPRODUCT_SNIPPET_SCHEMA: ComponentSchema = {
  containerNames: ['EProductSnippet', 'EProductSnippet2'],

  containerProperties: [
    // withDelivery (boolean) — показать доставку
    {
      propertyNames: ['withDelivery', 'Delivery'],
      fieldName: '#withDelivery',
      equals: { field: '#EDeliveryGroup', value: 'true' }
    },
    // withButton (boolean) — #EMarketCheckoutLabel ИЛИ #BUTTON
    {
      propertyNames: ['withButton', 'Button'],
      fieldName: '#withButton',
      compute: function(row) { return computeProductWithButton(row); }
    },
    // organicTitle (string) — название товара
    {
      propertyNames: ['organicTitle', 'title', 'Title'],
      fieldName: '#OrganicTitle',
      stringValue: '#OrganicTitle',
      skipIfEmpty: true
    },
    // brand (boolean) — показать бренд
    {
      propertyNames: ['brand', 'Brand'],
      fieldName: '#Brand',
      hasValue: '#Brand'
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
    },
    {
      instanceName: 'ELabelGroup',
      properties: [
        // withRating (boolean) — рейтинг товара на картинке
        {
          propertyNames: ['withRating'],
          fieldName: '#withRating',
          compute: function(row) { return computeWithReviews(row); }
        }
      ]
    }
  ],

  replacesHandlers: [
    'BrandLogic',
    'MarketCheckoutButton',
    'EProductSnippet'
  ]
};
