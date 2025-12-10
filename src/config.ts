// Конфигурация плагина Contentify

// Версия плагина для What's New экрана
// Формат: MAJOR.MINOR.PATCH
// Увеличивайте при каждом релизе с изменениями, достойными показа пользователю
export const PLUGIN_VERSION = '2.1.0';

// Список изменений для What's New экрана
// Последние изменения сверху
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.1.0',
    date: '2024-12-10',
    title: 'Улучшенный парсинг кнопок',
    highlights: [
      '🛒 Поддержка кнопки "Купить в 1 клик" во всех типах сниппетов',
      '🎨 Автоматическое определение вида кнопки (primary, white, secondary)',
      '📦 Улучшенный парсинг EShopItem и EOfferItem',
      '⚡ Оптимизация DOM-обхода для больших файлов',
    ],
    type: 'feature'
  },
  {
    version: '2.0.0',
    date: '2024-11-15',
    title: 'Contentify v2 — Новый интерфейс',
    highlights: [
      '✨ Полностью переработанный UI в стиле Figma UI3',
      '📊 Live-прогресс обработки в стиле GPT',
      '⚙️ Удалённые правила парсинга с автообновлением',
      '🔍 Продвинутый просмотр логов с фильтрацией',
    ],
    type: 'major'
  }
];

// Тип записи в changelog
export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  type: 'major' | 'feature' | 'fix' | 'improvement';
}

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
      },
      isCompact: {
        dataField: '#EPriceBarometer_isCompact',
        variantName: 'isCompact',
        type: 'boolean'
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

