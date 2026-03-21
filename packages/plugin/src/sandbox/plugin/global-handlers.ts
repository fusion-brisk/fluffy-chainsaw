/**
 * Глобальные обработчики — функции, работающие вне контекста сниппетов
 */

import { Logger } from '../../logger';
import { findSnippetContainers } from '../../utils/container-search';
import { CSVRow, ProgressCallback } from './types';

/**
 * Сбрасывает все сниппеты (instances) в области к дефолтному состоянию.
 * Использует Figma API resetOverrides() для возврата к master component.
 */
export async function resetAllSnippets(
  scope: string,
  onProgress?: ProgressCallback
): Promise<number> {
  let resetCount = 0;
  
  const containers = findSnippetContainers(scope === 'page' ? 'page' : 'selection');
  
  Logger.info(`🔍 Найдено ${containers.length} сниппетов для сброса`);
  
  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    
    // Отправляем прогресс каждые 10 сниппетов
    if (onProgress && i % 10 === 0) {
      onProgress(
        Math.round((i / containers.length) * 100),
        100,
        `Сброс сниппетов... ${i}/${containers.length}`,
        'resetting'
      );
    }
    
    try {
      if (container.type === 'INSTANCE' && !container.removed) {
        (container as InstanceNode).resetOverrides();
        resetCount++;
        Logger.debug(`  ↩️ Сброшен: ${container.name}`);
      } else if ('children' in container) {
        const instances = (container as SceneNode & ChildrenMixin).findAll(n => n.type === 'INSTANCE');
        for (const inst of instances) {
          if (!inst.removed && inst.type === 'INSTANCE') {
            (inst as InstanceNode).resetOverrides();
            resetCount++;
          }
        }
      }
    } catch (e) {
      Logger.error(`Ошибка сброса ${container.name}:`, e);
    }
  }
  
  Logger.info(`✅ Сброшено ${resetCount} инстансов`);
  return resetCount;
}

/**
 * Применяет глобальный поисковый запрос к текстовым слоям "#query" вне сниппетов.
 */
export async function applyGlobalQuery(
  rows: CSVRow[],
  scope: string
): Promise<void> {
  try {
    if (!rows || !rows.length) return;
    
    const first = rows[0] || {};
    const raw = first['#query'] || '';
    const value = raw ? String(raw).trim() : '';
    if (!value) return;
    
    const targets: SceneNode[] = [];
    
    if (scope === 'page') {
      if (figma.currentPage.findAll) {
        targets.push(...figma.currentPage.findAll(n => n.name === '#query'));
      }
    } else {
      const selection = figma.currentPage.selection || [];
      for (const node of selection) {
        if (node.removed) continue;
        if (node.name === '#query') targets.push(node);
        if ('findAll' in node) {
          try {
            const found = (node as SceneNode & ChildrenMixin).findAll((n: SceneNode) => n.name === '#query');
            if (found && found.length) targets.push(...found);
          } catch (e) {
            // ignore
          }
        }
      }
    }
    
    const expandedTargets: SceneNode[] = [];
    for (const t of targets) expandedTargets.push(t);
    
    if (!expandedTargets.length) {
      Logger.info('🔎 [Global] Слой "#query" не найден в текущем scope');
      figma.ui.postMessage({ type: 'log', message: '🔎 Не найден слой "#query" в макете' });
      return;
    }
    
    let applied = 0;
    for (const node of expandedTargets) {
      if (node.removed) continue;
      
      if (node.type === 'TEXT') {
        const textNode = node as TextNode;
        await safeSetText(textNode, value);
        applied += 1;
        continue;
      }
      
      if ('findAll' in node) {
        try {
          const innerTexts = (node as SceneNode & ChildrenMixin).findAll((n: SceneNode) => n.type === 'TEXT') as SceneNode[];
          if (innerTexts && innerTexts.length) {
            const firstText = innerTexts[0] as TextNode;
            await safeSetText(firstText, value);
            applied += 1;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    
    Logger.info(`✅ [Global] "#query" применён: ${applied} слоёв`);
    figma.ui.postMessage({ type: 'log', message: `✅ Запрос применён к "#query" (${applied})` });
  } catch (e) {
    Logger.error('❌ [Global] Ошибка применения #query:', e);
    figma.ui.postMessage({ type: 'log', message: '❌ Ошибка применения "#query" (см. консоль)' });
  }
}

/**
 * Безопасная установка текста с загрузкой шрифтов
 */
async function safeSetText(textNode: TextNode, value: string): Promise<void> {
  try {
    if (textNode.removed) return;
    const fontName = textNode.fontName;
    
    if (fontName !== figma.mixed && fontName && typeof fontName === 'object') {
      await figma.loadFontAsync(fontName as FontName);
    } else if (fontName === figma.mixed) {
      try {
        const len = (textNode.characters || '').length;
        if (len > 0) {
          const first = textNode.getRangeFontName(0, 1);
          if (first !== figma.mixed && first && typeof first === 'object') {
            await figma.loadFontAsync(first as FontName);
          }
        }
      } catch (e) {
        // ignore
      }
    }
    textNode.characters = value;
  } catch (e) {
    Logger.error('❌ [Global] Ошибка установки текста для "#query":', e);
  }
}

