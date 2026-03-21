import { Logger } from '../logger';
import { LayerDataItem, DetailedError } from '../types';
import { IMAGE_CONFIG } from '../config';
import { getFirstImageTarget, hasContainerCache } from '../utils/container-cache';

export class ImageProcessor {
  // Memory cache for the current session
  private imageCache: { [url: string]: Promise<Image> | undefined } = {};
  
  // Batch cache writes — накапливаем записи и сохраняем в конце
  private pendingCacheWrites: Map<string, { hash: string; timestamp: number }> = new Map();
  
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
    this.pendingCacheWrites.clear();
    // We intentionally don't clear cache here to preserve it across runs in same session
  }
  
  /**
   * Batch flush всех накопленных записей в clientStorage
   * Вызывается один раз в конце processPool для оптимизации I/O
   */
  private async flushCacheWrites(): Promise<void> {
    if (this.pendingCacheWrites.size === 0) return;
    
    const writes = Array.from(this.pendingCacheWrites.entries());
    Logger.debug(`💾 [Cache] Сохранение ${writes.length} записей в clientStorage...`);
    
    await Promise.all(writes.map(([key, value]) => 
      figma.clientStorage.setAsync(key, value).catch(e => {
        Logger.warn(`⚠️ [Cache] Ошибка записи ${key}:`, e);
      })
    ));
    
    this.pendingCacheWrites.clear();
    Logger.debug(`💾 [Cache] Сохранено ${writes.length} записей`);
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timeout ' + timeoutMs + 'ms'));
        }
      }, timeoutMs);
      
      fetch(url).then(res => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res);
      }).catch(err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private isValidImageFormat(bytes: Uint8Array): boolean {
    if (!bytes || bytes.length < 4) return false;
    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
    // GIF: 47 49 46 38
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
    // WebP: RIFF...WEBP
    if (bytes.length >= 12 && 
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
    return false;
  }

  private async getImageForUrl(url: string): Promise<Image> {
    // 1. Check memory cache first
    if (this.imageCache[url]) {
      return this.imageCache[url];
    }

    // Start a new promise for this URL
    const imagePromise = (async () => {
      const cacheKey = `img:${url}`;
      
      // 2. Check persistent storage (clientStorage) with TTL
      try {
        const cached = await figma.clientStorage.getAsync(cacheKey);
        if (cached) {
          // Поддержка старого формата (просто hash) и нового (объект с TTL)
          let hash: string | null = null;
          let isExpired = false;
          
          if (typeof cached === 'string') {
            // Старый формат — считаем валидным (миграция)
            hash = cached;
          } else if (cached && typeof cached === 'object' && 'hash' in cached) {
            // Новый формат с TTL
            hash = cached.hash;
            const timestamp = cached.timestamp || 0;
            isExpired = (Date.now() - timestamp) > IMAGE_CONFIG.CACHE_TTL_MS;
          }
          
          if (hash && !isExpired) {
            const image = figma.getImageByHash(hash);
            if (image) {
              Logger.debug(`   💾 Found in persistent cache: ${url.substring(0, 50)}...`);
              return image;
            }
          } else if (isExpired) {
            Logger.debug(`   ⏰ Cache expired for: ${url.substring(0, 50)}...`);
            // Удаляем устаревшую запись
            figma.clientStorage.deleteAsync(cacheKey).catch(() => {});
          }
        }
      } catch (e) {
        Logger.warn('Error reading from clientStorage:', e);
      }

      // 3. Fetch from network (с retry)
      const maxAttempts = (IMAGE_CONFIG.RETRY_COUNT || 1) + 1;
      let response: Response | null = null;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          response = await this.fetchWithTimeout(url, IMAGE_CONFIG.TIMEOUT_MS);
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (attempt < maxAttempts) {
            const delay = (IMAGE_CONFIG.RETRY_DELAY_MS || 500) * attempt;
            Logger.warn(`⏱️ Попытка ${attempt}/${maxAttempts} не удалась, повтор через ${delay}ms: ${url.substring(0, 60)}...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      if (lastError || !response) {
        throw lastError || new Error(`Не удалось загрузить: ${url}`);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      if (!bytes || bytes.length === 0) {
        throw new Error(`Пустой ответ от сервера для: ${url}`);
      }
      
      if (bytes.length > IMAGE_CONFIG.MAX_SIZE_BYTES) {
        throw new Error(`Изображение слишком большое (${Math.round(bytes.length / 1024 / 1024)}MB, максимум ${IMAGE_CONFIG.MAX_SIZE_BYTES / 1024 / 1024}MB): ${url}`);
      }
      
      if (!this.isValidImageFormat(bytes)) {
        throw new Error(`Неподдерживаемый формат изображения для: ${url}`);
      }
      
      // 4. Create image in Figma
      let image: Image | null = null;
      
      // Проверяем тип содержимого перед созданием
      // Ограничиваем область видимости переменной bytes, чтобы помочь GC очистить память быстрее
      {
        if (bytes.length > 0) {
          // Простейшая проверка на SVG (начинается с <svg или <?xml)
          // Но figma.createImage не поддерживает SVG. 
          // Если это SVG, мы не можем использовать его как ImagePaint.
          // Здесь мы ожидаем только растровые форматы (PNG, JPEG, GIF, WEBP).
          
          try {
            // Важно: createImage - синхронная операция
            image = figma.createImage(bytes);
          } catch (createError) {
            // Если figma.createImage выбрасывает ошибку (например, для неподдерживаемых форматов)
            Logger.warn(`⚠️ figma.createImage failed for ${url}:`, createError);
            throw new Error(`Figma не поддерживает формат изображения: ${url}`);
          }
        }
      }
      // bytes больше не нужен, GC может собрать его, если он не используется в замыканиях

      if (!image || !image.hash) {
        throw new Error('Не удалось создать изображение (возможно, неподдерживаемый формат)');
      }

      // 5. Add to pending cache writes (batch save at end of processPool)
      // Это оптимизация: вместо N отдельных setAsync делаем один batch в конце
      this.pendingCacheWrites.set(cacheKey, {
        hash: image.hash,
        timestamp: Date.now()
      });

      return image;
    })();

    // Store promise in memory cache
    this.imageCache[url] = imagePromise;
    return imagePromise;
  }

  // Base64 декодер для Figma plugin sandbox (atob не доступен)
  private base64ToBytes(base64: string): Uint8Array {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i;
    }

    // Удаляем padding и пробелы
    const cleanBase64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
    const len = cleanBase64.length;
    const bufferLength = Math.floor(len * 3 / 4);
    const bytes = new Uint8Array(bufferLength);

    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const encoded1 = lookup[cleanBase64.charCodeAt(i)];
      const encoded2 = lookup[cleanBase64.charCodeAt(i + 1)];
      const encoded3 = lookup[cleanBase64.charCodeAt(i + 2)];
      const encoded4 = lookup[cleanBase64.charCodeAt(i + 3)];

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      if (i + 2 < len && cleanBase64[i + 2] !== '=') {
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      }
      if (i + 3 < len && cleanBase64[i + 3] !== '=') {
        bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
      }
    }

    return bytes.slice(0, p);
  }

  // Конвертирует data:image/... URL в Figma Image
  private async getImageFromDataUrl(dataUrl: string): Promise<Image> {
    // Проверяем кеш по первым 100 символам data URL (достаточно для уникальности)
    const cacheKey = 'data_' + dataUrl.substring(0, 100);
    if (this.imageCache[cacheKey]) {
      Logger.debug(`   📦 Data URL из кеша`);
      return this.imageCache[cacheKey];
    }

    const imagePromise = (async (): Promise<Image> => {
      // Парсим data URL: data:image/png;base64,XXXXXX
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!match) {
        throw new Error('Некорректный формат data URL');
      }

      const base64Data = match[2];
      
      // Декодируем base64 в Uint8Array (без atob, который недоступен в Figma sandbox)
      const bytes = this.base64ToBytes(base64Data);

      // Создаём Figma Image
      const image = figma.createImage(bytes);
      if (!image || !image.hash) {
        throw new Error('Не удалось создать изображение из data URL');
      }

      Logger.debug(`   ✅ Data URL декодирован (${bytes.length} bytes)`);
      return image;
    })();

    this.imageCache[cacheKey] = imagePromise;
    return imagePromise;
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
          figmaImage = await this.getImageFromDataUrl(imgUrl);
        } else {
          figmaImage = await this.getImageForUrl(imgUrl);
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
    await this.flushCacheWrites();
    
    // Summary-лог — оставляем как info (это итоговая статистика)
    Logger.summary(`✅ [Image] Обработано: ${this.successfulImages} успешно, ${this.failedImages} ошибок, ${items.length - this.successfulImages - this.failedImages} пропущено`);
  }
}
