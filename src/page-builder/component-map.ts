/**
 * Component Map — маппинг типов сниппетов на компоненты библиотеки DC • ECOM
 * 
 * ВАЖНО: Ключи компонентов нужно получить из библиотеки DC • ECOM
 * Используйте скрипт get-component-keys.js в Dev Console Figma
 */

import { ComponentConfig, ContainerConfig, SnippetType, GroupType, LayoutElementType, ContainerType } from './types';

/**
 * Стили заливки из библиотеки DC • ECOM
 * Используются для применения фона через figma.importStyleByKeyAsync()
 * 
 * DEPRECATED: Стили работают некорректно в некоторых случаях.
 * Используйте VARIABLE_KEYS для привязки переменных.
 */
export const PAINT_STYLE_KEYS = {
  'Background/Primary': 'cc3c77fb5e00f762a4950a9fb73a82819c3408b9',
  'Background/Overflow': 'b43d617320789eba79aed9086a546e7cacb2fee8',
} as const;

/**
 * Ключи переменных из библиотеки DC • ECOM (Colors)
 * Используются для применения заливки через figma.variables.importVariableByKeyAsync()
 * 
 * Как получить ключи:
 * 1. Открыть Figma Dev Console (Plugins → Development → Open console)
 * 2. Выполнить:
 *    const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
 *    for (const coll of collections) {
 *      const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(coll.key);
 *      vars.forEach(v => console.log(v.name + ': ' + v.key));
 *    }
 */
