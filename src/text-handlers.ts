import { Logger } from './logger';
import { LayerDataItem } from './types';
import { trySetVariantProperty, trySetVariantPropertyRecursive } from './property-utils';

export async function loadFonts(textLayers: LayerDataItem[]): Promise<void> {
  const fontsStartTime = Date.now();
  Logger.verbose(`📝 Загружаем шрифты для ${textLayers.length} текстовых слоев...`);

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

      // 2) Fallback: ОПТИМИЗАЦИЯ для MIXED
      // Если мы собираемся заменить весь текст, нам нужен только шрифт, который применится к новому тексту.
      // Figma использует стили первого символа при полной замене текста.
      // Поэтому нет смысла сканировать весь текст (getStyledTextSegments или getRangeFontName в цикле),
      // если мы не сохраняем форматирование.
      
      const fontName = textNode.fontName as FontName | 'MIXED';
      
      if (fontName === 'MIXED') {
        // Берем шрифт только первого символа
        if (textLength > 0) {
           const firstCharFont = textNode.getRangeFontName(0, 1) as FontName | 'MIXED';
           if (firstCharFont && firstCharFont !== 'MIXED' && typeof firstCharFont === 'object') {
             const key = `${firstCharFont.family}|||${firstCharFont.style}`;
             fontsToLoadMap[key] = { family: firstCharFont.family, style: firstCharFont.style };
           }
        }
      } else if (fontName && typeof fontName === 'object') {
        // Обычный (единый) шрифт
        if (fontName.family && fontName.style) {
          const key = `${fontName.family}|||${fontName.style}`;
          fontsToLoadMap[key] = { family: fontName.family, style: fontName.style };
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  const fontsToLoad = Array.from(Object.values(fontsToLoadMap));
  Logger.debug(`🔤 Найдено ${fontsToLoad.length} уникальных шрифтов`);

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
  Logger.summary(`✅ Шрифтов загружено: ${successfulFonts}, ошибок: ${failedFonts} (${fontsTime}ms)`);
  
  figma.ui.postMessage({
    type: 'log',
    message: `⏱️ Загрузка шрифтов: ${(fontsTime / 1000).toFixed(2)}s`
  });
}

export async function processTextLayers(textLayers: LayerDataItem[]): Promise<void> {
  const textStartTime = Date.now();
  Logger.verbose(`📝 Обрабатываем ${textLayers.length} текстовых слоев...`);

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
            isVariantPropertyProcessed = trySetVariantProperty(instance, [trimmedTextValue], item.fieldName);
            if ('children' in instance) {
              isVariantPropertyProcessed = isVariantPropertyProcessed || trySetVariantPropertyRecursive(instance, [trimmedTextValue], item.fieldName);
            }
          } else {
            // For non-instances, look up parents or children
            let parent: BaseNode | null = item.layer.parent;
            while (parent && !isVariantPropertyProcessed) {
              if (parent.type === 'INSTANCE' && !parent.removed) {
                isVariantPropertyProcessed = trySetVariantProperty(parent as InstanceNode, [trimmedTextValue], item.fieldName);
                if (isVariantPropertyProcessed) {
                  isVariantPropertyProcessed = isVariantPropertyProcessed || trySetVariantPropertyRecursive(parent as InstanceNode, [trimmedTextValue], item.fieldName);
                  break;
                }
              }
              parent = parent.parent;
            }
            
            if (!isVariantPropertyProcessed && 'children' in item.layer) {
              isVariantPropertyProcessed = trySetVariantPropertyRecursive(item.layer as SceneNode, [trimmedTextValue], item.fieldName);
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
              // Нет дочернего TEXT — пробуем установить через componentProperties
              // Это нужно для компонентов типа EPrice, которые используют exposed properties
              let propertySet = false;
              
              if (instance.componentProperties) {
                // Пробуем разные имена свойств
                const propertyNames = ['value', 'text', 'content', 'label', 'Value', 'Text'];
                
                for (const propName of propertyNames) {
                  // Проверяем точное совпадение или с суффиксом
                  for (const propKey in instance.componentProperties) {
                    if (propKey === propName || propKey.startsWith(propName + '#') || propKey.toLowerCase() === propName.toLowerCase()) {
                      const prop = instance.componentProperties[propKey];
                      if (prop && typeof prop === 'object' && 'value' in prop) {
                        try {
                          // Figma setProperties принимает только string | boolean
                          // Для числовых свойств передаём как строку
                          const valueToSet: string = textValue;
                          
                          instance.setProperties({ [propName]: valueToSet });
                          Logger.debug(`✅ Установлено свойство "${propName}" = "${valueToSet}" для INSTANCE "${instance.name}"`);
                          propertySet = true;
                          break;
                        } catch (propError) {
                          Logger.debug(`⚠️ Не удалось установить "${propName}": ${propError}`);
                        }
                      }
                    }
                  }
                  if (propertySet) break;
                }
              }
              
              if (!propertySet) {
                Logger.warn(`⚠️ Не найден текстовый слой или свойство в INSTANCE "${instance.name}" для "${item.fieldName}"`);
              }
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
  Logger.logTextStats(textLayers.length, textTime);
  
  figma.ui.postMessage({
    type: 'log',
    message: `⏱️ Обработка текстов: ${(textTime / 1000).toFixed(2)}s`
  });
}

