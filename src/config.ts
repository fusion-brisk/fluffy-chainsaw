// Конфигурация плагина Contentify

// Имена контейнеров, которые считаются сниппетами (карточками)
// Главный критерий: наличие цены в сниппете
export const SNIPPET_CONTAINER_NAMES = [
  // Основные типы карточек с ценой
  'EShopItem',              // Карточки магазинов Яндекс.Маркета
  'EProductSnippet2',       // Сниппеты товаров (новый формат)
  'ESnippet',               // Общий сниппет
  'EProductSnippet',        // Устаревший формат
  'EOfferItem',             // Офер
  'Snippet',                // Базовый сниппет
  
  // Organic сниппеты с ценой
  'Organic_withOfferInfo',  // Органик с офером (цена, магазин, доставка)
  
  // ProductTile - карточки товаров в сетке
  'ProductTile-Item',       // Карточка товара в плитке
];

// Имена текстовых полей, которые могут быть внутри инстансов
export const TEXT_FIELD_NAMES = [
  '#organicTitle', 
  '#shoptitle', 
  '#shopname', 
  '#brand', 
  '#organicprice', 
  '#oldprice', 
  '#organictext',
  '#ProductRating',
  '#EPriceBarometer_View'
];

// Конфигурация для специальных компонентов
export const COMPONENT_CONFIG = {
  EPriceGroup: {
    name: 'EPriceGroup',
    properties: {
      discount: {
        dataField: '#EPriceGroup_Discount',
        variantName: 'Discount',
        type: 'boolean'
      },
      oldPrice: {
        dataField: '#EPriceGroup_OldPrice',
        variantName: 'Old Price', // Также пробуем OldPrice, Old_Price
        type: 'boolean'
      }
    }
  },
  ELabelGroup: {
    name: 'ELabelGroup',
    properties: {
      rating: {
        dataField: '#ProductRating', // Если есть значение, ставим true
        variantName: 'Rating',
        type: 'presence' // true если есть значение, false если нет
      },
      barometer: {
        dataField: '#ELabelGroup_Barometer',
        variantName: 'Barometer',
        type: 'boolean'
      }
    }
  },
  EPriceBarometer: {
    name: 'EPriceBarometer',
    properties: {
      view: {
        dataField: '#EPriceBarometer_View',
        variantName: 'View',
        type: 'string'
      }
    }
  }
};

// Настройки для изображений
export const IMAGE_CONFIG = {
  TIMEOUT_MS: 30000,
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_CONCURRENT: 3
};

