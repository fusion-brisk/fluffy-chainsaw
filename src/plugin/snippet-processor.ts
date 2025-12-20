/**
 * Snippet Processor — основной цикл обработки import-csv
 */

import { Logger } from '../logger';
import { handlerRegistry, HandlerContext } from '../component-handlers';
import { ImageProcessor } from '../image-handlers';
import { loadFonts, processTextLayers } from '../text-handlers';
import { LayerDataItem, DetailedError } from '../types';
import { findSnippetContainers, sortContainersByPosition } from '../utils/container-search';
import { CSVRow, ProgressCallback } from './types';
import { resetAllSnippets, applyGlobalQuery } from './global-handlers';
import {
  groupContainersWithDataLayers,
  assignRowsToContainers,
  createLayerData,
  prepareContainersForProcessing
} from './data-assignment';

export interface ImportCSVParams {
  rows: CSVRow[];
  scope: 'page' | 'selection';
  resetBeforeImport: boolean;
}

export interface ImportCSVResult {
  processedCount: number;
  totalContainers: number;
  imageStats: {
    successfulImages: number;
    failedImages: number;
    skippedImages: number;
    errors: DetailedError[];
  };
}

/**
 * Основной обработчик import-csv
 */
export async function processImportCSV(
  params: ImportCSVParams,
  imageProcessor: ImageProcessor,
  onProgress: ProgressCallback
): Promise<ImportCSVResult> {
  const { rows, scope, resetBeforeImport } = params;
  const startTime = Date.now();
  
  const logTiming = (stage: string) => {
    const elapsed = Date.now() - startTime;
    Logger.info(`⏱️ [${elapsed}ms] ${stage}`);
  };
  
  Logger.info(`📊 Получено ${rows.length} строк данных`);
  Logger.info(`📍 Область: ${scope}`);
  
  // Начальный прогресс
  onProgress(1, 100, `Подготовка к обработке ${rows.length} строк...`, 'searching');
  
  // === Reset snippets before import if requested ===
  if (resetBeforeImport) {
    Logger.info('🔄 Сброс сниппетов перед импортом...');
    onProgress(1, 100, 'Сброс сниппетов...', 'resetting');
    const resetCount = await resetAllSnippets(scope, onProgress);
    Logger.info(`✅ Сброшено ${resetCount} сниппетов`);
  }
  
  // === Global fields ===
  await applyGlobalQuery(rows, scope);
  
  // === Определяем область поиска ===
  let searchNodes: readonly SceneNode[] = [];
  if (scope === 'selection') {
    searchNodes = figma.currentPage.selection;
    Logger.info(`🎯 Найдено ${searchNodes.length} выбранных элементов`);
    if (searchNodes.length === 0) {
      figma.notify('❌ Нет выбранных элементов');
      return { processedCount: 0, totalContainers: 0, imageStats: { successfulImages: 0, failedImages: 0, skippedImages: 0, errors: [] } };
    }
  } else {
    searchNodes = figma.currentPage.children;
    Logger.info(`🎯 Поиск по всей странице: ${searchNodes.length} элементов`);
  }
  
  onProgress(3, 100, `Область определена: ${searchNodes.length} элементов`, 'searching');
  
  // === Собираем контейнеры ===
  onProgress(5, 100, 'Поиск контейнеров сниппетов...', 'searching');
  
  const allContainers = findSnippetContainers(scope === 'page' ? 'page' : 'selection');
  Logger.info(`📦 Найдено ${allContainers.length} контейнеров-сниппетов`);
  
  onProgress(12, 100, `Найдено ${allContainers.length} контейнеров, сортировка...`, 'searching');
  
  // Сортировка по позиции
  sortContainersByPosition(allContainers);
  Logger.debug(`🔢 Контейнеры отсортированы по позиции (Y→X)`);
  
  onProgress(15, 100, `Анализ структуры контейнеров...`, 'searching');
  
  // === Группировка контейнеров ===
  const snippetGroups = groupContainersWithDataLayers(allContainers, onProgress);
  Logger.info(`📊 Создано ${snippetGroups.size} групп сниппетов`);
  logTiming('Группировка сниппетов завершена (Top-Down)');
  
  onProgress(40, 100, `Создано ${snippetGroups.size} групп сниппетов`, 'grouping');
  
  // === Маппинг строк на контейнеры ===
  const containerRowAssignments = assignRowsToContainers(rows, snippetGroups);
  
  // === Создание layerData ===
  const layerData = createLayerData(snippetGroups, containerRowAssignments);
  Logger.info(`📊 Создано ${layerData.length} элементов layerData`);
  
  const filteredLayers = layerData.filter(item => !item.layer.removed && !item.layer.locked && item.layer.visible);
  
  // === Обработка компонентной логики ===
  const containersToProcess = prepareContainersForProcessing(snippetGroups, containerRowAssignments);
  Logger.debug(`🔄 Обработка компонентной логики для ${containersToProcess.size} контейнеров...`);
  
  let processingIndex = 0;
  const totalToProcess = containersToProcess.size;
  
  onProgress(40, 100, `Компонентная логика: 0/${totalToProcess}`, 'components');
  
  for (const [containerKey, data] of containersToProcess) {
    if (!data.container || !data.row) continue;
    
    const context: HandlerContext = { container: data.container, containerKey, row: data.row };
    
    // Детальное логирование
    const containerName = data.container && 'name' in data.container ? data.container.name : 'N/A';
    const shopName = data.row['#ShopName'] || 'N/A';
    const price = data.row['#OrganicPrice'] || 'N/A';
    const fintechEnabled = data.row['#EPriceGroup_Fintech'] || 'false';
    const fintechType = data.row['#Fintech_Type'] || 'N/A';
    const priceView = data.row['#EPrice_View'] || 'N/A';
    Logger.info(`📍 [${processingIndex}] ${containerName}: Shop="${shopName}", Price="${price}", Fintech=${fintechEnabled} (${fintechType}), EPrice_View=${priceView}`);
    processingIndex++;
    
    // Прогресс
    if (processingIndex % 2 === 0 || processingIndex % Math.max(1, Math.floor(totalToProcess / 10)) === 0) {
      const progress = 40 + Math.floor((processingIndex / totalToProcess) * 20);
      onProgress(Math.min(60, progress), 100, `Компонентная логика: ${processingIndex}/${totalToProcess}`, 'components');
    }
    
    // Выполнение всех handlers через registry
    const results = await handlerRegistry.executeAll(context);
    
    // Логирование ошибок
    const errors = results.filter(r => !r.success);
    if (errors.length > 0) {
      for (const err of errors) {
        Logger.error(`[${err.handlerName}] Error: ${err.error}`);
      }
    }
    
    // Статистика (debug)
    const successCount = results.filter(r => r.success).length;
    Logger.debug(`✅ [${containerKey}] ${successCount}/${results.length} handlers успешно`);
  }
  Logger.debug(`✅ Компонентная логика обработана`);
  
  onProgress(60, 100, `Обработана компонентная логика`, 'components');
  
  // === Обработка текста ===
  const textLayers = filteredLayers.filter(item => {
    if (!item.isText) return false;
    
    try {
      if (item.layer.type === 'TEXT' && item.fieldValue) {
        if ((item.layer as TextNode).characters === item.fieldValue) {
          return false;
        }
      }
    } catch (e) {
      return true;
    }
    
    return true;
  });
  
  if (textLayers.length > 0) {
    onProgress(62, 100, `Загрузка шрифтов для ${textLayers.length} слоев...`, 'text');
    
    Logger.info(`🔤 Загрузка шрифтов для ${textLayers.length} текстовых слоев`);
    await loadFonts(textLayers);
    
    onProgress(66, 100, `Шрифты загружены, обработка текста...`, 'text');
    
    processTextLayers(textLayers);
    
    onProgress(70, 100, `Обработано ${textLayers.length} текстовых слоев`, 'text');
  } else {
    Logger.info('🔤 Нет текстовых слоев для обновления');
    onProgress(70, 100, `Пропущена обработка текста (нет изменений)`, 'text');
  }
  
  // === Обработка изображений ===
  const imageLayers = filteredLayers.filter(item => item.isImage);
  let imageStats = {
    successfulImages: 0,
    failedImages: 0,
    skippedImages: 0,
    errors: [] as DetailedError[]
  };
  
  if (imageLayers.length > 0) {
    imageProcessor.resetForNewImport();
    
    onProgress(75, 100, `Начинаем обработку ${imageLayers.length} изображений...`, 'images-start');
    
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
    
    imageStats = {
      successfulImages: imageProcessor.successfulImages,
      failedImages: imageProcessor.failedImages,
      skippedImages: imageLayers.length - imageProcessor.successfulImages - imageProcessor.failedImages,
      errors: imageProcessor.errors
    };
  }
  
  const totalTime = Date.now() - startTime;
  Logger.info(`🎉 Готово! Обработано ${processingIndex} элементов за ${(totalTime / 1000).toFixed(2)}s`);
  
  return {
    processedCount: processingIndex,
    totalContainers: snippetGroups.size,
    imageStats
  };
}

