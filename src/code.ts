/**
 * Contentify Plugin — Entry Point
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
import type { WizardPayload } from './types/wizard-types';
import { renderProductCard as renderProductCardSidebar } from './plugin/productcard-processor';

const RELAY_URL = 'http://localhost:3847';

/** Pure JS base64 encoder — no btoa dependency, safe for Figma sandbox */
function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  const rem = len % 3;
  const mainLen = len - rem;

  for (let i = 0; i < mainLen; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += chars[b0 >> 2]
            + chars[((b0 & 3) << 4) | (b1 >> 4)]
            + chars[((b1 & 15) << 2) | (b2 >> 6)]
            + chars[b2 & 63];
  }

  if (rem === 1) {
    const b0 = bytes[mainLen];
    result += chars[b0 >> 2] + chars[(b0 & 3) << 4] + '==';
  } else if (rem === 2) {
    const b0 = bytes[mainLen];
    const b1 = bytes[mainLen + 1];
    result += chars[b0 >> 2]
            + chars[((b0 & 3) << 4) | (b1 >> 4)]
            + chars[(b1 & 15) << 2]
            + '=';
  }

  return result;
}

/** Export the created SERP frame to the relay for visual comparison */
async function exportResultToRelay(frame: FrameNode, query: string): Promise<void> {
  // Always export at 1x for readable text in comparisons
  const scale = 1;

  const jpegBytes = await frame.exportAsync({
    format: 'JPG',
    constraint: { type: 'SCALE', value: scale }
  });

  const base64 = bytesToBase64(jpegBytes);
  const dataUrl = 'data:image/jpeg;base64,' + base64;

  await fetch(RELAY_URL + '/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataUrl,
      meta: {
        width: frame.width,
        height: frame.height,
        query,
        scale
      }
    })
  });

  Logger.info(`🖼️ Result exported to relay: ${Math.round(base64.length / 1024)}KB, scale=${scale}`);
}

console.log('🚀 Плагин Contentify загружен');

// Глобальные экземпляры
const imageProcessor = new ImageProcessor();
const rulesManager = new ParsingRulesManager();

// Загрузка скриншотов и размещение рядом с SERP фреймом
async function placeScreenshotSegments(pageFrame: FrameNode, query: string): Promise<void> {
  // Fetch screenshot metadata
  const metaRes = await fetch(`${RELAY_URL}/screenshot`);
  if (!metaRes.ok) return;

  const meta = await metaRes.json() as {
    count: number;
    meta: { viewportWidth: number; viewportHeight: number };
  };
  if (meta.count === 0) return;

  // Fetch all segment images
  const imageHashes: string[] = [];
  for (let i = 0; i < meta.count; i++) {
    const segRes = await fetch(`${RELAY_URL}/screenshot?index=${i}`);
    if (!segRes.ok) continue;
    const buffer = await segRes.arrayBuffer();
    const image = figma.createImage(new Uint8Array(buffer));
    imageHashes.push(image.hash);
  }

  if (imageHashes.length === 0) return;

  const { viewportWidth, viewportHeight } = meta.meta;

  // Create container frame
  const frame = figma.createFrame();
  frame.name = `Screenshot — ${query}`;
  frame.x = pageFrame.x + pageFrame.width + 100;
  frame.y = pageFrame.y;
  frame.resize(viewportWidth, viewportHeight * imageHashes.length);
  frame.clipsContent = true;

  // Place each segment as a rectangle with image fill
  for (let i = 0; i < imageHashes.length; i++) {
    const rect = figma.createRectangle();
    rect.resize(viewportWidth, viewportHeight);
    rect.x = 0;
    rect.y = i * viewportHeight;
    rect.fills = [{
      type: 'IMAGE',
      imageHash: imageHashes[i],
      scaleMode: 'FILL',
    }];
    frame.appendChild(rect);
  }

  Logger.info(`📸 Размещено ${imageHashes.length} сегментов скриншота`);
}

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

