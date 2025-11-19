
// Рекурсивная функция для обработки Variant Properties во вложенных инстансах
// Возвращает true, если хотя бы один Variant Property был обработан
// Опционально можно ограничить обработку только инстансами с определенными именами
function processVariantPropertyRecursive(node: SceneNode, value: string, fieldName: string, allowedInstanceNames?: string[]): boolean {
  try {
    if (node.removed) return false;
    
    let processed = false;
    
    // Если это инстанс, обрабатываем Variant Property
    if (node.type === 'INSTANCE') {
      const instance = node as InstanceNode;
      
      // Если указаны разрешенные имена, проверяем, что инстанс в списке
      if (allowedInstanceNames && allowedInstanceNames.length > 0) {
        if (!allowedInstanceNames.includes(instance.name)) {
          // Пропускаем инстанс, но продолжаем рекурсивный обход
        } else {
          // Инстанс в списке разрешенных - обрабатываем
          processed = processVariantProperty(instance, value, fieldName);
        }
      } else {
        // Ограничений нет - обрабатываем все инстансы
        processed = processVariantProperty(instance, value, fieldName);
      }
    }
    
    // Рекурсивно обрабатываем дочерние элементы
    if ('children' in node && node.children) {
      for (const child of node.children) {
        if (!child.removed) {
          const childProcessed = processVariantPropertyRecursive(child, value, fieldName, allowedInstanceNames);
          processed = processed || childProcessed;
        }
      }
    }
    
    return processed;
  } catch (e) {
    Logger.error(`   ❌ [Recursive] Ошибка при рекурсивном обходе:`, e);
    // Игнорируем ошибки при рекурсивном обходе
    return false;
  }
}
figma.ui.onmessage = async (msg) => {
  Logger.info('📨 Получено сообщение от UI:', msg.type);
  
  if (msg.type === 'test') {
    Logger.info('✅ Получено тестовое сообщение:', msg.message);
    figma.ui.postMessage({
      type: 'log',
      message: 'Плагин работает!'
    });
    return;
  }
  
  if (msg.type === 'get-theme') {
    Logger.info('🎨 Запрос темы от UI');
    figma.ui.postMessage({
      type: 'log',
      message: 'Тема применена автоматически'
    });
    return;
  }
  
  if (msg.type === 'close') {
    Logger.info('🚪 Закрытие плагина');
    figma.closePlugin();
    return;
  }
  
  if (msg.type === 'get-pages') {
    Logger.info('📄 Запрос списка страниц от UI');
    const pages = figma.root.children.map(page => page.name);
    figma.ui.postMessage({
      type: 'pages',
      pages: pages
    });
    return;
  }
  
  if (msg.type === 'check-selection') {
    const hasSelection = figma.currentPage.selection.length > 0;
    figma.ui.postMessage({
      type: 'selection-status',
      hasSelection: hasSelection
    });
    return;
  }
  
  if (msg.type === 'import-csv') {
    const startTime = Date.now();
    Logger.info('🔄 Начинаем оптимизированную обработку данных');
    
    const rows = msg.rows || [];
    const scope = msg.scope || 'page';
    const filter = msg.filter || '';

    Logger.info(`📊 Получено ${rows.length} строк данных`);
    Logger.info(`📍 Область: ${scope}`);
    
    const logTiming = (stage: string) => {
      const elapsed = Date.now() - startTime;
      Logger.info(`⏱️ [${elapsed}ms] ${stage}`);
    };

    // Определяем область поиска
    let searchNodes: readonly SceneNode[] = [];
    if (scope === 'selection') {
      searchNodes = figma.currentPage.selection;
      Logger.info(`🎯 Найдено ${searchNodes.length} выбранных элементов`);
      
      if (searchNodes.length === 0) {
        figma.notify('❌ Нет выбранных элементов');
        return;
      }
    } else {
      searchNodes = figma.currentPage.children;
      Logger.info(`🎯 Поиск по всей странице: ${searchNodes.length} элементов`);
    }
    
    // ОПТИМИЗИРОВАННАЯ ЛОГИКА: собираем слои с # и обрабатываем их
    Logger.info(`🔄 Начинаем оптимизированную обработку`);
    
    // Собираем все слои с # в порядке их появления в документе
    const allHashLayers: SceneNode[] = [];
    
    const collectAllHashLayers = (nodes: readonly SceneNode[]): void => {
      for (const node of nodes) {
        if (node.name.startsWith('#')) {
          allHashLayers.push(node);
        }
        
        // Рекурсивно ищем в дочерних элементах
        if ('children' in node && node.children) {
          collectAllHashLayers(node.children);
        }
      }
    };
    
    collectAllHashLayers(searchNodes);
    Logger.info(`📋 Найдено ${allHashLayers.length} слоев с #`);
    logTiming('Поиск слоев завершен');
    
    // Логируем найденные поля для отладки
    const fieldNames = allHashLayers.map(layer => layer.name);
    Logger.debug(`🔍 Найденные поля:`, fieldNames.slice(0, 20)); // первые 20
    
    if (allHashLayers.length === 0) {
      figma.notify('❌ Нет слоев с # для заполнения');
      return;
    }

            // ПРОСТОЙ АЛГОРИТМ: Группировка по конкретным именам контейнеров
            const snippetGroups = new Map<string, SceneNode[]>();
            
            // Конкретные имена контейнеров-сниппетов
            const snippetContainerNames = ['Snippet', 'ESnippet', 'EProductSnippet', 'EOfferItem', 'EShopItem'];
            
            // ОПТИМИЗАЦИЯ: Кэш для проверки selection (создаем Set для быстрого поиска)
            const searchNodesSet = scope === 'selection' ? new Set(searchNodes) : null;
            
            // Функция для поиска контейнера с конкретным именем
            const findNamedSnippetContainer = (layer: SceneNode): BaseNode | null => {
              let current: BaseNode | null = layer.parent;
              
              while (current) {
                // Проверяем точное совпадение имени
                if (snippetContainerNames.includes(current.name)) {
                  // Для selection: быстрая проверка через Set
                  if (scope === 'selection' && searchNodesSet) {
                    // Проверяем, что контейнер или его родители в выделении
                    let checkNode: BaseNode | null = current;
                    let found = false;
                    while (checkNode) {
                      if (searchNodesSet.has(checkNode as SceneNode)) {
                        found = true;
                        break;
                      }
                      checkNode = checkNode.parent;
                    }
                    if (!found) {
                    return null; // Контейнер вне выделения
                    }
                  }
                  return current;
                }
                current = current.parent;
              }
              
              return null; // Не нашли подходящий контейнер
            };
            
            // ОПТИМИЗАЦИЯ: Кэшируем результаты проверок для ускорения
            const containerCache = new Map<SceneNode, BaseNode | null>();
            
            // Группируем слои по их контейнерам-сниппетам
            for (const layer of allHashLayers) {
              try {
                // Быстрая проверка removed без полной проверки доступности
                if (layer.removed) continue;
                
                const layerName = safeGetLayerName(layer);
                if (!layerName) continue;
                
                // Используем кэш для поиска контейнера
                let snippetContainer = containerCache.get(layer);
                if (snippetContainer === undefined) {
                  snippetContainer = findNamedSnippetContainer(layer);
                  containerCache.set(layer, snippetContainer);
                }
                
                if (snippetContainer && !snippetContainer.removed) {
                  try {
                    const containerKey = snippetContainer.id;
                  
                  if (!snippetGroups.has(containerKey)) {
                    snippetGroups.set(containerKey, []);
                  }
                  snippetGroups.get(containerKey)!.push(layer);
                  } catch (propError) {
                    // Пропускаем проблемные контейнеры
                    continue;
                  }
                }
              } catch (groupError) {
                // Продолжаем обработку других слоев
                continue;
              }
            }
            
            // Логируем итоговые группы
            Logger.info(`📊 Создано ${snippetGroups.size} групп сниппетов:`);
    logTiming('Группировка сниппетов завершена');
            for (const [containerKey, layers] of snippetGroups) {
              try {
                // КРИТИЧЕСКОЕ: Проверяем, что первый слой не удален перед обращением к его свойствам
                const firstLayer = layers[0];
                let containerName = 'Unknown';
                if (firstLayer && !firstLayer.removed) {
                  try {
                    const parent = firstLayer.parent;
                    if (parent && !parent.removed) {
                      containerName = parent.name || 'Unknown';
                    }
                  } catch (parentError) {
                    Logger.warn(`⚠️ Ошибка получения имени контейнера для ${containerKey}:`, parentError);
                  }
                }
                Logger.debug(`📦 "${containerName}" (${containerKey}): ${layers.length} слоев`);
              } catch (logError) {
                Logger.error(`❌ Ошибка логирования группы ${containerKey}:`, logError);
              }
            }
            
            // Используем созданные группы
            const finalContainerMap = snippetGroups;
    
    // Теперь назначаем строки контейнерам и создаем layerData
    const normalizeFieldName = (name: string): string => name ? String(name).trim().toLowerCase() : '';
    interface LayerDataItem {
      layer: SceneNode;
      rowIndex: number;
      fieldName: string;
      fieldValue: string | undefined;
      isImage: boolean;
      isText: boolean;
      isShape: boolean;
      row: { [key: string]: string } | null; // Ссылка на данные строки для обновления
    }
    const layerData: LayerDataItem[] = [];
    let nextRowIndex = 0;
    
    Logger.info(`📊 Назначаем строки для ${finalContainerMap.size} контейнеров (всего строк: ${rows.length})`);
    
    for (const [containerKey, layers] of finalContainerMap) {
      try {
        if (!layers || layers.length === 0) {
          nextRowIndex++;
          continue;
        }
        
        // ОПТИМИЗАЦИЯ: Быстрая фильтрация только по removed (без полной проверки доступности)
        const validLayers = layers.filter(layer => !layer.removed);
        
        if (validLayers.length === 0) {
          nextRowIndex++;
          continue;
        }
        
        const rowIndex = nextRowIndex % rows.length;
        const row = rows[rowIndex];
      
      // Подготавливаем карту ключей строки для нечувствительного к регистру поиска
      const rowKeyMap: { [key: string]: string } = {};
      try {
        for (const key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            rowKeyMap[normalizeFieldName(key)] = row[key];
          }
        }
      } catch (e) {
        // ignore
      }

        // Все слои в этом контейнере получают данные из одной строки
        // Отслеживаем дубликаты полей в контейнере - обновляем только первый слой с таким именем
        const processedFieldNames = new Set<string>();
        
        for (const layer of validLayers) {
          try {
            // Быстрая проверка removed
            if (layer.removed) continue;
            
            const fieldName = safeGetLayerName(layer);
            if (!fieldName) continue;
            
            // Пропускаем дубликаты полей
            if (processedFieldNames.has(fieldName)) continue;
            processedFieldNames.add(fieldName);
            
            const normName = normalizeFieldName(fieldName);
            const direct = row[fieldName];
            const fallback = rowKeyMap[normName];
            const fieldValue = (direct !== undefined && direct !== null ? direct : fallback);
            
            // ДИАГНОСТИКА: Логируем FaviconImage на этапе создания layerData
            const isFaviconField = normalizeFieldName(fieldName).includes('favicon');
            if (isFaviconField) {
              Logger.debug(`🔍 [DIAGNOSTIC] Найден FaviconImage слой: fieldName="${fieldName}", fieldValue="${fieldValue !== undefined && fieldValue !== null ? String(fieldValue).substring(0, 100) : 'null/undefined'}..."`);
            }
            
            // Пропускаем пустые значения
            if (fieldValue === undefined || fieldValue === null || 
                (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
              // ДИАГНОСТИКА: Логируем, если это favicon с пустым значением
              if (isFaviconField) {
                Logger.debug(`⚠️ [DIAGNOSTIC] FaviconImage слой "${fieldName}" пропущен из-за пустого fieldValue`);
              }
              continue;
            }
            
            const layerType = safeGetLayerType(layer);
            if (!layerType) {
              // ДИАГНОСТИКА: Логируем, если это favicon без типа слоя
              if (isFaviconField) {
                Logger.debug(`⚠️ [DIAGNOSTIC] FaviconImage слой "${fieldName}" пропущен из-за отсутствия layerType`);
              }
              continue;
            }
          
            // Определяем тип слоя
          let isTextLayer = layerType === 'TEXT';
          const isImageLayer = normalizeFieldName(fieldName).endsWith('image');
          const isShapeLayer = layerType === 'RECTANGLE' || layerType === 'ELLIPSE' || layerType === 'POLYGON';
          
          // ДИАГНОСТИКА: Логируем для favicon, определяется ли он как изображение
          if (isFaviconField) {
            Logger.debug(`🔍 [DIAGNOSTIC] FaviconImage слой "${fieldName}": layerType="${layerType}", isImageLayer=${isImageLayer}`);
          }
          
          if (layerType === 'INSTANCE') {
            const textFieldNames = ['#organicTitle', '#shoptitle', '#shopname', '#brand', '#organicprice', '#oldprice', '#organictext'];
            if (textFieldNames.includes(normalizeFieldName(fieldName))) {
              isTextLayer = true;
            }
          }
          
            layerData.push({
              layer,
              rowIndex,
              fieldName,
              fieldValue,
              isImage: isImageLayer,
              isText: isTextLayer,
              isShape: isShapeLayer,
              row: row // Сохраняем ссылку на строку для обновления данных
            });
          } catch (layerError) {
            // Продолжаем обработку других слоев
            continue;
          }
        }
        
        // Всегда двигаем индекс строки — одна группа = одна строка
        nextRowIndex++;
      } catch (containerError) {
        Logger.error(`❌ Ошибка обработки контейнера ${containerKey}:`, containerError);
        // Продолжаем обработку других контейнеров
        nextRowIndex++;
      }
    }
    
    Logger.info(`📊 Создано ${layerData.length} элементов layerData`);
    
    const textCount = layerData.filter(item => item.isText).length;
    const imageCount = layerData.filter(item => item.isImage).length;
    const shapeCount = layerData.filter(item => item.isShape).length;
    Logger.info(`📊 Типы слоев: ${textCount} текстовых, ${imageCount} изображений, ${shapeCount} фигур`);
    
    // Отладочная информация: какие типы слоев реально есть
    const layerTypes: { [key: string]: number } = {};
    layerData.forEach(item => {
      try {
        // КРИТИЧЕСКОЕ: Проверяем, что слой не удален перед обращением к его свойствам
        if (item.layer.removed) {
          return;
        }
        const type = item.layer.type;
        layerTypes[type] = (layerTypes[type] || 0) + 1;
      } catch (e) {
        // Игнорируем ошибки при получении типа слоя
      }
    });
    Logger.debug(`📊 Реальные типы слоев:`, layerTypes);
    
    // Проверяем, есть ли текстовые слои с данными
    const textLayersWithData = layerData.filter(item => item.isText && item.fieldValue !== undefined);
    Logger.debug(`📊 Текстовых слоев с данными: ${textLayersWithData.length}`);
    if (textCount > 0 && textLayersWithData.length === 0) {
      const sample = layerData.filter(item => item.isText).slice(0, 3);
      Logger.warn(`⚠️ Текстовые слои без данных! Примеры:`, sample.map(item => {
        try {
          // КРИТИЧЕСКОЕ: Проверяем, что слой не удален перед обращением к его свойствам
          if (item.layer.removed) {
            return { name: item.fieldName, type: 'REMOVED', hasValue: false, rowIndex: item.rowIndex };
          }
          return {
            name: item.fieldName,
            type: item.layer.type,
            hasValue: item.fieldValue !== undefined,
            rowIndex: item.rowIndex
          };
        } catch (e) {
          return { name: item.fieldName, type: 'ERROR', hasValue: false, rowIndex: item.rowIndex };
        }
      }));
    }

    // ОПТИМИЗАЦИЯ 2: Быстрая фильтрация слоев (убрана медленная проверка видимости родителей)
    const filterLower = filter ? filter.toLowerCase() : '';
    const filteredLayers = layerData.filter(item => {
      try {
        // Быстрые проверки без обращения к родителям
        if (item.layer.removed || item.layer.locked || !item.layer.visible) return false;
        if (filterLower && !item.fieldName.toLowerCase().includes(filterLower)) return false;
        return true;
      } catch (e) {
        // Игнорируем ошибки при фильтрации - исключаем проблемные слои
        return false;
      }
    });

    Logger.info(`📊 Обрабатываем ${filteredLayers.length} слоев из ${allHashLayers.length}`);

    // Обработка property Brand для инстансов сниппетов (fallback для обратной совместимости)
    // Если нет значения #Brand в обрабатываемых данных, устанавливаем property Brand в False
    // Используем новую универсальную функцию processVariantProperty
    const brandSnippetContainerNames = ['Snippet', 'ESnippet', 'EProductSnippet', 'EOfferItem', 'EShopItem'];
    
    // Группируем layerData по контейнерам сниппетов и проверяем наличие #Brand
    const containersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasBrandValue: boolean;
    }>();
    
    for (const item of layerData) {
      if (!item.row) continue;
      
      // Находим контейнер сниппета (Snippet, ESnippet и т.д.)
      let container: BaseNode | null = item.layer.parent;
      let containerKey: string | null = null;
      
      while (container) {
        if (brandSnippetContainerNames.includes(container.name)) {
          containerKey = container.id;
          break;
        }
        container = container.parent;
      }
      
      if (!containerKey) continue;
      
      // Проверяем, есть ли слой #Brand с непустым значением для этого контейнера
      const isBrandField = normalizeFieldName(item.fieldName) === 'brand';
      const brandValueStr = item.fieldValue ? String(item.fieldValue).trim() : '';
      // Игнорируем Variant Property синтаксис (формат PropertyName=value)
      const isVariantPropertySyntax = /^[^=\s]+=.+$/.test(brandValueStr);
      const hasBrandValue = isBrandField && 
                            item.fieldValue !== undefined && 
                            item.fieldValue !== null && 
                            brandValueStr !== '' &&
                            !isVariantPropertySyntax; // Игнорируем Variant Property синтаксис
      
      if (!containersMap.has(containerKey)) {
        containersMap.set(containerKey, { 
          row: item.row, 
          container: container,
          hasBrandValue: hasBrandValue
        });
      } else {
        // Если уже есть запись, обновляем hasBrandValue (если нашли #Brand с значением)
        const existing = containersMap.get(containerKey)!;
        if (hasBrandValue) {
          existing.hasBrandValue = true;
        }
      }
    }
    
    // Обрабатываем каждый контейнер: если нет значения #Brand, устанавливаем Brand=false через новую функцию
    Logger.debug(`🔍 [Brand Logic] Обработка ${containersMap.size} контейнеров сниппетов...`);
    for (const [containerKey, data] of containersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasBrandValue=${data.hasBrandValue}`);
      
      // Если нет значения #Brand в обрабатываемых данных, выключаем property Brand
      if (!data.hasBrandValue) {
        Logger.debug(`   🔧 Устанавливаем Brand=false для контейнера "${containerName}"`);
        // Используем новую универсальную функцию для установки Brand=false
        try {
          if (data.container.type === 'INSTANCE' && !data.container.removed) {
            const containerInstance = data.container as InstanceNode;
            // Проверяем, что это инстанс сниппета
            if (brandSnippetContainerNames.includes(containerInstance.name)) {
              Logger.debug(`      ✅ Контейнер "${containerInstance.name}" является инстансом, устанавливаем Brand=false`);
              // Обрабатываем сам инстанс и все вложенные инстансы сниппетов
              processVariantPropertyRecursive(containerInstance, 'Brand=false', '#Brand', brandSnippetContainerNames);
            } else {
              Logger.debug(`      ⏭️ Контейнер "${containerInstance.name}" не является инстансом сниппета`);
            }
          }
          
          // Также проверяем дочерние инстансы
          if ('children' in data.container) {
            Logger.debug(`      🔍 Поиск дочерних инстансов в "${containerName}"...`);
            for (const child of data.container.children) {
              if (child.type === 'INSTANCE' && !child.removed) {
                const instance = child as InstanceNode;
                if (brandSnippetContainerNames.includes(instance.name)) {
                  Logger.debug(`         ✅ Найден дочерний инстанс "${instance.name}", устанавливаем Brand=false`);
                  processVariantPropertyRecursive(instance, 'Brand=false', '#Brand', brandSnippetContainerNames);
                }
              }
            }
          }
        } catch (e) {
          Logger.error(`   ❌ Ошибка обработки контейнера "${containerName}":`, e);
        }
      } else {
        Logger.debug(`   ⏭️ Контейнер "${containerName}" имеет значение #Brand, пропускаем`);
      }
    }

    // Обработка EPriceGroup: установка Variant Properties "Discount" и "Old Price"
    // Если в строке данных есть поля #EPriceGroup_Discount или #EPriceGroup_OldPrice со значением 'true',
    // устанавливаем соответствующие свойства в true, иначе - в false
    Logger.debug(`🔍 [EPriceGroup Logic] Обработка EPriceGroup для сниппетов...`);
    
    // Функция для поиска инстанса EPriceGroup в контейнере
    const findEPriceGroupInstance = (node: BaseNode): InstanceNode | null => {
      if (node.type === 'INSTANCE' && node.name === 'EPriceGroup' && !node.removed) {
        return node as InstanceNode;
      }
      
      if ('children' in node && node.children) {
        for (const child of node.children) {
          const found = findEPriceGroupInstance(child);
          if (found) return found;
        }
      }
      
      return null;
    };
    
    // Группируем контейнеры по их ID и проверяем наличие полей EPriceGroup в соответствующих строках
    const ePriceGroupContainersMap = new Map<string, { 
      row: { [key: string]: string } | null; 
      container: BaseNode | null;
      hasDiscount: boolean;
      hasOldPrice: boolean;
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
      // Используем ту же логику, что и при создании layerData
      const containerIndex = Array.from(finalContainerMap.keys()).indexOf(containerKey);
      const rowIndex = containerIndex % rows.length;
      const row = rows[rowIndex];
      
      // Проверяем наличие полей #EPriceGroup_Discount и #EPriceGroup_OldPrice
      const hasDiscount = row && row['#EPriceGroup_Discount'] === 'true';
      const hasOldPrice = row && row['#EPriceGroup_OldPrice'] === 'true';
      
      // Сохраняем информацию о всех контейнерах (не только тех, где есть поля)
      ePriceGroupContainersMap.set(containerKey, { 
        row: row, 
        container: container,
        hasDiscount: hasDiscount || false,
        hasOldPrice: hasOldPrice || false
      });
    }
    
    // Обрабатываем каждый контейнер
    for (const [containerKey, data] of ePriceGroupContainersMap) {
      if (!data.container) continue;
      
      const containerName = data.container.name || 'Unknown';
      Logger.debug(`   📦 Контейнер "${containerName}" (${containerKey}): hasDiscount=${data.hasDiscount}, hasOldPrice=${data.hasOldPrice}`);
      
      // Ищем инстанс EPriceGroup в контейнере
      const ePriceGroupInstance = findEPriceGroupInstance(data.container);
      
      if (ePriceGroupInstance) {
        Logger.debug(`      ✅ Найден инстанс "EPriceGroup" в контейнере "${containerName}"`);
        
        // Устанавливаем Variant Properties: true если поля есть и равны 'true', иначе false
        if (data.hasDiscount) {
          Logger.debug(`      🔧 Устанавливаем Discount=true для инстанса "EPriceGroup"`);
          processVariantProperty(ePriceGroupInstance, 'Discount=true', '#EPriceGroup_Discount');
        } else {
          Logger.debug(`      🔧 Устанавливаем Discount=false для инстанса "EPriceGroup" (EPriceGroup-Pair не найден)`);
          processVariantProperty(ePriceGroupInstance, 'Discount=false', '#EPriceGroup_Discount');
        }
        
        if (data.hasOldPrice) {
          Logger.debug(`      🔧 Устанавливаем Old Price=true для инстанса "EPriceGroup"`);
          // Пробуем разные варианты названия свойства (с пробелом и без)
          if (!processVariantProperty(ePriceGroupInstance, 'Old Price=true', '#EPriceGroup_OldPrice')) {
            // Если не сработало, пробуем без пробела
            if (!processVariantProperty(ePriceGroupInstance, 'OldPrice=true', '#EPriceGroup_OldPrice')) {
              processVariantProperty(ePriceGroupInstance, 'Old_Price=true', '#EPriceGroup_OldPrice');
            }
          }
        } else {
          Logger.debug(`      🔧 Устанавливаем Old Price=false для инстанса "EPriceGroup" (EPriceGroup-Pair не найден)`);
          
          // Сначала выводим все свойства инстанса для отладки
          Logger.debug(`      📋 Все свойства инстанса "EPriceGroup" для отладки:`);
          const allProps = ePriceGroupInstance.componentProperties;
          for (const propKey in allProps) {
            if (Object.prototype.hasOwnProperty.call(allProps, propKey)) {
              const prop = allProps[propKey];
              if (prop && typeof prop === 'object') {
                if ('options' in prop) {
                  const propOptions = prop.options as readonly string[];
                  const currentValue = 'value' in prop ? prop.value : 'N/A';
                  Logger.debug(`         - "${propKey}" (variant): текущее="${currentValue}", опции=[${propOptions.map(o => String(o)).join(', ')}]`);
                } else if ('value' in prop) {
                  const currentValue = prop.value;
                  const valueType = typeof currentValue;
                  Logger.debug(`         - "${propKey}" (${valueType}): текущее="${currentValue}"`);
                }
              }
            }
          }
          
          // Пробуем разные варианты названия свойства (с пробелом и без)
          // Пробуем все варианты независимо от результата предыдущего
          let oldPriceSet = false;
          
          Logger.debug(`      🔄 Попытка 1: "Old Price=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old Price=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          Logger.debug(`      🔄 Попытка 2: "OldPrice=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'OldPrice=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          Logger.debug(`      🔄 Попытка 3: "Old_Price=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'Old_Price=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          // Также пробуем варианты с разными регистрами
          Logger.debug(`      🔄 Попытка 4: "old price=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'old price=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          Logger.debug(`      🔄 Попытка 5: "oldprice=false"`);
          oldPriceSet = processVariantProperty(ePriceGroupInstance, 'oldprice=false', '#EPriceGroup_OldPrice') || oldPriceSet;
          
          if (!oldPriceSet) {
            Logger.warn(`      ⚠️ Не удалось установить Old Price=false ни одним из вариантов названия`);
            Logger.warn(`      💡 Проверьте, что свойство "Old Price" существует в инстансе "EPriceGroup" и имеет boolean тип или вариант со значением "false"`);
          } else {
            Logger.debug(`      ✅ Успешно установлено Old Price=false`);
          }
        }
      } else {
        Logger.debug(`      ⚠️ Инстанс "EPriceGroup" не найден в контейнере "${containerName}"`);
      }
    }

    // ОПТИМИЗАЦИЯ 3: Разделяем обработку текста и изображений
    // Для текста: обрабатываем даже если fieldValue пустой (может быть пустая строка)
    const totalTextLayers = filteredLayers.filter(item => item.isText).length;
    const textLayersAll = filteredLayers.filter(item => item.isText && item.fieldValue !== undefined);
    Logger.info(`📝 Всего текстовых слоев: ${totalTextLayers}, с fieldValue: ${textLayersAll.length}`);
    
    // Отладочная информация: почему текстовые слои отфильтрованы
    if (totalTextLayers > 0 && textLayersAll.length === 0) {
      const sampleTextLayers = filteredLayers.filter(item => item.isText).slice(0, 3);
      Logger.warn(`⚠️ Все текстовые слои отфильтрованы! Примеры:`, sampleTextLayers.map(item => ({
        fieldName: item.fieldName,
        hasValue: item.fieldValue !== undefined,
        valueType: typeof item.fieldValue,
        valuePreview: item.fieldValue ? String(item.fieldValue).substring(0, 30) : 'null/undefined'
      })));
    }
    
    // ОПТИМИЗАЦИЯ: Убираем проверку совпадения текста - всегда обновляем для скорости
    // Чтение characters для каждого слоя замедляет обработку
    // Фильтруем только удаленные слои (locked/visible уже проверены выше)
    const textLayers = textLayersAll.filter(item => !item.layer.removed);
    Logger.info(`📝 Текстовых слоев для обработки: ${textLayers.length}`);
    
    // Собираем все изображения-слои
    const allImageLayers = filteredLayers.filter(item => item.isImage);
    Logger.info(`🖼️ Всего изображений-слоев: ${allImageLayers.length}`);
    
    // ДИАГНОСТИКА: Проверяем, какие поля изображений есть в allImageLayers
    if (allImageLayers.length > 0) {
      const imageFieldNames = allImageLayers.map(item => item.fieldName);
      const uniqueImageFields = Array.from(new Set(imageFieldNames));
      Logger.debug(`🔍 [DIAGNOSTIC] Поля изображений в allImageLayers:`, uniqueImageFields);
      
      // Проверяем конкретно FaviconImage
      const faviconLayersInAll = allImageLayers.filter(item => 
        normalizeFieldName(item.fieldName).includes('favicon')
      );
      if (faviconLayersInAll.length > 0) {
        Logger.debug(`🔍 [DIAGNOSTIC] Найдено ${faviconLayersInAll.length} слоев с favicon в allImageLayers:`);
        faviconLayersInAll.forEach((item, idx) => {
          Logger.debug(`   ${idx + 1}. fieldName="${item.fieldName}", fieldValue="${item.fieldValue ? String(item.fieldValue).substring(0, 100) : 'null/undefined'}..."`);
        });
      } else {
        Logger.debug(`⚠️ [DIAGNOSTIC] Нет слоев с favicon в allImageLayers!`);
      }
    }
    
    // Разделяем на валидные (с URL) и те, что нужно очистить
    const imageLayers: typeof filteredLayers = [];
    const imageClearLayers: typeof filteredLayers = [];
    
    for (const item of allImageLayers) {
      if (!item.fieldValue) {
        // ДИАГНОСТИКА: Логируем, если это favicon без значения
        if (normalizeFieldName(item.fieldName).includes('favicon')) {
          Logger.debug(`⚠️ [DIAGNOSTIC] Favicon слой "${item.fieldName}" не имеет fieldValue, пропускаем`);
        }
        imageClearLayers.push(item);
        continue;
      }
      const v = String(item.fieldValue).trim();
      // Валидные форматы: обычный URL, или SPRITE_LIST: для списка фавиконок
      if (v.startsWith('http') || v.startsWith('//') || v.startsWith('SPRITE_LIST:')) {
        imageLayers.push(item);
      } else {
        // ДИАГНОСТИКА: Логируем, если это favicon с невалидным форматом
        if (normalizeFieldName(item.fieldName).includes('favicon')) {
          Logger.debug(`⚠️ [DIAGNOSTIC] Favicon слой "${item.fieldName}" имеет невалидный формат: "${v.substring(0, 100)}..."`);
        }
        imageClearLayers.push(item);
      }
    }
    
    Logger.info(`🖼️ Валидных изображений с URL: ${imageLayers.length}, без URL (очистить): ${imageClearLayers.length}`);

    // Слои-изображения без ссылки — очищаем заливки, чтобы не оставались старые картинки
    if (imageClearLayers.length > 0) {
      for (const item of imageClearLayers) {
        try {
          if (item.layer.type === 'RECTANGLE' || item.layer.type === 'ELLIPSE' || item.layer.type === 'POLYGON') {
            (item.layer as RectangleNode | EllipseNode | PolygonNode).fills = [];
          }
        } catch (e) {
          // Игнорируем ошибки очистки
        }
      }
    }
    
    // Логируем, какие изображения найдены
    // ДИАГНОСТИКА: Выводим все имена полей изображений для отладки
    if (imageLayers.length > 0) {
      Logger.debug(`🔍 [DIAGNOSTIC] Все имена полей изображений:`);
      const fieldNames = imageLayers.map(item => item.fieldName);
      const uniqueFieldNames = Array.from(new Set(fieldNames));
      Logger.debug(`   Всего уникальных имен: ${uniqueFieldNames.length}`);
      uniqueFieldNames.forEach((name, idx) => {
        const count = fieldNames.filter(n => n === name).length;
        Logger.debug(`   ${idx + 1}. "${name}" (встречается ${count} раз)`);
      });
    }
    
    const faviconLayers = imageLayers.filter(item => item.fieldName.toLowerCase().includes('favicon'));
    Logger.info(`🖼️ Найдено ${imageLayers.length} изображений, из них ${faviconLayers.length} фавиконок`);
    if (faviconLayers.length > 0) {
      Logger.debug(`📋 Фавиконки:`, faviconLayers.map(item => `${item.fieldName}=${item.fieldValue?.substring(0, 50)}...`));
    } else if (imageLayers.length > 0) {
      // ДИАГНОСТИКА: Если фавиконки не найдены, проверяем возможные варианты имен
      const possibleFaviconFields = imageLayers.filter(item => {
        const lowerName = item.fieldName.toLowerCase();
        return lowerName.includes('icon') || lowerName.includes('shop') || lowerName.includes('logo');
      });
      if (possibleFaviconFields.length > 0) {
        Logger.debug(`⚠️ [DIAGNOSTIC] Фавиконки не найдены, но найдены похожие поля:`);
        possibleFaviconFields.forEach(item => {
          Logger.debug(`   - "${item.fieldName}" = "${item.fieldValue?.substring(0, 80)}..."`);
        });
      }
    }

