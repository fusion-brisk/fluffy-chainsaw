import { Logger } from './logger';
import { LayerDataItem, DetailedError } from './types';
import { IMAGE_CONFIG } from './config';

export class ImageProcessor {
  // Memory cache for the current session
  private imageCache: { [url: string]: Promise<Image> | undefined } = {};
  private spriteFaviconList: { urls: string[]; currentIndex: number } | null = null;
  
  public successfulImages = 0;
  public failedImages = 0;
  public errors: DetailedError[] = [];

  constructor() {}
  
  public resetForNewImport(): void {
    this.successfulImages = 0;
    this.failedImages = 0;
    this.errors = [];
    this.spriteFaviconList = null;
    // We intentionally don't clear cache here to preserve it across runs in same session
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
      
      // 2. Check persistent storage (clientStorage)
      try {
        const cachedHash = await figma.clientStorage.getAsync(cacheKey);
        if (cachedHash && typeof cachedHash === 'string') {
          const image = figma.getImageByHash(cachedHash);
          if (image) {
            Logger.debug(`   💾 Found in persistent cache: ${url.substring(0, 50)}...`);
            return image;
          }
        }
      } catch (e) {
        Logger.warn('Error reading from clientStorage:', e);
      }

      // 3. Fetch from network
      let response: Response;
      try {
        response = await this.fetchWithTimeout(url, IMAGE_CONFIG.TIMEOUT_MS);
      } catch (e) {
        Logger.warn('⏱️ Повторная попытка загрузки без таймаута:', url, e);
        response = await fetch(url);
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
      if (bytes.length > 0) {
        // Простейшая проверка на SVG (начинается с <svg или <?xml)
        // Но figma.createImage не поддерживает SVG. 
        // Если это SVG, мы не можем использовать его как ImagePaint.
        // Здесь мы ожидаем только растровые форматы (PNG, JPEG, GIF, WEBP).
        
        try {
          image = figma.createImage(bytes);
        } catch (createError) {
          // Если figma.createImage выбрасывает ошибку (например, для неподдерживаемых форматов)
          Logger.warn(`⚠️ figma.createImage failed for ${url}:`, createError);
          throw new Error(`Figma не поддерживает формат изображения: ${url}`);
        }
      }

      if (!image || !image.hash) {
        throw new Error('Не удалось создать изображение (возможно, неподдерживаемый формат)');
      }

      // 5. Save hash to persistent storage
      try {
        figma.clientStorage.setAsync(cacheKey, image.hash).catch(e => {
          Logger.warn('Error writing to clientStorage:', e);
        });
      } catch (e) {
        // ignore
      }

      return image;
    })();

