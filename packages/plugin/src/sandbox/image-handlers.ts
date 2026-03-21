import { Logger } from '../logger';
import { LayerDataItem, DetailedError } from '../types';
import { IMAGE_CONFIG } from '../config';
import { getFirstImageTarget, hasContainerCache } from '../utils/container-cache';
import { ImageCache } from './image-cache';

// Re-export from sub-modules so external imports don't break
export { ImageCache } from './image-cache';
export { fetchWithTimeout, isValidImageFormat, base64ToBytes } from './image-network';

export class ImageProcessor {
  private cache = new ImageCache();

  public successfulImages = 0;
  public failedImages = 0;
  public errors: DetailedError[] = [];
  private processedCount = 0; // Счетчик для отслеживания прогресса

  constructor() {}

  public resetForNewImport(): void {
    this.successfulImages = 0;
    this.failedImages = 0;
    this.errors = [];
    this.processedCount = 0;
    this.cache.resetPendingWrites();
    // We intentionally don't clear cache here to preserve it across runs in same session
  }

  // Helper to mark layer as failed — hide the layer to avoid gray/red placeholders
  private markAsFailed(item: LayerDataItem, message: string): void {
    try {
      if (item.layer.removed) return;

      // Скрываем слой вместо красной заливки — это убирает серые плейсхолдеры
      // для сниппетов без изображений (ozon.ru, wildberries.ru и т.д.)
      if ('visible' in item.layer) {
        (item.layer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug(`   🖼️ [markAsFailed] Скрыт слой "${item.fieldName}"`);
      }
    } catch (e) {
      // Ignore errors during marking
    }

    this.failedImages++;

    // Add detailed error
    this.errors.push({
      id: Math.random().toString(36).substring(7),
      type: 'image',
      message: message,
      layerName: item.fieldName,
      rowIndex: item.rowIndex,
      url: typeof item.fieldValue === 'string' ? item.fieldValue : undefined
    });
  }

  // Находит подходящий слой для изображения внутри контейнера (INSTANCE, FRAME, GROUP)
  // Поддерживает: RECTANGLE, ELLIPSE, POLYGON, VECTOR (все поддерживают fills)
  private findImageTargetInContainer(container: SceneNode & ChildrenMixin): RectangleNode | EllipseNode | PolygonNode | VectorNode | null {
    if (!container || !('children' in container)) return null;

    // Проверяем, есть ли дети вообще
    if (!container.children || container.children.length === 0) {
      // Для INSTANCE без прямых детей — пробуем findAll (находит все вложенные ноды)
      if (container.type === 'INSTANCE' && 'findAll' in container) {
        const instance = container as InstanceNode;
        const allNodes = instance.findAll(n =>
          n.type === 'RECTANGLE' || n.type === 'ELLIPSE' || n.type === 'POLYGON' || n.type === 'VECTOR'
        );
        if (allNodes.length > 0) {
          Logger.debug(`   🔍 [findAll] Найдено ${allNodes.length} fillable нод в INSTANCE через findAll`);
          return allNodes[0] as RectangleNode | EllipseNode | PolygonNode | VectorNode;
        }
        Logger.debug(`   ⚠️ [findImageTarget] INSTANCE ${container.name} пуст даже через findAll`);
      } else {
        Logger.debug(`   ⚠️ [findImageTarget] Контейнер ${container.name} не имеет детей`);
      }
      return null;
    }

    // Сначала ищем прямых детей
    for (const child of container.children) {
      if (child.removed) continue;

      // Приоритет: Rectangle > Ellipse > Polygon > Vector
      if (child.type === 'RECTANGLE') {
        return child as RectangleNode;
      }
      if (child.type === 'ELLIPSE') {
        return child as EllipseNode;
      }
      if (child.type === 'POLYGON') {
        return child as PolygonNode;
      }
      if (child.type === 'VECTOR') {
        return child as VectorNode;
      }
    }

    // Если не нашли прямых детей — ищем рекурсивно
    for (const child of container.children) {
      if (child.removed) continue;

      if ('children' in child) {
        const found = this.findImageTargetInContainer(child as SceneNode & ChildrenMixin);
        if (found) return found;
      }
    }

    // Логируем типы детей для отладки, если ничего не нашли
    const childTypes = container.children.map(c => c.type).join(', ');
    Logger.debug(`   ⚠️ [findImageTarget] В ${container.name} не найден подходящий слой. Типы детей: ${childTypes}`);

    return null;
  }

  // Ищет FRAME внутри контейнера (FRAME поддерживает fills)
  private findFrameInContainer(container: SceneNode & ChildrenMixin): FrameNode | null {
    if (!container || !('children' in container) || !container.children) return null;

    for (const child of container.children) {
      if (child.removed) continue;

      if (child.type === 'FRAME') {
        return child as FrameNode;
      }
    }

    // Рекурсивный поиск
    for (const child of container.children) {
      if (child.removed) continue;

      if ('children' in child) {
        const found = this.findFrameInContainer(child as SceneNode & ChildrenMixin);
        if (found) return found;
      }
    }

    return null;
  }

  // Fallback: ищет любой слой с поддержкой fills внутри контейнера
  private findAnyFillableInContainer(container: SceneNode & ChildrenMixin): (RectangleNode | EllipseNode | PolygonNode | VectorNode | FrameNode) | null {
    if (!container || !('children' in container) || !container.children) return null;

    for (const child of container.children) {
      if (child.removed) continue;

      // Проверяем типы, которые поддерживают fills
      if (child.type === 'RECTANGLE') return child as RectangleNode;
      if (child.type === 'ELLIPSE') return child as EllipseNode;
      if (child.type === 'POLYGON') return child as PolygonNode;
      if (child.type === 'VECTOR') return child as VectorNode;
      if (child.type === 'FRAME') return child as FrameNode;

      // Рекурсивно ищем внутри вложенных контейнеров
      if ('children' in child) {
        const found = this.findAnyFillableInContainer(child as SceneNode & ChildrenMixin);
        if (found) return found;
      }
    }

    return null;
  }

  // Собирает структуру контейнера для отладки (рекурсивно, до 2 уровней)
  private getContainerStructure(layer: SceneNode, depth: number = 0): string {
    if (!('children' in layer)) {
      return `${layer.name}(${layer.type})`;
    }

    const container = layer as SceneNode & ChildrenMixin;
    if (!container.children || container.children.length === 0) {
      return `${layer.name}(${layer.type}:пусто)`;
    }

    if (depth >= 2) {
      return `${layer.name}(${layer.type}:${container.children.length} детей)`;
    }

    const childrenInfo = container.children.map(c => {
      if ('children' in c && depth < 1) {
        return this.getContainerStructure(c, depth + 1);
      }
      return `${c.name}(${c.type})`;
    }).join(', ');

    return `${layer.name}(${layer.type}): [${childrenInfo}]`;
  }

  public async processImage(item: LayerDataItem, index: number, total: number): Promise<void> {
    Logger.debug(`🖼️ [${index + 1}/${total}] Обработка изображения "${item.fieldName}"`);

    try {
      if (!item.fieldValue || typeof item.fieldValue !== 'string') {
        Logger.warn(`⚠️ Пропускаем "${item.fieldName}" - нет URL`);
        this.markAsFailed(item, 'URL отсутствует или пустой');
        return;
      }

      let imgUrl = String(item.fieldValue).trim();
      let spritePosition: string | null = null;
      let spriteSize: string | null = null;

      // Предварительная проверка на список, который не был обработан (на всякий случай)
      if (imgUrl.startsWith('SPRITE_LIST:')) {
        Logger.warn(`⚠️ Необработанный SPRITE_LIST в processImage: ${imgUrl.substring(0, 30)}...`);
        this.markAsFailed(item, 'Ошибка обработки SPRITE_LIST');
        return;
      }

      // Обычная обработка спрайтов (CSS sprites)
      const spriteMatch = imgUrl.match(/^(.+)\|(.+?)(?:\|(.+))?$/);
      if (spriteMatch) {
        imgUrl = spriteMatch[1];
        spritePosition = spriteMatch[2].trim();
        spriteSize = spriteMatch[3] ? spriteMatch[3].trim() : null;
        Logger.debug(`   🎯 Спрайт: позиция=${spritePosition}${spriteSize ? `, размер=${spriteSize}` : ''}`);
      }

      // Валидация URL: http/https/data:image
      const isValidUrl = imgUrl.startsWith('http://') ||
                         imgUrl.startsWith('https://') ||
                         imgUrl.startsWith('//') ||
                         imgUrl.startsWith('data:image/');
      if (!isValidUrl) {
        Logger.warn(`⚠️ Некорректный URL: ${imgUrl.substring(0, 50)}...`);
        this.markAsFailed(item, `Некорректный URL: ${imgUrl}`);
        return;
      }

      if (imgUrl.startsWith('//')) {
        imgUrl = 'https:' + imgUrl;
      }

      // Get image from cache or network (или из base64)
      let figmaImage: Image;
      try {
        if (imgUrl.startsWith('data:image/')) {
          figmaImage = await this.cache.getImageFromDataUrl(imgUrl);
        } else {
          figmaImage = await this.cache.getImageForUrl(imgUrl);
        }
      } catch (loadError) {
        const errMsg = loadError instanceof Error ? loadError.message : String(loadError);
        Logger.error(`   ❌ Ошибка загрузки:`, loadError);
        this.markAsFailed(item, `Ошибка загрузки: ${errMsg}`);
        return;
      }

      if (item.layer.removed) {
        Logger.warn(`   ⚠️ Слой удален`);
        this.markAsFailed(item, 'Слой был удалён');
        return;
      }

      // Находим слой для применения изображения
      // Для INSTANCE/FRAME — ищем внутри подходящую фигуру
      let targetLayer: RectangleNode | EllipseNode | PolygonNode | VectorNode | FrameNode | null = null;
      const layerType = item.layer.type;

      // === ОПТИМИЗАЦИЯ: Пробуем кэш контейнера для быстрого поиска ===
      if (item.row && item.row['#_containerId']) {
        const containerId = item.row['#_containerId'] as string;
        if (hasContainerCache(containerId)) {
          const cached = getFirstImageTarget(containerId);
          if (cached && !cached.removed) {
            targetLayer = cached as RectangleNode | EllipseNode | PolygonNode | VectorNode | FrameNode;
            Logger.debug(`   💾 [Cache] Найден target из кэша: ${cached.name} (${cached.type})`);
          }
        }
      }

      // Если кэш не помог — используем стандартную логику
      if (!targetLayer && (layerType === 'RECTANGLE' || layerType === 'ELLIPSE' || layerType === 'POLYGON' || layerType === 'VECTOR')) {
        targetLayer = item.layer as RectangleNode | EllipseNode | PolygonNode | VectorNode;
      } else if (!targetLayer && layerType === 'FRAME') {
        // FRAME может сам принимать fills — проверяем, есть ли внутри фигуры
        const innerTarget = this.findImageTargetInContainer(item.layer as FrameNode);
        if (innerTarget) {
          targetLayer = innerTarget;
          Logger.debug(`   🔍 Найден целевой слой внутри FRAME: ${innerTarget.name} (${innerTarget.type})`);
        } else {
          // Если внутри нет фигур — применяем к самому FRAME
          targetLayer = item.layer as FrameNode;
          Logger.debug(`   🔍 Применяем изображение к самому FRAME: ${item.layer.name}`);
        }
      } else if (!targetLayer && (layerType === 'INSTANCE' || layerType === 'GROUP')) {
        // Ищем внутри первую подходящую фигуру
        targetLayer = this.findImageTargetInContainer(item.layer as SceneNode & ChildrenMixin);
        if (targetLayer) {
          Logger.debug(`   🔍 Найден целевой слой внутри ${layerType}: ${targetLayer.name} (${targetLayer.type})`);
        } else {
          // Fallback 1: ищем FRAME внутри INSTANCE (FRAME поддерживает fills)
          const frameTarget = this.findFrameInContainer(item.layer as SceneNode & ChildrenMixin);
          if (frameTarget) {
            targetLayer = frameTarget;
            Logger.debug(`   🔍 Найден FRAME внутри ${layerType}: ${frameTarget.name}`);
          } else {
            // Fallback 2: ищем любой слой с поддержкой fills (рекурсивно)
            const anyFillable = this.findAnyFillableInContainer(item.layer as SceneNode & ChildrenMixin);
            if (anyFillable) {
              targetLayer = anyFillable;
              Logger.debug(`   🔍 Найден fillable слой внутри ${layerType}: ${anyFillable.name} (${anyFillable.type})`);
            } else if (layerType === 'INSTANCE') {
              // Fallback 3: INSTANCE сам поддерживает fills (через GeometryMixin)
              // Применяем изображение напрямую к INSTANCE как к FrameNode
              targetLayer = item.layer as unknown as FrameNode;
              Logger.debug(`   🔍 Применяем изображение напрямую к INSTANCE: ${item.layer.name}`);
            }
          }
        }
      }

      if (!targetLayer) {
        // Собираем структуру для отладки и включаем в сообщение об ошибке
        const structure = this.getContainerStructure(item.layer as SceneNode);
        this.markAsFailed(item, `Не найден fillable в ${layerType}. Структура: ${structure}`);
        return;
      }

      // Применение изображения
      try {
        // Диагностика: проверяем тип target слоя и его родителей
        const targetName = 'name' in targetLayer ? targetLayer.name : 'N/A';
        const targetType = targetLayer.type;
        const parentInfo = 'parent' in targetLayer && targetLayer.parent
          ? `${targetLayer.parent.type}:${('name' in targetLayer.parent ? targetLayer.parent.name : 'N/A')}`
          : 'no parent';
        Logger.debug(`   🎯 [Image Apply] target="${targetName}" (${targetType}), parent=${parentInfo}, field="${item.fieldName}"`);

        if (spritePosition) {
          await this.applySpriteImage(targetLayer, figmaImage, spritePosition, spriteSize);
        } else {
          // Определяем режим масштабирования: для #OrganicImage используем FIT, для остальных FILL
          const isOrganicImage = item.fieldName.toLowerCase().includes('organicimage');
          const scaleMode = isOrganicImage ? 'FIT' : 'FILL';

          const newPaint: ImagePaint = {
            type: 'IMAGE',
            scaleMode: scaleMode,
            imageHash: figmaImage.hash
          };

          // Проверка: можно ли менять fills у этого слоя
          const canSetFills = 'fills' in targetLayer;
          if (!canSetFills) {
            Logger.error(`   ❌ [Image Apply] targetLayer не поддерживает fills! type=${targetType}`);
            this.markAsFailed(item, `Target layer ${targetType} не поддерживает fills`);
            return;
          }

          targetLayer.fills = [newPaint];

          // Проверка: применилось ли изображение?
          const appliedFills = targetLayer.fills;
          const appliedHash = (appliedFills && appliedFills.length > 0 && appliedFills[0].type === 'IMAGE')
            ? (appliedFills[0] as ImagePaint).imageHash
            : 'N/A';
          if (appliedHash !== figmaImage.hash) {
            Logger.warn(`   ⚠️ [Image Apply] Hash не совпадает! expected=${figmaImage.hash.substring(0,8)}, got=${String(appliedHash).substring(0,8)}`);
          }

          Logger.debug(`   ✅ Изображение применено (${scaleMode}) к ${targetName}`);
        }

        this.successfulImages++;
      } catch (applyError) {
        const errMsg = applyError instanceof Error ? applyError.message : String(applyError);
        Logger.error(`   ❌ Ошибка применения изображения:`, applyError);
        this.markAsFailed(item, `Ошибка применения: ${errMsg}`);
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`   ❌ Ошибка обработки изображения "${item.fieldName}":`, error);
      this.markAsFailed(item, `Общая ошибка: ${errMsg}`);
    }
  }

  private updateShopNameFromUrl(imgUrl: string, item: LayerDataItem): void {
    try {
      const urlMatch = imgUrl.match(/\/favicon\/v2\/([^?]+)/);
      if (urlMatch && urlMatch[1]) {
        const decodedHost = decodeURIComponent(urlMatch[1]);
        // Simple hostname extraction
        let hostname = decodedHost;
        if (hostname.startsWith('http')) {
             try {
                 hostname = new URL(hostname).hostname;
             } catch (e) {
                 Logger.debug('Failed to parse hostname from URL', e);
             }
        } else {
             hostname = hostname.split('/')[0];
        }

        if (item.row) {
          // Мы не должны перезаписывать #ShopName доменом, если там уже есть нормальное имя!
          // Это поле перезаписывается только если оно пустое или совпадает с доменом
          if (!item.row['#ShopName'] || item.row['#ShopName'] === item.row['#OrganicHost']) {
             // Осторожно: hostname из фавиконки может быть техническим (market.yandex.ru),
             // а не реальным именем магазина.
             // Поэтому лучше использовать hostname только если совсем ничего нет.
             if (!item.row['#ShopName']) {
                 item.row['#ShopName'] = hostname;
                 this.updateRelatedTextLayers(item.rowIndex, hostname);
             }
          }

          // #OrganicHost можно обновлять смело, так как это техническое поле
          item.row['#OrganicHost'] = hostname;

          // Но updateRelatedTextLayers обновляет и #ShopName в UI (текстовых слоях),
          // даже если мы не трогали item.row['#ShopName'].
          // Нужно разделить обновление слоев.
        }
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
  }

  // Callback для обновления текстовых слоев извне
  public onUpdateTextLayer: ((rowIndex: number, fieldName: string, value: string) => void) | null = null;

  private updateRelatedTextLayers(rowIndex: number, value: string): void {
    if (this.onUpdateTextLayer) {
      // НЕ обновляем #ShopName автоматически из домена фавиконки,
      // так как это часто затирает красивое имя магазина (Video-shoper.ru) на техническое (video-shoper.ru)
      // this.onUpdateTextLayer(rowIndex, '#ShopName', value);

      this.onUpdateTextLayer(rowIndex, '#OrganicHost', value);
    }
  }

  private async applySpriteImage(
    layer: RectangleNode | EllipseNode | PolygonNode | VectorNode | FrameNode,
    figmaImage: Image,
    spritePosition: string,
    spriteSize: string | null
  ): Promise<void> {
    let bgOffsetX = 0;
    let bgOffsetY = 0;

    const pxValues = spritePosition.match(/(-?\d+(?:\.\d+)?)px/g);
    if (pxValues) {
      if (pxValues.length === 1) {
        const value = parseFloat(pxValues[0]);
        const lowerPos = spritePosition.toLowerCase();
        if (lowerPos.includes('x') && !lowerPos.includes('y')) bgOffsetX = value;
        else if (lowerPos.includes('y') && !lowerPos.includes('x')) bgOffsetY = value;
        else {
          if (spritePosition.match(/0px\s*[-\d]/)) bgOffsetY = value;
          else bgOffsetX = value;
        }
      } else if (pxValues.length >= 2) {
        bgOffsetX = parseFloat(pxValues[0]) || 0;
        bgOffsetY = parseFloat(pxValues[1]) || 0;
      }
    } else {
      const numValues = spritePosition.match(/(-?\d+(?:\.\d+)?)/g);
      if (numValues) {
        if (numValues.length === 1) bgOffsetX = parseFloat(numValues[0]) || 0;
        else {
          bgOffsetX = parseFloat(numValues[0]) || 0;
          bgOffsetY = parseFloat(numValues[1]) || 0;
        }
      }
    }

    const layerWidth = layer.width;
    const layerHeight = layer.height;
    let spriteItemSize = 16;

    if (spriteSize) {
      const sizeMatch = spriteSize.match(/(\d+(?:\.\d+)?)px/i);
      if (sizeMatch) spriteItemSize = parseFloat(sizeMatch[1]) || 16;
    } else {
      const isHorizontal = bgOffsetX !== 0 && bgOffsetY === 0;
      const isVertical = bgOffsetX === 0 && bgOffsetY !== 0;

      if (isVertical && bgOffsetY !== 0) {
        const absOffset = Math.abs(bgOffsetY);
        if (absOffset % 32 === 0) spriteItemSize = 32;
        else if (absOffset % 20 === 0) spriteItemSize = 20;
        else if (absOffset % 16 === 0) spriteItemSize = 16;
        else spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
      } else if (isHorizontal && bgOffsetX !== 0) {
        const absOffset = Math.abs(bgOffsetX);
        if (absOffset % 32 === 0) spriteItemSize = 32;
        else if (absOffset % 20 === 0) spriteItemSize = 20;
        else if (absOffset % 16 === 0) spriteItemSize = 16;
        else spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
      } else {
        spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
      }
    }

    const imageSize = await figmaImage.getSizeAsync();
    const imageWidth = imageSize.width;
    const imageHeight = imageSize.height;

    const targetX = -bgOffsetX;
    const targetY = -bgOffsetY;

    const visibleW = spriteItemSize / imageWidth;
    const visibleH = spriteItemSize / imageHeight;
    const offsetX = targetX / imageWidth;
    const offsetY = targetY / imageHeight;

    const newPaint: ImagePaint = {
      type: 'IMAGE',
      scaleMode: 'CROP',
      imageHash: figmaImage.hash,
      imageTransform: [
        [visibleW, 0, offsetX],
        [0, visibleH, offsetY]
      ]
    };

    layer.fills = [newPaint];
    Logger.debug(`   ✅ Спрайт применен успешно (CROP)`);
  }

  // Pre-process favicons synchronously to resolve lists and prevent race conditions
  private resolveFaviconUrls(items: LayerDataItem[]): void {
    let currentSpriteList: string[] | null = null;
    let currentListIndex = 0;

    let lastRowIndex = -1;
    let cachedRowUrl: string | null = null;

    for (const item of items) {
      const isFavicon = item.fieldName.toLowerCase().includes('favicon');
      if (!isFavicon) continue;

      const rawValue = typeof item.fieldValue === 'string' ? item.fieldValue.trim() : '';
      const isSpriteList = rawValue.startsWith('SPRITE_LIST:');

      // Check if we are in a new row context
      if (item.rowIndex !== lastRowIndex) {
        lastRowIndex = item.rowIndex;
        cachedRowUrl = null; // Reset cached decision for new row

        if (isSpriteList) {
          // Initialize new list
          const listData = rawValue.substring('SPRITE_LIST:'.length);
          const urls = listData.split('|').filter(u => u.length > 0);

          if (urls.length > 0) {
            currentSpriteList = urls;
            currentListIndex = 0;
            // Use first item immediately
            cachedRowUrl = currentSpriteList[currentListIndex];
            currentListIndex++;
            Logger.debug(`   📦 [Pre-process] New SpriteList init for row ${item.rowIndex}, using idx 0: ${cachedRowUrl?.substring(0, 30)}...`);
          } else {
            currentSpriteList = null;
            Logger.warn(`   ⚠️ [Pre-process] Empty SpriteList for row ${item.rowIndex}`);
          }
        } else if (rawValue && (rawValue.startsWith('http') || rawValue.startsWith('//'))) {
          // Explicit URL - overrides list
          cachedRowUrl = rawValue;
          // We DO NOT advance currentListIndex here. Explicit URL is treated as an "insert" or "override"
          // that doesn't consume a sequence item (safest assumption).
          Logger.debug(`   📦 [Pre-process] Explicit URL for row ${item.rowIndex}: ${cachedRowUrl.substring(0, 30)}...`);
        } else {
          // Empty or invalid - try to use active list
          if (currentSpriteList && currentListIndex < currentSpriteList.length) {
            cachedRowUrl = currentSpriteList[currentListIndex];
            currentListIndex++;
            Logger.debug(`   📦 [Pre-process] Using SpriteList item ${currentListIndex-1} for row ${item.rowIndex}: ${cachedRowUrl.substring(0, 30)}...`);
          } else if (currentSpriteList) {
             Logger.warn(`   ⚠️ [Pre-process] SpriteList exhausted at row ${item.rowIndex}`);
          }
        }
      } else {
         // Same row - handle potential conflict if this layer brings a new list?
         // If duplicate layers exist, we use the `cachedRowUrl` determined for this row.
         // However, if THIS specific layer introduces a SpriteList (e.g. was processed second),
         // we should probably respect it if we haven't found a URL yet.
         if (isSpriteList && !cachedRowUrl) {
             const listData = rawValue.substring('SPRITE_LIST:'.length);
             const urls = listData.split('|').filter(u => u.length > 0);
             if (urls.length > 0) {
                 currentSpriteList = urls;
                 currentListIndex = 0;
                 cachedRowUrl = currentSpriteList[currentListIndex];
                 currentListIndex++;
                 Logger.debug(`   📦 [Pre-process] Late SpriteList init for row ${item.rowIndex}`);
             }
         }
      }

      // Apply resolved URL to item
      if (cachedRowUrl) {
        item.fieldValue = cachedRowUrl;
        this.updateShopNameFromUrl(cachedRowUrl, item);
      }
    }
  }

  public async processPool(items: LayerDataItem[]): Promise<void> {
    Logger.verbose(`🔄 Начинаем обработку пула из ${items.length} изображений...`);

    // Логируем примеры URL для диагностики
    const sampleUrls = items.slice(0, 3).map(i => {
      const url = String(i.fieldValue || '').substring(0, 60);
      return `${i.fieldName}="${url}..."`;
    });
    Logger.debug(`🖼️ [Image] Примеры: ${sampleUrls.join(', ')}`);

    // 1. Synchronous pre-processing of favicons
    this.resolveFaviconUrls(items);
    Logger.debug(`🖼️ [Image] resolveFaviconUrls завершён`);

    const total = items.length;
    const queue = [...items];
    const workers: Promise<void>[] = [];

    // Функция для отправки прогресса (синхронизированная)
    const logInterval = Math.max(1, Math.floor(total / 10)); // Лог каждые 10% или минимум каждое
    const updateProgress = () => {
      this.processedCount++;
      const currentCount = this.processedCount;
      const progress = 75 + Math.floor((currentCount / total) * 25); // 75-100%

      // Консольный лог каждые 10% или при завершении
      if (currentCount % logInterval === 0 || currentCount === total) {
        Logger.verbose(`🖼️ [Image] Прогресс: ${currentCount}/${total} (${this.successfulImages} ОК, ${this.failedImages} ошибок)`);
      }

      // Обновляем каждые 3 изображения или каждые 5% или при завершении
      const updateInterval = Math.max(1, Math.floor(total / 20));
      if (currentCount % 3 === 0 || currentCount % updateInterval === 0 || currentCount === total) {
        figma.ui.postMessage({
          type: 'progress',
          current: Math.min(100, progress),
          total: 100,
          message: `Обработка изображений: ${currentCount}/${total}`,
          operationType: 'images'
        });
      }
    };

    for (let i = 0; i < IMAGE_CONFIG.MAX_CONCURRENT; i++) {
      workers.push((async () => {
        let workerProcessedCount = 0;
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            const index = items.length - queue.length - 1;
            await this.processImage(item, index, items.length);

            // Обновляем общий прогресс (в JavaScript операции атомарны в рамках одного потока)
            updateProgress();

            // ОПТИМИЗАЦИЯ: Smart Batching
            // Каждые 3 картинки даем UI потоку Figma передохнуть ("продышаться"),
            // чтобы интерфейс не зависал намертво при большом импорте.
            workerProcessedCount++;
            if (workerProcessedCount % 3 === 0) {
               await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
        }
      })());
    }

    await Promise.all(workers);

    // Batch flush всех накопленных записей в clientStorage
    await this.cache.flushCacheWrites();

    // Summary-лог — оставляем как info (это итоговая статистика)
    Logger.summary(`✅ [Image] Обработано: ${this.successfulImages} успешно, ${this.failedImages} ошибок, ${items.length - this.successfulImages - this.failedImages} пропущено`);
  }
}
