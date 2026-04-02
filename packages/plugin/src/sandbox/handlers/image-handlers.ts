/**
 * Image handlers — image loading, application, and imageType switching
 *
 * Handles:
 * - Component cache for page-level component lookup
 * - Single image application (EThumb)
 * - ThumbGroup images (EThumbGroup collage)
 * - imageType switching between EThumb and EThumbGroup
 */

import { Logger } from '../../logger';
import { findFirstNodeByName } from '../../utils/node-search';
import { fetchAndApplyImage } from '../image-apply';
import { HandlerContext } from './types';
import { CSVRow } from '../../types/csv-fields';

// Кэш компонентов страницы (построается один раз при первом вызове)
let componentsCache: Map<string, ComponentNode> | null = null;
let componentsCachePageId: string | null = null;

/**
 * Получить компонент по имени из кэша (O(1) вместо findAll)
 */
function getCachedComponent(name: string): ComponentNode | undefined {
  // Проверяем актуальность кэша (страница не изменилась)
  if (componentsCachePageId !== figma.currentPage.id) {
    componentsCache = null;
    componentsCachePageId = null;
  }

  // Лениво строим кэш при первом обращении
  if (!componentsCache) {
    const startTime = Date.now();
    componentsCache = new Map();
    componentsCachePageId = figma.currentPage.id;

    const allComponents = figma.currentPage.findAll(
      (n) => n.type === 'COMPONENT',
    ) as ComponentNode[];
    for (const comp of allComponents) {
      if (!comp.removed && !componentsCache.has(comp.name)) {
        componentsCache.set(comp.name, comp);
      }
    }

    Logger.debug(
      `📦 [ComponentsCache] Построен: ${componentsCache.size} компонентов за ${Date.now() - startTime}ms`,
    );
  }

  return componentsCache.get(name);
}

/**
 * Очистка кэша компонентов (вызывается при необходимости)
 */
export function clearComponentsCache(): void {
  componentsCache = null;
  componentsCachePageId = null;
}

/**
 * Применяет одиночное изображение к слою #OrganicImage / #ThumbImage / Image Ratio
 * Вызывается для State=Default (одна картинка)
 */
async function applySingleImage(container: SceneNode, row: CSVRow): Promise<void> {
  const url = row['#OrganicImage'] || row['#ThumbImage'] || '';

  if (!url || url.trim() === '') {
    Logger.debug(`⚠️ [applySingleImage] URL пустой, пропуск`);
    return;
  }

  // Ищем слой изображения по разным именам
  const layerNames = ['#OrganicImage', '#ThumbImage', 'Image Ratio', 'EThumb-Image', '#Image'];
  let layer: SceneNode | null = null;

  for (const name of layerNames) {
    layer = findFirstNodeByName(container, name) as SceneNode | null;
    if (layer) {
      Logger.debug(`🖼️ [applySingleImage] Найден слой "${name}"`);
      break;
    }
  }

  if (!layer) {
    Logger.debug(
      `⚠️ [applySingleImage] Слой изображения не найден (пробовал: ${layerNames.join(', ')})`,
    );
    return;
  }

  Logger.debug(
    `🖼️ [applySingleImage] Применяем к "${layer.name}", URL="${url.substring(0, 50)}..."`,
  );
  await fetchAndApplyImage(layer, url, 'FIT', '[applySingleImage]');
}

/**
 * Находит все слои с fills внутри контейнера (для изображений)
 */
function findAllFillableLayers(node: SceneNode): SceneNode[] {
  const result: SceneNode[] = [];

  if ('fills' in node && node.type !== 'TEXT') {
    result.push(node);
  }

  if ('children' in node) {
    for (const child of (node as FrameNode | GroupNode).children) {
      result.push(...findAllFillableLayers(child));
    }
  }

  return result;
}

