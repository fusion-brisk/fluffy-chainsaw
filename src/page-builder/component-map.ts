/**
 * Component Map — маппинг типов сниппетов на компоненты библиотеки DC • ECOM
 * 
 * ВАЖНО: Ключи компонентов нужно получить из библиотеки DC • ECOM
 * Используйте скрипт get-component-keys.js в Dev Console Figma
 */

import { ComponentConfig, ContainerConfig, SnippetType, GroupType, LayoutElementType, ContainerType } from './types';

/**
 * Маппинг типов сниппетов на конфигурацию компонентов
 * 
 * TODO: Заполнить реальными ключами из библиотеки DC • ECOM
 * Ключи можно получить:
 * 1. Через Dev Console в Figma (см. scripts/get-component-keys.js)
 * 2. Из URL компонента (Copy link → node-id=XXX:YYY)
 */
/**
 * Node IDs компонентов в библиотеке DC • ECOM (секция Organisms)
 * Используй scripts/get-component-keys.js чтобы получить .key из этих nodeId
 */
export const COMPONENT_NODE_IDS = {
  // EOfferItem ComponentSet
  'EOfferItem': {
    desktop_btnRight: '22275:104394',
    desktop_btnDown: '22275:104613',
    touch_btnRight: '15029:574539',
    touch_btnDown: '22266:215796',
  },
  // EShopItem ComponentSet
  'EShopItem': {
    desktop: '22266:253481',
    touch: '22266:253420',
  },
  // EProductSnippet2 ComponentSet
  'EProductSnippet2': {
    default: '22275:120573',
    withPadding: '22275:120677',
    withBtn: '23256:276424',
  },
  // ESnippet ComponentSet
  'ESnippet': {
    desktop: '21938:180822',
    touch: '15390:158563',
  },
} as const;

export const SNIPPET_COMPONENT_MAP: Record<SnippetType, ComponentConfig> = {
  'ESnippet': {
    // TODO: обновить ключ после публикации версии с withThumb
    key: '9cc1db3b34bdd3cedf0a3a29c86884bc618f4fdf', // Platform=Desktop (старый)
    name: 'ESnippet',
    defaultVariant: {
      'Platform': 'Desktop',
      'withButton': true,
      'withMeta': true,
      'withReviews': true,
      'withDelivery': true,
      'withFintech': true,
      'withPrice': true,
      // 'withThumb': true, // Добавить после публикации новой версии
    },
  },
  
  'EOfferItem': {
    key: '09f5630474c44e6514735edd7202c35adcf27613', // Platform=Touch, View=Btn Right
    name: 'EOfferItem',
    defaultVariant: {
      'Platform': 'Desktop', // Переключим на Desktop после импорта
      'View': 'Btn Right',
      'withButton': true,
      'withMeta': true,
      'withReviews': true,
      'withDelivery': true,
      'withFintech': true,
    },
  },
  
  'EShopItem': {
    key: 'a209c6636b3fa7c279731ef02c78065632b535c6', // Platform=Desktop, View=Default
    keyTouch: 'b1c1848c5454036cc48fdfaea06fcc14cd400980', // Platform=Touch, View=Default
    name: 'EShopItem',
    defaultVariant: {
      'Platform': 'Desktop',
      'View': 'Default',
      'withButton': true,
      'withMeta': true,
      'withDelivery': true,
      'withFintech': true,
    },
  },
  
  'EProductSnippet2': {
    key: 'f921fc66ed6f56cccf558f7bcacbebcaa97495b7', // View=Default
    name: 'EProductSnippet',
    // ПРИМЕЧАНИЕ: withDelivery убран из defaultVariant — это exposed property,
    // которое не доступно через setProperties на верхнем уровне.
    // Устанавливается в handleEProductSnippet через trySetProperty с поиском свойства.
    defaultVariant: {
      'View': 'Default',
    },
  },
  
  'Organic': {
    key: '', // TODO: Найти Organic компонент и получить key
    name: 'Organic',
    defaultVariant: {
      'Platform': 'Desktop',
    },
  },
  
  'Organic_withOfferInfo': {
    key: '', // TODO: Тот же Organic, но с другим вариантом
    name: 'Organic',
    defaultVariant: {
      'Platform': 'Desktop',
      'withOfferInfo': true,
    },
  },
  
  'ProductTile-Item': {
    key: '', // TODO: Найти ProductTile-Item и получить key
    name: 'ProductTile-Item',
    defaultVariant: {
      'Platform': 'Desktop',
    },
  },
};

/**
 * Маппинг элементов страницы (Header, Footer, Pager, Related)
 */
