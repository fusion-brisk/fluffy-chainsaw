/**
 * Field Mapping — конфигурация маппинга полей CSV → слои Figma
 * 
 * Декларативное описание того, какие поля данных соответствуют
 * каким слоям в Figma-компонентах.
 */

import { CSVFields, SnippetType } from './csv-fields';

/**
 * Тип маппинга поля
 */
export type FieldMappingType = 
  | 'text'           // Текстовый слой
  | 'image'          // Изображение
  | 'variant'        // Variant Property
  | 'visibility'     // Видимость элемента
  | 'string-prop';   // String Property

/**
 * Конфигурация маппинга одного поля
 */
export interface FieldMappingConfig {
  /** Поле данных из CSVRow */
  dataField: keyof CSVFields;
  /** Тип маппинга */
  type: FieldMappingType;
  /** Имена слоёв в Figma (в порядке приоритета) */
  layerNames: string[];
  /** Имя Variant Property (для type='variant') */
  variantName?: string;
  /** Возможные значения (для type='variant') */
  variantValues?: string[];
  /** Трансформация значения */
  transform?: 'boolean' | 'price' | 'rating' | 'percent' | 'none';
  /** Дефолтное значение если поле пустое */
  defaultValue?: string;
  /** Ограничение по типам контейнеров */
  containers?: SnippetType[];
}

/**
 * Группа маппингов для компонента
 */
export interface ComponentMappingGroup {
  /** Имя компонента */
  component: string;
  /** Альтернативные имена */
  aliases?: string[];
  /** Маппинги полей */
  fields: FieldMappingConfig[];
}

/**
 * Конфигурация маппинга полей
 */
