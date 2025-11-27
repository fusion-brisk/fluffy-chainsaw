import { Logger } from './logger';
import { SNIPPET_CONTAINER_NAMES, TEXT_FIELD_NAMES } from './config';
import { handleBrandLogic, handleEPriceGroup, handleELabelGroup, handleEPriceBarometer } from './component-handlers';
import { ImageProcessor } from './image-handlers';
import { loadFonts, processTextLayers } from './text-handlers';
import { LayerDataItem } from './types';

console.log('🚀 Плагин Contentify загружен');

try {
  figma.showUI(__html__, { width: 320, height: 600 });
  // Отправляем начальное состояние выделения
  figma.ui.postMessage({ 
    type: 'selection-status', 
    hasSelection: figma.currentPage.selection.length > 0 
  });
} catch (error) {
  Logger.error('❌ Ошибка при показе UI:', error);
  figma.notify('❌ Ошибка загрузки UI');
}

// Глобальный экземпляр ImageProcessor для сохранения кэша между импортами
const imageProcessor = new ImageProcessor();

// Обработка изменений выделения
figma.on('selectionchange', () => {
  const hasSelection = figma.currentPage.selection.length > 0;
  figma.ui.postMessage({ type: 'selection-status', hasSelection: hasSelection });
});

// Вспомогательные функции
const safeGetLayerName = (layer: SceneNode): string | null => {
  try {
    if (layer.removed) return null;
    return layer.name;
  } catch {
    return null;
  }
};

const safeGetLayerType = (layer: SceneNode): string | null => {
  try {
    if (layer.removed) return null;
    return layer.type;
  } catch {
    return null;
  }
};