export const VARIABLE_KEYS = {
  // === Background ===
  'Background/Primary': 'a4085d6ec026ec8a6ed9e9c92ecd4c9ad719734d',
  'Background/Overflow': '95d13b2ca4b81f42999696c424718703d42de134',
  'Background/Secondary': '26f239770af505a7631d4e4dab745f6bd3904642',
  'Background/Tertiary': '45fa656d3577aa2bb923366236d9f8a3d2a659c9',
  'Background/Primary@desktop': '6b46dbcc8aa42e958a5dd47232a8b6445fc76657',
  'Background/Overflow@desktop': 'e90d0c37c2c2d74417560ba7a0049e23ef8c25c6',
  'Background/Secondary@desktop': '72bfea8ad3a394a8cffdd7b7b8a86970e4c187e3',
  'Background/Always/White': '1c5f42b15f6eaab3056db20a1f5447ea5ec2f909',
  'Background/Always/Secondary Black': '6dd7f860c8087e14cf4e95feb8d149c0edec8afb',
  'Background/Always/Tertiary Black': '3177b962b0a36878d0064a0ba6fe3b3453b48a69',
  
  // === Text and Icon ===
  'Text and Icon/Primary': '4ca8951655d30c2c1132997c7728945d96fb29a0',
  'Text and Icon/Secondary': 'ec2fbd56bb82a3b5915ed775be53facdbb0c0c45',
  'Text and Icon/Tertiary': '5cdbe33bdfaed7bbec3b178d6f19798cb517085d',
  'Text and Icon/Quaternary': '0eca24a612cf4585510407998fa6785fb6ad6724',
  'Text and Icon/Quinary': '130ae726fd9fdf16707b2bd3df7ef63acabc9219',
  'Text and Icon/Quaternary Solid': 'f09b2438a1a3c10fa1e728dd14326669d3d66a04',
  'Text and Icon/Secondary@desktop': 'f94c0e35f139108b37c6cb632de7d7f8dbd6c8fe',
  'Text and Icon/Snippet@touch': '802e7dab307cf866e7e29c03a5edde756f2fdff2',
  'Text and Icon/Always/Primary Black': 'f3c3fb1cb39c6f5aebd67633bed8e9582541fa0d',
  'Text and Icon/Always/Secondary White': '52f87e961d653de4200e6e3615f04d434bde8072',
  'Text and Icon/Always/Tertiary Black': 'eb66a5ed51629a1bdef11a4519755da942056b6d',
  'Text and Icon/Always/Tertiary White': 'e12726fc0f77d3e51219491b4e429f7b23b0f4c9',
  'Text and Icon/Always/Quaternary Black': '95dcf129c24daf5fd2c15667855eb3dc3f115a1b',
  'Text and Icon/Always/Quaternary White': 'aa94565cce869886698858395bf1240405297a53',
  'Text and Icon/Always/Quinary Black': '9690e949866ae76a13bf86ddce5d5eecd732e4bf',
  'Text and Icon/Always/Quinary White': 'ba9df011d67e3d3010283539429f327a78788679',
  'Text and Icon/Always/Primary White': '5269c3610687d855f9ca38381dbc0ce0e8e80167',
  
  // === Fill ===
  'Fill/05': 'e6370efe7f6f4b4bb2bd5c003abff065b7d84cfb',
  'Fill/05 Solid': 'e63bc25803c802b5e4a4e5cae17d31bb43d8a754',
  'Fill/10': '2d6dcd6e1bf92b12c579fa8b3b2064335b493119',
  'Fill/20': '5f45cc2c3f71011169c1af25a386a8dde979a4cf',
  'Fill/30': 'fc556336583a6ea4ca6a00f45eefd03b4549d4b3',
  'Fill/40': '86cd4dbc30f0cf5fd5390f5e7fecd3172957dde2',
  'Fill/50': 'c16c1a0da778fd6495cce9d0bb285fa13d73847c',
  'Fill/60': '8729d7700002c5fda14876e0b57b4fef9382e75b',
  'Fill/70': '4665f17e666455ef0d49fae95d972816322f1095',
  'Fill/80': 'dafa15c678c0d0dc5c1c6264f6ede3242d964e1a',
  'Fill/Always/30 Black': '4de9f0ca4573632b85829518aeae6eb17f4aa32e',
  'Fill/Always/40 Black': '20af97dd72bbcf13e7b895147ba78671724dbce8',
  'Fill/Always/50 White': 'b1fd3e97a3029b9b77cd2c835d15286e157f84fb',
  'Fill/Always/60 Black': '27112dfb3ab3d14f690d9dc9855e4ac44054f3ae',
  'Fill/Always/70 Black': 'ab1e275a0a273713ca402014804bd196168ba74d',
  'Fill/Always/80 Black': 'b77227414e31faf03af1ff7116fba8dc1e27f862',
  'Fill/Always/80 White': 'e3bd1e8cddc0b155c694edf4e5301828badad470',
  
  // === Accent ===
  'Accent/Blue': 'a8fd5158c722d04e4682227e01763cc45d065eda',
  'Accent/Green': '336310b6aaef4f9124ab3e4a169bf99389038728',
  'Accent/Red': 'c8fe0cc47fcc0b601de0cd3dfbb9df8d999ad523',
  'Accent/Yellow': '347b9c5686cea6dab8bb410ed0c038826c53f82a',
  'Accent/Light Red': 'c6d2b231b81a0ab6470fade60e05521b0ed42ea0',
  
  // === Applied ===
  'Applied/Link': '6e8c75148d8882c824ff0c6d09e88a5d1604f2dd',
  'Applied/Link Hover': '3fad36593910d666dcc92fdd53d93c105d5d3a19',
  'Applied/Link Visited': 'a5325a609c17ede56c70c910dc699d1007f6ece3',
  'Applied/Link Visited@desktop': '689eda90daa4c37e8551bf65d2ce979da5b588e4',
  'Applied/Greenurl': '58b7b1290295ce1fef451adbee818ab2b86a279c',
  'Applied/Green Text': 'd810be9d77e5a7cd846ceeaee5cac82cc25d875c',
  'Applied/Stroke': '099e83d77e888efd2b03592f0aca9f51c027f9b6',
  'Applied/Overlay': 'e33040df23f1f305fba9d6b30dae93a25ef8a036',
  'Applied/Skeleton': '328f4919ca37183f34eee2c7199886bec5a6b458',
  'Applied/Image Fill': 'edd303bea0451b01b2509bc8673bdd53aa67b70a',
  'Applied/Freshness': '0c8147d185a2d36479743c775004e1f5c0b69e8c',
  'Applied/Reliable': '79f2512384059e00253b3ff517126e71e93b211c',
  'Applied/Alice': '290ef4db0cc8a0b8fe66cf3bb3a167141d0b18bd',
  'Applied/Control Primary': '5851965fe9c36a53a535eaaa184d9ca0053c5050',
  'Applied/Control Primary Hovered': '56a2acdab8a2026023346164f568f64af1e0c057',
  'Applied/Control Secondary': 'b0dba07e385db027eb0a26b402508e078537300a',
  'Applied/Control Secondary Hover': '4c7fe4b37f8e66a4626f434a0529cbbe49642e42',
  'Applied/Control Secondary Checked': '20116be55994487cb0d536e3d2d8f18d1e1f1007',
  'Applied/Control White Beta': '55c8ce4bb5552c7e2a5dca59389773e5c5dd9756',
  'Applied/Control White Beta Hovered': '1b67ed760f6497f5bab9e1883cac95f1d455496f',
  'Applied/Always/Control Secondary White': '48a34aa5b58d151c3b8c61d9375187f909e18c04',
  
  // === Rating ===
  'Applied/Always/Rating Good': '8389ae38865689cc23c7ba73e45f8724aac17e63',
  'Applied/Always/Rating Average': 'fef81d3af3316da07815b4edb0124d305b2b5057',
  'Applied/Always/Rating Not Good': '1fb011502ae729823bbd0588f47c88c1987c62f3',
  'Applied/Always/Rating Bad': 'aae759e5e161402e0bdbebbd144ce57c30d0936c',
  'Applied/Always/Rating Awful': 'b163681d7ee7768aa487286dbefb07d143025110',
  
  // === Tech ===
  'Tech/Theme': '422975deaec659fbbe974b41eb37b17955fe3767',
} as const;

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
    key: '9cc1db3b34bdd3cedf0a3a29c86884bc618f4fdf', // Platform=Desktop
    keyTouch: 'fd4c85bc57a4b46b9587247035a5fd01b5df4a91', // Platform=Touch
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
    key: 'ad30904f3637a4c14779a366e56b8d6173bbd78b', // Platform=Desktop, View=Btn Right
    keyTouch: '09f5630474c44e6514735edd7202c35adcf27613', // Platform=Touch, View=Btn Right
    name: 'EOfferItem',
    defaultVariant: {
      'Platform': 'Desktop',
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
  
  'Title': {
    key: 'b49cc069e0de9428bfa913fd9a504011fafca336', // Size=M variant
    name: 'Title',
    defaultVariant: {
      'Size': 'M',
      // Boolean properties — все отключены для минимального варианта
      'Grid | List Control#23400:0': false,
      'ADV Text Label#23052:0': false,
      'Favicon#22522:32': false,
      'Chevron#22522:28': false,
      '2-Action#22448:4': false,
      'Subtitle#22448:8': false,
      '1-Action#22448:2': false,
      '3-Action#22448:6': false,
      'ACTION ICON#22448:0': false,
    },
  },
  
  'FuturisSearch': {
    key: '', // Wizard-блок создаётся программно через wizard-processor
    name: 'FuturisSearch',
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
    counterAxisSpacing: 8,   // gap между строками
    clipsContent: true,      // overflow hidden
    padding: {
      top: 16,   // верхний паддинг для отступа от Title
      right: 0,
      bottom: 0,
      left: 0,
    },
    childTypes: ['EProductSnippet2'],
    childWidth: 184,  // Фиксированная ширина карточки (desktop) — было 186
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
    // EntityOffers может содержать:
    // - EShopItem — для touch платформы и стандартного варианта
    // - ESnippet — для desktop платформы в варианте EntityOffersOrganic
    childTypes: ['EShopItem', 'ESnippet'],
    childWidth: 'FILL',
  },

  'EShopList': {
    name: 'EShopList',
    layoutMode: 'VERTICAL',
    width: 'FILL',
    height: 'HUG',
    itemSpacing: 6, // Gap 6px между EShopItem элементами
    padding: {
      top: 0, // Без паддингов — wrapper добавит их
      right: 0,
      bottom: 0,
      left: 0,
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

