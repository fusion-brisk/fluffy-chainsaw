/**
 * Message Router — роутинг postMessage событий от UI
 */

import { Logger, LogLevel } from '../../logger';
import { PLUGIN_VERSION, SESSION_CODE_KEY } from '../../config';
import { ParsingRulesManager } from '../../parsing-rules-manager';
import { resetAllSnippets } from './global-handlers';
import { buildExportHtml } from '../html-export/export-handler';
import type { UserSettings } from '../../types';
import type { HtmlNode } from '../html-export/tree-to-html';

// Ключ для хранения последней просмотренной версии
const WHATS_NEW_STORAGE_KEY = 'contentify_whats_new_seen_version';
// Ключ для one-time first-run tip на compact-strip (показывается один раз после
// успешного pair-a). Значение — любой truthy marker, важен сам факт присутствия.
const ONBOARDING_SEEN_KEY = 'contentify_onboarding_seen';

/**
 * Обработчики простых сообщений (синхронные или быстрые async)
 * Возвращает true если сообщение было обработано
 */
export async function handleSimpleMessage(
  msg: { type: string; [key: string]: unknown },
  rulesManager: ParsingRulesManager,
  checkRulesUpdates: () => Promise<void>,
): Promise<boolean> {
  const { type } = msg;

  // === Test ===
  if (type === 'test') {
    Logger.debug('✅ Получено тестовое сообщение:', msg.message);
    figma.ui.postMessage({ type: 'log', message: 'Плагин работает!' });
    return true;
  }

  // === Theme (compatibility) ===
  if (type === 'get-theme') {
    return true;
  }

  // === Close ===
  if (type === 'close') {
    Logger.debug('🚪 Закрытие плагина');
    figma.closePlugin();
    return true;
  }

  // === Pages list ===
  if (type === 'get-pages') {
    Logger.verbose('📄 Запрос списка страниц от UI');
    const pages = figma.root.children.map((page) => page.name);
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
      const [scope, logLevel] = await Promise.all([
        figma.clientStorage.getAsync('contentify_scope'),
        figma.clientStorage.getAsync('contentify_log_level'),
      ]);
      const settings: UserSettings = {
        scope: scope === 'page' || scope === 'selection' ? scope : 'selection',
      };
      if (typeof logLevel === 'number') {
        settings.logLevel = logLevel;
        Logger.setLevel(logLevel as LogLevel);
      }

      figma.ui.postMessage({ type: 'settings-loaded', settings });
    } catch (e) {
      Logger.error('Failed to load settings:', e);
      figma.ui.postMessage({ type: 'settings-loaded', settings: { scope: 'selection' } });
    }
    return true;
  }

  if (type === 'save-settings') {
    const settings = msg.settings as UserSettings | undefined;
    if (settings) {
      const writes: Promise<void>[] = [];

      if (settings.scope) {
        writes.push(figma.clientStorage.setAsync('contentify_scope', settings.scope));
      }
      if (typeof settings.logLevel === 'number') {
        writes.push(figma.clientStorage.setAsync('contentify_log_level', settings.logLevel));
        Logger.setLevel(settings.logLevel as LogLevel);
      }

      await Promise.all(writes);
      Logger.debug('Settings saved:', settings);
    }
    return true;
  }

  // === Setup skipped preference ===
  if (type === 'get-setup-skipped') {
    try {
      const skipped = await figma.clientStorage.getAsync('contentify_setup_skipped');
      figma.ui.postMessage({
        type: 'setup-skipped-loaded',
        skipped: skipped === true,
      });
    } catch (e) {
      Logger.error('Failed to load setup-skipped:', e);
      figma.ui.postMessage({ type: 'setup-skipped-loaded', skipped: false });
    }
    return true;
  }

  if (type === 'save-setup-skipped') {
    try {
      await figma.clientStorage.setAsync('contentify_setup_skipped', true);
      Logger.debug('Setup skipped preference saved');
    } catch (e) {
      Logger.error('Failed to save setup-skipped:', e);
    }
    return true;
  }

  // === Cloud relay session code ===
  if (type === 'get-session-code') {
    try {
      const code = await figma.clientStorage.getAsync(SESSION_CODE_KEY);
      const sessionCode = typeof code === 'string' && code.length === 6 ? code : null;
      figma.ui.postMessage({ type: 'session-code-loaded', sessionCode });
    } catch (e) {
      Logger.error('Failed to load session code:', e);
      figma.ui.postMessage({ type: 'session-code-loaded', sessionCode: null });
    }
    return true;
  }

  if (type === 'set-session-code') {
    const code = msg.code as string | undefined;
    if (typeof code !== 'string' || !/^[A-Z0-9]{6}$/.test(code)) {
      Logger.error('Invalid session code, not saving:', code);
      return true;
    }
    try {
      await figma.clientStorage.setAsync(SESSION_CODE_KEY, code);
      Logger.debug('Session code saved');
    } catch (e) {
      Logger.error('Failed to save session code:', e);
    }
    return true;
  }

  // === Parsing rules handlers ===
  if (type === 'get-parsing-rules') {
    Logger.verbose('📋 Запрос правил парсинга от UI');
    const metadata = rulesManager.getCurrentMetadata();
    if (metadata) {
      figma.ui.postMessage({
        type: 'parsing-rules-loaded',
        metadata: metadata,
      });
    }
    return true;
  }

  if (type === 'check-remote-rules-update') {
    Logger.verbose('🔄 Ручная проверка обновлений правил');
    checkRulesUpdates().catch(function (err) {
      Logger.error('Ошибка проверки обновлений:', err);
      figma.ui.postMessage({ type: 'error', message: 'Не удалось проверить обновления' });
    });
    return true;
  }

  if (type === 'apply-remote-rules') {
    Logger.verbose('✅ Применение удалённых правил');
    const success = await rulesManager.applyRemoteRules(msg.hash as string);

    if (success) {
      figma.notify('✅ Правила парсинга обновлены');
      const newMetadata = rulesManager.getCurrentMetadata();
      if (newMetadata) {
        figma.ui.postMessage({
          type: 'parsing-rules-loaded',
          metadata: newMetadata,
        });
      }
    } else {
      figma.notify('❌ Не удалось применить правила');
    }
    return true;
  }

  if (type === 'dismiss-rules-update') {
    await rulesManager.dismissUpdate();
    Logger.verbose('❌ Обновление правил отклонено');
    return true;
  }

  if (type === 'reset-rules-cache') {
    Logger.verbose('🔄 Сброс кэша правил');
    const resetMetadata = await rulesManager.resetToDefaults();
    figma.notify('🔄 Правила сброшены к значениям по умолчанию');
    figma.ui.postMessage({
      type: 'parsing-rules-loaded',
      metadata: resetMetadata,
    });
    return true;
  }

  if (type === 'get-remote-url') {
    const url = await rulesManager.getRemoteUrl();
    figma.ui.postMessage({
      type: 'remote-url-loaded',
      url: url || '',
    });
    return true;
  }

  if (type === 'set-remote-url') {
    const urlValue = msg.url as string;
    await rulesManager.setRemoteUrl(urlValue);
    figma.notify('✅ Remote config URL обновлён');
    Logger.verbose('🔗 URL обновлён: ' + urlValue);

    if (urlValue && urlValue.trim()) {
      checkRulesUpdates().catch(function (err) {
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

      Logger.debug(
        `What's New check: seen=${seenVersion}, current=${PLUGIN_VERSION}, shouldShow=${shouldShow}`,
      );

      figma.ui.postMessage({
        type: 'whats-new-status',
        shouldShow: shouldShow,
        currentVersion: PLUGIN_VERSION,
      });
    } catch (e) {
      Logger.error('Failed to check whats-new status:', e);
      figma.ui.postMessage({
        type: 'whats-new-status',
        shouldShow: false,
        currentVersion: PLUGIN_VERSION,
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

  // === Onboarding tip handlers ===
  if (type === 'check-onboarding-seen') {
    try {
      const seen = await figma.clientStorage.getAsync(ONBOARDING_SEEN_KEY);
      figma.ui.postMessage({ type: 'onboarding-seen-status', seen: seen === true });
    } catch (e) {
      Logger.error('Failed to check onboarding status:', e);
      figma.ui.postMessage({ type: 'onboarding-seen-status', seen: false });
    }
    return true;
  }

  if (type === 'mark-onboarding-seen') {
    try {
      await figma.clientStorage.setAsync(ONBOARDING_SEEN_KEY, true);
      Logger.debug('Onboarding tip marked as seen');
    } catch (e) {
      Logger.error('Failed to save onboarding seen status:', e);
    }
    return true;
  }

  // === Log level handlers ===
  if (type === 'get-log-level') {
    const level = Logger.getLevel();
    figma.ui.postMessage({ type: 'log-level-loaded', level: level });
    return true;
  }

  if (type === 'set-log-level') {
    const level = msg.level as number;
    if (level >= LogLevel.SILENT && level <= LogLevel.DEBUG) {
      Logger.setLevel(level as LogLevel);
      // Сохраняем в storage
      figma.clientStorage.setAsync('contentify_log_level', level).catch(() => {});
    }
    return true;
  }

  // === Reset snippets ===
  if (type === 'reset-snippets') {
    const scope = (msg.scope as string) || 'page';
    Logger.verbose(`🔄 Сброс сниппетов (${scope})`);

    try {
      const onProgress = (
        current: number,
        total: number,
        message: string,
        operationType: string,
      ) => {
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

  // === Export HTML ===
  if (type === 'export-html') {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      const errorMsg = 'Выберите фрейм для экспорта';
      figma.notify(errorMsg, { error: true });
      figma.ui.postMessage({ type: 'export-html-error', message: errorMsg });
      return true;
    }

    const rootNode = selection[0];
    Logger.debug('Export HTML: ' + rootNode.name + ' (' + rootNode.type + ')');

    try {
      const nodeCount = countExportNodes(rootNode);
      const MAX_NODES = 5000;
      if (nodeCount > MAX_NODES) {
        const errorMsg =
          'Слишком большой выбор (' + nodeCount + ' нод). Максимум ' + MAX_NODES + '.';
        figma.notify(errorMsg, { error: true });
        figma.ui.postMessage({ type: 'export-html-error', message: errorMsg });
        return true;
      }

      // Collect and export images
      const imageEntries = collectExportImages(rootNode);
      const imageMap: Record<string, string> = {};
      const limit = Math.min(imageEntries.length, 20);
      for (let i = 0; i < limit; i++) {
        try {
          const bytes = await imageEntries[i].node.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: 2 },
          });
          imageMap[imageEntries[i].imageRef] = 'data:image/png;base64,' + figma.base64Encode(bytes);
        } catch (imgErr) {
          Logger.debug('Image export failed: ' + imageEntries[i].imageRef);
        }
      }

      const serialized = serializeExportNode(rootNode);
      const result = buildExportHtml(serialized as unknown as HtmlNode, imageMap);

      figma.ui.postMessage({
        type: 'export-html-result',
        html: result.html,
        fileName: result.fileName,
      });
      figma.notify('HTML exported: ' + result.fileName);
    } catch (e) {
      Logger.error('Export HTML error:', e);
      const errorMsg = 'Ошибка экспорта: ' + String(e);
      figma.notify(errorMsg, { error: true });
      figma.ui.postMessage({ type: 'export-html-error', message: errorMsg });
    }
    return true;
  }

  // Not handled
  return false;
}

function countExportNodes(node: SceneNode): number {
  let count = 1;
  if ('children' in node) {
    const ch = (node as FrameNode).children;
    for (let i = 0; i < ch.length; i++) {
      count += countExportNodes(ch[i]);
    }
  }
  return count;
}

function collectExportImages(node: SceneNode): Array<{ node: SceneNode; imageRef: string }> {
  let results: Array<{ node: SceneNode; imageRef: string }> = [];
  if ('fills' in node) {
    const fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      for (let i = 0; i < fills.length; i++) {
        if (fills[i].type === 'IMAGE' && (fills[i] as ImagePaint).imageHash) {
          results.push({ node: node, imageRef: (fills[i] as ImagePaint).imageHash! });
          break;
        }
      }
    }
  }
  if ('children' in node) {
    const ch = (node as FrameNode).children;
    for (let i = 0; i < ch.length; i++) {
      results = results.concat(collectExportImages(ch[i]));
    }
  }
  return results;
}

function serializeExportNode(node: SceneNode): Record<string, unknown> {
  const obj: Record<string, unknown> = { id: node.id, name: node.name, type: node.type };

  if ('layoutMode' in node) {
    const f = node as FrameNode;
    obj.layoutMode = f.layoutMode;
    obj.primaryAxisAlignItems = f.primaryAxisAlignItems;
    obj.counterAxisAlignItems = f.counterAxisAlignItems;
    obj.itemSpacing = f.itemSpacing;
    obj.paddingTop = f.paddingTop;
    obj.paddingRight = f.paddingRight;
    obj.paddingBottom = f.paddingBottom;
    obj.paddingLeft = f.paddingLeft;
    obj.clipsContent = f.clipsContent;
  }

  obj.absoluteBoundingBox = { x: node.x, y: node.y, width: node.width, height: node.height };

  if ('layoutSizingHorizontal' in node) {
    obj.layoutSizingHorizontal = (node as FrameNode).layoutSizingHorizontal;
    obj.layoutSizingVertical = (node as FrameNode).layoutSizingVertical;
  }
  if ('fills' in node && Array.isArray((node as GeometryMixin).fills)) {
    obj.fills = (node as GeometryMixin).fills;
  }
  if ('strokes' in node) {
    obj.strokes = (node as GeometryMixin).strokes;
    obj.strokeWeight = (node as GeometryMixin).strokeWeight;
  }
  if ('effects' in node) {
    obj.effects = (node as BlendMixin).effects;
  }
  if ('cornerRadius' in node) {
    obj.cornerRadius = (node as RectangleNode).cornerRadius;
  }
  if ('opacity' in node) {
    obj.opacity = (node as BlendMixin).opacity;
  }

  if (node.type === 'TEXT') {
    const t = node as TextNode;
    obj.characters = t.characters;
    obj.style = {
      fontFamily: typeof t.fontName !== 'symbol' ? (t.fontName as FontName).family : undefined,
      fontSize: typeof t.fontSize === 'number' ? t.fontSize : undefined,
      fontWeight: typeof t.fontWeight === 'number' ? t.fontWeight : undefined,
      lineHeightPx: (() => {
        const lh = t.lineHeight;
        if (typeof lh === 'symbol') return undefined;
        // TS narrows `lh` to the PIXELS branch here, so `.value` is safe
        return lh.unit === 'PIXELS' ? lh.value : undefined;
      })(),
      textAlignHorizontal: t.textAlignHorizontal,
    };
  }

  if (node.type === 'INSTANCE') {
    obj.componentProperties = (node as InstanceNode).componentProperties;
  }

  if ('children' in node) {
    const children: Record<string, unknown>[] = [];
    const ch = (node as FrameNode).children;
    for (let i = 0; i < ch.length; i++) {
      if (ch[i].visible !== false) {
        children.push(serializeExportNode(ch[i]));
      }
    }
    obj.children = children;
  }

  return obj;
}