export const LAYOUT_COMPONENT_MAP: Record<LayoutElementType, ComponentConfig> = {
  'Header': {
    key: '6cea05769f0320a02cce6ce168573daa75395308',
    name: 'Header',
    defaultVariant: {
      'Platform': 'Desktop',
    },
  },
  
  'Related': {
    key: 'e8b88751731dfbe91a6951472ae0233f07c5c32a',
    name: 'Related',
    defaultVariant: {
      'Platform': 'Desktop',
    },
  },
  
  'Pager': {
    key: '074d6f70fff0d97ec766385cf475ae43b70e9356',
    name: 'Pager',
    defaultVariant: {
      'Platform': 'Desktop',
    },
  },
  
  'Footer': {
    key: '', // TODO: обновить ключ Footer
    name: 'Footer',
    defaultVariant: {
      'Platform': 'Desktop',
    },
  },
  
  'EQuickFilters': {
    key: '', // Это Auto Layout фрейм, создаётся вручную
    name: 'EQuickFilters',
    defaultVariant: {},
  },
};

/**
 * Компоненты для панели фильтров
 */
export const FILTER_COMPONENTS = {
  // Кнопка "Все фильтры"
  'FilterButton': {
    key: 'af9d11ebc792f3fb6cef88babe0f092c6b8fd589', // ComponentSet Key
    variantKey: 'c3162fdf2f6fc1fb2252d14d73288265151d5b51', // Selected=False, View=Rounded
    name: 'Filters / Refine Control / Filter Button',
    defaultVariant: {
      'Selected': 'False',
      'View': 'Rounded',
      'With counter': 'False',
      'Disabled': 'False',
    },
  },

  // Кнопки быстрых фильтров (Цена, Бренд и т.д.)
  // View=Secondary, Right=True (иконка-стрелка справа)
  'QuickFilterButton': {
    key: 'a7ca09ed0f1e27d8b6bb038d6f91fa100f40b1bf', // Control / Button ComponentSet Key
    variantKey: '3729962e75d05135920ef313930f59ecd45e8bd5', // Base variant
    name: 'Control / Button',
    defaultVariant: {
      'View': 'Secondary',
      'Size': 'M',
      'Text': true,
      'Right': true,   // Иконка-стрелка справа
      'Left': false,   // Без иконки слева
    },
  },
} as const;

/**
 * Маппинг типов групп на конфигурацию компонентов
 * 
 * Группы — это компоненты с несколькими слотами для сниппетов
 * Количество видимых сниппетов регулируется через свойства
 */
export const GROUP_COMPONENT_MAP: Record<GroupType, ComponentConfig> = {
  'EShopGroup': {
    key: '', // TODO: Получить из библиотеки
    name: 'EShopGroup',
    isGroup: true,
    maxItems: 6,
    itemCountProperty: 'itemsCount', // Свойство для управления количеством
    defaultVariant: {
      'Platform': 'desktop',
      'itemsCount': '3', // По умолчанию показываем 3
    },
  },
  
  'EOfferGroup': {
    key: '', // TODO: Получить из библиотеки
    name: 'EOfferGroup',
    isGroup: true,
    maxItems: 10,
    itemCountProperty: 'itemsCount',
    defaultVariant: {
      'Platform': 'desktop',
    },
  },
  
  'ProductTileRow': {
    key: '', // TODO: Получить из библиотеки
    name: 'ProductTileRow',
    isGroup: true,
    maxItems: 4,
    itemCountProperty: 'columns',
    defaultVariant: {
      'Platform': 'desktop',
      'columns': '4',
    },
  },
  
  'OrganicBlock': {
    key: '', // TODO: Получить из библиотеки
    name: 'OrganicBlock',
    isGroup: true,
    maxItems: 5,
    itemCountProperty: 'resultsCount',
    defaultVariant: {
      'Platform': 'desktop',
    },
  },
};

/**
 * Получить конфигурацию компонента по типу
 */
export function getComponentConfig(type: SnippetType | GroupType | LayoutElementType): ComponentConfig | null {
  if (type in SNIPPET_COMPONENT_MAP) {
    return SNIPPET_COMPONENT_MAP[type as SnippetType];
  }
  if (type in GROUP_COMPONENT_MAP) {
    return GROUP_COMPONENT_MAP[type as GroupType];
  }
  if (type in LAYOUT_COMPONENT_MAP) {
    return LAYOUT_COMPONENT_MAP[type as LayoutElementType];
  }
  return null;
}

/**
 * Проверить, является ли тип групповым компонентом
 */
export function isGroupType(type: string): type is GroupType {
  return type in GROUP_COMPONENT_MAP;
}

/**
 * Проверить, является ли тип сниппетом
 */
export function isSnippetType(type: string): type is SnippetType {
  return type in SNIPPET_COMPONENT_MAP;
}

/**
 * Проверить, является ли тип элементом страницы
 */
export function isLayoutType(type: string): type is LayoutElementType {
  return type in LAYOUT_COMPONENT_MAP;
}

/**
 * Конфигурации контейнеров (Auto Layout фреймы)
 * 
 * Контейнеры — это фреймы, которые группируют сниппеты определённого типа
 */
