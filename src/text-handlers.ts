import { Logger } from './logger';
import { LayerDataItem } from './types';
import { processVariantProperty, processVariantPropertyRecursive } from './property-utils';

export async function loadFonts(textLayers: LayerDataItem[]): Promise<void> {
  const fontsStartTime = Date.now();
  Logger.info(`📝 Загружаем шрифты для ${textLayers.length} текстовых слоев...`);

  type FontPair = { family: string; style: string };
  const fontsToLoadMap: { [key: string]: FontPair } = {};

  for (const item of textLayers) {
    const textNode = item.layer as TextNode;
    try {
      const nodeCharacters = textNode.characters || '';
      const textLength = nodeCharacters.length;
      if (textLength === 0) {
        const fn = textNode.fontName as FontName | 'MIXED';
        if (fn && typeof fn === 'object' && fn.family && fn.style) {
          const key = `${fn.family}|||${fn.style}`;
          fontsToLoadMap[key] = { family: fn.family, style: fn.style };
        }
        continue;
      }

      // 1) Быстрый путь: getStyledTextSegments
      const anyText = textNode as TextNode & { getStyledTextSegments?: (props: string[]) => Array<{ fontName: FontName | 'MIXED' }> };
      if (typeof anyText.getStyledTextSegments === 'function') {
        const segments = anyText.getStyledTextSegments(['fontName']);
        if (segments && segments.length) {
          for (const seg of segments) {
            const fn = seg.fontName;
            if (fn && typeof fn === 'object' && fn.family && fn.style) {
              const key = `${fn.family}|||${fn.style}`;
              fontsToLoadMap[key] = { family: fn.family, style: fn.style };
            }
          }
          continue;
        }
      }

      // 2) Fallback: посимвольное чтение (если MIXED и нет сегментов)
      const fontName = textNode.fontName as FontName | 'MIXED';
      if (fontName && fontName !== 'MIXED' && typeof fontName === 'object') {
        if (fontName.family && fontName.style) {
          const key = `${fontName.family}|||${fontName.style}`;
          fontsToLoadMap[key] = { family: fontName.family, style: fontName.style };
        }
      } else {
        let start = 0;
        while (start < textLength) {
          try {
            const rangeFont = textNode.getRangeFontName(start, start + 1) as FontName | 'MIXED';
            let end = start + 1;
            while (end < textLength) {
              const nextFont = textNode.getRangeFontName(end, end + 1) as FontName | 'MIXED';
              if (!nextFont || nextFont === 'MIXED' || typeof nextFont !== 'object' || 
                  nextFont.family !== (typeof rangeFont === 'object' ? rangeFont.family : '') || 
                  nextFont.style !== (typeof rangeFont === 'object' ? rangeFont.style : '')) break;
              end++;
            }
            if (rangeFont && rangeFont !== 'MIXED' && typeof rangeFont === 'object' && rangeFont.family && rangeFont.style) {
              const key = `${rangeFont.family}|||${rangeFont.style}`;
              fontsToLoadMap[key] = { family: rangeFont.family, style: rangeFont.style };
            }
            start = end;
          } catch (e) {
            start++;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  const fontsToLoad = Array.from(Object.values(fontsToLoadMap));
  Logger.info(`🔤 Найдено ${fontsToLoad.length} уникальных шрифтов`);

  let successfulFonts = 0;
  let failedFonts = 0;

  const fontPromises = fontsToLoad.map(async (fp) => {
    try {
      await figma.loadFontAsync({ family: fp.family, style: fp.style });
      successfulFonts += 1;
    } catch (error) {
      Logger.error(`❌ Ошибка загрузки шрифта ${fp.family} ${fp.style}:`, error);
      failedFonts += 1;
    }
  });

  await Promise.all(fontPromises);

  const fontsTime = Date.now() - fontsStartTime;
  Logger.info(`✅ Шрифтов загружено: ${successfulFonts}, ошибок: ${failedFonts} (${fontsTime}ms)`);
  
  figma.ui.postMessage({
    type: 'log',
    message: `⏱️ Загрузка шрифтов: ${(fontsTime / 1000).toFixed(2)}s`
  });
}

export function processTextLayers(textLayers: LayerDataItem[]): void {
  const textStartTime = Date.now();
  Logger.info(`📝 Обрабатываем ${textLayers.length} текстовых слоев...`);

  try {
    for (const item of textLayers) {
      try {
        if (item.layer.removed || !item.fieldValue || item.fieldValue.trim() === '') {
          continue;
        }
        
        let textValue = String(item.fieldValue);
        if (textValue.length > 10000) {
          textValue = textValue.substring(0, 10000);
        }
        // eslint-disable-next-line no-control-regex
        textValue = textValue.replace(/\0/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
        
        const layerType = item.layer.type;
        
        // Check for Variant Property syntax
        const trimmedTextValue = textValue.trim();
        const isVariantPropertyFormat = /^[^=\s]+=.+$/.test(trimmedTextValue);
        let isVariantPropertyProcessed = false;
        
        if (isVariantPropertyFormat) {
          Logger.debug(`🔍 [Text Layer] Обнаружен формат Variant Property: "${trimmedTextValue}" для поля "${item.fieldName}"`);
          
          if (layerType === 'INSTANCE') {
            const instance = item.layer as InstanceNode;
            isVariantPropertyProcessed = processVariantProperty(instance, trimmedTextValue, item.fieldName);
            if ('children' in instance) {
              isVariantPropertyProcessed = isVariantPropertyProcessed || processVariantPropertyRecursive(instance, trimmedTextValue, item.fieldName);
            }
          } else {
            // For non-instances, look up parents or children
            let parent: BaseNode | null = item.layer.parent;
            while (parent && !isVariantPropertyProcessed) {
              if (parent.type === 'INSTANCE' && !parent.removed) {
                isVariantPropertyProcessed = processVariantProperty(parent as InstanceNode, trimmedTextValue, item.fieldName);
                if (isVariantPropertyProcessed) {
                  isVariantPropertyProcessed = isVariantPropertyProcessed || processVariantPropertyRecursive(parent as InstanceNode, trimmedTextValue, item.fieldName);
                  break;
                }
              }
              parent = parent.parent;
            }
            
            if (!isVariantPropertyProcessed && 'children' in item.layer) {
              isVariantPropertyProcessed = processVariantPropertyRecursive(item.layer, trimmedTextValue, item.fieldName);
            }
          }
        }
        
        if (isVariantPropertyProcessed) {
          continue;
        }

        // Apply text
        if (layerType === 'TEXT') {
          try {
            (item.layer as TextNode).characters = textValue;
          } catch (setTextError) {
            Logger.error(`❌ Ошибка установки текста для "${item.fieldName}":`, setTextError);
          }
        } else if (layerType === 'INSTANCE') {
          const instance = item.layer as InstanceNode;
          try {
            let textLayer: TextNode | null = null;
            let firstTextLayer: TextNode | null = null;
            
            if ('children' in instance && instance.children) {
              for (const child of instance.children) {
                if (child.type === 'TEXT' && !child.removed) {
                  if (!firstTextLayer) firstTextLayer = child as TextNode;
                  if (child.name === item.fieldName) {
                    textLayer = child as TextNode;
                    break;
                  }
                }
              }
            }
            
            const targetLayer = textLayer || firstTextLayer;
            if (targetLayer) {
              targetLayer.characters = textValue;
            } else {
              Logger.warn(`⚠️ Не найден текстовый слой в INSTANCE "${instance.name}" для "${item.fieldName}"`);
            }
          } catch (instanceError) {
            Logger.error(`❌ Ошибка обработки INSTANCE "${item.fieldName}":`, instanceError);
          }
        }
      } catch (error) {
        Logger.error(`❌ Ошибка установки текста для "${item.fieldName}":`, error);
      }
    }
  } catch (outerError) {
    Logger.error(`❌ Критическая ошибка при обработке текстовых слоев:`, outerError);
  }

  const textTime = Date.now() - textStartTime;
  Logger.info(`✅ Обработано ${textLayers.length} текстовых слоев (${textTime}ms)`);
  
  figma.ui.postMessage({
    type: 'log',
    message: `⏱️ Обработка текстов: ${(textTime / 1000).toFixed(2)}s`
  });
}

