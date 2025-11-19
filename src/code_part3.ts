    // ОПТИМИЗАЦИЯ 4: Предварительная загрузка всех шрифтов (с учетом MIXED и стилей с пробелами)
    if (textLayers.length > 0) {
      const fontsStartTime = Date.now();
      Logger.info(`📝 Загружаем шрифты для ${textLayers.length} текстовых слоев...`);

      // Собираем точные пары {family, style} из всех текстовых слоев, включая MIXED
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

          // 1) Быстрый путь: используем getStyledTextSegments, если доступно
          const anyText = textNode as TextNode & { getStyledTextSegments?: (props: string[]) => Array<{ fontName: FontName | 'MIXED' }> };
          if (typeof anyText.getStyledTextSegments === 'function') {
            const segments = anyText.getStyledTextSegments(['fontName']);
            if (segments && segments.length) {
              for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const fn = seg.fontName;
                if (fn && typeof fn === 'object' && fn.family && fn.style) {
                  const key = `${fn.family}|||${fn.style}`;
                  fontsToLoadMap[key] = { family: fn.family, style: fn.style };
                }
              }
              continue;
            }
          }

          // 2) Если сегменты недоступны: используем оригинальную MIXED-логику
          const fontName = textNode.fontName as FontName | 'MIXED';
          if (fontName && fontName !== 'MIXED' && typeof fontName === 'object') {
            if (fontName.family && fontName.style) {
              const key2 = `${fontName.family}|||${fontName.style}`;
              fontsToLoadMap[key2] = { family: fontName.family, style: fontName.style };
            }
          } else {
            let start = 0;
            while (start < textLength) {
              try {
                // Читаем шрифты без задержек
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
                  const key3 = `${rangeFont.family}|||${rangeFont.style}`;
                  fontsToLoadMap[key3] = { family: rangeFont.family, style: rangeFont.style };
                }
                start = end;
              } catch (e) {
                // Игнорируем ошибки чтения шрифтов для отдельных символов
                start++;
              }
            }
          }
        } catch (e) {
          // Игнорируем проблемы чтения шрифтов конкретного узла
        }
      }

      // ОПТИМИЗАЦИЯ: Прямое извлечение значений из Map без промежуточных преобразований
      const fontsToLoad = Array.from(Object.values(fontsToLoadMap));
      Logger.info(`🔤 Найдено ${fontsToLoad.length} уникальных шрифтов`);

      // Загружаем все шрифты ПАРАЛЛЕЛЬНО для ускорения
      let successfulFonts = 0;
      let failedFonts = 0;
      
      // Загружаем шрифты параллельно
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
      logTiming('Загрузка шрифтов завершена');
      
      // Отправляем тайминг в UI
      figma.ui.postMessage({
        type: 'log',
        message: `⏱️ Загрузка шрифтов: ${(fontsTime / 1000).toFixed(2)}s`
      });

      // Теперь безопасно обрабатываем текстовые слои
      Logger.info(`📝 Обрабатываем ${textLayers.length} текстовых слоев...`);
      
      // ОПТИМИЗАЦИЯ: Упрощенная обработка текстовых слоев без избыточных проверок
      const textStartTime = Date.now();
      try {
        for (let i = 0; i < textLayers.length; i++) {
          const item = textLayers[i];
          try {
            // Быстрая проверка: пропускаем удаленные слои и пустые значения
            if (item.layer.removed || !item.fieldValue || item.fieldValue.trim() === '') {
            continue;
          }
          
            // Подготовка текста: ограничение длины и очистка
            let textValue = String(item.fieldValue);
          if (textValue.length > 10000) {
            textValue = textValue.substring(0, 10000);
          }
            // eslint-disable-next-line no-control-regex
          textValue = textValue.replace(/\0/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
          
            // Определяем тип слоя один раз
              const layerType = item.layer.type;
            
            // ОБРАБОТКА VARIANT PROPERTIES: проверяем, является ли значение инструкцией PropertyName=value
            // Проверяем формат PropertyName=value (содержит = и слева от = нет пробелов)
            let isVariantPropertyProcessed = false;
            const trimmedTextValue = textValue.trim();
            const isVariantPropertyFormat = /^[^=\s]+=.+$/.test(trimmedTextValue);
            
            if (isVariantPropertyFormat) {
              Logger.debug(`🔍 [Text Layer] Обнаружен формат Variant Property: "${trimmedTextValue}" для поля "${item.fieldName}"`);
              if (layerType === 'INSTANCE') {
                const instance = item.layer as InstanceNode;
                // Пробуем обработать как Variant Property
                isVariantPropertyProcessed = processVariantProperty(instance, trimmedTextValue, item.fieldName);
                
                // Также обрабатываем вложенные инстансы
                if ('children' in instance) {
                  const nestedProcessed = processVariantPropertyRecursive(instance, trimmedTextValue, item.fieldName);
                  isVariantPropertyProcessed = isVariantPropertyProcessed || nestedProcessed;
                }
              } else {
                // Для не-инстансов ищем инстансы в родителях и дочерних элементах
                // Проверяем родительские инстансы
                let parent: BaseNode | null = item.layer.parent;
                while (parent && !isVariantPropertyProcessed) {
                  if (parent.type === 'INSTANCE' && !parent.removed) {
                    isVariantPropertyProcessed = processVariantProperty(parent as InstanceNode, trimmedTextValue, item.fieldName);
                    if (isVariantPropertyProcessed) {
                      // Обрабатываем вложенные инстансы
                      const nestedProcessed = processVariantPropertyRecursive(parent as InstanceNode, trimmedTextValue, item.fieldName);
                      isVariantPropertyProcessed = isVariantPropertyProcessed || nestedProcessed;
                      break;
                    }
                  }
                  parent = parent.parent;
                }
                
                // Если не обработано в родителях, проверяем дочерние элементы
                if (!isVariantPropertyProcessed && 'children' in item.layer) {
                  isVariantPropertyProcessed = processVariantPropertyRecursive(item.layer, trimmedTextValue, item.fieldName);
                }
              }
            }
            
            // Если значение было обработано как Variant Property, не применяем его как текст
            if (isVariantPropertyProcessed) {
              Logger.debug(`   ✅ Значение "${trimmedTextValue}" обработано как Variant Property, пропускаем применение как текст`);
              continue;
            } else if (isVariantPropertyFormat) {
              Logger.debug(`   ⚠️ Значение "${trimmedTextValue}" имеет формат Variant Property, но не было обработано`);
            }
            
            if (layerType === 'TEXT') {
              // Прямой текстовый слой - устанавливаем напрямую
              try {
              (item.layer as TextNode).characters = textValue;
            } catch (setTextError) {
                Logger.error(`❌ Ошибка установки текста для "${item.fieldName}":`, setTextError);
              }
            } else if (layerType === 'INSTANCE') {
              // ОПТИМИЗАЦИЯ: Для INSTANCE используем прямой доступ к children в один проход
            const instance = item.layer as InstanceNode;
              try {
            let textLayer: TextNode | null = null;
                let firstTextLayer: TextNode | null = null;
                
                // Быстрый поиск: один проход по children
                if ('children' in instance && instance.children) {
                  for (const child of instance.children) {
                    if (child.type === 'TEXT' && !child.removed) {
                      // Сохраняем первый текстовый слой на случай, если точного совпадения не будет
                      if (!firstTextLayer) {
                        firstTextLayer = child as TextNode;
                      }
                      // Ищем слой с точным именем
                      if (child.name === item.fieldName) {
                        textLayer = child as TextNode;
                        break; // Нашли точное совпадение - выходим
                      }
                    }
                  }
                }
                
                // Используем точное совпадение или первый текстовый слой
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
      logTiming('Обработка текстов завершена');
      
      // Отправляем тайминг в UI
      figma.ui.postMessage({
        type: 'log',
        message: `⏱️ Обработка текстов: ${(textTime / 1000).toFixed(2)}s`
      });
    }

    // Обработка ELabelGroup: установка рейтинга в #ProductRating и Variant Property "Rating"
    // Если в сниппете есть значение #ProductRating, применяем его к текстовому элементу #ProductRating
    // Если в сниппете нет #ProductRating (нет ELabelRating в mhtml), устанавливаем Rating=false в инстансе ELabelGroup
    Logger.debug(`🔍 [ELabelGroup Logic] Начало обработки ELabelGroup для сниппетов...`);
    Logger.debug(`🔍 [ELabelGroup Logic] Количество контейнеров: ${finalContainerMap.size}`);
    
    // Функция для поиска инстанса ELabelGroup в контейнере
    const findELabelGroupInstance = (node: BaseNode): InstanceNode | null => {
      if (node.type === 'INSTANCE' && node.name === 'ELabelGroup' && !node.removed) {
        return node as InstanceNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findELabelGroupInstance(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Функция для поиска текстового элемента #ProductRating в контейнере
    const findProductRatingTextLayer = (node: BaseNode): TextNode | null => {
      if (node.type === 'TEXT' && node.name === '#ProductRating' && !node.removed) {
        return node as TextNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findProductRatingTextLayer(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Группируем контейнеры по их ID и проверяем наличие поля #ProductRating в соответствующих строках
    const eLabelGroupContainersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasProductRating: boolean;
      productRatingValue: string;
    }>();
    
    // Проходим по всем контейнерам и их соответствующим строкам
    for (const [containerKey, layers] of finalContainerMap) {
      if (!layers || layers.length === 0) continue;
      
      // Находим контейнер сниппета (первый слой должен иметь родителя-контейнер)
      let container: BaseNode | null = null;
      for (const layer of layers) {
        if (layer.removed) continue;
        let current: BaseNode | null = layer.parent;
        while (current) {
          if (brandSnippetContainerNames.includes(current.name)) {
            container = current;
            break;
          }
          current = current.parent;
        }
        if (container) break;
      }
      
      if (!container) continue;
      
      // Определяем индекс строки для этого контейнера
      const containerIndex = Array.from(finalContainerMap.keys()).indexOf(containerKey);
      const rowIndex = containerIndex % rows.length;
      const row = rows[rowIndex];
      
      // Проверяем наличие поля #ProductRating
      const productRatingValue = row && row['#ProductRating'] ? String(row['#ProductRating']).trim() : '';
      const hasProductRating = productRatingValue !== '';
      
      // Сохраняем информацию о всех контейнерах
      eLabelGroupContainersMap.set(containerKey, { 
        row: row, 
        container: container,
        hasProductRating: hasProductRating,
        productRatingValue: productRatingValue
      });
    }
    
    // Обрабатываем каждый контейнер
    for (const [containerKey, data] of eLabelGroupContainersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasProductRating=${data.hasProductRating}, productRatingValue="${data.productRatingValue}"`);
      
      // Ищем инстанс ELabelGroup в контейнере
      const eLabelGroupInstance = findELabelGroupInstance(data.container);
      
      if (data.hasProductRating) {
        // Если есть значение #ProductRating, применяем его к текстовому элементу #ProductRating
        Logger.debug(`      ✅ Найдено значение #ProductRating: "${data.productRatingValue}"`);
        
        // Ищем текстовый элемент #ProductRating в контейнере
        const productRatingTextLayer = findProductRatingTextLayer(data.container);
        
        if (productRatingTextLayer) {
          try {
            // Загружаем шрифт для текстового элемента перед применением текста
            const fontName = productRatingTextLayer.fontName;
            if (fontName && typeof fontName === 'object' && fontName.family && fontName.style) {
              await figma.loadFontAsync({ family: fontName.family, style: fontName.style });
            }
            
            // Применяем значение к текстовому элементу
            productRatingTextLayer.characters = data.productRatingValue;
            Logger.debug(`      ✅ Применено значение "${data.productRatingValue}" к текстовому элементу #ProductRating`);
          } catch (e) {
            Logger.error(`      ❌ Ошибка применения значения к #ProductRating:`, e);
          }
        } else {
          Logger.warn(`      ⚠️ Текстовый элемент #ProductRating не найден в контейнере "${containerName}"`);
        }
        
        // Если есть инстанс ELabelGroup, устанавливаем Rating=true (если нужно)
        if (eLabelGroupInstance) {
          Logger.debug(`      🔧 Устанавливаем Rating=true для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Rating=true', '#ProductRating');
        }
      } else {
        // Если нет значения #ProductRating, устанавливаем Rating=false в инстансе ELabelGroup
        Logger.debug(`      ⚠️ Значение #ProductRating не найдено, устанавливаем Rating=false`);
        
        if (eLabelGroupInstance) {
          Logger.debug(`      ✅ Найден инстанс "ELabelGroup" в контейнере "${containerName}"`);
          Logger.debug(`      🔧 Устанавливаем Rating=false для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Rating=false', '#ProductRating');
        } else {
          Logger.debug(`      ⚠️ Инстанс "ELabelGroup" не найден в контейнере "${containerName}"`);
        }
      }
    }

    // Обработка EPriceBarometer: установка Variant Properties "Barometer" для ELabelGroup и "view" для EPriceBarometer
    Logger.debug(`🔍 [EPriceBarometer Logic] Начало обработки EPriceBarometer для сниппетов...`);
    Logger.debug(`🔍 [EPriceBarometer Logic] Количество контейнеров: ${finalContainerMap.size}`);
    
    // Функция для поиска инстанса EPriceBarometer в контейнере
    const findEPriceBarometerInstance = (node: BaseNode): InstanceNode | null => {
      if (node.type === 'INSTANCE' && node.name === 'EPriceBarometer' && !node.removed) {
        return node as InstanceNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findEPriceBarometerInstance(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Группируем контейнеры по их ID и проверяем наличие полей EPriceBarometer в соответствующих строках
    const ePriceBarometerContainersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasBarometer: boolean;
      barometerView: string | null;
    }>();
    
    // Проходим по всем контейнерам и их соответствующим строкам
    for (const [containerKey, layers] of finalContainerMap) {
      if (!layers || layers.length === 0) continue;
      
      // Находим контейнер сниппета (первый слой должен иметь родителя-контейнер)
      let container: BaseNode | null = null;
      for (const layer of layers) {
        if (layer.removed) continue;
        let current: BaseNode | null = layer.parent;
        while (current) {
          if (brandSnippetContainerNames.includes(current.name)) {
            container = current;
            break;
          }
          current = current.parent;
        }
        if (container) break;
      }
      
      if (!container) continue;
      
      // Определяем индекс строки для этого контейнера
      const containerIndex = Array.from(finalContainerMap.keys()).indexOf(containerKey);
      const rowIndex = containerIndex % rows.length;
      const row = rows[rowIndex];
      
      // Проверяем наличие полей #ELabelGroup_Barometer и #EPriceBarometer_View
      const hasBarometer = row && row['#ELabelGroup_Barometer'] === 'true';
      const barometerView = row && row['#EPriceBarometer_View'] ? String(row['#EPriceBarometer_View']).trim() : null;
      
      // Сохраняем информацию о всех контейнерах
      ePriceBarometerContainersMap.set(containerKey, { 
        row: row, 
        container: container,
        hasBarometer: hasBarometer,
        barometerView: barometerView
      });
    }
    
    // Обрабатываем каждый контейнер
    for (const [containerKey, data] of ePriceBarometerContainersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasBarometer=${data.hasBarometer}, barometerView="${data.barometerView || 'null'}"`);
      
      // 1. Обработка ELabelGroup.Barometer
      const eLabelGroupInstance = findELabelGroupInstance(data.container);
      if (eLabelGroupInstance) {
        if (data.hasBarometer) {
          Logger.debug(`      🔧 Устанавливаем Barometer=true для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Barometer=true', '#ELabelGroup_Barometer');
        } else {
          Logger.debug(`      🔧 Устанавливаем Barometer=false для инстанса "ELabelGroup"`);
          processVariantProperty(eLabelGroupInstance, 'Barometer=false', '#ELabelGroup_Barometer');
        }
      } else {
        Logger.debug(`      ⚠️ Инстанс "ELabelGroup" не найден в контейнере "${containerName}" для установки Barometer`);
      }
      
      // 2. Обработка EPriceBarometer.view
      if (data.hasBarometer && data.barometerView) {
        const ePriceBarometerInstance = findEPriceBarometerInstance(data.container);
        if (ePriceBarometerInstance) {
          Logger.debug(`      ✅ Найден инстанс "EPriceBarometer" в контейнере "${containerName}"`);
          
          // Диагностика: логируем все Component Properties
          Logger.debug(`      🔍 Диагностика Component Properties для инстанса "EPriceBarometer":`);
          debugComponentProperties(ePriceBarometerInstance);
          
          // Выводим все свойства инстанса для отладки
          Logger.debug(`      📋 Все свойства инстанса "EPriceBarometer" для отладки:`);
          const allProps = ePriceBarometerInstance.componentProperties;
          let viewPropertyDetails: {
            key: string;
            type: string;
            currentValue: string | boolean | number;
            options: readonly string[] | null;
            fullProperty: InstanceNode['componentProperties'][string];
          } | null = null;
          
          for (const propKey in allProps) {
            if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
              const prop = allProps[propKey];
              if (prop && typeof prop === 'object') {
                const propKeyWithoutId = propKey.split('#')[0];
                
                if ('options' in prop) {
                  const propOptions = prop.options as readonly string[];
                  const currentValue = 'value' in prop ? prop.value : 'N/A';
                  Logger.debug(`         - "${propKey}" (variant): текущее="${currentValue}", опции=[${propOptions.map(o => String(o)).join(', ')}]`);
                  
                  // Сохраняем детали свойства View для специального логирования
                  if (propKeyWithoutId === 'View' || propKey.startsWith('View')) {
                    viewPropertyDetails = {
                      key: propKey,
                      type: 'variant',
                      currentValue: currentValue,
                      options: propOptions,
                      fullProperty: prop
                    };
                  }
                } else if ('value' in prop) {
                  const currentValue = prop.value;
                  const valueType = typeof currentValue;
                  Logger.debug(`         - "${propKey}" (${valueType}): текущее="${currentValue}"`);
                  
                  // Сохраняем детали свойства View для специального логирования
                  if (propKeyWithoutId === 'View' || propKey.startsWith('View')) {
                    viewPropertyDetails = {
                      key: propKey,
                      type: valueType,
                      currentValue: currentValue,
                      options: null,
                      fullProperty: prop
                    };
                  }
                }
              }
            }
          }
          
          // Специальное логирование для свойства View
          if (viewPropertyDetails) {
            Logger.debug(`      🎯 ДЕТАЛЬНАЯ ИНФОРМАЦИЯ О СВОЙСТВЕ "View":`);
            Logger.debug(`         - Ключ свойства: "${viewPropertyDetails.key}"`);
            Logger.debug(`         - Тип свойства: ${viewPropertyDetails.type}`);
            Logger.debug(`         - Текущее значение: "${viewPropertyDetails.currentValue}"`);
            if (viewPropertyDetails.options) {
              Logger.debug(`         - ✅ Это variant property с options:`);
              Logger.debug(`         - 📝 Все доступные значения для View: [${viewPropertyDetails.options.map((o: string) => `"${String(o)}"`).join(', ')}]`);
              Logger.debug(`         - 📊 Количество вариантов: ${viewPropertyDetails.options.length}`);
            } else {
              Logger.debug(`         - ⚠️ Это НЕ variant property (нет options)`);
              const propStr = viewPropertyDetails.fullProperty && typeof viewPropertyDetails.fullProperty === 'object' 
                ? JSON.stringify(viewPropertyDetails.fullProperty, null, 2)
                : String(viewPropertyDetails.fullProperty);
              Logger.debug(`         - 🔍 Полная структура свойства:`, propStr);
            }
          } else {
            Logger.warn(`      ⚠️ Свойство "View" не найдено в componentProperties!`);
          }
          
          // Устанавливаем свойство View (с заглавной буквы, как показано в логах)
          // Это строковое свойство компонента, обрабатываем его напрямую
          const targetViewValue = data.barometerView;
          
          Logger.debug(`      🔧 Устанавливаем View=${targetViewValue} для инстанса "EPriceBarometer" (строковое свойство)`);
          
          // Ищем полный ключ свойства View в componentProperties (используем уже объявленную переменную allProps)
          let viewPropertyKey: string | null = null;
          
          for (const propKey in allProps) {
            if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
              const propKeyWithoutId = propKey.split('#')[0];
              if (propKeyWithoutId === 'View' || propKey.startsWith('View')) {
                viewPropertyKey = propKey;
                Logger.debug(`      🔍 Найден ключ свойства: "${viewPropertyKey}"`);
                break;
              }
            }
          }
          
          // Используем функцию processStringProperty для установки строкового свойства
          const viewSet = processStringProperty(
            ePriceBarometerInstance, 
            'View', 
            targetViewValue, 
            '#EPriceBarometer_View',
            viewPropertyKey || undefined
          );
          
          if (!viewSet) {
            Logger.warn(`      ⚠️ Не удалось установить свойство "View" в инстансе "EPriceBarometer"`);
            Logger.warn(`      💡 Возможно, значение "${targetViewValue}" не существует в вариантах компонента. Проверьте доступные варианты.`);
          }
        } else {
          Logger.debug(`      ⚠️ Инстанс "EPriceBarometer" не найден в контейнере "${containerName}"`);
        }
      }
    }

    // ОПТИМИЗАЦИЯ 5: Загрузка изображений с кешем, таймаутом и пулом параллелизма
    if (imageLayers.length > 0) {
      const imagesStartTime = Date.now();
      Logger.info(`🖼️ Загружаем ${imageLayers.length} изображений с ограниченным параллелизмом...`);
      
      // Обертываем весь блок обработки изображений в try-catch для защиты от ошибок
      try {

      const imageCache: { [url: string]: Promise<Uint8Array> } = {};
      // Таймаут для загрузки изображения (мс) - увеличен для надежности
      const IMAGE_TIMEOUT_MS = 30000;
      // Максимальный размер изображения (10MB) для предотвращения перегрузки WebAssembly
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
      
      const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
        return new Promise(function(resolve, reject) {
          let settled = false;
          const timer = setTimeout(function() {
            if (!settled) {
              settled = true;
              reject(new Error('Timeout ' + timeoutMs + 'ms'));
            }
          }, timeoutMs);
          fetch(url).then(function(res) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(res);
          }).catch(function(err) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(err);
          });
        });
      };
      
      // Функция проверки формата изображения по сигнатурам
      const isValidImageFormat = (bytes: Uint8Array): boolean => {
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
      };
      
      const loadImageCached = (url: string): Promise<Uint8Array> => {
        if (!imageCache[url]) {
          imageCache[url] = (async () => {
            // Первая попытка с таймаутом, затем одна попытка без таймаута
            let response: Response;
            try {
              response = await fetchWithTimeout(url, IMAGE_TIMEOUT_MS);
            } catch (e) {
              Logger.warn('⏱️ Повторная попытка загрузки без таймаута:', url, e);
              response = await fetch(url);
            }
            if (!response.ok) {
              throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            
            // ВАЛИДАЦИЯ: Проверяем, что данные не пустые
            if (!bytes || bytes.length === 0) {
              throw new Error(`Пустой ответ от сервера для: ${url}`);
            }
            
            // ВАЛИДАЦИЯ: Проверяем размер изображения
            if (bytes.length > MAX_IMAGE_SIZE) {
              throw new Error(`Изображение слишком большое (${Math.round(bytes.length / 1024 / 1024)}MB, максимум ${MAX_IMAGE_SIZE / 1024 / 1024}MB): ${url}`);
            }
            
            // ВАЛИДАЦИЯ: Проверяем формат изображения
            if (!isValidImageFormat(bytes)) {
              throw new Error(`Неподдерживаемый формат изображения для: ${url}`);
            }
            
            return bytes;
          })();
        }
        return imageCache[url];
      };

      // Обрабатываем изображения с ограниченным параллелизмом (3 одновременно)
      const MAX_CONCURRENT_IMAGES = 3;
      let imagesProcessed = 0;
      let imagesSuccessful = 0;
      let imagesFailed = 0;
      
      // Хранилище для списка фавиконок из спрайта
      // Формат: { urls: string[], currentIndex: number }
      // currentIndex - текущий индекс в списке (увеличивается для каждого следующего сниппета)
      let spriteFaviconList: { urls: string[]; currentIndex: number } | null = null;
      
      // Функция обработки одного изображения
      const processImage = async (item: typeof imageLayers[0], index: number): Promise<void> => {
        Logger.debug(`🖼️ [${index + 1}/${imageLayers.length}] Обработка изображения "${item.fieldName}"`);
        
        try {
          // ============================================
          // ЧАСТЬ 1: ПАРСИНГ URL (СОХРАНЯЕМ БЕЗ ИЗМЕНЕНИЙ)
          // ============================================
          
          // Простая проверка наличия значения
          if (!item.fieldValue || typeof item.fieldValue !== 'string') {
            Logger.warn(`⚠️ Пропускаем "${item.fieldName}" - нет URL`);
            imagesFailed++;
            return;
          }
          
          // Парсим URL, позицию спрайта и размер из формата "url|position|size" или "url|position"
          // Также проверяем формат "SPRITE_LIST:url1|url2|url3|..." для списка фавиконок
          let imgUrl = String(item.fieldValue).trim();
          let spritePosition: string | null = null;
          let spriteSize: string | null = null;
          
          // Проверяем, является ли это фавиконкой (для применения логики списка)
          const isFavicon = item.fieldName.toLowerCase().includes('favicon');
          
          // Дополнительное логирование для фавиконок
          if (isFavicon) {
            Logger.debug(`   🔍 [FAVICON DEBUG] fieldName="${item.fieldName}", fieldValue="${item.fieldValue?.substring(0, 100)}...", rowIndex=${item.rowIndex}, spriteFaviconList=${spriteFaviconList ? `exists (index=${spriteFaviconList.currentIndex}/${spriteFaviconList.urls.length})` : 'null'}`);
          }
          
          // Проверяем, является ли это списком фавиконок из спрайта
          if (imgUrl.startsWith('SPRITE_LIST:')) {
            if (!isFavicon) {
              Logger.warn(`   ⚠️ SPRITE_LIST найден в не-фавиконке "${item.fieldName}", пропускаем`);
              imagesFailed++;
              return;
            }
            const listData = imgUrl.substring('SPRITE_LIST:'.length);
            const urls = listData.split('|').filter(url => url.trim().length > 0);
            if (urls.length > 0) {
              // Проверяем, можем ли мы использовать существующий список
              // Если список уже существует и currentIndex в пределах списка, используем следующий URL
              if (spriteFaviconList && spriteFaviconList.currentIndex < spriteFaviconList.urls.length) {
                // Используем существующий список - берем URL по текущему индексу
                imgUrl = spriteFaviconList.urls[spriteFaviconList.currentIndex];
                Logger.debug(`   🎯 Используем фавиконку из существующего списка для строки ${item.rowIndex} (индекс ${spriteFaviconList.currentIndex}/${spriteFaviconList.urls.length - 1}): ${imgUrl.substring(0, 80)}...`);
                // Увеличиваем индекс для следующего сниппета
                spriteFaviconList.currentIndex++;
              } else {
                // Создаем новый список (или список закончился, начинаем заново)
                spriteFaviconList = { urls: urls, currentIndex: 1 }; // currentIndex = 1, т.к. используем urls[0]
                imgUrl = urls[0];
                Logger.debug(`   🎯 Список фавиконок из спрайта обнаружен для строки ${item.rowIndex}: ${urls.length} адресов, применяем первый (индекс 0): ${imgUrl.substring(0, 80)}...`);
              }
              
              // Обновляем ShopName для текущего сниппета на основе используемого URL
              try {
                const urlMatch = imgUrl.match(/\/favicon\/v2\/([^?]+)/);
                if (urlMatch && urlMatch[1]) {
                  const decodedHost = decodeURIComponent(urlMatch[1]);
                  const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
                  const hostname = hostUrl.hostname;
                  // Обновляем ShopName в данных строки, если он еще не установлен
                  if (item.row) {
                    item.row['#ShopName'] = hostname;
                    item.row['#OrganicHost'] = hostname;
                    
                    // Обновляем ShopName в текстовых слоях, если они уже обработаны
                    // Ищем текстовые слои с тем же rowIndex и полем #ShopName
                    const shopNameLayers = textLayersAll.filter(tl => 
                      tl.rowIndex === item.rowIndex && 
                      tl.fieldName.toLowerCase().includes('shopname')
                    );
                    for (const shopLayer of shopNameLayers) {
                      try {
                        if (shopLayer.layer.type === 'TEXT') {
                          (shopLayer.layer as TextNode).characters = hostname;
                        } else if (shopLayer.layer.type === 'INSTANCE') {
                          const instance = shopLayer.layer as InstanceNode;
                          if ('children' in instance && instance.children) {
                            for (const child of instance.children) {
                              if (child.type === 'TEXT' && !child.removed) {
                                if (child.name === shopLayer.fieldName || child.name.toLowerCase().includes('shopname')) {
                                  (child as TextNode).characters = hostname;
                                  break;
                                }
                              }
                            }
                          }
                        }
                      } catch (e) {
                        // Игнорируем ошибки обновления текста
                      }
                    }
                  }
                }
              } catch (e) {
                // Игнорируем ошибки парсинга URL
              }
            } else {
              Logger.warn(`   ⚠️ Пустой список фавиконок в SPRITE_LIST`);
              imagesFailed++;
              return;
            }
          } else if (isFavicon && spriteFaviconList) {
            // Используем URL из сохраненного списка на основе currentIndex
            if (spriteFaviconList.currentIndex < spriteFaviconList.urls.length) {
              // Используем URL из списка по текущему индексу
              imgUrl = spriteFaviconList.urls[spriteFaviconList.currentIndex];
              Logger.debug(`   🎯 Используем фавиконку из списка для строки ${item.rowIndex} (индекс ${spriteFaviconList.currentIndex}/${spriteFaviconList.urls.length - 1}): ${imgUrl.substring(0, 80)}...`);
              // Увеличиваем индекс для следующего сниппета
              spriteFaviconList.currentIndex++;
            } else {
              // Список закончился - сбрасываем
              Logger.debug(`   ⚠️ Список фавиконок закончился (индекс ${spriteFaviconList.currentIndex} >= ${spriteFaviconList.urls.length}), сбрасываем список`);
              spriteFaviconList = null;
              // Продолжаем обработку как обычную фавиконку (но у нас нет URL, так что это ошибка)
              Logger.warn(`   ⚠️ Нет URL для фавиконки в строке ${item.rowIndex}`);
              imagesFailed++;
              return;
            }
            
            // Обновляем ShopName для текущего сниппета на основе соответствующего URL из списка
            try {
              const urlMatch = imgUrl.match(/\/favicon\/v2\/([^?]+)/);
              if (urlMatch && urlMatch[1]) {
                const decodedHost = decodeURIComponent(urlMatch[1]);
                const hostUrl = new URL(decodedHost.startsWith('http') ? decodedHost : `https://${decodedHost}`);
                const hostname = hostUrl.hostname;
                // Обновляем ShopName в данных строки
                if (item.row) {
                  item.row['#ShopName'] = hostname;
                  item.row['#OrganicHost'] = hostname;
                  
                  // Обновляем ShopName в текстовых слоях, если они уже обработаны
                  // Ищем текстовые слои с тем же rowIndex и полем #ShopName
                  const shopNameLayers = textLayersAll.filter(tl => 
                    tl.rowIndex === item.rowIndex && 
                    tl.fieldName.toLowerCase().includes('shopname')
                  );
                  for (const shopLayer of shopNameLayers) {
                    try {
                      if (shopLayer.layer.type === 'TEXT') {
                        (shopLayer.layer as TextNode).characters = hostname;
                      } else if (shopLayer.layer.type === 'INSTANCE') {
                        const instance = shopLayer.layer as InstanceNode;
                        if ('children' in instance && instance.children) {
                          for (const child of instance.children) {
                            if (child.type === 'TEXT' && !child.removed) {
                              if (child.name === shopLayer.fieldName || child.name.toLowerCase().includes('shopname')) {
                                (child as TextNode).characters = hostname;
                                break;
                              }
                            }
                          }
                        }
                      }
                    } catch (e) {
                      // Игнорируем ошибки обновления текста
                    }
                  }
                }
              }
            } catch (e) {
              // Игнорируем ошибки парсинга URL
            }
          } else {
            // Обычный формат: проверяем на спрайт с позицией
            const spriteMatch = imgUrl.match(/^(.+)\|(.+?)(?:\|(.+))?$/);
            if (spriteMatch) {
              imgUrl = spriteMatch[1];
              spritePosition = spriteMatch[2].trim();
              spriteSize = spriteMatch[3] ? spriteMatch[3].trim() : null;
              Logger.debug(`   🎯 Спрайт обнаружен, позиция: ${spritePosition}${spriteSize ? `, размер: ${spriteSize}` : ''}`);
            }
            // Не сбрасываем список для обычных фавиконок, так как они могут быть из той же серии
            // Список будет сброшен только если он закончился или встретили новый SPRITE_LIST:
          }
          
          // Простая проверка формата URL
          if (!imgUrl.startsWith('http://') && !imgUrl.startsWith('https://') && !imgUrl.startsWith('//')) {
            Logger.warn(`⚠️ Пропускаем "${item.fieldName}" - некорректный URL: ${imgUrl.substring(0, 50)}...`);
            imagesFailed++;
            return;
          }
          
          // Нормализуем URL
          if (imgUrl.startsWith('//')) {
            imgUrl = 'https:' + imgUrl;
          }
          
          Logger.debug(`   📍 URL: ${imgUrl.substring(0, 80)}...`);
          
          // ============================================
          // ЧАСТЬ 2: ЗАГРУЗКА И ПРИМЕНЕНИЕ ИЗОБРАЖЕНИЯ
          // ============================================
          
          // Загружаем байты изображения
          let imageBytes: Uint8Array;
          try {
            imageBytes = await loadImageCached(imgUrl);
            Logger.debug(`   ✅ Загружено ${Math.round(imageBytes.length / 1024)}KB`);
          } catch (loadError) {
            Logger.error(`   ❌ Ошибка загрузки:`, loadError);
            imagesFailed++;
            return;
          }
          
          // Проверяем слой перед обработкой
          if (item.layer.removed) {
            Logger.warn(`   ⚠️ Слой удален, пропускаем`);
            imagesFailed++;
            return;
          }
          
          const layerType = item.layer.type;
          if (layerType !== 'RECTANGLE' && layerType !== 'ELLIPSE' && layerType !== 'POLYGON') {
            Logger.warn(`   ⚠️ Неподдерживаемый тип слоя: ${layerType}`);
            imagesFailed++;
            return;
          }
          
          // Создаем изображение в Figma
          let figmaImage: Image;
          try {
            figmaImage = figma.createImage(imageBytes);
            if (!figmaImage || !figmaImage.hash) {
              throw new Error('Не удалось создать изображение');
            }
            Logger.debug(`   ✅ Изображение создано в Figma`);
          } catch (createError) {
            Logger.error(`   ❌ Ошибка создания изображения:`, createError);
            imagesFailed++;
            return;
          }
          
          // Применяем изображение к слою с поддержкой спрайтов
          try {
            if (spritePosition && (layerType === 'RECTANGLE' || layerType === 'ELLIPSE' || layerType === 'POLYGON')) {
              const layer = item.layer as RectangleNode | EllipseNode | PolygonNode;
              
              let bgOffsetX = 0;
              let bgOffsetY = 0;
              
              // Парсим все значения в px из строки
              const pxValues = spritePosition.match(/(-?\d+(?:\.\d+)?)px/g);
              if (pxValues) {
                if (pxValues.length === 1) {
                  const value = parseFloat(pxValues[0]);
                  const lowerPos = spritePosition.toLowerCase();
                  if (lowerPos.includes('x') && !lowerPos.includes('y')) {
                    bgOffsetX = value;
                  } else if (lowerPos.includes('y') && !lowerPos.includes('x')) {
                    bgOffsetY = value;
                  } else {
                    if (spritePosition.match(/0px\s*[-\d]/)) {
                      bgOffsetY = value;
                    } else {
                      bgOffsetX = value;
                    }
                  }
                } else if (pxValues.length >= 2) {
                  bgOffsetX = parseFloat(pxValues[0]) || 0;
                  bgOffsetY = parseFloat(pxValues[1]) || 0;
                }
              } else {
                const numValues = spritePosition.match(/(-?\d+(?:\.\d+)?)/g);
                if (numValues) {
                  if (numValues.length === 1) {
                    bgOffsetX = parseFloat(numValues[0]) || 0;
                  } else {
                    bgOffsetX = parseFloat(numValues[0]) || 0;
                    bgOffsetY = parseFloat(numValues[1]) || 0;
                  }
                }
              }
              
              const isHorizontalSprite = bgOffsetX !== 0 && bgOffsetY === 0;
              const isVerticalSprite = bgOffsetX === 0 && bgOffsetY !== 0;
              
              // Получаем размеры слоя для правильного масштабирования
              const layerWidth = layer.width;
              const layerHeight = layer.height;
              
              // Определяем размер одного элемента спрайта
              let spriteItemSize = 16; // По умолчанию
              
              // Если размер указан в данных (background-size из CSS)
              if (spriteSize) {
                const sizeMatch = spriteSize.match(/(\d+(?:\.\d+)?)px/i);
                if (sizeMatch) {
                  spriteItemSize = parseFloat(sizeMatch[1]) || 16;
                  Logger.debug(`   📏 Размер элемента спрайта из CSS: ${spriteItemSize}px`);
                }
              } else {
                if (isVerticalSprite && bgOffsetY !== 0) {
                  const absOffset = Math.abs(bgOffsetY);
                  if (absOffset % 32 === 0) spriteItemSize = 32;
                  else if (absOffset % 20 === 0) spriteItemSize = 20;
                  else if (absOffset % 16 === 0) spriteItemSize = 16;
                  else spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
                } else if (isHorizontalSprite && bgOffsetX !== 0) {
                  const absOffset = Math.abs(bgOffsetX);
                  if (absOffset % 32 === 0) spriteItemSize = 32;
                  else if (absOffset % 20 === 0) spriteItemSize = 20;
                  else if (absOffset % 16 === 0) spriteItemSize = 16;
                  else spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
                } else {
                  spriteItemSize = Math.min(layerWidth, layerHeight) || 16;
                }
                Logger.debug(`   📏 Размер элемента спрайта вычислен: ${spriteItemSize}px`);
              }
              
              // Многоэтапное применение спрайта:
              // 1. Вычисляем масштаб для сохранения пропорций

