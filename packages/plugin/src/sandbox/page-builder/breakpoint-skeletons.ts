/**
 * Breakpoint Skeletons — принципиальные макеты SERP под каждый брейкпоинт.
 *
 * Создаёт 4 вертикальных фрейма (5col, 4col, 3col, touch) в горизонтальной
 * обёртке на текущей странице. Каждый фрейм содержит Header, EQuickFilters,
 * AdvProductGallery, ProductsTiles и один ESnippet — инстансы библиотеки
 * без данных, разложенные в autolayout. Используется для отладки адаптивного
 * поведения без реальных данных из relay.
 *
 * Источник брейкпоинтов: docs/BREAKPOINTS.md и замеры 2026-04-21.
 */

import { Logger } from '../../logger';
import { SNIPPET_COMPONENT_MAP, LAYOUT_COMPONENT_MAP } from './component-map';
import { loadComponent, createPlaceholder } from './component-import';
import { createEQuickFiltersPanel, createAsideFiltersPanel } from './panel-builders';
import type { StructureNode } from './types';
import type { CSVRow } from '../../types';

/** Ширина content__aside в Yandex SERP (соответствует `createAsideFiltersPanel`). */
const ASIDE_WIDTH = 230;

/** Зазор между content__aside и content__left в горизонтальной обёртке. */
const ASIDE_GAP = 16;

export type BreakpointName = '5col' | '4col' | '3col' | '3col-narrow' | 'touch';

export interface BreakpointSpec {
  name: BreakpointName;
  label: string;
  /** Ширина всего фрейма брейкпоинта (= ширина окна в Яндексе). */
  frameWidth: number;
  /** Ширина `.content__left` — колонки, где лежат плитки/сниппеты. */
  leftColWidth: number;
  /**
   * Offset content__left от левого края фрейма в px — замер с реальной
   * обычной выдачи Яндекса (yandex.ru/search без products_mode). Этот же
   * padding применяется к Header и к contentRow независимо от того,
   * отображается ли сайдбар — в обычной выдаче Яндекса гуттер не меняется
   * при появлении aside.
   */
  leftPaddingX: number;
  /**
   * Показывать ли content__aside (EAsideFilters) слева от content__left.
   * Desktop — true, touch — false (на мобильной выдаче боковых фильтров нет).
   */
  hasAsideFilters: boolean;
  platform: 'desktop' | 'touch';
  gridCols: number;
  tileWidth: number;
  galleryVariant: 'left' | 'top';
  gapY: number;
}

/**
 * Каноничные брейкпоинты Яндекс SERP. Все переходы сняты с регулярной выдачи
 * (yandex.ru/search без products_mode) — это четыре разных плато левого
 * гуттера, переходы совпадают с CSS-правилами Яндекса:
 *   - ≥1560       → gutter 124, leftCol 792 (5 колонок в products_mode)
 *   - 1252–1559   → gutter 100, leftCol 792 (4 колонки)
 *   - 991–1251    → gutter 100, leftCol 568 (3 колонки)
 *   - 820–990     → gutter  28, leftCol 568 (3 колонки, узкий chrome)
 *   - <820        → horizontal scroll на desktop, ниже 390 — touch-шаблон
 * gridCols/tileWidth берутся из products_mode=1 — в регулярной выдаче плиточной
 * сетки нет, но переходы grid (5↔4 при 1560, 4↔3 при 1252) совпадают с
 * переходами leftCol.w, поэтому одна конфигурация описывает оба контекста.
 */
