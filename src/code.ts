/**
 * EProductSnippet Plugin — Entry Point
 * 
 * Минимальный entry point, делегирующий логику в модули:
 * - plugin/message-router.ts — роутинг сообщений
 * - plugin/snippet-processor.ts — обработка import-csv
 * - plugin/global-handlers.ts — глобальные функции
 */

import { Logger, LogLevel } from './logger';
import { PLUGIN_VERSION } from './config';
import { ImageProcessor } from './image-handlers';
import { ParsingRulesManager } from './parsing-rules-manager';
import { handleSimpleMessage, processImportCSV, CSVRow } from './plugin';
import { createSerpPage, detectPlatformFromHtml } from './page-builder';

console.log('🚀 Плагин EProductSnippet загружен');

// Глобальные экземпляры
const imageProcessor = new ImageProcessor();
const rulesManager = new ParsingRulesManager();

// Флаг отмены текущей операции
let isImportCancelled = false;

// Функция для проверки отмены (используется в processImportCSV)
export function checkCancelled(): boolean {
  return isImportCancelled;
}

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
    // Initial size matches 'checking' state
    figma.showUI(__html__, { width: 320, height: 56 });
    
    // Отправляем начальное состояние выделения
    figma.ui.postMessage({
      type: 'selection-status',
      hasSelection: figma.currentPage.selection.length > 0
    });
    
    // Загружаем сохранённый log-level
    try {
      const savedLevel = await figma.clientStorage.getAsync('contentify_log_level');
      if (savedLevel !== undefined && savedLevel >= LogLevel.SILENT && savedLevel <= LogLevel.DEBUG) {
        Logger.setLevel(savedLevel as LogLevel);
      }
    } catch {
      // Используем уровень по умолчанию (SUMMARY)
    }
    
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
    
    // === Cancel Import ===
    if (msg.type === 'cancel-import') {
      Logger.info('⛔ Получена команда отмены импорта');
      isImportCancelled = true;
      figma.ui.postMessage({ type: 'import-cancelled' });
      return;
    }
    
    // === Resize UI ===
    if (msg.type === 'resize-ui') {
      const { width, height } = msg;
      if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
        figma.ui.resize(width, height);
      }
      return;
    }
    
    // === Apply Relay Payload (from Browser Extension) ===
    if (msg.type === 'apply-relay-payload') {
      const payload = msg.payload as {
        schemaVersion: number;
        source: { url: string; title: string };
        capturedAt: string;
        items: Array<{ title?: string; priceText?: string; imageUrl?: string; href?: string; _rawCSVRow?: CSVRow }>;
        rawRows?: CSVRow[];
        _isMockData?: boolean;
      };
      
      Logger.info(`📦 Получен payload от браузерного расширения`);
      Logger.info(`   Источник: ${payload.source?.url || 'unknown'}`);
      Logger.info(`   Элементов: ${payload.items?.length || 0}`);
      
      if (payload._isMockData) {
        Logger.info('   ⚠️ Это тестовые данные (mock)');
      }
      
      try {
        // Получаем CSVRow данные — приоритет rawRows, иначе извлекаем из items._rawCSVRow
        let rows: CSVRow[] = [];
        
        if (payload.rawRows && payload.rawRows.length > 0) {
          rows = payload.rawRows;
          Logger.info(`   Используем rawRows: ${rows.length} CSVRow`);
        } else if (payload.items && payload.items.length > 0) {
          // Извлекаем из _rawCSVRow каждого item
          rows = payload.items
            .map(item => item._rawCSVRow)
            .filter((row): row is CSVRow => row !== undefined && row !== null);
          
          if (rows.length > 0) {
            Logger.info(`   Извлечено из items._rawCSVRow: ${rows.length} CSVRow`);
          } else {
            // Fallback: конвертируем items в базовый CSVRow формат
            Logger.info('   Конвертируем items в CSVRow формат');
            rows = payload.items.map(item => ({
              '#SnippetType': 'Organic',
              '#OrganicTitle': item.title || '',
              '#OrganicPrice': (item.priceText || '').replace(/[^\d]/g, ''),
              '#Currency': '₽',
              '#ProductURL': item.href || '',
              '#OrganicImage': item.imageUrl || '',
              '#ShopName': '',
              '#OrganicHost': ''
            } as CSVRow));
          }
        }
        
        if (rows.length === 0) {
          throw new Error('Нет данных для импорта');
        }
        
        // Извлекаем поисковый запрос из первой строки или URL
        let query = rows[0]?.['#query'] || '';
        if (!query && payload.source?.url) {
          try {
            const urlParams = new URL(payload.source.url).searchParams;
            query = urlParams.get('text') || urlParams.get('q') || '';
          } catch (e) {}
        }
        
        Logger.info(`🏗️ Создаём SERP страницу: ${rows.length} сниппетов, query="${query}"`);
        
        // Отправляем progress: начало
        figma.ui.postMessage({ 
          type: 'progress', 
          current: 10, 
          total: 100, 
          message: 'Импорт компонентов...', 
          operationType: 'relay-import' 
        });
        
        // Создаём SERP страницу из библиотечных компонентов
        const result = await createSerpPage(rows, {
          query: query || undefined,
          platform: 'desktop',
          contentLeftWidth: 792,
          contentGap: 0,
          leftPadding: 100
        });
        
        // Отправляем progress: завершение
        figma.ui.postMessage({ 
          type: 'progress', 
          current: 100, 
          total: 100, 
          message: 'Готово!', 
          operationType: 'relay-import' 
        });
        
        if (result.success && result.frame) {
          // Выделяем и фокусируемся на созданном фрейме
          figma.currentPage.selection = [result.frame];
          figma.viewport.scrollAndZoomIntoView([result.frame]);
          
          const count = result.createdCount || rows.length;
          figma.notify(`✅ Создано ${count} сниппетов из браузера`);
          
          figma.ui.postMessage({
            type: 'relay-payload-applied',
            success: true,
            itemCount: count,
            frameName: result.frame.name
          });
          
          Logger.info(`✅ Создан SERP фрейм "${result.frame.name}" с ${count} сниппетами`);
        } else {
          const errorMsg = result.errors?.length > 0 ? result.errors.join('; ') : 'Не удалось создать страницу';
          throw new Error(errorMsg);
        }
        
      } catch (error) {
        Logger.error('❌ Ошибка применения relay payload:', error);
        figma.ui.postMessage({
          type: 'relay-payload-applied',
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        figma.notify('❌ Ошибка импорта из браузера');
      }
      
      return;
    }
    
    // === Build Page (Create SERP from HTML) ===
    if (msg.type === 'build-page') {
      const rows = (msg.rows || []) as CSVRow[];
      const query = msg.query as string | undefined;
      const htmlContent = (msg.html || '') as string;
      
      // Автоопределение платформы из HTML
      const platform = detectPlatformFromHtml(htmlContent);
      
      Logger.info(`🏗️ Начинаем создание SERP страницы из ${rows.length} элементов (platform=${platform})`);
      
      try {
        const result = await createSerpPage(rows, {
          query,
          platform,
          contentLeftWidth: platform === 'desktop' ? 792 : undefined,
          contentGap: 0,
          leftPadding: platform === 'desktop' ? 100 : 0,
        });
        
        if (result.success) {
          Logger.info(`✅ Создано ${result.createdCount} элементов`);
          
          // Отправляем статистику
          figma.ui.postMessage({
            type: 'stats',
            stats: {
              processedInstances: result.createdCount,
              totalInstances: result.createdCount,
              successfulImages: 0,
              skippedImages: 0,
              failedImages: result.errors.length,
              errors: result.errors.map((err, i) => ({
                id: `build-${i}`,
                type: 'other' as const,
                message: err
              }))
            }
          });
          
          figma.ui.postMessage({
            type: 'build-page-done',
            count: result.createdCount,
            frameName: result.frame?.name || 'SERP Page'
          });
        } else {
          throw new Error(result.errors.join(', '));
        }
      } catch (error) {
        Logger.error('❌ Ошибка создания страницы:', error);
        figma.ui.postMessage({
          type: 'error',
          message: `Ошибка создания страницы: ${error instanceof Error ? error.message : String(error)}`
        });
      }
      
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
        figma.ui.postMessage({ type: 'progress', current, total, message, operationType });
      };
      
      // Основная обработка
      const result = await processImportCSV(
        { rows, scope, resetBeforeImport },
        imageProcessor,
        onProgress,
        () => isImportCancelled // Передаём функцию проверки отмены
      );
      
      // Если отменено — не отправляем результаты
      if (isImportCancelled) {
        Logger.info('⛔ Импорт был отменён пользователем');
        return;
      }
      
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
