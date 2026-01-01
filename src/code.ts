/**
 * EProductSnippet Plugin — Entry Point
 * 
 * Минимальный entry point, делегирующий логику в модули:
 * - plugin/message-router.ts — роутинг сообщений
 * - plugin/snippet-processor.ts — обработка import-csv
 * - plugin/global-handlers.ts — глобальные функции
 */

<<<<<<< HEAD
import { Logger, LogLevel } from './logger';
=======
import { Logger } from './logger';
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
import { PLUGIN_VERSION } from './config';
import { ImageProcessor } from './image-handlers';
import { ParsingRulesManager } from './parsing-rules-manager';
import { handleSimpleMessage, processImportCSV, CSVRow } from './plugin';

console.log('🚀 Плагин EProductSnippet загружен');

// Глобальные экземпляры
const imageProcessor = new ImageProcessor();
const rulesManager = new ParsingRulesManager();

<<<<<<< HEAD
// Флаг отмены текущей операции
let isImportCancelled = false;

// Функция для проверки отмены (используется в processImportCSV)
export function checkCancelled(): boolean {
  return isImportCancelled;
}

=======
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
// Проверка обновлений правил парсинга
async function checkRulesUpdates(): Promise<void> {
  const updateInfo = await rulesManager.checkForUpdates();
  
  if (updateInfo && updateInfo.hasUpdate && updateInfo.newRules) {
    Logger.info('📢 Доступно обновление правил парсинга');
    
    figma.ui.postMessage({
      type: 'rules-update-available',
      newVersion: updateInfo.newRules.version,
      currentVersion: rulesManager.getCurrentRules().version,
      hash: updateInfo.hash || ''
    });
  }
}

// Инициализация плагина
(async function initPlugin() {
  try {
<<<<<<< HEAD
    figma.showUI(__html__, { width: 320, height: 380 });
=======
    figma.showUI(__html__, { width: 320, height: 600 });
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
    
    // Отправляем начальное состояние выделения
    figma.ui.postMessage({
      type: 'selection-status',
      hasSelection: figma.currentPage.selection.length > 0
    });
    
<<<<<<< HEAD
    // Загружаем сохранённый log-level
    try {
      const savedLevel = await figma.clientStorage.getAsync('contentify_log_level');
      if (savedLevel !== undefined && savedLevel >= LogLevel.SILENT && savedLevel <= LogLevel.DEBUG) {
        Logger.setLevel(savedLevel as LogLevel);
      }
    } catch {
      // Используем уровень по умолчанию (SUMMARY)
    }
    
=======
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
    // Загружаем правила парсинга
    await rulesManager.loadRules();
    Logger.info('✅ Правила парсинга загружены');
    
    // Проверяем обновления в фоне
    checkRulesUpdates().catch(function(err) {
      Logger.error('Ошибка проверки обновлений правил:', err);
    });
    
  } catch (error) {
    Logger.error('❌ Ошибка при инициализации плагина:', error);
    figma.notify('❌ Ошибка загрузки плагина');
  }
})();

// Обработка изменений выделения
figma.on('selectionchange', () => {
  const hasSelection = figma.currentPage.selection.length > 0;
  figma.ui.postMessage({ type: 'selection-status', hasSelection: hasSelection });
});

// Главный обработчик сообщений
figma.ui.onmessage = async (msg) => {
  try {
    Logger.info('📨 Получено сообщение от UI:', msg.type);
    
    // Пробуем обработать простые сообщения
    const handled = await handleSimpleMessage(msg, rulesManager, checkRulesUpdates);
    if (handled) return;
    
<<<<<<< HEAD
    // === Cancel Import ===
    if (msg.type === 'cancel-import') {
      Logger.info('⛔ Получена команда отмены импорта');
      isImportCancelled = true;
      figma.ui.postMessage({ type: 'import-cancelled' });
      return;
    }
    
    // === Import CSV ===
    if (msg.type === 'import-csv') {
      // Сбрасываем флаг отмены перед началом
      isImportCancelled = false;
      
      const rows = (msg.rows || []) as CSVRow[];
      const scope = (msg.scope || 'page') as 'page' | 'selection';
      const resetBeforeImport = (msg.resetBeforeImport || false) as boolean;
      
      Logger.info('🔄 Начинаем оптимизированную обработку данных');
      
      // Callback для прогресса (проверяет отмену)
      const onProgress = (current: number, total: number, message: string, operationType: string) => {
        if (isImportCancelled) return;
=======
    // === Import CSV ===
    if (msg.type === 'import-csv') {
      const rows = (msg.rows || []) as CSVRow[];
      const scope = (msg.scope || 'page') as 'page' | 'selection';
      const resetBeforeImport = (msg.resetBeforeImport || false) as boolean;
      
      Logger.info('🔄 Начинаем оптимизированную обработку данных');
      
      // Callback для прогресса
      const onProgress = (current: number, total: number, message: string, operationType: string) => {
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
        figma.ui.postMessage({ type: 'progress', current, total, message, operationType });
      };
      
      // Основная обработка
      const result = await processImportCSV(
        { rows, scope, resetBeforeImport },
        imageProcessor,
<<<<<<< HEAD
        onProgress,
        () => isImportCancelled // Передаём функцию проверки отмены
      );
      
      // Если отменено — не отправляем результаты
      if (isImportCancelled) {
        Logger.info('⛔ Импорт был отменён пользователем');
        return;
      }
      
=======
        onProgress
      );
      
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
      // Отправляем статистику
      figma.ui.postMessage({
        type: 'stats',
        stats: {
          processedInstances: result.processedCount,
          totalInstances: result.totalContainers,
          successfulImages: result.imageStats.successfulImages,
          skippedImages: result.imageStats.skippedImages,
          failedImages: result.imageStats.failedImages,
          errors: result.imageStats.errors
        }
      });
      
      // Отправляем завершение
      figma.ui.postMessage({
        type: 'done',
        count: result.processedCount
      });
      
      return;
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
