/**
 * ESnippet Structural Hooks — императивные операции, которые нельзя
 * выразить декларативно через schema engine.
 *
 * Запускается ПОСЛЕ schema engine для ESnippet/Snippet контейнеров.
 */

import { Logger } from '../../logger';
import { findFirstNodeByName, findTextLayerByName, safeSetTextNode } from '../../utils/node-search';
import { safeSetVisible } from '../handlers/visibility-handlers';
import type { HandlerContext } from '../handlers/types';
import type { CSVRow } from '../../types/csv-fields';

/**
 * ESnippet structural hook — сайтлинки, промо-текст, EThumb fallback, clipsContent.
 */
export function handleESnippetStructural(context: HandlerContext): void {
  const container = context.container;
  const row = context.row;
  if (!container || !row) return;

  const containerName = container && 'name' in container ? String(container.name) : '';
  if (containerName !== 'ESnippet' && containerName !== 'Snippet') return;
  if (container.type !== 'INSTANCE' || container.removed) return;

  const instance = container as InstanceNode;

  // 1. EThumb visibility fallback
  applyThumbFallback(instance, row);

  // 2. Sitelinks: visibility + text filling
  applySitelinks(instance, row);

  // 3. Force-reset boolean properties that schema computed as false
  //    Workaround: setProperties silently fails for some booleans on certain variants
  //    IMPORTANT: only reset properties NOT managed by the schema engine to avoid
  //    variant conflicts that can break favicon/greenurl visibility
  forceResetBooleans(instance, row);

  // 4. Promo: visibility + text filling
  applyPromoSection(instance, row);

  // 5. Address link text
  applyAddressLink(instance, row);

  // 6. Title: limit to 3 lines with ellipsis
  applyTitleMaxLines(instance);

  // 7. content__left clipsContent
  applyClipsContentFix(instance);
}

/**
 * Если image=none, принудительно скрываем EThumb-слой
 * (серый placeholder может оставаться видимым даже после свойства)
 */
function applyThumbFallback(instance: InstanceNode, row: CSVRow): void {
  const hasImage = row['#withThumb'] === 'true' || row['#imageType'] === 'EThumbGroup';
  if (hasImage) return;

  const names = ['EThumb', 'Organic-OfferThumb', 'Thumb'];
  for (let i = 0; i < names.length; i++) {
    const layer = findFirstNodeByName(instance, names[i]);
    if (layer && 'visible' in layer) {
      // Use safeSetVisible to avoid flipping the image variant property
      // via Figma's boolean↔visibility bidirectional sync
      const set = safeSetVisible(layer as SceneNode, false, instance);
      if (set) {
        Logger.debug('   [ESnippet-hook] EThumb hidden (fallback via safeSetVisible)');
      }
      return;
    }
  }
}

/**
 * Сайтлинки: visibility + text filling
 */