export const CONTAINER_CONFIG_MAP: Record<ContainerType, ContainerConfig> = {
  'AdvProductGallery': {
    name: 'AdvProductGallery',
    layoutMode: 'HORIZONTAL',  // Горизонтальный layout без wrap
    width: 'HUG',              // HUG — ширина по контенту (без обрезки)
    height: 'HUG',
    itemSpacing: 8,            // gap между карточками
    clipsContent: false,       // Без clip — контент может выходить за границы
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    childTypes: ['EProductSnippet2'],
    childWidth: 186,  // Фиксированная ширина карточки
    // Для дочерних EProductSnippet2 применяется View=AdvGallery
  },

  'ProductsTiles': {
    name: 'ProductsTiles',
    layoutMode: 'WRAP',
    width: 'FILL',
    height: 'HUG',
    itemSpacing: 8,          // gap между карточками по горизонтали
    counterAxisSpacing: 10,  // gap между строками
    padding: {
      top: 10,
      right: 10,
      bottom: 20,
      left: 10,
    },
    childTypes: ['EProductSnippet2'],
    childWidth: 186,  // Фиксированная ширина карточки
    // Для дочерних EProductSnippet2 применяется View=Default
  },
  
  'EntityOffers': {
    name: 'EntityOffers',
    layoutMode: 'VERTICAL',
    width: 'FILL',
    height: 'HUG',
    itemSpacing: 0,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    // EntityOffers содержит Organic_withOfferInfo и ESnippet — органику с ценой
    childTypes: ['ESnippet', 'Organic_withOfferInfo', 'Organic'],
    childWidth: 'FILL',
  },

  'EShopList': {
    name: 'EShopList',
    layoutMode: 'VERTICAL',
    width: 'FILL',
    height: 'HUG',
    itemSpacing: 0,
    padding: {
      top: 12,
      right: 16,
      bottom: 12,
      left: 16,
    },
    childTypes: ['EShopItem'],
    childWidth: 'FILL',
  },
  
  'EOfferList': {
    name: 'EOfferList',
    layoutMode: 'VERTICAL',
    width: 'FILL',
    height: 'HUG',
    itemSpacing: 0,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    childTypes: ['EOfferItem'],
    childWidth: 'FILL',
  },
  
  'OrganicList': {
    name: 'OrganicList',
    layoutMode: 'VERTICAL',
    width: 'FILL',
    height: 'HUG',
    itemSpacing: 16,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    childTypes: ['Organic', 'Organic_withOfferInfo'],
    childWidth: 'FILL',
  },
};

/**
 * Получить конфигурацию контейнера по типу
 */
export function getContainerConfig(type: ContainerType): ContainerConfig | null {
  return CONTAINER_CONFIG_MAP[type] || null;
}

/**
 * Проверить, является ли тип контейнером
 */
export function isContainerType(type: string): type is ContainerType {
  return type in CONTAINER_CONFIG_MAP;
}

/**
 * Определить тип контейнера для типа сниппета
 */
export function getContainerTypeForSnippet(snippetType: SnippetType): ContainerType | null {
  switch (snippetType) {
    case 'EProductSnippet2':
      return 'AdvProductGallery';
    case 'EShopItem':
      return 'EShopList';
    case 'EOfferItem':
      return 'EOfferList';
    case 'Organic':
    case 'Organic_withOfferInfo':
      // Organic_withOfferInfo с ценой группируются в EntityOffers
      return 'EntityOffers';
    default:
      return null;  // ESnippet и другие не группируются автоматически
  }
}

/**
 * Маппинг CSS классов контейнеров HTML на ContainerType
 */
export const CSS_CLASS_TO_CONTAINER_TYPE: Record<string, ContainerType> = {
  'AdvProductGallery': 'AdvProductGallery',
  'ProductsTiles': 'ProductsTiles',
  'EntityOffers': 'EntityOffers',
  'EShopGroup': 'EShopList',
  'EOfferGroup': 'EOfferList',
  'EShopList': 'EShopList',
  'EOfferList': 'EOfferList',
  'OrganicList': 'OrganicList',
};

/**
 * Маппинг CSS классов HTML на типы сниппетов
 * Используется для определения типа элемента при парсинге HTML
 */
export const CSS_CLASS_TO_SNIPPET_TYPE: Record<string, SnippetType> = {
  'ESnippet': 'ESnippet',
  'EOfferItem': 'EOfferItem',
  'EShopItem': 'EShopItem',
  'EProductSnippet2': 'EProductSnippet2',
  'Organic': 'Organic',
  'Organic_withOfferInfo': 'Organic_withOfferInfo',
  'ProductTile-Item': 'ProductTile-Item',
};

/**
 * Маппинг CSS классов HTML на типы групп
 */
export const CSS_CLASS_TO_GROUP_TYPE: Record<string, GroupType> = {
  'EShopGroup': 'EShopGroup',
  'EOfferGroup': 'EOfferGroup',
  'ProductTileRow': 'ProductTileRow',
  'OrganicBlock': 'OrganicBlock',
  'serp-list': 'OrganicBlock', // Общий контейнер результатов
};

