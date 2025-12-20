/**
 * Message Router — роутинг postMessage событий от UI
 */

import { Logger } from '../logger';
import { PLUGIN_VERSION } from '../config';
import { ParsingRulesManager } from '../parsing-rules-manager';
import { resetAllSnippets } from './global-handlers';

// Ключ для хранения последней просмотренной версии
const WHATS_NEW_STORAGE_KEY = 'contentify_whats_new_seen_version';

/**
 * Обработчики простых сообщений (синхронные или быстрые async)
 * Возвращает true если сообщение было обработано
 */
export async function handleSimpleMessage(
  msg: { type: string; [key: string]: unknown },
  rulesManager: ParsingRulesManager,
  checkRulesUpdates: () => Promise<void>
): Promise<boolean> {
  const { type } = msg;
  
  // === Test ===
  if (type === 'test') {
    Logger.info('✅ Получено тестовое сообщение:', msg.message);
    figma.ui.postMessage({ type: 'log', message: 'Плагин работает!' });
    return true;
  }
  
  // === Theme (compatibility) ===
  if (type === 'get-theme') {
    return true;
  }
  
  // === Close ===
  if (type === 'close') {
    Logger.info('🚪 Закрытие плагина');
    figma.closePlugin();
    return true;
  }
  
  // === Pages list ===
  if (type === 'get-pages') {
    Logger.info('📄 Запрос списка страниц от UI');
    const pages = figma.root.children.map(page => page.name);
    figma.ui.postMessage({ type: 'pages', pages: pages });
    return true;
  }
  
  // === Selection status ===
  if (type === 'check-selection') {
    const hasSelection = figma.currentPage.selection.length > 0;
    figma.ui.postMessage({ type: 'selection-status', hasSelection: hasSelection });
    return true;
  }
  
  // === Settings handlers ===
  if (type === 'get-settings') {
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
    return true;
  }
  
  if (type === 'save-settings') {
    const settings = msg.settings as { scope?: string } | undefined;
    if (settings && settings.scope) {
      await figma.clientStorage.setAsync('contentify_scope', settings.scope);
      Logger.debug('Settings saved:', settings);
    }
    return true;
  }
  
  // === Parsing rules handlers ===
  if (type === 'get-parsing-rules') {
    Logger.info('📋 Запрос правил парсинга от UI');
    const metadata = rulesManager.getCurrentMetadata();
    if (metadata) {
      figma.ui.postMessage({
        type: 'parsing-rules-loaded',
        metadata: metadata
      });
    }
    return true;
  }
  
  if (type === 'check-remote-rules-update') {
    Logger.info('🔄 Ручная проверка обновлений правил');
    checkRulesUpdates().catch(function(err) {
      Logger.error('Ошибка проверки обновлений:', err);
      figma.ui.postMessage({ type: 'error', message: 'Не удалось проверить обновления' });
    });
    return true;
  }
  
  if (type === 'apply-remote-rules') {
    Logger.info('✅ Применение удалённых правил');
    const success = await rulesManager.applyRemoteRules(msg.hash as string);
    
    if (success) {
      figma.notify('✅ Правила парсинга обновлены');
      const newMetadata = rulesManager.getCurrentMetadata();
      if (newMetadata) {
        figma.ui.postMessage({
          type: 'parsing-rules-loaded',
          metadata: newMetadata
        });
      }
    } else {
      figma.notify('❌ Не удалось применить правила');
    }
    return true;
  }
  
  if (type === 'dismiss-rules-update') {
    await rulesManager.dismissUpdate();
    Logger.info('❌ Обновление правил отклонено');
    return true;
  }
  
  if (type === 'reset-rules-cache') {
    Logger.info('🔄 Сброс кэша правил');
    const resetMetadata = await rulesManager.resetToDefaults();
    figma.notify('🔄 Правила сброшены к значениям по умолчанию');
    figma.ui.postMessage({
      type: 'parsing-rules-loaded',
      metadata: resetMetadata
    });
    return true;
  }
  
  if (type === 'get-remote-url') {
    const url = await rulesManager.getRemoteUrl();
    figma.ui.postMessage({
      type: 'remote-url-loaded',
      url: url || ''
    });
    return true;
  }
  
  if (type === 'set-remote-url') {
    const urlValue = msg.url as string;
    await rulesManager.setRemoteUrl(urlValue);
    figma.notify('✅ Remote config URL обновлён');
    Logger.info('🔗 URL обновлён: ' + urlValue);
    
    if (urlValue && urlValue.trim()) {
      checkRulesUpdates().catch(function(err) {
        Logger.error('Ошибка проверки обновлений:', err);
      });
    }
    return true;
  }
  
  // === What's New handlers ===
  if (type === 'check-whats-new') {
    try {
      const seenVersion = await figma.clientStorage.getAsync(WHATS_NEW_STORAGE_KEY);
      const shouldShow = seenVersion !== PLUGIN_VERSION;
      
      Logger.debug(`What's New check: seen=${seenVersion}, current=${PLUGIN_VERSION}, shouldShow=${shouldShow}`);
      
      figma.ui.postMessage({
        type: 'whats-new-status',
        shouldShow: shouldShow,
        currentVersion: PLUGIN_VERSION
      });
    } catch (e) {
      Logger.error('Failed to check whats-new status:', e);
      figma.ui.postMessage({
        type: 'whats-new-status',
        shouldShow: false,
        currentVersion: PLUGIN_VERSION
      });
    }
    return true;
  }
  
  if (type === 'mark-whats-new-seen') {
    try {
      await figma.clientStorage.setAsync(WHATS_NEW_STORAGE_KEY, msg.version);
      Logger.debug(`What's New marked as seen for version ${msg.version}`);
    } catch (e) {
      Logger.error('Failed to save whats-new seen status:', e);
    }
    return true;
  }
  
  // === Reset snippets ===
  if (type === 'reset-snippets') {
    const scope = (msg.scope as string) || 'page';
    Logger.info(`🔄 Сброс сниппетов (${scope})`);
    
    try {
      const onProgress = (current: number, total: number, message: string, operationType: string) => {
        figma.ui.postMessage({ type: 'progress', current, total, message, operationType });
      };
      
      const resetCount = await resetAllSnippets(scope, onProgress);
      figma.ui.postMessage({ type: 'reset-done', count: resetCount });
      figma.notify(`✅ Сброшено ${resetCount} сниппетов`);
    } catch (e) {
      Logger.error('Reset error:', e);
      figma.ui.postMessage({ type: 'error', message: 'Ошибка при сбросе сниппетов' });
    }
    return true;
  }
  
  // Not handled
  return false;
}

