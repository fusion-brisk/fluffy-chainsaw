/**
 * Page Builder Types
 * 
 * Типы для модуля создания страниц из HTML
 */

import { CSVRow } from '../types';

// ============================================================================
// COMPONENT CONFIGURATION
// ============================================================================

/**
 * Конфигурация компонента из библиотеки
 */
export interface ComponentConfig {
  /** Component key из Team Library (DC • ECOM) */
  key: string;
  /** Component key для touch платформы (если отличается) */
  keyTouch?: string;
  /** Имя компонента в библиотеке */
  name: string;
  /** Default variant properties */
  defaultVariant?: Record<string, string | boolean>;
  /** Поддерживает ли компонент группировку (несколько items внутри) */
  isGroup?: boolean;
  /** Максимальное количество items в группе (если isGroup=true) */
  maxItems?: number;
  /** Свойство для управления количеством видимых items */
  itemCountProperty?: string;
}

/**
 * Конфигурация контейнера (Auto Layout фрейм)
 */
export interface ContainerConfig {
  /** Имя контейнера */
  name: string;
  /** Направление layout */
  layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'WRAP';
  /** Ширина: число = fixed, 'FILL' = fill parent, 'HUG' = по контенту */
  width: number | 'FILL' | 'HUG';
  /** Высота: 'HUG' = auto, число = fixed */
  height: 'HUG' | number;
  /** Gap между элементами */
  itemSpacing?: number;
  /** Gap между строками (для WRAP) */
  counterAxisSpacing?: number;
  /** Padding */
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  /** Какие типы сниппетов содержит */
  childTypes: SnippetType[];
  /** Ширина дочерних элементов */
  childWidth?: number | 'FILL';
  /** Обрезать контент (clipsContent) */
  clipsContent?: boolean;
}

// ============================================================================
// ELEMENT TYPES
// ============================================================================

/**
 * Типы сниппетов (компоненты из библиотеки)
 */
export type SnippetType = 
  | 'ESnippet'           // Основной сниппет товара
  | 'EOfferItem'         // Оффер в списке
  | 'EShopItem'          // Магазин в списке
  | 'EProductSnippet2'   // Карточка товара в галерее
  | 'Organic'            // Органический результат
  | 'Organic_withOfferInfo'
  | 'ProductTile-Item';

/**
 * Типы элементов страницы (обрамление)
 */
export type LayoutElementType =
  | 'Header'           // Шапка страницы
  | 'Footer'           // Подвал страницы
  | 'Pager'            // Пагинация
  | 'Related'          // Похожие запросы / Вместе с этим ищут
  | 'EQuickFilters';   // Панель быстрых фильтров

/**
 * Типы контейнеров (Auto Layout фреймы для группировки)
 */
export type ContainerType =
  | 'AdvProductGallery'  // Рекламная галерея товаров (wrap, карточки с View=AdvGallery)
  | 'ProductsTiles'      // Обычные товарные карточки (wrap, View=Default)
  | 'EntityOffers'       // Группа офферов от разных магазинов (vertical, ESnippet)
  | 'EShopList'          // Список магазинов (vertical)
  | 'EOfferList'         // Список офферов (vertical)
  | 'OrganicList';       // Список органики (vertical)

/**
 * Типы групп сниппетов (устаревшее, для совместимости)
 * @deprecated Use ContainerType instead
 */
export type GroupType =
  | 'EShopGroup'
  | 'EOfferGroup'
  | 'ProductTileRow'
  | 'OrganicBlock';

// ============================================================================
// PAGE STRUCTURE
// ============================================================================

/**
 * Узел структуры страницы
 * Может быть: сниппет, контейнер, layout элемент
 */
export interface StructureNode {
  /** Уникальный ID */
  id: string;
  /** Тип узла */
  type: SnippetType | ContainerType | LayoutElementType;
  /** Данные для заполнения (для сниппетов) */
  data?: CSVRow;
  /** Дочерние узлы (для контейнеров) */
  children?: StructureNode[];
  /** Порядок в родителе */
  order: number;
}

/**
 * Полная структура страницы
 */
export interface SerpPageStructure {
  /** Метаданные */
  meta: PageMeta;
  /** Содержимое content__left */
  contentLeft: StructureNode[];
  /** Содержимое content__right (пока не используется) */
  contentRight: StructureNode[];
  /** Статистика */
  stats: {
    totalSnippets: number;
    byType: Record<string, number>;
    containers: number;
  };
}

/**
 * Элемент страницы (устаревшее, для совместимости)
 * @deprecated Use StructureNode instead
 */
export interface PageElement {
  /** Уникальный ID элемента */
  id: string;
  /** Тип сниппета, группы или элемента страницы */
  type: SnippetType | GroupType | LayoutElementType;
  /** Данные для заполнения */
  data: CSVRow;
  /** Порядок на странице (0-based) */
  order: number;
  /** Вложенные элементы (для групп) */
  children?: PageElement[];
  /** Глубина вложенности (0 = top-level) */
  depth: number;
  /** CSS классы оригинального HTML элемента */
  cssClasses?: string[];
  /** data-атрибуты оригинального HTML элемента */
  dataAttributes?: Record<string, string>;
}

/**
 * Результат парсинга структуры страницы (устаревшее)
 * @deprecated Use SerpPageStructure instead
 */
export interface PageStructure {
  /** Элементы страницы в порядке появления */
  elements: PageElement[];
  /** Метаданные страницы */
  meta: PageMeta;
  /** Статистика парсинга */
  stats: ParsingStats;
}

/**
 * Метаданные страницы
 */
export interface PageMeta {
  /** Поисковый запрос */
  query?: string;
  /** Платформа (desktop/touch) */
  platform: 'desktop' | 'touch';
  /** Общее количество результатов */
  totalResults?: number;
  /** Источник данных */
  source?: string;
}

/**
 * Статистика парсинга
 */
export interface ParsingStats {
  /** Всего найдено элементов */
  totalElements: number;
  /** По типам */
  byType: Record<string, number>;
  /** Количество групп */
  groupCount: number;
  /** Время парсинга (ms) */
  parseTime: number;
}

// ============================================================================
// PAGE CREATION
// ============================================================================

/**
 * Опции создания страницы
 */
export interface PageCreationOptions {
  /** Ширина страницы */
  width?: number;
  /** Отступ между элементами */
  itemSpacing?: number;
  /** Padding страницы */
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  /** Имя создаваемого фрейма */
  frameName?: string;
  /** Платформа */
  platform?: 'desktop' | 'touch';
}

/**
 * Результат создания страницы
 */
export interface PageCreationResult {
  /** Успешно ли создана страница */
  success: boolean;
  /** Созданный фрейм (может быть null при ошибке) */
  frame: FrameNode | null;
  /** Количество созданных элементов */
  createdCount: number;
  /** Ошибки при создании (строки для простоты) */
  errors: string[];
  /** Время создания (ms) */
  creationTime: number;
}

/**
 * Ошибка создания элемента
 */
export interface PageCreationError {
  /** ID элемента */
  elementId: string;
  /** Тип элемента */
  elementType: string;
  /** Сообщение об ошибке */
  message: string;
  /** Стек ошибки */
  stack?: string;
}