figma.ui.onmessage = async (msg) => {
  // Глобальный перехват ошибок
  try {
    Logger.info('📨 Получено сообщение от UI:', msg.type);
  
  if (msg.type === 'test') {
      Logger.info('✅ Получено тестовое сообщение:', msg.message);
      figma.ui.postMessage({ type: 'log', message: 'Плагин работает!' });
    return;
  }
  
  if (msg.type === 'get-theme') {
      Logger.info('🎨 Запрос темы от UI');
      figma.ui.postMessage({ type: 'log', message: 'Тема применена автоматически' });
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
      figma.ui.postMessage({ type: 'pages', pages: pages });
    return;
  }
  
  // Old check-selection handler removed (using selectionchange event instead)

    // --- SETTINGS HANDLERS ---
    if (msg.type === 'get-settings') {
      try {
        const scope = await figma.clientStorage.getAsync('contentify_scope');
    figma.ui.postMessage({
          type: 'settings-loaded', 
          settings: { scope: (scope === 'page' || scope === 'selection') ? scope : 'selection' } 
    });
      } catch (e) {
        Logger.error('Failed to load settings:', e);
        figma.ui.postMessage({ type: 'settings-loaded', settings: { scope: 'selection' } });
      }
    return;
  }

    if (msg.type === 'save-settings') {
      if (msg.settings && msg.settings.scope) {
        await figma.clientStorage.setAsync('contentify_scope', msg.settings.scope);
        Logger.debug('Settings saved:', msg.settings);
      }
      return;
    }
    // -------------------------
  
  if (msg.type === 'import-csv') {
    const startTime = Date.now();
    Logger.info('🔄 Начинаем оптимизированную обработку данных');
    
    const rows = msg.rows || [];
    const scope = msg.scope || 'page';
      // const filter = msg.filter || ''; 

    Logger.info(`📊 Получено ${rows.length} строк данных`);
    Logger.info(`📍 Область: ${scope}`);
    
    const logTiming = (stage: string) => {
      const elapsed = Date.now() - startTime;
      Logger.info(`⏱️ [${elapsed}ms] ${stage}`);
    };

      // 1. Определяем область поиска
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
    
      // 2. Собираем контейнеры и группируем данные (Оптимизированный Top-Down подход)
    const snippetGroups = new Map<string, SceneNode[]>();
    let allContainers: SceneNode[] = [];

    if (scope === 'page') {
      // Быстрый поиск по всей странице через нативный findAll
      if (figma.currentPage.findAll) {
         allContainers = figma.currentPage.findAll(n => SNIPPET_CONTAINER_NAMES.includes(n.name));
      } else {
         // Fallback
         figma.currentPage.children.forEach(child => {
             if (SNIPPET_CONTAINER_NAMES.includes(child.name)) allContainers.push(child);
             if ('findAll' in child) {
               allContainers.push(...(child as SceneNode & ChildrenMixin).findAll((n: SceneNode) => SNIPPET_CONTAINER_NAMES.includes(n.name)));
             }
         });
      }
    } else {
      // Поиск в выделении
      const visited = new Set<string>();
      
      for (const node of searchNodes) {
         if (node.removed) continue;
         
         // Проверяем сам узел
         if (SNIPPET_CONTAINER_NAMES.includes(node.name) && !visited.has(node.id)) {
            allContainers.push(node);
            visited.add(node.id);
         }
         
         // Ищем внутри узла
         if ('findAll' in node) {
            const found = (node as SceneNode & ChildrenMixin).findAll((n: SceneNode) => SNIPPET_CONTAINER_NAMES.includes(n.name));
            for (const item of found) {
               if (!visited.has(item.id)) {
                   allContainers.push(item);
                   visited.add(item.id);
               }
            }
         }
      }
    }
    
    Logger.info(`📦 Найдено ${allContainers.length} контейнеров-сниппетов`);
    
    // Набор ID всех контейнеров для проверки вложенности
    const containerIds = new Set(allContainers.map(c => c.id));
    
    for (const container of allContainers) {
        if (container.removed) continue;
        
        // Ищем слои данных (#) внутри контейнера
        let dataLayers: SceneNode[] = [];
        
        if ('findAll' in container) {
           dataLayers = (container as SceneNode & ChildrenMixin).findAll((n: SceneNode) => n.name.startsWith('#'));
        }
        
        if (dataLayers.length === 0) continue;
        
        // Фильтрация: берем только те слои, для которых этот контейнер является БЛИЖАЙШИМ из списка allContainers
        const validLayers: SceneNode[] = [];
        
        for (const layer of dataLayers) {
           let isDirectChild = true;
           let currentParent = layer.parent;
           
           // Поднимаемся вверх от слоя к текущему контейнеру
           while (currentParent && currentParent.id !== container.id) {
              // Если по пути встретили ДРУГОЙ известный контейнер, значит слой принадлежит ему (вложенность)
              if (containerIds.has(currentParent.id) && SNIPPET_CONTAINER_NAMES.includes(currentParent.name)) {
                 isDirectChild = false;
                 break;
              }
              currentParent = currentParent.parent;
           }
           
           if (isDirectChild) {
              validLayers.push(layer);
           }
        }
        
        if (validLayers.length > 0) {
           snippetGroups.set(container.id, validLayers);
        }
    }

    Logger.info(`📊 Создано ${snippetGroups.size} групп сниппетов`);
    logTiming('Группировка сниппетов завершена (Top-Down)');

      // 4. Создаем layerData (назначаем строки)
    const normalizeFieldName = (name: string): string => name ? String(name).trim().toLowerCase() : '';
    const layerData: LayerDataItem[] = [];
    let nextRowIndex = 0;
    
      const finalContainerMap = snippetGroups;
    
    for (const [_, layers] of finalContainerMap) {
        const validLayers = layers.filter(layer => !layer.removed);
        if (validLayers.length === 0) {
          nextRowIndex++;
          continue;
        }
        
        const rowIndex = nextRowIndex % rows.length;
        const row = rows[rowIndex];
      
      const rowKeyMap: { [key: string]: string } = {};
      try {
        for (const key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            rowKeyMap[normalizeFieldName(key)] = row[key];
          }
        }
        } catch (e) { /* ignore */ }

        const processedFieldNames = new Set<string>();
        
        for (const layer of validLayers) {
            const fieldName = safeGetLayerName(layer);
            if (!fieldName) continue;
            if (processedFieldNames.has(fieldName)) continue;
            processedFieldNames.add(fieldName);
            
            const normName = normalizeFieldName(fieldName);
            const direct = row[fieldName];
            const fallback = rowKeyMap[normName];
            const fieldValue = (direct !== undefined && direct !== null ? direct : fallback);
            
          if (fieldValue === undefined || fieldValue === null || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
              continue;
            }
            
            const layerType = safeGetLayerType(layer);
          if (!layerType) continue;
          
          let isTextLayer = layerType === 'TEXT';
          const isImageLayer = normalizeFieldName(fieldName).endsWith('image');
          const isShapeLayer = ['RECTANGLE', 'ELLIPSE', 'POLYGON'].includes(layerType);
          
          if (layerType === 'INSTANCE') {
            if (TEXT_FIELD_NAMES.includes(normalizeFieldName(fieldName))) {
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
            row
          });
        }
        nextRowIndex++;
      }
      
      Logger.info(`📊 Создано ${layerData.length} элементов layerData`);
      
      const filteredLayers = layerData.filter(item => !item.layer.removed && !item.layer.locked && item.layer.visible);
      
      // 5. Обработка компонентной логики
      const containersToProcess = new Map<string, { row: { [key: string]: string } | null; container: BaseNode | null; }>();
    for (const [containerKey, layers] of finalContainerMap) {
        if (!layers.length) continue;
      let container: BaseNode | null = null;
      for (const layer of layers) {
        if (layer.removed) continue;
          let current = layer.parent;
        while (current) {
            if (SNIPPET_CONTAINER_NAMES.includes(current.name)) {
            container = current;
            break;
          }
          current = current.parent;
        }
        if (container) break;
      }
      if (!container) continue;
      
      const containerIndex = Array.from(finalContainerMap.keys()).indexOf(containerKey);
      const rowIndex = containerIndex % rows.length;
        containersToProcess.set(containerKey, { row: rows[rowIndex], container });
      }
      
      Logger.debug(`🔄 Обработка компонентной логики для ${containersToProcess.size} контейнеров...`);
      const componentPromises: Promise<void>[] = [];
      for (const [containerKey, data] of containersToProcess) {
        if (!data.container || !data.row) continue;
        const context = { container: data.container, containerKey, row: data.row };
        
        try {
          handleBrandLogic(context);
          handleEPriceGroup(context);
          handleEPriceBarometer(context);
          componentPromises.push(handleELabelGroup(context).catch(e => Logger.error(`Error in handleELabelGroup:`, e)));
        } catch (e) {
          Logger.error(`Error in component handlers:`, e);
        }
      }
      await Promise.all(componentPromises);
      Logger.debug(`✅ Компонентная логика обработана`);

      // 6. Обработка текста
      const textLayers = filteredLayers.filter(item => {
        if (!item.isText) return false;
        
        // Проверяем, действительно ли текст изменится
        try {
           if (item.layer.type === 'TEXT' && item.fieldValue) {
              // Если текст совпадает, пропускаем загрузку шрифта и обработку
              if ((item.layer as TextNode).characters === item.fieldValue) {
                 return false;
              }
           }
        } catch (e) {
           // Если ошибка доступа к свойству, оставляем слой для обработки
           return true;
        }
        
        return true;
      });
      
      if (textLayers.length > 0) {
        Logger.info(`🔤 Загрузка шрифтов для ${textLayers.length} текстовых слоев`);
        await loadFonts(textLayers);
        processTextLayers(textLayers);
      } else {
        Logger.info('🔤 Нет текстовых слоев для обновления');
      }

      // 7. Обработка изображений
      const imageLayers = filteredLayers.filter(item => item.isImage);
    if (imageLayers.length > 0) {
        // Сбрасываем статистику для нового прогона, но кэш остается
        imageProcessor.resetForNewImport();
        
        imageProcessor.onUpdateTextLayer = (rowIndex, fieldName, value) => {
          const targets = filteredLayers.filter(l => 
            l.rowIndex === rowIndex && 
            l.isText && 
            (l.fieldName === fieldName || l.fieldName.toLowerCase().includes(fieldName.toLowerCase().replace('#', '')))
          );
          
          for (const target of targets) {
            try {
              if (target.layer.removed) continue;
              if (target.layer.type === 'TEXT') {
                (target.layer as TextNode).characters = value;
              } else if (target.layer.type === 'INSTANCE') {
                const instance = target.layer as InstanceNode;
                if ('children' in instance) {
                          for (const child of instance.children) {
                    if (child.type === 'TEXT' && !child.removed && (child.name === target.fieldName || child.name.toLowerCase().includes(fieldName.toLowerCase().replace('#', '')))) {
                      (child as TextNode).characters = value;
                            }
                          }
                        }
                      }
                    } catch (e) {
              // ignore
            }
          }
        };
        
        await imageProcessor.processPool(imageLayers);
        
      figma.ui.postMessage({
          type: 'stats',
          stats: {
            processedInstances: nextRowIndex,
            totalInstances: finalContainerMap.size,
            successfulImages: imageProcessor.successfulImages,
            skippedImages: imageLayers.length - imageProcessor.successfulImages - imageProcessor.failedImages,
            failedImages: imageProcessor.failedImages,
            errors: imageProcessor.errors
          }
        });
      }
      
    const totalTime = Date.now() - startTime;
      Logger.info(`🎉 Готово! Обработано ${nextRowIndex} элементов за ${(totalTime / 1000).toFixed(2)}s`);
    
    figma.ui.postMessage({
      type: 'done',
        count: nextRowIndex
      });
    }
  } catch (err) {
    Logger.error('CRITICAL PLUGIN ERROR:', err);
    figma.notify('❌ Критическая ошибка плагина. Проверьте консоль.');
    figma.ui.postMessage({
      type: 'error', 
      message: `Critical error: ${err instanceof Error ? err.message : String(err)}` 
    });
  }
};
