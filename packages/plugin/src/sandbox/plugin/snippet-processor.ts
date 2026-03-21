/**
 * Snippet Processor — основной цикл обработки import-csv
 */

import { Logger } from '../../logger';
import { handlerRegistry } from '../handlers/registry';
import type { HandlerContext } from '../handlers/types';
import { resetHandlerStats, logHandlerStats } from '../handlers/registry';
import { ImageProcessor } from '../image-handlers';
import { loadFonts, processTextLayers } from '../text-handlers';
import { DetailedError } from '../../types';
import { findSnippetContainers, sortContainersByPosition } from '../../utils/container-search';
// Container cache отключен — слишком высокое потребление памяти
// import { buildContainerStructureCache, clearContainerStructureCache } from '../../utils/container-cache';
import { resetNodeSearchStats, logNodeSearchStats, resetLoadedFontsCache } from '../../utils/node-search';
import { resetPropertyWarnings, logPropertyWarnings } from '../property-utils';
import { resetComponentCache } from '../../utils/component-cache';
import { buildInstanceCache } from '../../utils/instance-cache';
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
  fieldsSet?: number;
  fieldsFailed?: number;
  handlerErrors?: number;
}

// Yield to main thread to allow message processing (cancel, etc.)
async function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// Cancellation result helper
const CANCELLED_RESULT: ImportCSVResult = {
  processedCount: 0,
  totalContainers: 0,
  imageStats: { successfulImages: 0, failedImages: 0, skippedImages: 0, errors: [] }
};

/**
 * Основной обработчик import-csv
 */
