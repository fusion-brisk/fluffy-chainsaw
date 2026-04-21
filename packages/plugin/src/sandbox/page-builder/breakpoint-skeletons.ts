/**
 * Breakpoint Skeletons — принципиальные макеты SERP под каждый брейкпоинт.
 *
 * Создаёт 4 вертикальных фрейма (5col, 4col, 3col, touch) в горизонтальной
 * обёртке на текущей странице. Каждый фрейм содержит Header, AdvProductGallery,
 * ProductsTiles и один ESnippet — инстансы библиотеки без данных, просто
 * разложенные в autolayout. Используется для отладки адаптивного поведения
 * без реальных данных из relay.
 *
 * Источник брейкпоинтов: docs/BREAKPOINTS.md и замеры 2026-04-21.
 */

import { Logger } from '../../logger';
import { SNIPPET_COMPONENT_MAP, LAYOUT_COMPONENT_MAP } from './component-map';
import { loadComponent, createPlaceholder } from './component-import';

export type BreakpointName = '5col' | '4col' | '3col' | 'touch';

export interface BreakpointSpec {
  name: BreakpointName;
  label: string;
  frameWidth: number;
  leftColWidth: number;
  platform: 'desktop' | 'touch';
  gridCols: number;
  tileWidth: number;
  galleryVariant: 'left' | 'top';
  paddingX: number;
  gapY: number;
}

/**
 * Каноничные брейкпоинты Яндекс SERP (products_mode=1).
 * Ширина фрейма — референсная из каждого диапазона, leftColWidth — фактическая
 * ширина `.content__left` на этой ширине.
 */
export const BREAKPOINTS: readonly BreakpointSpec[] = [
  {
    name: '5col',
    label: 'Desktop · 5 col · ≥1560',
    frameWidth: 1920,
    leftColWidth: 984,
    platform: 'desktop',
    gridCols: 5,
    tileWidth: 184,
    galleryVariant: 'left',
    paddingX: 16,
    gapY: 16,
  },
  {
    name: '4col',
    label: 'Desktop · 4 col · 1252–1559',
    frameWidth: 1440,
    leftColWidth: 792,
    platform: 'desktop',
    gridCols: 4,
    tileWidth: 184,
    galleryVariant: 'left',
    paddingX: 16,
    gapY: 16,
  },
  {
    name: '3col',
    label: 'Desktop · 3 col · 820–1251',
    frameWidth: 1024,
    leftColWidth: 568,
    platform: 'desktop',
    gridCols: 3,
    tileWidth: 172,
    galleryVariant: 'left',
    paddingX: 16,
    gapY: 16,
  },
  {
    name: 'touch',
    label: 'Touch · 1 col · <820',
    frameWidth: 390,
    leftColWidth: 360,
    platform: 'touch',
    gridCols: 1,
    tileWidth: 360,
    galleryVariant: 'top',
    paddingX: 15,
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
 * Создать Header-инстанс на ширину FILL.
 */
async function createHeader(platform: 'desktop' | 'touch'): Promise<SceneNode | null> {
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
 * Построить один breakpoint-фрейм: вертикальный autolayout с Header, галереей, сеткой, 1 ESnippet.
 */
async function buildBreakpointFrame(spec: BreakpointSpec): Promise<FrameNode> {
  const root = createAutoFrame(spec.label, 'VERTICAL', {
    fixedWidth: spec.frameWidth,
    itemSpacing: spec.gapY,
    padding: { top: 0, right: 0, bottom: 24, left: 0 },
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
  });

  // Header — fill width
  const header = await createHeader(spec.platform);
  if (header) {
    root.appendChild(header);
    if ('layoutSizingHorizontal' in header) {
      (header as FrameNode).layoutSizingHorizontal = 'FILL';
    }
  }

  // content__left — колонка центрируется внутри фрейма с фиксированной шириной
  const contentWrap = createAutoFrame('content__left', 'VERTICAL', {
    fixedWidth: spec.leftColWidth,
    itemSpacing: spec.gapY,
    padding: { top: 0, right: spec.paddingX, bottom: 0, left: spec.paddingX },
  });
  root.appendChild(contentWrap);

  // AdvProductGallery — горизонтальная карусель
  const galleryTileCount = spec.platform === 'touch' ? 4 : 2;
  const galleryTileWidth = spec.platform === 'touch' ? 152 : 156;
  const gallery = createAutoFrame('AdvProductGallery', 'HORIZONTAL', {
    widthFill: false,
    itemSpacing: 8,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  // Gallery ширина = fill родителя (сам контейнер хранит карточки фиксированной ширины)
  gallery.primaryAxisSizingMode = 'AUTO';
  gallery.counterAxisSizingMode = 'AUTO';
  gallery.clipsContent = false;
  contentWrap.appendChild(gallery);
  for (let i = 0; i < galleryTileCount; i++) {
    const tile = await createProductTile('AdvGallery', galleryTileWidth);
    gallery.appendChild(tile);
  }

  // ProductsTiles — сетка товаров (WRAP для desktop, VERTICAL для touch)
  const tilesCount = spec.platform === 'touch' ? 4 : spec.gridCols * 2;
  const tiles = createAutoFrame('ProductsTiles', 'HORIZONTAL', {
    widthFill: true,
    itemSpacing: 8,
    counterAxisSpacing: 8,
    wrap: spec.platform === 'desktop',
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  contentWrap.appendChild(tiles);
  tiles.layoutSizingHorizontal = 'FILL';
  for (let i = 0; i < tilesCount; i++) {
    const tile = await createProductTile('Default', spec.tileWidth);
    tiles.appendChild(tile);
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
