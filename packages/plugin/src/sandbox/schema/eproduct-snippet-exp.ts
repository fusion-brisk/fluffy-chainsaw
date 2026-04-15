/**
 * EProductSnippetExp Schema — карточка товара в masonry grid (новый формат)
 *
 * Компонент-сет с вариантами type: product, product-promo, from-images
 * Свойства: Title, SourceName, SourceMeta (text), type (variant)
 * Вложенные: EPriceGroup (handler), ELabelGroup (withRating)
 */

import type { ComponentSchema } from './types';
import { computeWithReviews } from './transforms';

export const EPRODUCT_SNIPPET_EXP_SCHEMA: ComponentSchema = {
  containerNames: ['EProductSnippetExp'],

  containerProperties: [
    // type (variant) — product | product-promo | from-images
    {
      propertyNames: ['type'],
      fieldName: '#SnippetExpType',
      compute: function (row) {
        if (row['#isPromoCard'] === 'true') return 'product-promo';
        if (row['#MixedGridImageOnly'] === 'true') return 'from-images';
        return 'product';
      },
    },
    // Title — now inside SLOT, set via text node handler (not component property)
    // SourceName (string) — название магазина
    {
      propertyNames: ['SourceName', 'sourceName'],
      fieldName: '#ShopName',
      stringValue: '#ShopName',
      skipIfEmpty: true,
    },
    // SourceMeta (string) — вторичный текст (пустой — доставку не показываем)
    {
      propertyNames: ['SourceMeta', 'sourceMeta'],
      fieldName: '#SourceMeta',
      compute: function () {
        return '';
      },
    },
  ],

  nestedInstances: [
    {
      instanceName: 'ELabelGroup',
      properties: [
        // withRating (boolean) — рейтинг на картинке
        {
          propertyNames: ['withRating'],
          fieldName: '#withRating',
          compute: function (row) {
            return computeWithReviews(row);
          },
        },
        // withDiscount (boolean) — лейбл скидки на картинке (перенесён из EPriceGroup)
        {
          propertyNames: ['withDiscount'],
          fieldName: '#withDiscount',
          compute: function (row) {
            return row['#EPriceGroup_Discount'] === 'true' || row['#Discount'] === 'true';
          },
        },
      ],
    },
  ],

  replacesHandlers: ['EProductSnippet'],
};
