/**
 * Image Operations — загрузка и применение изображений, фавиконок и аватаров
 */

import { Logger } from '../../logger';
import { fetchAndApplyImage } from '../image-apply';

/**
 * Bulk preload all fonts used by TEXT nodes in an instance.
 * Avoids per-handler font loading failures and speeds up text operations.
 */
export async function preloadInstanceFonts(instance: InstanceNode): Promise<void> {
  const textNodes = instance.findAll((n) => n.type === 'TEXT') as TextNode[];
  const loaded = new Set<string>();
  for (const textNode of textNodes) {
    if (textNode.hasMissingFont) continue;
    const fontName = textNode.fontName;
    if (fontName === figma.mixed) continue;
    const key = `${fontName.family}::${fontName.style}`;
    if (loaded.has(key)) continue;
    try {
      await figma.loadFontAsync(fontName);
      loaded.add(key);
    } catch {
      // font unavailable — handlers will handle individually
    }
  }
}

/**
 * Найти слой изображения внутри контейнера
 */
export function findImageLayer(container: SceneNode, names: string[]): SceneNode | null {
  if (!('children' in container)) return null;

  // Сначала ищем точное совпадение
  for (const name of names) {
    const found = findLayerRecursive(container, name);
    if (found) return found;
  }

  // Fallback: ищем слой с "Image" или "Thumb" в имени (частичное совпадение)
  const partialFound = findLayerByPartialName(container, ['Image', 'Thumb', 'image', 'thumb']);
  if (partialFound) {
    Logger.debug(`[findImageLayer] Найден по частичному совпадению: "${partialFound.name}"`);
    return partialFound;
  }

  return null;
}

/**
 * Ищет слой по частичному совпадению имени (contains)
 */
function findLayerByPartialName(node: SceneNode, patterns: string[]): SceneNode | null {
  // Проверяем текущий узел — ищем только слои с fills (Rectangle, Frame)
  if ('fills' in node && patterns.some((p) => node.name.includes(p))) {
    return node;
  }

  if (!('children' in node)) return null;

  for (const child of node.children) {
    const found = findLayerByPartialName(child, patterns);
    if (found) return found;
  }
  return null;
}

function findLayerRecursive(node: SceneNode, name: string): SceneNode | null {
  if (node.name === name) return node;
  if (!('children' in node)) return null;

  for (const child of node.children) {
    const found = findLayerRecursive(child, name);
    if (found) return found;
  }
  return null;
}

/**
 * Загружает изображение по URL и применяет к слою
 */
export async function loadAndApplyImage(
  layer: SceneNode,
  url: string,
  logPrefix: string,
): Promise<boolean> {
  return fetchAndApplyImage(layer, url, 'FIT', logPrefix);
}

/**
 * Применить изображения к сниппету
 * Поддерживает как одиночное изображение, так и EThumbGroup (3 картинки)
 */
