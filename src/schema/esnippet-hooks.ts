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

  // 2. Sitelinks: visibility + text filling
  applySitelinks(instance, row);

  // 3. Promo: force-set withPromo property + visibility + text filling
  forceSetWithPromo(instance, row);
  applyPromoSection(instance, row);

  // 4. Address link text
  applyAddressLink(instance, row);

  // 5. content__left clipsContent
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
 * Сайтлинки: visibility + text filling
 */
function applySitelinks(instance: InstanceNode, row: CSVRow): void {
  var sitelinksContainer =
    findFirstNodeByName(instance, 'Sitelinks') ||
    findFirstNodeByName(instance, 'Block / Snippet-staff / Sitelinks');

  // Hide sitelinks section when #Sitelinks is not 'true'
  if (row['#Sitelinks'] !== 'true') {
    // Try direct container first
    if (sitelinksContainer && 'visible' in sitelinksContainer) {
      try {
        (sitelinksContainer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug('   [ESnippet-hook] Sitelinks hidden (#Sitelinks!=true)');
      } catch (_e) { /* ignore */ }
    }
    // Broader search: hide any descendant frame/instance with 'Sitelink' or 'sitelink' in name
    if ('findAll' in instance) {
      var sitelinkNodes = instance.findAll(function(n) {
        return n.name.indexOf('itelink') !== -1 && n.type !== 'TEXT';
      });
      for (var si = 0; si < sitelinkNodes.length; si++) {
        if ('visible' in sitelinkNodes[si]) {
          try { (sitelinkNodes[si] as SceneNode).visible = false; } catch (_e) { /* ignore */ }
        }
      }
    }
    return;
  }

  if (!sitelinksContainer) return;

  var texts: string[] = [];
  for (var i = 1; i <= 4; i++) {
    var text = ((row as any)['#Sitelink_' + i] || '').trim();
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

  // Стратегия 2: Sitelinks-Item instances
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

  // Стратегия 3: text nodes containing 'Title'
  if ('findAll' in sitelinksContainer) {
    var titleNodes = (sitelinksContainer as FrameNode).findAll(function(n) {
      return n.type === 'TEXT' && (n.name === 'Sitelinks-Title' || n.name.indexOf('Title') !== -1);
    }) as TextNode[];
    for (var m = 0; m < Math.min(titleNodes.length, texts.length); m++) {
      safeSetTextNode(titleNodes[m], texts[m]);
      filled++;
    }
  }
  if (filled > 0) return;

  // Стратегия 4 (fallback): all text nodes with placeholder "Ссылка"
  if ('findAll' in sitelinksContainer) {
    var placeholders = (sitelinksContainer as FrameNode).findAll(function(n) {
      return n.type === 'TEXT' && (n as TextNode).characters === 'Ссылка';
    }) as TextNode[];
    for (var p = 0; p < Math.min(placeholders.length, texts.length); p++) {
      safeSetTextNode(placeholders[p], texts[p]);
      filled++;
    }
    if (filled > 0) {
      Logger.debug('   [ESnippet-hook] Sitelinks set via placeholder fallback (' + filled + ')');
    }
  }
}

/**
 * Force-set withPromo via full property key.
 * Workaround: setProperties({'withPromo': false}) silently fails on this component.
 */
function forceSetWithPromo(instance: InstanceNode, row: CSVRow): void {
  var hasPromo = !!((row['#Promo'] || '') as string).trim();
  if (hasPromo) return; // Only need to force when setting to false

  // Find the full key for withPromo (e.g. 'withPromo#8042:21')
  var props = instance.componentProperties;
  for (var key in props) {
    if (key.split('#')[0] === 'withPromo') {
      try {
        // Try full key
        instance.setProperties(Object.fromEntries([[key, false]]));
      } catch (_e1) {
        try {
          // Try setting all current props + withPromo=false together
          var allProps: Record<string, string | boolean> = {};
          for (var k in props) {
            var p = props[k];
            if (p && typeof p === 'object' && 'value' in p) {
              var simpleName = k.split('#')[0];
              var val = p.value;
              if (typeof val === 'string' || typeof val === 'boolean') {
                allProps[simpleName] = val;
              }
            }
          }
          allProps['withPromo'] = false;
          instance.setProperties(allProps);
        } catch (_e2) { /* ignore */ }
      }
      break;
    }
  }
}

/**
 * Промо-секция: visibility + text
 */
function applyPromoSection(instance: InstanceNode, row: CSVRow): void {
  var promoText = (row['#Promo'] || '').trim();
  var isPromo = row['#isPromo'] === 'true';

  // Find promo container for visibility control
  var promoContainer =
    findFirstNodeByName(instance, 'Promo') ||
    findFirstNodeByName(instance, 'PromoOffer') ||
    findFirstNodeByName(instance, 'InfoSection');

  // Hide promo section when no promo content
  if (!promoText && !isPromo) {
    if (promoContainer && 'visible' in promoContainer) {
      try {
        (promoContainer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug('   [ESnippet-hook] Promo hidden (no promo data)');
      } catch (_e) { /* ignore */ }
    }
    // Broader search: hide any descendant with 'Promo' or 'promo' in name
    if ('findAll' in instance) {
      var promoNodes = instance.findAll(function(n) {
        return (n.name.indexOf('romo') !== -1 || n.name.indexOf('InfoSection') !== -1) && n.type !== 'TEXT';
      });
      for (var pi = 0; pi < promoNodes.length; pi++) {
        if ('visible' in promoNodes[pi]) {
          try { (promoNodes[pi] as SceneNode).visible = false; } catch (_e) { /* ignore */ }
        }
      }
    }
    return;
  }

  // Set promo text if available
  if (promoText) {
    var layer =
      findTextLayerByName(instance, '#Promo') ||
      findTextLayerByName(instance, 'InfoSection-Text') ||
      findTextLayerByName(instance, 'PromoText');
    if (layer) {
      safeSetTextNode(layer, promoText);
      Logger.debug('   [ESnippet-hook] Promo text set');
    }
  }
}

/**
 * Address link: set #addressLink text on the address layer
 */
function applyAddressLink(instance: InstanceNode, row: CSVRow): void {
  var addressLink = (row['#addressLink'] || '').trim();
  if (!addressLink) return;

  // Try multiple name variants for the address link text layer
  var layer =
    findTextLayerByName(instance, '#addressLink') ||
    findTextLayerByName(instance, 'addressLink') ||
    findTextLayerByName(instance, 'Address-Link') ||
    findTextLayerByName(instance, 'ShopAddress-Link');

  if (layer) {
    safeSetTextNode(layer, addressLink);
    Logger.debug('   [ESnippet-hook] addressLink set: "' + addressLink + '"');
    return;
  }

  // Fallback: find the address container and look for link-like text nodes
  var addressContainer =
    findFirstNodeByName(instance, 'ShopOfflineRegion') ||
    findFirstNodeByName(instance, 'Address') ||
    findFirstNodeByName(instance, 'ShopAddress');

  if (addressContainer && 'findAll' in addressContainer) {
    // Find text nodes that look like address links (contain "ул." or typical defaults)
    var textNodes = (addressContainer as FrameNode).findAll(function(n) {
      return n.type === 'TEXT';
    }) as TextNode[];

    // The address link is typically the second text node (after city/metro text)
    // or the one containing typical address patterns
    for (var i = 0; i < textNodes.length; i++) {
      var chars = textNodes[i].characters;
      if (chars.indexOf('ул.') !== -1 || chars.indexOf('переулок') !== -1 ||
          chars.indexOf('пр.') !== -1 || chars.indexOf('ш.') !== -1 ||
          chars === '#addressLink') {
        safeSetTextNode(textNodes[i], addressLink);
        Logger.debug('   [ESnippet-hook] addressLink set via fallback: "' + addressLink + '"');
        return;
      }
    }
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
