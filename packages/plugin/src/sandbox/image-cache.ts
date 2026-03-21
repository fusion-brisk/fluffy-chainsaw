import { Logger } from '../logger';
import { IMAGE_CONFIG } from '../config';
import { fetchWithTimeout, isValidImageFormat, base64ToBytes } from './image-network';

/**
 * Image cache — manages memory cache (URL→Promise<Image>), persistent storage (clientStorage),
 * and batched cache writes.
 */
export class ImageCache {
  // Memory cache for the current session
  private imageCache: { [url: string]: Promise<Image> | undefined } = {};

  // Batch cache writes — накапливаем записи и сохраняем в конце
  private pendingCacheWrites: Map<string, { hash: string; timestamp: number }> = new Map();

  /**
   * Clear pending writes (but keep memory cache to preserve it across runs in same session).
   */
  public resetPendingWrites(): void {
    this.pendingCacheWrites.clear();
  }

  /**
   * Batch flush всех накопленных записей в clientStorage.
   * Вызывается один раз в конце processPool для оптимизации I/O.
   */
  public async flushCacheWrites(): Promise<void> {
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

  /**
   * Get or fetch an image for a URL (http/https). Uses memory cache → persistent cache → network.
   */
  public async getImageForUrl(url: string): Promise<Image> {
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
          response = await fetchWithTimeout(url, IMAGE_CONFIG.TIMEOUT_MS);
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

      if (!isValidImageFormat(bytes)) {
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

  /**
   * Convert a data:image/... URL to a Figma Image.
   */
  public async getImageFromDataUrl(dataUrl: string): Promise<Image> {
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
      const bytes = base64ToBytes(base64Data);

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
}