export async function processImportCSV(
  params: ImportCSVParams,
  imageProcessor: ImageProcessor,
  onProgress: ProgressCallback,
  isCancelled?: () => boolean
): Promise<ImportCSVResult> {
  const { rows, scope, resetBeforeImport } = params;
  const startTime = Date.now();
  
  // Helper для проверки отмены
  const checkCancelled = (): boolean => isCancelled?.() ?? false;
  
  // Helper: проверка отмены с yield
  const checkCancelledWithYield = async (): Promise<boolean> => {
    await yieldToMain();
    return checkCancelled();
  };
  
  const logTiming = (stage: string) => {
    const elapsed = Date.now() - startTime;
    Logger.info(`⏱️ [${elapsed}ms] ${stage}`);
  };
  
  Logger.summary(`📊 Получено ${rows.length} строк данных`);
  Logger.verbose(`📍 Область: ${scope}`);
  
  // Начальный прогресс
  onProgress(1, 100, `Подготовка к обработке ${rows.length} строк...`, 'searching');
  
  // === YIELD POINT 1: Позволяем отменить сразу после старта ===
  if (await checkCancelledWithYield()) {
    Logger.verbose('⛔ Отменено на этапе подготовки');
    return CANCELLED_RESULT;
  }
  
  // === Reset snippets before import if requested ===
  if (resetBeforeImport) {
    Logger.verbose('🔄 Сброс сниппетов перед импортом...');
    onProgress(1, 100, 'Сброс сниппетов...', 'resetting');
    const resetCount = await resetAllSnippets(scope, onProgress);
    Logger.summary(`✅ Сброшено ${resetCount} сниппетов`);
    
    // === YIELD POINT 2: После сброса ===
    if (await checkCancelledWithYield()) {
      Logger.verbose('⛔ Отменено после сброса сниппетов');
      return CANCELLED_RESULT;
    }
  }
  
  // === Global fields ===
  await applyGlobalQuery(rows, scope);
  
  // === YIELD POINT 3: После глобальных полей ===
  if (await checkCancelledWithYield()) {
    Logger.verbose('⛔ Отменено после применения глобальных полей');
    return CANCELLED_RESULT;
  }
  
  // === Определяем область поиска ===
  let searchNodes: readonly SceneNode[] = [];
  if (scope === 'selection') {
    searchNodes = figma.currentPage.selection;
    Logger.verbose(`🎯 Найдено ${searchNodes.length} выбранных элементов`);
    if (searchNodes.length === 0) {
      figma.notify('❌ Нет выбранных элементов');
      return CANCELLED_RESULT;
    }
  } else {
    searchNodes = figma.currentPage.children;
    Logger.verbose(`🎯 Поиск по всей странице: ${searchNodes.length} элементов`);
  }
  
  onProgress(3, 100, `Область определена: ${searchNodes.length} элементов`, 'searching');
  
  // === YIELD POINT 4: Перед тяжёлым поиском контейнеров ===
  if (await checkCancelledWithYield()) {
    Logger.verbose('⛔ Отменено перед поиском контейнеров');
    return CANCELLED_RESULT;
  }
  
  // === Собираем контейнеры ===
  onProgress(5, 100, 'Поиск контейнеров сниппетов...', 'searching');
  logTiming('Перед поиском контейнеров');
  
  const allContainers = findSnippetContainers(scope === 'page' ? 'page' : 'selection');
  Logger.summary(`📦 Найдено ${allContainers.length} контейнеров-сниппетов`);
  logTiming('После поиска контейнеров');
  
  // === YIELD POINT 5: После поиска контейнеров ===
  if (checkCancelled()) {
    Logger.verbose('⛔ Отменено после поиска контейнеров');
    return CANCELLED_RESULT;
  }
  logTiming('После yield 5');
  
  onProgress(12, 100, `Найдено ${allContainers.length} контейнеров, сортировка...`, 'searching');
  
  // Сортировка по позиции
  sortContainersByPosition(allContainers);
  logTiming('После сортировки');
  
  onProgress(15, 100, `Анализ структуры контейнеров...`, 'searching');
  
  // Сброс статистики перед обработкой (кэш отключен для экономии памяти)
  resetNodeSearchStats();
  resetHandlerStats();
  resetLoadedFontsCache();
  resetPropertyWarnings();
  resetComponentCache();
  logTiming('После reset');
  
  // Перед группировкой — без yield для скорости
  if (checkCancelled()) {
    Logger.verbose('⛔ Отменено перед группировкой');
    return CANCELLED_RESULT;
  }
  
  // === Группировка контейнеров ===
  // ОПТИМИЗАЦИЯ v3: Single-pass — передаём searchRoot для одного findAll
  logTiming('Перед группировкой контейнеров');
  const snippetGroups = groupContainersWithDataLayers(allContainers, onProgress, figma.currentPage);
  Logger.verbose(`📊 Создано ${snippetGroups.size} групп сниппетов`);
  logTiming('Группировка завершена');
  
  // === YIELD POINT 7: После группировки ===
  if (await checkCancelledWithYield()) {
    Logger.verbose('⛔ Отменено после группировки');
    return CANCELLED_RESULT;
  }
  
  onProgress(40, 100, `Создано ${snippetGroups.size} групп сниппетов`, 'grouping');
  
  // === Маппинг строк на контейнеры ===
  const containerRowAssignments = assignRowsToContainers(rows, snippetGroups);
  
  // === Создание layerData ===
  const layerData = createLayerData(snippetGroups, containerRowAssignments);
  Logger.verbose(`📊 Создано ${layerData.length} элементов layerData`);
  
  // === YIELD POINT 8: После создания layerData ===
  if (await checkCancelledWithYield()) {
    Logger.verbose('⛔ Отменено после создания layerData');
    return CANCELLED_RESULT;
  }
  
  const filteredLayers = layerData.filter(item => !item.layer.removed && !item.layer.locked && item.layer.visible);
  
  // === Обработка компонентной логики ===
  const containersToProcess = await prepareContainersForProcessing(snippetGroups, containerRowAssignments);
  Logger.info(`🔄 Обработка компонентной логики для ${containersToProcess.size} контейнеров...`);
  
  let processingIndex = 0;
  const totalToProcess = containersToProcess.size;
  
  // Агрегированная статистика контейнеров
  const containerTypeCounts: Record<string, number> = {};
  let handlerErrorCount = 0;
  let totalFieldsSet = 0;
  let totalFieldsFailed = 0;
  
  // ДИАГНОСТИКА: Статистика DeepCache
  let totalCacheTime = 0;
  let totalCacheSize = 0;
  let totalInstances = 0;
  let totalTextNodes = 0;
  let totalGroups = 0;
  
  onProgress(40, 100, `Компонентная логика: 0/${totalToProcess}`, 'components');
  
  // === Последовательная обработка handlers (как в оригинале) ===
  // ВАЖНО: Figma API работает быстрее с последовательными операциями
  for (const [containerKey, data] of containersToProcess) {
    if (!data.container || !data.row) continue;
    
    // Проверка отмены каждые 10 контейнеров
    if (processingIndex % 10 === 0 && checkCancelled()) {
      Logger.verbose('⛔ Обработка прервана пользователем');
      return { processedCount: processingIndex, totalContainers: totalToProcess, imageStats: { successfulImages: 0, failedImages: 0, skippedImages: 0, errors: [] } };
    }
    
    // Bulk preload all fonts in container before handler execution
    if (data.container.type === 'INSTANCE') {
      const textNodes = data.container.findAll(n => n.type === 'TEXT') as TextNode[];
      for (const tn of textNodes) {
        if (!tn.hasMissingFont && tn.fontName !== figma.mixed) {
          try { await figma.loadFontAsync(tn.fontName as FontName); } catch { /* skip */ }
        }
      }
    }

    // ОПТИМИЗАЦИЯ: Строим DeepCache ОДИН РАЗ на контейнер
    // Кэшируем INSTANCE, TEXT, GROUP ноды — избавляет от ~10000+ рекурсивных поисков
    const cacheStart = Date.now();
    const instanceCache = buildInstanceCache(data.container);
    const cacheTime = Date.now() - cacheStart;
    totalCacheTime += cacheTime;
    totalCacheSize += instanceCache.stats.nodeCount;
    totalInstances += instanceCache.stats.instanceCount;
    totalTextNodes += instanceCache.stats.textCount;
    totalGroups += instanceCache.stats.groupCount;
    
    const context: HandlerContext = { container: data.container, containerKey, row: data.row, instanceCache };
    
    // Сбор статистики по типам контейнеров
    const containerName = data.container && 'name' in data.container ? String(data.container.name) : 'Unknown';
    // Извлекаем базовое имя контейнера (без индекса)
    const baseName = containerName.replace(/\s*\d+$/, '').trim();
    containerTypeCounts[baseName] = (containerTypeCounts[baseName] || 0) + 1;
    
    // Verbose логирование (только в режиме VERBOSE или DEBUG)
    const containerType = data.container && 'type' in data.container ? data.container.type : 'N/A';
    const shopName = data.row['#ShopName'] || 'N/A';
    const price = data.row['#OrganicPrice'] || 'N/A';
    Logger.verbose(`📍 [${processingIndex}] ${containerName} (${containerType}): Shop="${shopName}", Price="${price}"`);
    processingIndex++;
    
    // Выполнение всех handlers через registry
    const results = await handlerRegistry.executeAll(context);
    
    // Логирование ошибок (всегда) и медленных handlers (debug)
    for (const res of results) {
      if (!res.success) {
        Logger.error(`[${res.handlerName}] Error: ${res.error}`);
        handlerErrorCount++;
      }
      totalFieldsSet += res.fieldsSet || 0;
      totalFieldsFailed += res.fieldsFailed || 0;
      // Логируем handlers занявшие >100ms только в debug
      if (res.duration && res.duration > 100) {
        Logger.debug(`⚠️ Slow handler: ${res.handlerName} took ${res.duration}ms on ${containerName}`);
      }
    }
    
    // Прогресс каждые 5 контейнеров (уменьшаем частоту)
    if (processingIndex % 5 === 0 || processingIndex === totalToProcess) {
      const progress = 40 + Math.floor((processingIndex / totalToProcess) * 20);
      onProgress(Math.min(60, progress), 100, `Компонентная логика: ${processingIndex}/${totalToProcess}`, 'components');
    }
  }
  
  // Агрегированный лог контейнеров
  Logger.logContainerStats(containerTypeCounts);
  if (handlerErrorCount > 0) {
    Logger.warn(`⚠️ Handler errors: ${handlerErrorCount}`);
  }
  
  // ДИАГНОСТИКА: Статистика DeepCache
  const avgCacheTime = totalToProcess > 0 ? (totalCacheTime / totalToProcess).toFixed(1) : '0';
  const avgCacheSize = totalToProcess > 0 ? Math.round(totalCacheSize / totalToProcess) : 0;
  Logger.info(`📊 [DeepCache] Всего: ${totalCacheTime}ms на ${totalToProcess} контейнеров (avg ${avgCacheTime}ms, avg nodes ${avgCacheSize})`);
  Logger.info(`📊 [DeepCache] Nodes: ${totalCacheSize} total (${totalInstances} instances, ${totalTextNodes} text, ${totalGroups} groups)`);
  
  Logger.debug(`✅ Компонентная логика обработана (batch mode)`);
  logTiming('Handlers batch завершён');
  
  // Диагностика: статистика isDescendantOf
  logNodeSearchStats();
  
  // Диагностика: агрегированные предупреждения о свойствах
  logPropertyWarnings();
  
  // Диагностика: агрегированная статистика handlers
  logHandlerStats();
  
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
    
    Logger.verbose(`🔤 Загрузка шрифтов для ${textLayers.length} текстовых слоев`);
    await loadFonts(textLayers);
    
    onProgress(66, 100, `Шрифты загружены, обработка текста...`, 'text');
    
    await processTextLayers(textLayers);
    
    onProgress(70, 100, `Обработано ${textLayers.length} текстовых слоев`, 'text');
  } else {
    Logger.debug('🔤 Нет текстовых слоев для обновления');
    onProgress(70, 100, `Пропущена обработка текста (нет изменений)`, 'text');
  }
  
  // Проверка отмены перед изображениями
  if (checkCancelled()) {
    Logger.verbose('⛔ Обработка прервана пользователем перед изображениями');
    return { processedCount: processingIndex, totalContainers: snippetGroups.size, imageStats: { successfulImages: 0, failedImages: 0, skippedImages: 0, errors: [] } };
  }
  
  // === Обработка изображений ===
  const imageLayers = filteredLayers.filter(item => item.isImage);
  Logger.verbose(`🖼️ [Image] Найдено ${imageLayers.length} слоёв изображений из ${filteredLayers.length} всего`);
  
  // Логируем примеры найденных изображений (первые 5)
  if (imageLayers.length > 0) {
    const samples = imageLayers.slice(0, 5).map(l => `${l.fieldName}="${String(l.fieldValue || '').substring(0, 50)}..."`);
    Logger.debug(`🖼️ [Image] Примеры: ${samples.join(', ')}`);
  } else {
    // Логируем какие слои есть, чтобы понять структуру
    const layerTypes = filteredLayers.reduce((acc, l) => {
      const key = l.isText ? 'text' : l.isImage ? 'image' : 'other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Logger.debug(`🖼️ [Image] Распределение слоёв: text=${layerTypes.text || 0}, image=${layerTypes.image || 0}, other=${layerTypes.other || 0}`);
  }
  
  let imageStats = {
    successfulImages: 0,
    failedImages: 0,
    skippedImages: 0,
    errors: [] as DetailedError[]
  };
  
  if (imageLayers.length > 0) {
    const imageStart = Date.now();
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
    
    // Агрегированный лог изображений
    const imageTime = Date.now() - imageStart;
    Logger.logImageStats(imageStats.successfulImages, imageStats.failedImages, imageTime);
  }
  
  const totalTime = Date.now() - startTime;
  Logger.info(`🎉 Готово! Обработано ${processingIndex} элементов за ${(totalTime / 1000).toFixed(2)}s`);
  
  // Flush all pending logs to UI
  Logger.flush();
  
  return {
    processedCount: processingIndex,
    totalContainers: snippetGroups.size,
    imageStats,
    fieldsSet: totalFieldsSet,
    fieldsFailed: totalFieldsFailed,
    handlerErrors: handlerErrorCount
  };
}