/**
 * Применяет изображения к слоям #Image1, #Image2, #Image3 внутри EThumbGroup
 * Вызывается ПОСЛЕ переключения imageType на EThumbGroup
 *
 * FALLBACK: если #Image1 пустой но есть #OrganicImage — используем его
 *
 * Поиск слоёв:
 * 1. Сначала ищем слои с точными именами #Image1, #Image2, #Image3
 * 2. Если не найдены, ищем слои EThumbGroup-Main, EThumbGroup-Item_topRight, EThumbGroup-Item_bottomRight
 * 3. Если не найдены, ищем по именам Image Ratio, EThumb-Image
 * 4. Fallback: находим все fillable слои и применяем по порядку
 */
async function applyThumbGroupImages(container: SceneNode, row: CSVRow): Promise<void> {
  // FALLBACK: Если #Image1 пустой, используем #OrganicImage
  const image1 = row['#Image1'] || row['#OrganicImage'] || row['#ThumbImage'] || '';
  const image2 = row['#Image2'] || '';
  const image3 = row['#Image3'] || '';

  const imageUrls = [image1, image2, image3];

  Logger.debug(
    `🖼️ [applyThumbGroupImages] Начало для "${container.name}", URL: Image1="${image1.substring(0, 50)}...", Image2="${image2.substring(0, 50)}...", Image3="${image3.substring(0, 50)}..."`,
  );

  // Стратегия 1: Ищем слои по точным именам
  const exactNames = [
    ['#Image1', 'Image1', 'EThumbGroup-Main'],
    ['#Image2', 'Image2', 'EThumbGroup-Item_topRight'],
    ['#Image3', 'Image3', 'EThumbGroup-Item_bottomRight'],
  ];

  const foundLayers: (SceneNode | null)[] = [null, null, null];

  for (let i = 0; i < 3; i++) {
    for (const name of exactNames[i]) {
      const layer = findFirstNodeByName(container, name);
      if (layer && 'fills' in layer) {
        foundLayers[i] = layer;
        Logger.debug(`🖼️ [applyThumbGroupImages] Найден слой для Image${i + 1}: "${layer.name}"`);
        break;
      }
    }
  }

  // Стратегия 1.5: Несколько #OrganicImage (новая структура — nested EThumb внутри EThumbGroup)
  if (!foundLayers[0] && !foundLayers[1] && !foundLayers[2]) {
    if ('findAll' in container) {
      const allOrganicImages: SceneNode[] = [];
      (container as FrameNode).findAll((n) => {
        if (n.name === '#OrganicImage' && 'fills' in n) {
          allOrganicImages.push(n);
        }
        return false;
      });
      if (allOrganicImages.length >= 2) {
        // Сортируем по площади (самый большой = главное изображение)
        allOrganicImages.sort((a, b) => b.width * b.height - a.width * a.height);
        for (let i = 0; i < Math.min(3, allOrganicImages.length); i++) {
          foundLayers[i] = allOrganicImages[i];
          Logger.debug(
            `🖼️ [applyThumbGroupImages] Strategy 1.5: #OrganicImage "${allOrganicImages[i].name}" (${allOrganicImages[i].width}×${allOrganicImages[i].height}) для Image${i + 1}`,
          );
        }
      }
    }
  }

  // Стратегия 2: Ищем по общим именам изображений
  if (!foundLayers[0]) {
    const generalNames = ['Image Ratio', 'EThumb-Image', '#OrganicImage', '#ThumbImage'];
    for (const name of generalNames) {
      const layer = findFirstNodeByName(container, name);
      if (layer && 'fills' in layer) {
        foundLayers[0] = layer;
        Logger.debug(`🖼️ [applyThumbGroupImages] Fallback: найден слой "${layer.name}" для Image1`);
        break;
      }
    }
  }

  // Стратегия 3: Ищем все fillable слои с соответствующими размерами
  if (!foundLayers[0] && !foundLayers[1] && !foundLayers[2]) {
    Logger.debug(`🖼️ [applyThumbGroupImages] Поиск всех fillable слоёв...`);
    const allFillables = findAllFillableLayers(container);

    // Фильтруем только те, что похожи на слоты изображений (не слишком маленькие)
    const imageLayers = allFillables.filter((l) => {
      if (!('width' in l)) return false;
      const w = (l as SceneNode & { width: number }).width;
      const h = (l as SceneNode & { height: number }).height;
      return w > 30 && h > 30; // Минимальный размер для изображения
    });

    Logger.debug(`🖼️ [applyThumbGroupImages] Найдено ${imageLayers.length} потенциальных слоёв`);

    // Сортируем по размеру (самый большой = главное изображение)
    imageLayers.sort((a, b) => {
      const areaA =
        ('width' in a ? (a as SceneNode & { width: number }).width : 0) *
        ('height' in a ? (a as SceneNode & { height: number }).height : 0);
      const areaB =
        ('width' in b ? (b as SceneNode & { width: number }).width : 0) *
        ('height' in b ? (b as SceneNode & { height: number }).height : 0);
      return areaB - areaA;
    });

    for (let i = 0; i < Math.min(3, imageLayers.length); i++) {
      foundLayers[i] = imageLayers[i];
      Logger.debug(
        `🖼️ [applyThumbGroupImages] Автоподбор: слой "${imageLayers[i].name}" для Image${i + 1}`,
      );
    }
  }

  // Параллельная загрузка изображений
  const loadPromises = foundLayers.map(async (layer, i) => {
    const url = imageUrls[i];
    const fieldName = `Image${i + 1}`;

    if (!url || url.trim() === '') {
      Logger.debug(`⚠️ [applyThumbGroupImages] ${fieldName} — URL пустой, пропуск`);
      return;
    }

    if (!layer) {
      Logger.debug(`⚠️ [applyThumbGroupImages] ${fieldName} — слой не найден, пропуск`);
      return;
    }

    Logger.debug(`🖼️ [applyThumbGroupImages] Применяем ${fieldName} к слою "${layer.name}"`);
    await fetchAndApplyImage(layer, url, 'FIT', `[applyThumbGroupImages] ${fieldName}:`);
  });

  await Promise.all(loadPromises);
}