export const BREAKPOINTS: readonly BreakpointSpec[] = [
  {
    name: '5col',
    label: 'Desktop · 5 col · ≥1560',
    frameWidth: 1920,
    leftColWidth: 792,
    leftPaddingX: 124,
    hasAsideFilters: true,
    platform: 'desktop',
    gridCols: 5,
    tileWidth: 184,
    galleryVariant: 'left',
    gapY: 16,
  },
  {
    name: '4col',
    label: 'Desktop · 4 col · 1252–1559',
    frameWidth: 1440,
    leftColWidth: 792,
    leftPaddingX: 100,
    hasAsideFilters: true,
    platform: 'desktop',
    gridCols: 4,
    tileWidth: 184,
    galleryVariant: 'left',
    gapY: 16,
  },
  {
    name: '3col',
    label: 'Desktop · 3 col · 991–1251',
    frameWidth: 1100,
    leftColWidth: 568,
    leftPaddingX: 100,
    hasAsideFilters: true,
    platform: 'desktop',
    gridCols: 3,
    tileWidth: 172,
    galleryVariant: 'left',
    gapY: 16,
  },
  {
    name: '3col-narrow',
    label: 'Desktop · 3 col · 820–990',
    // Узкий chrome: gutter схлопывается со 100 до 28, сайдбар Яндекс обычно
    // скрывает при max-width: 990, поэтому aside отключён.
    frameWidth: 900,
    leftColWidth: 568,
    leftPaddingX: 28,
    hasAsideFilters: false,
    platform: 'desktop',
    gridCols: 3,
    tileWidth: 172,
    galleryVariant: 'left',
    gapY: 16,
  },
  {
    name: 'touch',
    label: 'Touch · 1 col · <820',
    frameWidth: 390,
    leftColWidth: 360,
    leftPaddingX: 15,
    hasAsideFilters: false,
    platform: 'touch',
    gridCols: 1,
    tileWidth: 360,
    galleryVariant: 'top',
    gapY: 12,
  },
];

export interface BreakpointSkeletonsResult {
  success: boolean;
  frame: FrameNode | null;
  createdBreakpoints: BreakpointName[];
  errors: string[];
}

/**
 * Создать фрейм-обёртку (горизонтальный autolayout), внутрь которого лягут 4 фрейма.
 */
function createWrapper(): FrameNode {
  const wrapper = figma.createFrame();
  wrapper.name = 'Breakpoint Skeletons';
  wrapper.layoutMode = 'HORIZONTAL';
  wrapper.primaryAxisSizingMode = 'AUTO';
  wrapper.counterAxisSizingMode = 'AUTO';
  wrapper.counterAxisAlignItems = 'MIN';
  wrapper.itemSpacing = 80;
  wrapper.paddingTop = 40;
  wrapper.paddingRight = 40;
  wrapper.paddingBottom = 40;
  wrapper.paddingLeft = 40;
  wrapper.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }];
  return wrapper;
}

/**
 * Создать пустой autolayout-фрейм с заданными параметрами.
 */
function createAutoFrame(
  name: string,
  direction: 'HORIZONTAL' | 'VERTICAL',
  opts: {
    widthFill?: boolean;
    fixedWidth?: number;
    itemSpacing?: number;
    counterAxisSpacing?: number;
    wrap?: boolean;
    padding?: { top: number; right: number; bottom: number; left: number };
    fills?: Paint[];
  } = {},
): FrameNode {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = direction;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = opts.widthFill ? 'AUTO' : 'FIXED';
  f.itemSpacing = opts.itemSpacing ?? 0;
  if (opts.counterAxisSpacing !== undefined) f.counterAxisSpacing = opts.counterAxisSpacing;
  if (opts.wrap) f.layoutWrap = 'WRAP';
  if (opts.fixedWidth !== undefined) f.resize(opts.fixedWidth, 100);
  const p = opts.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  f.paddingTop = p.top;
  f.paddingRight = p.right;
  f.paddingBottom = p.bottom;
  f.paddingLeft = p.left;
  f.fills = opts.fills ?? [];
  return f;
}

/**
 * Создать один инстанс EProductSnippet2 с указанным View (AdvGallery или Default).
 * Фиксированная ширина — т.к. карточки в сетке/карусели имеют жёсткий размер.
 */
async function createProductTile(
  view: 'AdvGallery' | 'Default',
  width: number,
): Promise<SceneNode> {
  const cfg = SNIPPET_COMPONENT_MAP.EProductSnippet2;
  const component = await loadComponent(cfg.key);
  if (!component) {
    return createPlaceholder('EProductSnippet2', width, 240);
  }
  const instance = component.createInstance();
  try {
    instance.setProperties({ type: 'organic', View: view });
  } catch (e) {
    // Компонент может не иметь свойства View или 'type' — оставляем дефолтный вариант
    Logger.debug('[BreakpointSkeletons] Product tile setProperties ignored: ' + String(e));
  }
  // Жёсткая ширина — высота подстраивается компонентом
  if ('resize' in instance) {
    instance.resize(width, instance.height);
  }
  return instance;
}