function applySitelinks(instance: InstanceNode, row: CSVRow): void {
  const sitelinksContainer =
    findFirstNodeByName(instance, 'Sitelinks') ||
    findFirstNodeByName(instance, 'Block / Snippet-staff / Sitelinks');

  // Hide sitelinks section when #Sitelinks is not 'true'
  if (row['#Sitelinks'] !== 'true') {
    // Try direct container first
    if (sitelinksContainer && 'visible' in sitelinksContainer) {
      try {
        (sitelinksContainer as SceneNode & { visible: boolean }).visible = false;
        Logger.debug('   [ESnippet-hook] Sitelinks hidden (#Sitelinks!=true)');
      } catch (_e) {
        Logger.debug('[ESnippet-hook] Sitelinks container visibility toggle failed');
      }
    }
    // Broader search: hide any descendant frame/instance with 'Sitelink' or 'sitelink' in name
    if ('findAll' in instance) {
      const sitelinkNodes = instance.findAll(function (n) {
        return n.name.indexOf('itelink') !== -1 && n.type !== 'TEXT';
      });
      for (let si = 0; si < sitelinkNodes.length; si++) {
        if ('visible' in sitelinkNodes[si]) {
          try {
            (sitelinkNodes[si] as SceneNode).visible = false;
          } catch (_e) {
            Logger.debug('[ESnippet-hook] Sitelink node visibility toggle failed');
          }
        }
      }
    }
    return;
  }

  if (!sitelinksContainer) return;

  const texts: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const text = ((row as Record<string, string | undefined>)['#Sitelink_' + i] || '').trim();
    if (text) texts.push(text);
  }
  if (texts.length === 0) return;

  // Named layers #Sitelink_N (after Figma rename, this is the only strategy needed)
  for (let j = 0; j < texts.length; j++) {
    const layer =
      findTextLayerByName(sitelinksContainer, '#Sitelink_' + (j + 1)) ||
      findTextLayerByName(sitelinksContainer, 'Sitelink_' + (j + 1));
    if (layer) {
      safeSetTextNode(layer, texts[j]);
    }
  }

  // Hide unused sitelink slots beyond the actual count.
  // Structure: Sitelink(FRAME) → #Sitelink_N(TEXT), preceded by Dot(ELLIPSE).
  // Must hide: the TEXT, its parent Sitelink FRAME, and the preceding Dot.
  const MAX_SITELINK_SLOTS = 6;
  for (let k = texts.length + 1; k <= MAX_SITELINK_SLOTS; k++) {
    const unusedText =
      findFirstNodeByName(sitelinksContainer, '#Sitelink_' + k) ||
      findFirstNodeByName(sitelinksContainer, 'Sitelink_' + k);
    if (!unusedText) continue;

    // 1. Hide the text node itself
    if ('visible' in unusedText) {
      try {
        (unusedText as SceneNode).visible = false;
      } catch (_e) {
        /* skip */
      }
    }

    // 2. Hide the parent Sitelink FRAME
    const parentFrame = unusedText.parent;
    if (parentFrame && parentFrame.name === 'Sitelink' && 'visible' in parentFrame) {
      try {
        (parentFrame as SceneNode).visible = false;
      } catch (_e) {
        /* skip */
      }

      // 3. Hide the Dot preceding this Sitelink FRAME
      const grandParent = parentFrame.parent;
      if (grandParent && 'children' in grandParent) {
        const siblings = (grandParent as FrameNode).children;
        const frameIndex = siblings.indexOf(parentFrame as SceneNode);
        if (frameIndex > 0) {
          const prevSibling = siblings[frameIndex - 1];
          if (prevSibling.name === 'Dot' && 'visible' in prevSibling) {
            try {
              (prevSibling as SceneNode).visible = false;
            } catch (_e) {
              /* skip */
            }
          }
        }
      }
    }

    Logger.debug('   [ESnippet-hook] Sitelink_' + k + ' + container + Dot hidden');
  }
}

/**
 * Force-reset specific boolean properties that schema engine's trySetProperty
 * silently fails to set on certain variant combinations.
 * Only targets known problematic properties — schema engine handles the rest.
 */
function forceResetBooleans(instance: InstanceNode, row: CSVRow): void {
  const hasPromo = !!((row['#Promo'] || '') as string).trim();
  if (hasPromo) return;

  // Try setProperties with full key first
  const props = instance.componentProperties;
  let applied = false;
  for (const key in props) {
    if (
      key.split('#')[0] === 'withPromo' &&
      props[key].type === 'BOOLEAN' &&
      props[key].value !== false
    ) {
      try {
        const obj: Record<string, boolean> = {};
        obj[key] = false;
        instance.setProperties(obj);
        applied = true;
        Logger.debug('   [ESnippet-hook] withPromo force-set to false via ' + key);
      } catch (_e) {
        Logger.debug('   [ESnippet-hook] withPromo force-set FAILED for ' + key);
      }
      break;
    }
  }

  // Verify: re-read property. If still true, hide Promo frame directly.
  // This is a Figma API workaround — setProperties silently fails on some variant combinations.
  if (!applied) {
    for (const vkey in props) {
      if (
        vkey.split('#')[0] === 'withPromo' &&
        props[vkey].type === 'BOOLEAN' &&
        props[vkey].value !== false
      ) {
        const promoFrame = findFirstNodeByName(instance, 'Promo');
        if (promoFrame && 'visible' in promoFrame) {
          try {
            (promoFrame as SceneNode).visible = false;
            Logger.debug('   [ESnippet-hook] Promo frame hidden (setProperties workaround)');
          } catch (_e2) {
            Logger.debug('   [ESnippet-hook] Promo frame hide FAILED');
          }
        }
        break;
      }
    }
  }
}

