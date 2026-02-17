/**
 * ESnippet Structural Hooks — императивные операции, которые нельзя
 * выразить декларативно через schema engine.
 *
 * Запускается ПОСЛЕ schema engine для ESnippet/Snippet контейнеров.
 */

import { Logger } from '../logger';
import {
  findFirstNodeByName,
  findTextLayerByName,
  findFirstTextByPredicate,
  safeSetTextNode
} from '../utils/node-search';
import type { HandlerContext } from '../handlers/types';
import type { CSVRow } from '../types/csv-fields';

/**
 * ESnippet structural hook — сайтлинки, промо-текст, EThumb fallback, clipsContent.
 */
export function handleESnippetStructural(context: HandlerContext): void {
  var container = context.container;
  var row = context.row;
  if (!container || !row) return;

  var containerName = (container && 'name' in container) ? String(container.name) : '';
  if (containerName !== 'ESnippet' && containerName !== 'Snippet') return;
  if (container.type !== 'INSTANCE' || container.removed) return;

  var instance = container as InstanceNode;

  // 1. EThumb visibility fallback
  applyThumbFallback(instance, row);

  // 2. Sitelinks text filling
  applySitelinks(instance, row);

  // 3. Promo text filling (через текстовые слои, дополнительно к property из schema)
  applyPromoText(instance, row);

  // 4. content__left clipsContent
  applyClipsContentFix(instance);
}

/**
 * Если withThumb=false, принудительно скрываем EThumb-слой
 * (серый placeholder может оставаться видимым даже после свойства)
 */
function applyThumbFallback(instance: InstanceNode, row: CSVRow): void {
  if (row['#withThumb'] === 'true') return;

  var names = ['EThumb', 'Organic-OfferThumb', 'Thumb'];
  for (var i = 0; i < names.length; i++) {
    var layer = findFirstNodeByName(instance, names[i]);
    if (layer && 'visible' in layer) {
      try {
        (layer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug('   [ESnippet-hook] EThumb hidden (fallback)');
      } catch (_e) { /* ignore */ }
      return;
    }
  }
}

/**
 * Сайтлинки: 3 стратегии поиска текстовых слоёв
 */
function applySitelinks(instance: InstanceNode, row: CSVRow): void {
  if (row['#Sitelinks'] !== 'true') return;

  var sitelinksContainer =
    findFirstNodeByName(instance, 'Sitelinks') ||
    findFirstNodeByName(instance, 'Block / Snippet-staff / Sitelinks');
  if (!sitelinksContainer) return;

  var texts: string[] = [];
  for (var i = 1; i <= 4; i++) {
    var text = (row['#Sitelink_' + i] || '').trim();
    if (text) texts.push(text);
  }
  if (texts.length === 0) return;

  // Стратегия 1: именованные слои #Sitelink_N
  var filled = 0;
  for (var j = 0; j < texts.length; j++) {
    var layer =
      findTextLayerByName(sitelinksContainer, '#Sitelink_' + (j + 1)) ||
      findTextLayerByName(sitelinksContainer, 'Sitelink_' + (j + 1));
    if (layer) {
      safeSetTextNode(layer, texts[j]);
      filled++;
    }
  }
  if (filled > 0) return;

  // Стратегия 2: Sitelinks-Item
  if ('findAll' in sitelinksContainer) {
    var items = (sitelinksContainer as FrameNode).findAll(function(n) {
      return n.name === 'Sitelinks-Item' || n.name.indexOf('Sitelinks-Item') !== -1;
    });
    for (var k = 0; k < Math.min(items.length, texts.length); k++) {
      var textNode = findFirstTextByPredicate(items[k], function() { return true; });
      if (textNode) {
        safeSetTextNode(textNode, texts[k]);
        filled++;
      }
    }
  }
  if (filled > 0) return;

  // Стратегия 3: Sitelinks-Title
  if ('findAll' in sitelinksContainer) {
    var titleNodes = (sitelinksContainer as FrameNode).findAll(function(n) {
      return n.type === 'TEXT' && (n.name === 'Sitelinks-Title' || n.name.indexOf('Title') !== -1);
    }) as TextNode[];
    for (var m = 0; m < Math.min(titleNodes.length, texts.length); m++) {
      safeSetTextNode(titleNodes[m], texts[m]);
    }
  }
}

/**
 * Промо-текст: установка через текстовые слои (дополнительно к property)
 */
function applyPromoText(instance: InstanceNode, row: CSVRow): void {
  var promoText = (row['#Promo'] || '').trim();
  if (!promoText) return;

  var layer =
    findTextLayerByName(instance, '#Promo') ||
    findTextLayerByName(instance, 'InfoSection-Text') ||
    findTextLayerByName(instance, 'PromoText');
  if (layer) {
    safeSetTextNode(layer, promoText);
    Logger.debug('   [ESnippet-hook] Promo text set');
  }
}

/**
 * Отключаем clipsContent для content__left
 */
function applyClipsContentFix(instance: InstanceNode): void {
  var contentLeft = instance.findOne(function(n) { return n.name === 'content__left'; });
  if (contentLeft && contentLeft.type === 'FRAME' && !contentLeft.removed) {
    try {
      (contentLeft as FrameNode).clipsContent = false;
    } catch (_e) { /* ignore */ }
  }
}