/**
 * Создать Header-инстанс. Выставляет горизонтальный padding так, чтобы
 * внутренний контент (лого, поиск, иконки) выравнивался с `content__left`
 * снизу. Работает только если у библиотечного Header включён auto-layout —
 * в противном случае задание paddingLeft молча игнорируется.
 */
async function createHeader(
  platform: 'desktop' | 'touch',
  contentStartX: number,
): Promise<SceneNode | null> {
  const cfg = LAYOUT_COMPONENT_MAP.Header;
  if (!cfg.key) return null;
  const component = await loadComponent(cfg.key);
  if (!component) return null;
  const instance = component.createInstance();
  try {
    instance.setProperties({ Desktop: platform === 'desktop' ? 'True' : 'False' });
  } catch (e) {
    Logger.debug('[BreakpointSkeletons] Header setProperties ignored: ' + String(e));
  }
  // Выравниваем внутренний padding Header с левым краем контента.
  // Header в библиотеке — auto-layout фрейм, paddingLeft/Right можно выставить.
  try {
    if ('layoutMode' in instance && instance.layoutMode !== 'NONE') {
      instance.paddingLeft = contentStartX;
      // Правый padding не трогаем — у Header справа свой встроенный блок (иконки
      // пользователя), и симметрия contentStartX справа в реальном Yandex не
      // соблюдается.
    }
  } catch (e) {
    Logger.debug('[BreakpointSkeletons] Header paddingLeft override ignored: ' + String(e));
  }
  return instance;
}

/**
 * Создать ESnippet-инстанс (пример органического результата).
 */
async function createESnippet(platform: 'desktop' | 'touch'): Promise<SceneNode | null> {
  const cfg = SNIPPET_COMPONENT_MAP.ESnippet;
  const key = platform === 'touch' && cfg.keyTouch ? cfg.keyTouch : cfg.key;
  const component = await loadComponent(key);
  if (!component) return null;
  return component.createInstance();
}

/**
 * Мок-данные для EQuickFilters — 5 обычных фильтров + "Все фильтры".
 * Конкретные имена не важны; скелетон иллюстрирует раскладку.
 */
const FILTER_MOCK_DATA: CSVRow = {
  '#FilterButtonsCount': '5',
  '#FilterButton_1': 'Цена',
  '#FilterButton_2': 'Бренд',
  '#FilterButton_3': 'Мощность',
  '#FilterButton_4': 'Доставка',
  '#FilterButton_5': 'Рейтинг',
  '#FilterButtonType_1': 'dropdown',
  '#FilterButtonType_2': 'dropdown',
  '#FilterButtonType_3': 'dropdown',
  '#FilterButtonType_4': 'dropdown',
  '#FilterButtonType_5': 'sort',
  '#AllFiltersButton': 'true',
};

/**
 * Собрать панель быстрых фильтров через существующий билдер.
 * Возвращает null, если библиотечные компоненты не подгрузились.
 */
async function createFilterPanel(platform: 'desktop' | 'touch'): Promise<FrameNode | null> {
  const node: StructureNode = {
    id: 'filter-panel',
    type: 'EQuickFilters',
    data: FILTER_MOCK_DATA,
    order: 0,
  };
  try {
    return await createEQuickFiltersPanel(node, platform);
  } catch (e) {
    Logger.warn('[BreakpointSkeletons] createEQuickFiltersPanel failed: ' + String(e));
    return null;
  }
}

/**
 * Мок-данные для EAsideFilters — покрывают все 4 типа фильтров, поддерживаемых
 * существующим `createAsideFiltersPanel`: categories, number (range), enum, boolean.
 */
const ASIDE_FILTERS_MOCK_JSON = JSON.stringify({
  filters: [
    {
      title: 'Категория',
      type: 'categories',
      items: ['Фены', 'Фены-щётки', 'Выпрямители', 'Стайлеры'],
    },
    {
      title: 'Цена, ₽',
      type: 'number',
      placeholderFrom: 'от',
      placeholderTo: 'до',
    },
    {
      title: 'Бренд',
      type: 'enum',
      items: ['Dyson', 'Philips', 'Rowenta', 'Remington', 'Braun'],
      hasMore: true,
    },
    {
      title: 'С бесплатной доставкой',
      type: 'boolean',
    },
  ],
});