/**
 * Промо-секция: text filling only.
 * Visibility is controlled by the withPromo boolean property —
 * schema engine computes it, forceResetBooleans enforces it.
 * This hook only fills promo text content when available.
 */
function applyPromoSection(instance: InstanceNode, row: CSVRow): void {
  const promoText = (row['#Promo'] || '').trim();
  if (!promoText) return;

  // Try #PromoLabel first (current Figma naming), fallback to #PromoText (legacy)
  const labelLayer =
    findTextLayerByName(instance, '#PromoLabel') || findTextLayerByName(instance, '#PromoText');
  if (labelLayer) {
    // Use #PromoLabel field if available, otherwise full #Promo text
    const labelText = (
      (row as Record<string, string | undefined>)['#PromoLabel'] || promoText
    ).trim();
    safeSetTextNode(labelLayer, labelText);
    Logger.debug('   [ESnippet-hook] PromoLabel set: "' + labelText.substring(0, 40) + '"');
  }

  // Set promo link text if available
  const promoLink = ((row as Record<string, string | undefined>)['#PromoLink'] || '').trim();
  if (promoLink) {
    const linkLayer = findTextLayerByName(instance, 'link');
    if (linkLayer) {
      safeSetTextNode(linkLayer, promoLink);
      Logger.debug('   [ESnippet-hook] Promo link set: "' + promoLink + '"');
    }
  }
}

/**
 * Address link: set #addressLink text on the address layer
 */
function applyAddressLink(instance: InstanceNode, row: CSVRow): void {
  const addressLink = (row['#addressLink'] || '').trim();
  if (!addressLink) return;

  // Direct text layer lookup (after Figma rename)
  const layer = findTextLayerByName(instance, '#addressLink');
  if (layer) {
    safeSetTextNode(layer, addressLink);
    Logger.debug('   [ESnippet-hook] addressLink set: "' + addressLink + '"');
    return;
  }

  // Fallback: Line instance inside Address container → set value property
  const addressContainer = findFirstNodeByName(instance, 'Address');
  if (addressContainer && 'findAll' in addressContainer) {
    const lineInstances = (addressContainer as FrameNode).findAll(function (n) {
      return n.type === 'INSTANCE' && n.name === 'Line';
    }) as InstanceNode[];

    for (let li = 0; li < lineInstances.length; li++) {
      try {
        lineInstances[li].setProperties({ value: addressLink });
        Logger.debug('   [ESnippet-hook] addressLink set via Line.value: "' + addressLink + '"');
        return;
      } catch (_e) {
        Logger.debug('[ESnippet-hook] addressLink Line.value set failed');
      }
    }
  }
}

/**
 * Ограничение заголовка 3 строками с обрезкой
 */
function applyTitleMaxLines(instance: InstanceNode): void {
  const titleNode = findTextLayerByName(instance, '#OrganicTitle');
  if (!titleNode) return;
  try {
    titleNode.textTruncation = 'ENDING';
    titleNode.maxLines = 3;
  } catch (_e) {
    Logger.debug('[ESnippet-hook] Title maxLines set failed');
  }
}

/**
 * Отключаем clipsContent для content__left
 */
function applyClipsContentFix(instance: InstanceNode): void {
  const contentLeft = instance.findOne(function (n) {
    return n.name === 'content__left';
  });
  if (contentLeft && contentLeft.type === 'FRAME' && !contentLeft.removed) {
    try {
      (contentLeft as FrameNode).clipsContent = false;
    } catch (_e) {
      Logger.debug('[ESnippet-hook] clipsContent toggle failed');
    }
  }
}