// Обработка изменений выделения + дамп свойств компонента
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  const hasSelection = selection.length > 0;
  figma.ui.postMessage({ type: 'selection-status', hasSelection });

  // Dump component properties + child tree to console for debugging
  for (const node of selection) {
    if (node.type === 'INSTANCE') {
      const inst = node as InstanceNode;
      const props = inst.componentProperties;
      const lines: string[] = [`[Selection] INSTANCE "${inst.name}" (id=${inst.id})`];
      lines.push('  --- Properties ---');
      for (const key in props) {
        const p = props[key];
        lines.push(`  ${key}: ${p.type} = ${JSON.stringify(p.value)}`);
      }
      lines.push('  --- Children (2 levels) ---');
      function dumpChildren(parent: SceneNode, depth: number): void {
        if (depth > 2 || !('children' in parent)) return;
        for (const child of (parent as FrameNode).children) {
          const hidden = child.visible === false ? ' [HIDDEN]' : '';
          const fills = 'fills' in child ? ` (fills=${Array.isArray(child.fills) ? child.fills.length : '?'})` : '';
          lines.push(`${'  '.repeat(depth + 1)}${child.type} "${child.name}"${hidden}${fills}`);
          dumpChildren(child, depth + 1);
        }
      }
      dumpChildren(inst, 0);
      console.log(lines.join('\n'));
    }
  }
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
        items?: Array<{ title?: string; priceText?: string; imageUrl?: string; href?: string; _rawCSVRow?: CSVRow }>;
        rawRows?: CSVRow[];
        wizards?: WizardPayload[];
        productCard?: import('./types/wizard-types').ProductCardPayload;
        _isMockData?: boolean;
      };

      const wizardCount = payload.wizards?.length || 0;
      const hasProductCard = !!payload.productCard;
      Logger.info(`📦 Получен payload от браузерного расширения (schema v${payload.schemaVersion || 1})`);
      Logger.info(`   Источник: ${payload.source?.url || 'unknown'}`);
      Logger.info(`   Сниппетов: ${payload.rawRows?.length || payload.items?.length || 0}, Wizard-блоков: ${wizardCount}${hasProductCard ? ', ProductCard: да' : ''}`);
      
      if (payload._isMockData) {
        Logger.info('   ⚠️ Это тестовые данные (mock)');
      }
      
      try {
        // SchemaVersion 2+: rawRows is the single source of truth
        // Backward compatible with v1 (items._rawCSVRow fallback)
        let rows: CSVRow[] = [];
        
        if (payload.rawRows && payload.rawRows.length > 0) {
          rows = payload.rawRows;
          Logger.info(`   Используем rawRows: ${rows.length} CSVRow`);
        } else if ((payload.schemaVersion || 1) < 2 && payload.items && payload.items.length > 0) {
          // Legacy v1 fallback: extract from items._rawCSVRow
          rows = payload.items
            .map(item => item._rawCSVRow)
            .filter((row): row is CSVRow => row !== undefined && row !== null);
          
          if (rows.length > 0) {
            Logger.info(`   [v1 compat] Извлечено из items._rawCSVRow: ${rows.length} CSVRow`);
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
        
        const wizards = payload.wizards || [];
        Logger.info(`🏗️ Создаём SERP страницу: ${rows.length} сниппетов + ${wizards.length} wizard, query="${query}"`);
        
        // Отправляем progress: начало
        figma.ui.postMessage({ 
          type: 'progress', 
          current: 10, 
          total: 100, 
          message: 'Импорт компонентов...', 
          operationType: 'relay-import' 
        });
        
        // Определяем платформу из данных (первая строка с #platform)
        const firstRowPlatform = rows.find(r => r['#platform'])?.['#platform'];
        const platform: 'desktop' | 'touch' = firstRowPlatform === 'touch' ? 'touch' : 'desktop';
        console.log(`📱 [Relay] Определена платформа: ${platform} (из данных: ${firstRowPlatform || 'не указана'})`);
        
        // Создаём SERP страницу из библиотечных компонентов
        const result = await createSerpPage(rows, {
          query: query || undefined,
          platform,
          contentLeftWidth: platform === 'desktop' ? 792 : undefined,
          contentGap: 0,
          leftPadding: platform === 'desktop' ? 100 : 0,
          wizards
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

          // Размещаем скриншоты рядом с SERP фреймом (не блокирует основной поток)
          placeScreenshotSegments(result.frame, query).catch(err =>
            Logger.error('Screenshot placement failed:', err)
          );

          // Export result frame to relay for visual comparison (fire-and-forget)
          exportResultToRelay(result.frame, query).catch(err =>
            Logger.error('Result export failed:', err)
          );

          // Render ProductCard sidebar if present
          if (payload.productCard) {
            try {
              const sidebarFrame = await renderProductCardSidebar(payload.productCard, platform);
              if (sidebarFrame) {
                sidebarFrame.x = result.frame.x + result.frame.width + 40;
                sidebarFrame.y = result.frame.y;
                Logger.info(`🛒 ProductCard sidebar created next to SERP frame`);
              }
            } catch (pcErr) {
              Logger.error('ProductCard render failed:', pcErr);
            }
          }

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
      const buildWizards = (msg.wizards || []) as WizardPayload[];
      
      // Автоопределение платформы из HTML
      const platform = detectPlatformFromHtml(htmlContent);
      
      Logger.info(`🏗️ Начинаем создание SERP страницы из ${rows.length} элементов + ${buildWizards.length} wizard (platform=${platform})`);
      
      try {
        const result = await createSerpPage(rows, {
          query,
          platform,
          contentLeftWidth: platform === 'desktop' ? 792 : undefined,
          contentGap: 0,
          leftPadding: platform === 'desktop' ? 100 : 0,
          wizards: buildWizards
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
          errors: result.imageStats.errors,
          fieldsSet: result.fieldsSet || 0,
          fieldsFailed: result.fieldsFailed || 0,
          handlerErrors: result.handlerErrors || 0
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