export async function applySnippetImages(
  instance: InstanceNode,
  row: Record<string, string | undefined>,
): Promise<void> {
  const imageType = row['#imageType'] || '';
  const image1 = row['#Image1'] || '';
  const image2 = row['#Image2'] || '';
  const image3 = row['#Image3'] || '';

  // Если есть EThumbGroup с несколькими картинками
  if (imageType === 'EThumbGroup' && image2) {
    Logger.debug(
      `[applySnippetImages] EThumbGroup: применяем ${image1 ? '1' : '0'}+${image2 ? '1' : '0'}+${image3 ? '1' : '0'} картинок`,
    );

    const imageSlots = [
      { names: ['#Image1', 'Image1', 'EThumbGroup-Main'], url: image1 },
      { names: ['#Image2', 'Image2', 'EThumbGroup-Item_topRight'], url: image2 },
      { names: ['#Image3', 'Image3', 'EThumbGroup-Item_bottomRight'], url: image3 },
    ];

    // Параллельная загрузка всех изображений
    const promises = imageSlots.map(async (slot, idx) => {
      if (!slot.url || slot.url.trim() === '') return;

      let layer: SceneNode | null = null;
      for (const name of slot.names) {
        layer = findImageLayer(instance, [name]);
        if (layer) break;
      }

      if (!layer) {
        Logger.warn(
          `[applySnippetImages] Image${idx + 1}: слой не найден (пробовал: ${slot.names.join(', ')})`,
        );
        return;
      }

      Logger.debug(`[applySnippetImages] Image${idx + 1}: найден слой "${layer.name}"`);
      await loadAndApplyImage(layer, slot.url, `[applySnippetImages] Image${idx + 1}:`);
    });

    await Promise.all(promises);
    return;
  }

  // Одиночное изображение (стандартный путь)
  const imageUrl = row['#OrganicImage'] || row['#ThumbImage'] || row['#Image1'] || '';

  if (!imageUrl || imageUrl.trim() === '') {
    Logger.debug(`[applySnippetImages] Нет URL изображения`);
    return;
  }

  Logger.debug(`[applySnippetImages] URL: "${imageUrl.substring(0, 60)}..."`);

  // Ищем слой изображения
  // Добавлены имена для AdvGallery и других вариантов компонентов
  const layerNames = [
    '#OrganicImage',
    '#ThumbImage',
    'Image Ratio',
    'EThumb-Image',
    '#Image',
    '#Image1',
    // Дополнительные имена для AdvGallery и других вариантов
    'Image',
    'Thumb',
    'image',
    'EProductSnippet2-Image',
    'EProductSnippet2-Thumb',
    'AdvGallery-Image',
    'Card-Image',
    'EThumb',
    'Photo',
    'Picture',
  ];
  const layer = findImageLayer(instance, layerNames);

  if (!layer) {
    Logger.warn(`[applySnippetImages] Слой НЕ найден (пробовал: ${layerNames.join(', ')})`);
    // Логируем все дочерние элементы для отладки
    if ('children' in instance) {
      const childNames = (instance.children as readonly SceneNode[])
        .slice(0, 10)
        .map((c) => c.name);
      Logger.debug(`[applySnippetImages] Дочерние: ${childNames.join(', ')}`);
    }
    return;
  }

  Logger.debug(`[applySnippetImages] Найден слой: "${layer.name}"`);
  await loadAndApplyImage(layer, imageUrl, '[applySnippetImages]');
}

/**
 * Применить favicon к инстансу сниппета
 */
export async function applyFavicon(
  instance: InstanceNode,
  row: Record<string, string | undefined>,
): Promise<void> {
  const faviconUrl = row['#FaviconImage'] || '';

  if (!faviconUrl || faviconUrl.trim() === '') {
    Logger.debug(`[applyFavicon] Нет URL фавиконки`);
    return;
  }

  Logger.debug(`[applyFavicon] URL: "${faviconUrl.substring(0, 60)}..."`);

  // Ищем слой фавиконки
  const layerNames = [
    '#FaviconImage',
    '#Favicon',
    'Favicon',
    'favicon',
    'EFavicon',
    'EShopName/#Favicon',
  ];
  const layer = findImageLayer(instance, layerNames);

  if (!layer) {
    Logger.warn(`[applyFavicon] Слой НЕ найден (пробовал: ${layerNames.join(', ')})`);
    return;
  }

  Logger.debug(`[applyFavicon] Найден слой: "${layer.name}"`);
  await fetchAndApplyImage(layer, faviconUrl, 'FIT', '[applyFavicon]');
}

/**
 * Применить аватар автора цитаты к инстансу сниппета
 */
export async function applyQuoteAvatar(
  instance: InstanceNode,
  row: Record<string, string | undefined>,
): Promise<void> {
  const avatarUrl = row['#EQuote-AuthorAvatar'] || row['#QuoteImage'] || '';

  if (!avatarUrl || avatarUrl.trim() === '') {
    return; // Нет аватара — ничего не делаем (это нормально)
  }

  Logger.debug(`[applyQuoteAvatar] URL: "${avatarUrl.substring(0, 60)}..."`);

  // Ищем слой аватара
  const layerNames = [
    '#EQuote-AuthorAvatar',
    'EQuote-AuthorAvatar',
    '#QuoteImage',
    'EQuote-AvatarWrapper',
  ];
  const layer = findImageLayer(instance, layerNames);

  if (!layer) {
    Logger.warn(`[applyQuoteAvatar] Слой не найден (пробовал: ${layerNames.join(', ')})`);
    return;
  }

  Logger.debug(`[applyQuoteAvatar] Найден слой: "${layer.name}"`);
  await fetchAndApplyImage(layer, avatarUrl, 'FILL', '[applyQuoteAvatar]');
}

// Re-export findFillableLayer from shared utils for backward compatibility
export { findFillableLayer } from '../../utils/layer-search';

export interface ImageGridItem {
  url: string;
  width: number;
  height: number;
  row: number;
}
