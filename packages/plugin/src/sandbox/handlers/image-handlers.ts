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
import {
  findFirstNodeByName,
} from '../../utils/node-search';
import {
  getCachedInstance,
} from '../../utils/instance-cache';
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

    const allComponents = figma.currentPage.findAll(n => n.type === 'COMPONENT') as ComponentNode[];
    for (const comp of allComponents) {
      if (!comp.removed && !componentsCache.has(comp.name)) {
        componentsCache.set(comp.name, comp);
      }
    }

    Logger.debug(`📦 [ComponentsCache] Построен: ${componentsCache.size} компонентов за ${Date.now() - startTime}ms`);
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
    Logger.debug(`⚠️ [applySingleImage] Слой изображения не найден (пробовал: ${layerNames.join(', ')})`);
    return;
  }

  Logger.debug(`🖼️ [applySingleImage] Применяем к "${layer.name}", URL="${url.substring(0, 50)}..."`);

  try {
    let normalizedUrl = url;
    if (url.startsWith('//')) {
      normalizedUrl = `https:${url}`;
    }

    // Валидация URL
    try {
      const urlObj = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        Logger.debug(`⚠️ [applySingleImage] Неподдерживаемый протокол: ${urlObj.protocol}`);
        return;
      }
    } catch (urlErr) {
      Logger.debug(`⚠️ [applySingleImage] Невалидный URL: ${normalizedUrl}`);
      return;
    }

    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      Logger.debug(`❌ [applySingleImage] Ошибка загрузки: ${response.status}`);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const imageHash = figma.createImage(uint8Array).hash;

    if ('fills' in layer) {
      const imagePaint: ImagePaint = {
        type: 'IMAGE',
        scaleMode: 'FIT',
        imageHash: imageHash
      };
      (layer as GeometryMixin).fills = [imagePaint];
      Logger.debug(`✅ [applySingleImage] Изображение применено`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.debug(`❌ [applySingleImage] Ошибка: ${msg}`);
  }
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

  Logger.debug(`🖼️ [applyThumbGroupImages] Начало для "${container.name}", URL: Image1="${image1.substring(0, 50)}...", Image2="${image2.substring(0, 50)}...", Image3="${image3.substring(0, 50)}..."`);

  // Стратегия 1: Ищем слои по точным именам
  const exactNames = [
    ['#Image1', 'Image1', 'EThumbGroup-Main'],
    ['#Image2', 'Image2', 'EThumbGroup-Item_topRight'],
    ['#Image3', 'Image3', 'EThumbGroup-Item_bottomRight']
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
    const imageLayers = allFillables.filter(l => {
      if (!('width' in l)) return false;
      const w = (l as SceneNode & { width: number }).width;
      const h = (l as SceneNode & { height: number }).height;
      return w > 30 && h > 30; // Минимальный размер для изображения
    });

    Logger.debug(`🖼️ [applyThumbGroupImages] Найдено ${imageLayers.length} потенциальных слоёв`);

    // Сортируем по размеру (самый большой = главное изображение)
    imageLayers.sort((a, b) => {
      const areaA = ('width' in a ? (a as SceneNode & { width: number }).width : 0) * ('height' in a ? (a as SceneNode & { height: number }).height : 0);
      const areaB = ('width' in b ? (b as SceneNode & { width: number }).width : 0) * ('height' in b ? (b as SceneNode & { height: number }).height : 0);
      return areaB - areaA;
    });

    for (let i = 0; i < Math.min(3, imageLayers.length); i++) {
      foundLayers[i] = imageLayers[i];
      Logger.debug(`🖼️ [applyThumbGroupImages] Автоподбор: слой "${imageLayers[i].name}" для Image${i + 1}`);
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

    try {
      // Нормализуем URL
      let normalizedUrl = url;
      if (url.startsWith('//')) {
        normalizedUrl = `https:${url}`;
      }

      // Валидация URL
      try {
        const urlObj = new URL(normalizedUrl);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          Logger.debug(`⚠️ [applyThumbGroupImages] Неподдерживаемый протокол: ${urlObj.protocol}`);
          return;
        }
      } catch (urlErr) {
        Logger.debug(`⚠️ [applyThumbGroupImages] Невалидный URL: ${normalizedUrl}`);
        return;
      }

      // Загружаем изображение
      const response = await fetch(normalizedUrl);
      if (!response.ok) {
        Logger.debug(`❌ [applyThumbGroupImages] Ошибка загрузки ${fieldName}: ${response.status}`);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Создаём hash изображения
      const imageHash = figma.createImage(uint8Array).hash;

      // Применяем к слою
      if ('fills' in layer) {
        const imagePaint: ImagePaint = {
          type: 'IMAGE',
          scaleMode: 'FIT',
          imageHash: imageHash
        };
        (layer as GeometryMixin).fills = [imagePaint];
        Logger.debug(`✅ [applyThumbGroupImages] ${fieldName} применён к "${layer.name}"`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.debug(`❌ [applyThumbGroupImages] Ошибка ${fieldName}: ${msg}`);
    }
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

  // ВАЖНО: Независимо от imageType, пробуем применить изображения к EThumbGroup
  // Это нужно потому что в Figma может быть EThumbGroup по умолчанию
  // Ищем слой #Image1 — если он есть и виден, применяем изображения
  // Проверяем что container является SceneNode (имеет 'type')
  if ('type' in container && container.type !== 'DOCUMENT' && container.type !== 'PAGE') {
    const sceneContainer = container as SceneNode;
    const hasImage1Layer = findFirstNodeByName(sceneContainer, '#Image1') !== null;

    if (hasImage1Layer) {
      Logger.debug(`🖼️ [imageType] Найден слой #Image1 — применяем изображения к EThumbGroup`);
      await applyThumbGroupImages(sceneContainer, row);
    }
  }

  // Определяем целевое состояние: EThumb (одна картинка) или EThumbGroup (коллаж)
  const targetState = (!imageType || imageType === 'EThumb') ? 'Default' : 'EThumbGroup';

  Logger.debug(`🖼️ [imageType] Целевое состояние: ${targetState} (imageType=${imageType || 'N/A'})`);

  // Ищем INSTANCE для изменения State property

  // Нужен EThumbGroup — ищем instance на котором есть свойство imageType
  // Контейнер может быть INSTANCE или FRAME (с INSTANCE внутри)
  let targetInstance: InstanceNode | null = null;

  if (container.type === 'INSTANCE') {
    targetInstance = container as InstanceNode;
  } else if ('findOne' in container) {
    // Контейнер не INSTANCE — ищем внутри первый INSTANCE
    const innerInstance = (container as FrameNode).findOne(n => n.type === 'INSTANCE');
    if (innerInstance) {
      targetInstance = innerInstance as InstanceNode;
      Logger.debug(`🖼️ [imageType] Найден внутренний INSTANCE: ${innerInstance.name}`);
    }
  }

  if (!targetInstance) {
    Logger.debug(`🖼️ [imageType] INSTANCE не найден (container.type=${container.type})`);
    return;
  }

  const instance = targetInstance;

  // Ищем вложенный EThumb instance — ОПТИМИЗИРОВАНО: instanceCache сначала
  let eThumbInstance: InstanceNode | null = null;

  if (instance.name.toLowerCase().includes('ethumb')) {
    eThumbInstance = instance;
  } else if (instanceCache) {
    // Используем кэш для поиска EThumb вместо deep traversal
    eThumbInstance = getCachedInstance(instanceCache, 'EThumb') ||
                     getCachedInstance(instanceCache, 'Thumb') || null;
  }

  // Fallback: deep traversal только если кэш не помог
  if (!eThumbInstance && 'findOne' in instance) {
    const nodeWithFindOne = instance as unknown as { findOne: (callback: (node: SceneNode) => boolean) => SceneNode | null };
    eThumbInstance = nodeWithFindOne.findOne(n => {
      if (n.type !== 'INSTANCE') return false;
      return n.name.toLowerCase().includes('ethumb') || n.name.toLowerCase().includes('thumb');
    }) as InstanceNode | null;
  }

  // Пробуем установить State property
  if (eThumbInstance) {
    const eThumbProps = eThumbInstance.componentProperties;
    Logger.debug(`🖼️ [imageType] EThumb найден: "${eThumbInstance.name}", свойства: ${Object.keys(eThumbProps).join(', ')}`);

    // Ищем property State
    for (const key in eThumbProps) {
      const keyLower = key.toLowerCase();
      if (keyLower === 'state' || keyLower.startsWith('state#')) {
        const stateProp = eThumbProps[key];
        if (stateProp && typeof stateProp === 'object' && 'type' in stateProp) {
          Logger.debug(`🖼️ [imageType] Найдено State property: "${key}", type=${stateProp.type}, value="${(stateProp as { value: unknown }).value}"`);

          if (stateProp.type === 'VARIANT') {
            try {
              eThumbInstance.setProperties({ [key]: targetState });
              Logger.debug(`✅ [imageType] State установлен: ${targetState}`);

              // Если переключили на Default — применяем одиночное изображение
              if (targetState === 'Default') {
                await applySingleImage(container as SceneNode, row);
                return;
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Logger.warn(`⚠️ [imageType] Ошибка установки State: ${msg}`);
            }
          }
        }
        break;
      }
    }
  }

  // Если targetState = Default, применяем одиночное изображение и выходим
  if (targetState === 'Default') {
    Logger.debug(`🖼️ [imageType] Целевое состояние Default — применяем одиночное изображение`);
    await applySingleImage(container as SceneNode, row);
    return;
  }

  // Проверяем есть ли свойство imageType (для переключения через instance swap)
  const props = instance.componentProperties;
  let imageTypeKey: string | null = null;

  Logger.debug(`🖼️ [imageType] Поиск свойства imageType на ${instance.name}`);
  Logger.debug(`🖼️ [imageType] Доступные свойства: ${Object.keys(props).join(', ')}`);

  for (const key in props) {
    // Ищем свойство с именем imageType (может быть imageType#123:456, ImageType, Type и т.д.)
    const keyLower = key.toLowerCase();
    if (keyLower === 'imagetype' ||
        keyLower.startsWith('imagetype#') ||
        keyLower === 'type' ||
        keyLower.startsWith('type#')) {
      imageTypeKey = key;
      break;
    }
  }

  if (!imageTypeKey) {
    Logger.debug(`🖼️ [imageType] Свойство imageType НЕ НАЙДЕНО`);
    return;
  }

  const prop = props[imageTypeKey];
  if (!prop || typeof prop !== 'object' || !('type' in prop)) return;

  Logger.debug(`🖼️ [imageType] Найдено свойство "${imageTypeKey}", type=${prop.type}`);

  // Instance swap property имеет type = 'INSTANCE_SWAP'
  if (prop.type !== 'INSTANCE_SWAP') {
    Logger.debug(`   🖼️ [imageType] Свойство "${imageTypeKey}" не является INSTANCE_SWAP (type=${prop.type})`);
    return;
  }

  try {
    // Для instance swap нужно найти компонент по имени и получить его key
    const targetComponentName = imageType || ''; // 'EThumbGroup'
    if (!targetComponentName) {
      Logger.debug(`⚠️ [imageType] Пустое значение imageType`);
      return;
    }

    // Ищем компонент в кэше (O(1) вместо findAll по всей странице)
    const cachedComponent = getCachedComponent(targetComponentName);
    const components = cachedComponent ? [cachedComponent] : [];

    if (components.length === 0) {
      // Пробуем найти среди published components — это может быть component set
      // Для instance swap с exposed property можно использовать preferredValues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preferredValues = (prop as any).preferredValues as Array<{ type: string; key: string } | string> | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentValue = (prop as any).value as string | undefined;

      if (preferredValues && Array.isArray(preferredValues)) {
        Logger.debug(`🖼️ [imageType] preferredValues: ${JSON.stringify(preferredValues)}`);
        Logger.debug(`🖼️ [imageType] currentValue: ${currentValue}`);

        // preferredValues может быть массивом объектов {type, key} или просто строк
        // Проверяем формат
        const isObjectArray = preferredValues.length > 0 && typeof preferredValues[0] === 'object';

        let targetKey: string | null = null;

        if (isObjectArray) {
          // Формат: [{type: 'COMPONENT', key: '...'}]
          // Ищем альтернативный вариант (не текущий)
          const alternative = preferredValues.find((v) => typeof v === 'object' && v.key !== currentValue);
          if (alternative && typeof alternative === 'object') {
            targetKey = alternative.key;
            Logger.debug(`🖼️ [imageType] Найден альтернативный вариант (объект): key=${targetKey}`);
          }
        } else {
          // Формат: ['key1', 'key2'] — массив строк-ключей
          const alternative = preferredValues.find((v) => typeof v === 'string' && v !== currentValue);
          if (alternative && typeof alternative === 'string') {
            targetKey = alternative;
            Logger.debug(`🖼️ [imageType] Найден альтернативный вариант (строка): key=${targetKey}`);
          }
        }

        if (targetKey) {
          Logger.debug(`🖼️ [imageType] Найден component key: ${targetKey}`);

          // EThumbGroup теперь ВАРИАНТ внутри ComponentSet EThumb!
          // Ищем вложенный instance EThumb и переключаем на нужный вариант
          // Используем findOne вместо рекурсии для производительности

          // Reuse eThumbInstance found above (line ~907)
          if (eThumbInstance) {
            Logger.debug(`🖼️ [imageType] Найден вложенный EThumb: "${eThumbInstance.name}" (id=${eThumbInstance.id})`);

            const mainComp = await eThumbInstance.getMainComponentAsync();
            if (mainComp && mainComp.parent && mainComp.parent.type === 'COMPONENT_SET') {
              const componentSet = mainComp.parent as ComponentSetNode;
              Logger.debug(`🖼️ [imageType] ComponentSet: "${componentSet.name}" с ${componentSet.children.length} вариантами`);

              // Логируем ВСЕ варианты для диагностики
              Logger.debug(`🖼️ [imageType] Все варианты:`);
              componentSet.children.forEach((child, i) => {
                if (child.type === 'COMPONENT') {
                  const isCurrent = child.id === mainComp.id;
                  Logger.debug(`   ${i + 1}. "${child.name}" (id=${child.id}, key=${child.key}) ${isCurrent ? '← ТЕКУЩИЙ' : ''}`);
                }
              });

              // Ищем вариант с "group" в имени
              const targetVariant = componentSet.children.find((child) => {
                if (child.type !== 'COMPONENT') return false;
                const nameLower = child.name.toLowerCase();
                return nameLower.includes('group') || nameLower.includes('collage') || nameLower.includes('thumbgroup');
              }) as ComponentNode | undefined;

              if (targetVariant) {
                Logger.debug(`🖼️ [imageType] Найден вариант "group": "${targetVariant.name}" (id=${targetVariant.id})`);
                Logger.debug(`🖼️ [imageType] Устанавливаем ${imageTypeKey}=${targetVariant.id}`);

                try {
                  instance.setProperties({ [imageTypeKey]: targetVariant.id });
                  Logger.debug(`✅ [imageType] Успешно установлен EThumbGroup!`);

                  // После переключения применяем изображения к новым слоям
                  await applyThumbGroupImages(instance, row);

                  return;
                } catch (setErr) {
                  const msg = setErr instanceof Error ? setErr.message : String(setErr);
                  Logger.warn(`⚠️ [imageType] Ошибка setProperties: ${msg}`);
                }
              } else {
                Logger.debug(`⚠️ [imageType] Вариант с "group" не найден среди ${componentSet.children.length} вариантов`);
                // Fallback: применяем изображения к текущему варианту
                await applyThumbGroupImages(instance, row);
              }
            } else {
              // ComponentSet не найден — применяем изображения к текущему instance
              await applyThumbGroupImages(instance, row);
            }
          } else {
            Logger.debug(`⚠️ [imageType] Вложенный EThumb instance не найден`);
            // Fallback: применяем изображения напрямую к контейнеру
            await applyThumbGroupImages(instance, row);
          }

          // Fallback: Попробуем импортировать как library компонент
          try {
            const importedComponent = await figma.importComponentByKeyAsync(targetKey);
            Logger.debug(`🖼️ [imageType] Импортирован: "${importedComponent.name}" (id=${importedComponent.id})`);
            instance.setProperties({ [imageTypeKey]: importedComponent.id });
            Logger.debug(`✅ [imageType] Успешно установлен EThumbGroup!`);
            return;
          } catch (importErr) {
            const msg = importErr instanceof Error ? importErr.message : String(importErr);
            Logger.warn(`❌ [imageType] Ошибка импорта: ${msg}`);
          }
        }
      }

      Logger.debug(`⚠️ [imageType] Альтернативный вариант не найден в preferredValues`);
      return;
    }

    const targetComponent = components[0];
    const componentKey = targetComponent.key;

    // ВАЖНО: используем ПОЛНЫЙ ключ свойства (с #ID)
    Logger.debug(`🖼️ [imageType] Устанавливаем ${imageTypeKey}=${targetComponentName} (key=${componentKey})`);
    instance.setProperties({ [imageTypeKey]: componentKey });

    Logger.debug(`✅ [imageType] Установлен imageType="${imageType}"`);
  } catch (e) {
    Logger.error(`❌ [imageType] Ошибка установки imageType="${imageType}":`, e);
  }
}
