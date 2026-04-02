/**
 * ESnippet Schema — декларативное описание маппинга для универсального сниппета
 *
 * Покрывает ~22 свойства контейнера. Структурные операции
 * (сайтлинки, промо-текст, EThumb fallback, clipsContent)
 * обрабатываются отдельным handler в esnippet-hooks.ts.
 *
 * Заменяет:
 * - handleESnippetProps (snippet-handlers.ts) — часть с property mapping
 * - handleBrandLogic для ESnippet/Snippet (brand нет в ESnippet, пропускается)
 * - handleMarketCheckoutButton для ESnippet/Snippet
 * - handleOfficialShop для ESnippet/Snippet
 * - handleShopInfoDeliveryBnplContainer для ESnippet/Snippet
 */

import type { ComponentSchema } from './types';
import {
  computeWithReviews,
  computeWithQuotes,
  computeSnippetWithDelivery,
  computeSnippetWithFintech,
  computeWithAddress,
  computeWithContacts,
  computeSnippetWithButton,
  computeSnippetWithMeta,
  computeSnippetWithData,
  computeSnippetWithPrice,
  computeSnippetWithDeliveryBnpl,
  computeSnippetWithPromo,
  computeImageVariant,
} from './transforms';

export const ESNIPPET_SCHEMA: ComponentSchema = {
  containerNames: ['ESnippet', 'Snippet'],

  containerProperties: [
    // image (variant: none/single/group) — тип изображения
    // Заменяет бывший boolean withThumb + imperative imageType switching
    {
      propertyNames: ['image'],
      fieldName: '#imageType',
      compute: function (row) {
        return computeImageVariant(row);
      },
    },
    // withReviews (boolean) — рейтинг / отзывы
    {
      propertyNames: ['withReviews'],
      fieldName: '#withReviews',
      compute: function (row) {
        return computeWithReviews(row);
      },
    },
    // withQuotes (boolean) — цитата из отзыва
    {
      propertyNames: ['withQuotes'],
      fieldName: '#withQuotes',
      compute: function (row) {
        return computeWithQuotes(row);
      },
    },
    // withDelivery (boolean) — доставка
    {
      propertyNames: ['withDelivery'],
      fieldName: '#withDelivery',
      compute: function (row) {
        return computeSnippetWithDelivery(row);
      },
    },
    // withFintech (boolean) — финтех
    {
      propertyNames: ['withFintech'],
      fieldName: '#withFintech',
      compute: function (row) {
        return computeSnippetWithFintech(row);
      },
    },
    // withAddress (boolean) — адрес магазина
    {
      propertyNames: ['withAddress'],
      fieldName: '#withAddress',
      compute: function (row) {
        return computeWithAddress(row);
      },
    },
    // withSitelinks (boolean) — сайтлинки
    {
      propertyNames: ['withSitelinks', 'SITELINKS', 'Sitelinks'],
      fieldName: '#withSitelinks',
      equals: { field: '#Sitelinks', value: 'true' },
    },
    // withPromo (boolean) — промо-блок
    {
      propertyNames: ['withPromo'],
      fieldName: '#withPromo',
      compute: function (row) {
        return computeSnippetWithPromo(row);
      },
    },
    // withButton (boolean) — кнопка: (BUTTON AND Desktop) OR checkout
    {
      propertyNames: ['withButton'],
      fieldName: '#withButton',
      compute: function (row, container) {
        return computeSnippetWithButton(row, container);
      },
    },
    // withMeta (boolean) — доставка ИЛИ BNPL
    {
      propertyNames: ['withMeta'],
      fieldName: '#withMeta',
      compute: function (row) {
        return computeSnippetWithMeta(row);
      },
    },
    // withData (boolean) — отзывы ИЛИ доставка ИЛИ BNPL
    {
      propertyNames: ['withData'],
      fieldName: '#withData',
      compute: function (row) {
        return computeSnippetWithData(row);
      },
    },
    // withContacts (boolean) — контакты
    {
      propertyNames: ['withContacts'],
      fieldName: '#withContacts',
      compute: function (row) {
        return computeWithContacts(row);
      },
    },
    // withPrice (boolean) — блок цены
    {
      propertyNames: ['withPrice'],
      fieldName: '#withPrice',
      compute: function (row) {
        return computeSnippetWithPrice(row);
      },
    },
    // withDeliveryBnpl (boolean) — ShopInfo-DeliveryBnplContainer (delivery + fintech)
    {
      propertyNames: ['withDeliveryBnpl'],
      fieldName: '#withDeliveryBnpl',
      compute: function (row) {
        return computeSnippetWithDeliveryBnpl(row);
      },
    },
    // showKebab (boolean) — меню
    {
      propertyNames: ['showKebab'],
      fieldName: '#showKebab',
      equals: { field: '#showKebab', value: 'true' },
    },
    // isOfficial (boolean) — официальный магазин
    {
      propertyNames: ['isOfficial', 'official', 'Official'],
      fieldName: '#isOfficial',
      equals: { field: '#OfficialShop', value: 'true' },
    },
    // isPromo (boolean) — промо-сниппет
    {
      propertyNames: ['isPromo', 'promo', 'isAdv'],
      fieldName: '#isPromo',
      equals: { field: '#isPromo', value: 'true' },
    },
    // organicTitle (string) — заголовок
    {
      propertyNames: ['organicTitle'],
      fieldName: '#OrganicTitle',
      stringValue: '#OrganicTitle',
      skipIfEmpty: true,
    },
    // organicText (string) — описание
    {
      propertyNames: ['organicText'],
      fieldName: '#OrganicText',
      stringValue: '#OrganicText',
      skipIfEmpty: true,
    },
    // organicHost (string) — хост/greenurl
    {
      propertyNames: ['organicHost'],
      fieldName: '#OrganicHost',
      stringValue: '#OrganicHost',
      skipIfEmpty: true,
    },
    // organicPath (string) — путь в greenurl
    {
      propertyNames: ['organicPath'],
      fieldName: '#OrganicPath',
      stringValue: '#OrganicPath',
      skipIfEmpty: true,
    },
    // promoText (string) — текст промо через property
    {
      propertyNames: ['promoText', 'promo'],
      fieldName: '#Promo',
      stringValue: '#Promo',
      skipIfEmpty: true,
    },
  ],

  nestedInstances: [],

  replacesHandlers: [
    'MarketCheckoutButton',
    'OfficialShop',
    'ShopInfoDeliveryBnplContainer',
    'ESnippetProps',
  ],
};