export const FIELD_MAPPINGS: ComponentMappingGroup[] = [
  // === EPriceGroup ===
  {
    component: 'EPriceGroup',
    fields: [
      {
        dataField: '#EPriceGroup_Discount',
        type: 'variant',
        layerNames: ['EPriceGroup'],
        variantName: 'Discount',
        variantValues: ['true', 'false'],
        transform: 'boolean'
      },
      {
        dataField: '#EPriceGroup_OldPrice',
        type: 'variant',
        layerNames: ['EPriceGroup'],
        variantName: 'Old Price',
        variantValues: ['true', 'false'],
        transform: 'boolean'
      },
      {
        dataField: '#EPriceGroup_Fintech',
        type: 'variant',
        layerNames: ['EPriceGroup'],
        variantName: 'Fintech',
        variantValues: ['true', 'false'],
        transform: 'boolean'
      }
    ]
  },
  
  // === EPrice ===
  {
    component: 'EPrice',
    fields: [
      {
        dataField: '#OrganicPrice',
        type: 'text',
        layerNames: ['#OrganicPrice', 'EPrice'],
        transform: 'price'
      },
      {
        dataField: '#EPrice_View',
        type: 'variant',
        layerNames: ['EPrice'],
        variantName: 'view',
        variantValues: ['default', 'special'],
        defaultValue: 'default'
      }
    ]
  },
  
  // === LabelDiscount ===
  {
    component: 'LabelDiscount',
    aliases: ['Discount', 'Label / Discount'],
    fields: [
      {
        dataField: '#discount',
        type: 'text',
        layerNames: ['content', 'discount', 'value', 'label']
      },
      {
        dataField: '#LabelDiscount_View',
        type: 'variant',
        layerNames: ['LabelDiscount', 'Discount'],
        variantName: 'View'
      }
    ]
  },
  
  // === ELabelGroup ===
  {
    component: 'ELabelGroup',
    fields: [
      {
        dataField: '#ProductRating',
        type: 'text',
        layerNames: ['#ProductRating'],
        transform: 'rating'
      },
      {
        dataField: '#ELabelGroup_Barometer',
        type: 'variant',
        layerNames: ['ELabelGroup'],
        variantName: 'Barometer',
        variantValues: ['true', 'false'],
        transform: 'boolean'
      }
    ]
  },
  
  // === EPriceBarometer ===
  {
    component: 'EPriceBarometer',
    fields: [
      {
        dataField: '#EPriceBarometer_View',
        type: 'string-prop',
        layerNames: ['EPriceBarometer'],
        variantName: 'View'
      },
      {
        dataField: '#EPriceBarometer_isCompact',
        type: 'variant',
        layerNames: ['EPriceBarometer'],
        variantName: 'isCompact',
        variantValues: ['true', 'false'],
        transform: 'boolean'
      }
    ]
  },
  
  // === Fintech ===
  {
    component: 'Fintech',
    aliases: ['MetaFintech', 'Meta / Fintech'],
    fields: [
      {
        dataField: '#Fintech_Type',
        type: 'variant',
        layerNames: ['Fintech', 'MetaFintech', 'Meta / Fintech'],
        variantName: 'type'
      },
      {
        dataField: '#Fintech_View',
        type: 'variant',
        layerNames: ['Fintech', 'MetaFintech', 'Meta / Fintech'],
        variantName: 'View'
      }
    ]
  },
  
  // === EButton ===
  {
    component: 'EButton',
    aliases: ['Ebutton', 'Button'],
    fields: [
      {
        dataField: '#ButtonView',
        type: 'variant',
        layerNames: ['EButton', 'Ebutton', 'Button'],
        variantName: 'view'
      },
      {
        dataField: '#EButton_visible',
        type: 'visibility',
        layerNames: ['EButton', 'Ebutton', 'Button'],
        transform: 'boolean'
      }
    ]
  },
  
  // === MarketCheckoutButton ===
  {
    component: 'MarketCheckoutButton',
    fields: [
      {
        dataField: '#BUTTON',
        type: 'variant',
        layerNames: ['EShopItem', 'EOfferItem'],
        variantName: 'BUTTON',
        variantValues: ['true', 'false'],
        transform: 'boolean'
      }
    ]
  },
  
  // === EShopName ===
  {
    component: 'EShopName',
    fields: [
      {
        dataField: '#ShopName',
        type: 'text',
        layerNames: ['#ShopName', 'ShopName']
      },
      {
        dataField: '#OfficialShop',
        type: 'visibility',
        layerNames: ['After'],
        transform: 'boolean'
      }
    ]
  },
  
  // === Favicon ===
  {
    component: 'Favicon',
    fields: [
      {
        dataField: '#FaviconImage',
        type: 'image',
        layerNames: ['#FaviconImage', 'Favicon', 'favicon']
      }
    ]
  },
  
  // === OrganicContent ===
  {
    component: 'OrganicContent',
    fields: [
      {
        dataField: '#OrganicTitle',
        type: 'text',
        layerNames: ['#OrganicTitle', 'OrganicTitle', 'Block / Snippet-staff / OrganicTitle']
      },
      {
        dataField: '#OrganicText',
        type: 'text',
        layerNames: ['#OrganicText', 'OrganicText', 'Block / Snippet-staff / OrganicContentItem']
      },
      {
        dataField: '#OrganicHost',
        type: 'text',
        layerNames: ['#OrganicHost', 'OrganicHost', 'Block / Snippet-staff / Path']
      }
    ]
  },
  
  // === EDeliveryGroup ===
  {
    component: 'EDeliveryGroup',
    fields: [
      {
        dataField: '#DeliveryList',
        type: 'text',
        layerNames: ['#DeliveryList', 'DeliveryList']
      },
      {
        dataField: '#EDeliveryGroup',
        type: 'visibility',
        layerNames: ['EDeliveryGroup'],
        transform: 'boolean'
      }
    ]
  },
  
  // === EThumb ===
  {
    component: 'EThumb',
    fields: [
      {
        dataField: '#ThumbImage',
        type: 'image',
        layerNames: ['#ThumbImage', 'EThumb', 'Thumb']
      }
    ]
  },
  
  // === Reviews ===
  {
    component: 'Reviews',
    aliases: ['EReviewsLabel', 'Rating + Reviews'],
    fields: [
      {
        dataField: '#ShopInfo-Ugc',
        type: 'text',
        layerNames: ['#ShopInfo-Ugc', '#shopRating'],
        transform: 'rating'
      },
      {
        dataField: '#EReviews_shopText',
        type: 'text',
        layerNames: ['#EReviews_shopText']
      }
    ]
  }
];

/**
 * Создаёт Map для быстрого поиска маппинга по имени компонента
 */
function createMappingIndex(): Map<string, ComponentMappingGroup> {
  const index = new Map<string, ComponentMappingGroup>();
  
  for (const group of FIELD_MAPPINGS) {
    index.set(group.component.toLowerCase(), group);
    
    if (group.aliases) {
      for (const alias of group.aliases) {
        index.set(alias.toLowerCase(), group);
      }
    }
  }
  
  return index;
}

const mappingIndex = createMappingIndex();

/**
 * Получить маппинг для компонента
 */
export function getMappingForComponent(componentName: string): ComponentMappingGroup | undefined {
  return mappingIndex.get(componentName.toLowerCase());
}

/**
 * Получить все маппинги для поля данных
 */
export function getMappingsForField(dataField: keyof CSVFields): FieldMappingConfig[] {
  const results: FieldMappingConfig[] = [];
  
  for (const group of FIELD_MAPPINGS) {
    for (const field of group.fields) {
      if (field.dataField === dataField) {
        results.push(field);
      }
    }
  }
  
  return results;
}

/**
 * Получить все поля данных
 */
export function getAllDataFields(): (keyof CSVFields)[] {
  const fields = new Set<keyof CSVFields>();
  
  for (const group of FIELD_MAPPINGS) {
    for (const field of group.fields) {
      fields.add(field.dataField);
    }
  }
  
  return Array.from(fields);
}