    // Store promise in memory cache
    this.imageCache[url] = imagePromise;
    return imagePromise;
  }

  // Helper to mark layer as failed with visual feedback
  private markAsFailed(item: LayerDataItem, message: string): void {
    try {
      if (item.layer.removed) return;
      
      if (item.layer.type === 'RECTANGLE' || item.layer.type === 'ELLIPSE' || item.layer.type === 'POLYGON') {
        const redPaint: SolidPaint = {
          type: 'SOLID',
          color: { r: 1, g: 0, b: 0 },
          opacity: 0.3
        };
        (item.layer as RectangleNode | EllipseNode | PolygonNode).fills = [redPaint];
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
      
      const isFavicon = item.fieldName.toLowerCase().includes('favicon');
      
      // Обработка SPRITE_LIST
      if (imgUrl.startsWith('SPRITE_LIST:')) {
        if (!isFavicon) {
          Logger.warn(`   ⚠️ SPRITE_LIST найден в не-фавиконке "${item.fieldName}", пропускаем`);
          this.markAsFailed(item, 'SPRITE_LIST только для фавиконок');
          return;
        }
        
        const listData = imgUrl.substring('SPRITE_LIST:'.length);
        const urls = listData.split('|').filter(url => url.trim().length > 0);
        
        if (urls.length > 0) {
          if (this.spriteFaviconList && this.spriteFaviconList.currentIndex < this.spriteFaviconList.urls.length) {
            imgUrl = this.spriteFaviconList.urls[this.spriteFaviconList.currentIndex];
            Logger.debug(`   🎯 Фавиконка из списка (idx ${this.spriteFaviconList.currentIndex}): ${imgUrl.substring(0, 50)}...`);
            this.spriteFaviconList.currentIndex++;
          } else {
            this.spriteFaviconList = { urls: urls, currentIndex: 1 };
            imgUrl = urls[0];
            Logger.debug(`   🎯 Новый список фавиконок, берем первую: ${imgUrl.substring(0, 50)}...`);
          }
          
          this.updateShopNameFromUrl(imgUrl, item);
        } else {
          Logger.warn(`   ⚠️ Пустой список фавиконок в SPRITE_LIST`);
          this.markAsFailed(item, 'Пустой SPRITE_LIST');
          return;
        }
      } else if (isFavicon && this.spriteFaviconList) {
        if (this.spriteFaviconList.currentIndex < this.spriteFaviconList.urls.length) {
          imgUrl = this.spriteFaviconList.urls[this.spriteFaviconList.currentIndex];
          Logger.debug(`   🎯 Фавиконка из списка (idx ${this.spriteFaviconList.currentIndex}): ${imgUrl.substring(0, 50)}...`);
          this.spriteFaviconList.currentIndex++;
        } else {
          Logger.debug(`   ⚠️ Список фавиконок закончился, сбрасываем`);
          this.spriteFaviconList = null;
          Logger.warn(`   ⚠️ Нет URL для фавиконки в строке ${item.rowIndex}`);
          this.markAsFailed(item, 'Список фавиконок закончился');
          return;
        }
        
        this.updateShopNameFromUrl(imgUrl, item);
      } else {
        // Обычная обработка спрайтов
        const spriteMatch = imgUrl.match(/^(.+)\|(.+?)(?:\|(.+))?$/);
        if (spriteMatch) {
          imgUrl = spriteMatch[1];
          spritePosition = spriteMatch[2].trim();
          spriteSize = spriteMatch[3] ? spriteMatch[3].trim() : null;
          Logger.debug(`   🎯 Спрайт: позиция=${spritePosition}${spriteSize ? `, размер=${spriteSize}` : ''}`);
        }
      }
      
      if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://') && !imgUrl.startsWith('//')) {
        Logger.warn(`⚠️ Некорректный URL: ${imgUrl.substring(0, 50)}...`);
        this.markAsFailed(item, `Некорректный URL: ${imgUrl}`);
        return;
      }
      
      if (imgUrl.startsWith('//')) {
        imgUrl = 'https:' + imgUrl;
      }
      
      // Get image from cache or network
      let figmaImage: Image;
      try {
        figmaImage = await this.getImageForUrl(imgUrl);
      } catch (loadError) {
        const errMsg = loadError instanceof Error ? loadError.message : String(loadError);
        Logger.error(`   ❌ Ошибка загрузки:`, loadError);
        this.markAsFailed(item, `Ошибка загрузки: ${errMsg}`);
        return;
      }
      
      if (item.layer.removed) {
        Logger.warn(`   ⚠️ Слой удален`);
        this.failedImages++; 
        return;
      }
      
      const layerType = item.layer.type;
      if (layerType !== 'RECTANGLE' && layerType !== 'ELLIPSE' && layerType !== 'POLYGON') {
        Logger.warn(`   ⚠️ Неподдерживаемый тип слоя: ${layerType}`);
        this.failedImages++; 
        // Не считаем это критической ошибкой для отчета, но можно добавить
        return;
      }
      
      // Применение изображения
      try {
        const layer = item.layer as RectangleNode | EllipseNode | PolygonNode;
        
        if (spritePosition) {
          await this.applySpriteImage(layer, figmaImage, spritePosition, spriteSize);
        } else {
          // Определяем режим масштабирования: для #OrganicImage используем FIT, для остальных FILL
          const isOrganicImage = item.fieldName.toLowerCase().includes('organicimage');
          const scaleMode = isOrganicImage ? 'FIT' : 'FILL';

          const newPaint: ImagePaint = {
            type: 'IMAGE',
            scaleMode: scaleMode,
            imageHash: figmaImage.hash
          };
          layer.fills = [newPaint];
          Logger.debug(`   ✅ Изображение применено (${scaleMode})`);
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
        const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
        const hostname = hostUrl.hostname;
        
        if (item.row) {
          item.row['#ShopName'] = hostname;
          item.row['#OrganicHost'] = hostname;
          this.updateRelatedTextLayers(item.rowIndex, hostname);
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
      this.onUpdateTextLayer(rowIndex, '#ShopName', value);
      this.onUpdateTextLayer(rowIndex, '#OrganicHost', value);
    }
  }

  private async applySpriteImage(
    layer: RectangleNode | EllipseNode | PolygonNode, 
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

  public async processPool(items: LayerDataItem[]): Promise<void> {
    const queue = [...items];
    const workers: Promise<void>[] = [];
    
    for (let i = 0; i < IMAGE_CONFIG.MAX_CONCURRENT; i++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            const index = items.length - queue.length - 1;
            await this.processImage(item, index, items.length);
          }
        }
      })());
    }
    
    await Promise.all(workers);
  }
}