/**
 * Собрать панель боковых фильтров через существующий билдер.
 */
async function createAsidePanel(platform: 'desktop' | 'touch'): Promise<FrameNode | null> {
  const node: StructureNode = {
    id: 'aside-filters',
    type: 'EAsideFilters',
    data: { '#AsideFilters_data': ASIDE_FILTERS_MOCK_JSON } as CSVRow,
    order: 0,
  };
  try {
    return await createAsideFiltersPanel(node, platform);
  } catch (e) {
    Logger.warn('[BreakpointSkeletons] createAsideFiltersPanel failed: ' + String(e));
    return null;
  }
}

/**
 * Построить один breakpoint-фрейм: Header (FILL) → вертикальная колонка с
 * filters + gallery + tiles + ESnippet, сдвинутая от левого края на leftPaddingX.
 */
async function buildBreakpointFrame(spec: BreakpointSpec): Promise<FrameNode> {
  const root = createAutoFrame(spec.label, 'VERTICAL', {
    fixedWidth: spec.frameWidth,
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 24, left: 0 },
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
  });

  // Header — fill width, с paddingLeft = leftPaddingX, чтобы лого и
  // поисковая строка внутри Header начинались с той же x-координаты,
  // что и контент ниже. В обычной выдаче Яндекса левый gutter одинаковый
  // для Header и content — 124px на широком десктопе, 100px в узкой зоне.
  const header = await createHeader(spec.platform, spec.leftPaddingX);
  if (header) {
    root.appendChild(header);
    if ('layoutSizingHorizontal' in header) {
      (header as FrameNode).layoutSizingHorizontal = 'FILL';
    }
  }

  // contentRow — горизонтальная обёртка с тем же leftPaddingX.
  const contentRow = createAutoFrame('contentRow', 'HORIZONTAL', {
    widthFill: true,
    itemSpacing: spec.hasAsideFilters ? ASIDE_GAP : 0,
    padding: { top: spec.gapY, right: 0, bottom: 0, left: spec.leftPaddingX },
  });
  root.appendChild(contentRow);
  contentRow.layoutSizingHorizontal = 'FILL';

  // content__aside — боковые фильтры (только desktop)
  if (spec.hasAsideFilters) {
    const aside = await createAsidePanel(spec.platform);
    if (aside) {
      contentRow.appendChild(aside);
      // ширина панели уже выставлена билдером (230px FIXED)
    } else {
      // fallback-плейсхолдер, чтобы раскладка не схлопывалась, если библиотека
      // недоступна
      const stub = createAutoFrame('EAsideFilters (fallback)', 'VERTICAL', {
        fixedWidth: ASIDE_WIDTH,
        padding: { top: 16, right: 0, bottom: 16, left: 0 },
        fills: [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.97 } }],
      });
      stub.resize(ASIDE_WIDTH, 200);
      contentRow.appendChild(stub);
    }
  }

  // content__left — вертикальная колонка фиксированной ширины
  const contentWrap = createAutoFrame('content__left', 'VERTICAL', {
    fixedWidth: spec.leftColWidth,
    itemSpacing: spec.gapY,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  contentRow.appendChild(contentWrap);

  // EQuickFilters — панель фильтров над сеткой
  const filterPanel = await createFilterPanel(spec.platform);
  if (filterPanel) {
    contentWrap.appendChild(filterPanel);
    filterPanel.layoutSizingHorizontal = 'FILL';
  }

  // AdvProductGallery — горизонтальная карусель
  const galleryTileCount = spec.platform === 'touch' ? 4 : 2;
  const galleryTileWidth = spec.platform === 'touch' ? 152 : 156;
  const gallery = createAutoFrame('AdvProductGallery', 'HORIZONTAL', {
    widthFill: false,
    itemSpacing: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  gallery.primaryAxisSizingMode = 'AUTO';
  gallery.counterAxisSizingMode = 'AUTO';
  gallery.clipsContent = false;
  contentWrap.appendChild(gallery);
  for (let i = 0; i < galleryTileCount; i++) {
    const tile = await createProductTile('AdvGallery', galleryTileWidth);
    gallery.appendChild(tile);
  }

  // ProductsTiles — нативный Figma grid: layoutMode='GRID' с gridRowCount/
  // gridColumnCount. Треки по умолчанию FLEX — ячейки распределяются равномерно
  // по ширине контейнера. Плитки получают FILL по обеим осям, чтобы занять всю
  // ячейку. Позицию каждой плитки ставим явно через setGridChildPosition.
  const totalTiles = spec.platform === 'touch' ? 4 : spec.gridCols * 2;
  const rowCount = Math.ceil(totalTiles / spec.gridCols);
  const GRID_GAP = 8;

  const tiles = figma.createFrame();
  tiles.name = 'ProductsTiles';
  tiles.layoutMode = 'GRID';
  tiles.gridColumnCount = spec.gridCols;
  tiles.gridRowCount = rowCount;
  tiles.gridColumnGap = GRID_GAP;
  tiles.gridRowGap = GRID_GAP;
  tiles.paddingTop = 0;
  tiles.paddingRight = 0;
  tiles.paddingBottom = 0;
  tiles.paddingLeft = 0;
  tiles.fills = [];
  contentWrap.appendChild(tiles);
  tiles.layoutSizingHorizontal = 'FILL';
  tiles.layoutSizingVertical = 'HUG';

  let placed = 0;
  for (let r = 0; r < rowCount; r++) {
    const colsInRow = Math.min(spec.gridCols, totalTiles - placed);
    for (let c = 0; c < colsInRow; c++) {
      // Начальная ширина — только хинт; grid перераспределит FLEX-треки.
      const tile = await createProductTile('Default', spec.tileWidth);
      tiles.appendChild(tile);
      try {
        if ('setGridChildPosition' in tile) {
          (tile as FrameNode).setGridChildPosition(r, c);
        }
      } catch (e) {
        Logger.debug('[BreakpointSkeletons] setGridChildPosition ignored: ' + String(e));
      }
      if ('layoutSizingHorizontal' in tile) {
        (tile as FrameNode).layoutSizingHorizontal = 'FILL';
      }
      if ('layoutSizingVertical' in tile) {
        (tile as FrameNode).layoutSizingVertical = 'HUG';
      }
      placed += 1;
    }
  }

  // Organic ESnippet — один под сеткой
  const esnippet = await createESnippet(spec.platform);
  if (esnippet) {
    contentWrap.appendChild(esnippet);
    if ('layoutSizingHorizontal' in esnippet) {
      (esnippet as FrameNode).layoutSizingHorizontal = 'FILL';
    }
  }

  return root;
}

/**
 * Создать 4 принципиальных макета SERP — по одному на каждый брейкпоинт.
 * Фреймы кладутся в горизонтальную обёртку на текущей странице, обёртка центрируется.
 */
export async function createBreakpointSkeletons(): Promise<BreakpointSkeletonsResult> {
  const startTime = Date.now();
  Logger.info('[BreakpointSkeletons] Starting...');

  const wrapper = createWrapper();
  wrapper.x = figma.viewport.center.x - 2000;
  wrapper.y = figma.viewport.center.y;
  figma.currentPage.appendChild(wrapper);

  const created: BreakpointName[] = [];
  const errors: string[] = [];

  for (const spec of BREAKPOINTS) {
    try {
      const frame = await buildBreakpointFrame(spec);
      wrapper.appendChild(frame);
      created.push(spec.name);
      Logger.verbose('[BreakpointSkeletons] Built ' + spec.name);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push('[' + spec.name + '] ' + msg);
      Logger.error('[BreakpointSkeletons] Failed ' + spec.name + ':', e);
    }
  }

  figma.currentPage.selection = [wrapper];
  figma.viewport.scrollAndZoomIntoView([wrapper]);

  Logger.info(
    '[BreakpointSkeletons] Done: ' +
      created.length +
      '/' +
      BREAKPOINTS.length +
      ' in ' +
      (Date.now() - startTime) +
      'ms',
  );

  return {
    success: errors.length === 0 && created.length === BREAKPOINTS.length,
    frame: wrapper,
    createdBreakpoints: created,
    errors,
  };
}