/**
 * Обработка imageType — переключение между EThumb и EThumbGroup
 * Instance swap property для отображения одной картинки или коллажа
 */
export async function handleImageType(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;

  if (!container || !row) return;

  const containerName = container && 'name' in container ? container.name : 'unknown';
  const imageType = row['#imageType'];
  Logger.debug(`🖼️ [imageType] container="${containerName}", imageType=${imageType || 'N/A'}`);

  // Применяем изображения к EThumbGroup если imageType указывает на коллаж
  // Проверяем наличие слоёв #Image1 или #OrganicImage (новая структура: nested EThumb)
  if (
    'type' in container &&
    container.type !== 'DOCUMENT' &&
    container.type !== 'PAGE' &&
    imageType === 'EThumbGroup'
  ) {
    const sceneContainer = container as SceneNode;
    const hasImageLayers =
      findFirstNodeByName(sceneContainer, '#Image1') !== null ||
      findFirstNodeByName(sceneContainer, '#OrganicImage') !== null;

    if (hasImageLayers) {
      Logger.debug(`🖼️ [imageType] EThumbGroup — применяем изображения к коллажу`);
      await applyThumbGroupImages(sceneContainer, row);
    }
  }

  // Переключение image VARIANT теперь выполняется schema engine (esnippet.ts).
  // Handler отвечает только за применение изображений.

  if (!imageType || imageType === 'EThumb') {
    // Одиночное изображение
    if ('type' in container && container.type !== 'DOCUMENT' && container.type !== 'PAGE') {
      Logger.debug(`🖼️ [imageType] Применяем одиночное изображение`);
      await applySingleImage(container as SceneNode, row);
    }
  }
  // EThumbGroup: изображения уже применены выше (applyThumbGroupImages)
}
