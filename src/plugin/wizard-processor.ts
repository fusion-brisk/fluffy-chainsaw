/**
 * Wizard Processor — рендеринг wizard-блоков (FuturisSearch) в Figma
 *
 * Использует библиотечные компоненты:
 * - Markdown (key: 5bbe264e...) — variant property `Type`:
 *   h1–h6, p, p+source, bullet list, numbered list, dashed list, quote
 *   Boolean: `Show Source#6002:0`
 * - img (key: 4bf69ebc...) — компонент изображения
 *
 * При недоступности библиотечных компонентов — fallback на программные фреймы.
 */

import { Logger } from '../logger';
import { findTextNode } from '../utils/node-search';
import type {
  WizardPayload,
  WizardComponent,
  WizardSpan,
  WizardParagraph,
  WizardHeading,
  WizardList,
  WizardImage,
  WizardVideo,
  WizardComponentKeys,
  MarkdownVariant,
  WizardProcessingResult
} from '../types/wizard-types';

// ============================================================================
// COMPONENT KEYS
// ============================================================================

const WIZARD_COMPONENT_KEYS: WizardComponentKeys = {
  markdown: '5bbe264e14c28d64a12482cf83c8b59771d42560',
  img: '4bf69ebc80b596bf8177818121654bacc5edd3f3',
};

// ============================================================================
// COMPONENT CACHE
// ============================================================================

let cachedMarkdown: ComponentNode | null = null;
let cachedImg: ComponentNode | null = null;
let libraryAvailable = true;

/**
 * Импортирует и кэширует библиотечные компоненты.
 * Вызывается один раз при первом рендере.
 */
async function ensureComponents(): Promise<void> {
  if (!libraryAvailable) return;

  try {
    if (!cachedMarkdown) {
      cachedMarkdown = await figma.importComponentByKeyAsync(WIZARD_COMPONENT_KEYS.markdown);
      Logger.debug(`[Wizard] Markdown component imported: ${cachedMarkdown.name}`);
    }
    if (!cachedImg) {
      cachedImg = await figma.importComponentByKeyAsync(WIZARD_COMPONENT_KEYS.img);
      Logger.debug(`[Wizard] img component imported: ${cachedImg.name}`);
    }
  } catch (e) {
    Logger.warn(`[Wizard] Библиотечные компоненты недоступны, используем fallback: ${e instanceof Error ? e.message : String(e)}`);
    libraryAvailable = false;
    cachedMarkdown = null;
    cachedImg = null;
  }
}

// ============================================================================
// MARKDOWN INSTANCE HELPERS
// ============================================================================

/**
 * Создаёт инстанс Markdown-компонента с заданным вариантом.
 */
function createMarkdownInstance(variant: MarkdownVariant): InstanceNode {
  const instance = cachedMarkdown!.createInstance();
  try {
    instance.setProperties({ 'Type': variant });
  } catch (e) {
    Logger.warn(`[Wizard] Не удалось установить Type=${variant}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return instance;
}

/**
 * Находит контентный текстовый нод внутри инстанса, загружает его шрифт и записывает текст.
 */
async function fillInstanceText(instance: InstanceNode, text: string): Promise<TextNode | null> {
  const textNode = findContentTextNode(instance);
  if (!textNode) {
    Logger.warn(`[Wizard] Текстовый нод не найден в инстансе ${instance.name}`);
    return null;
  }

  try {
    await figma.loadFontAsync(textNode.fontName as FontName);
  } catch {
    // Шрифт компонента может быть уже загружен
  }

  textNode.characters = text || ' ';
  return textNode;
}

/**
 * Находит все текстовые ноды внутри узла (рекурсивно).
 */
function findAllTextNodes(node: BaseNode): TextNode[] {
  const result: TextNode[] = [];
  if (node.type === 'TEXT' && !node.removed) {
    result.push(node);
  }
  if ('children' in node && node.children) {
    for (const child of node.children) {
      result.push(...findAllTextNodes(child));
    }
  }
  return result;
}

/**
 * Находит «контентный» текстовый нод — тот, в который нужно писать данные.
 * Для dashed/numbered/bullet list — это ВТОРОЙ текст в «li» (первый — маркер).
 * Для остальных — первый текстовый нод.
 */
function findContentTextNode(instance: InstanceNode): TextNode | null {
  const allText = findAllTextNodes(instance);
  if (allText.length === 0) return null;
  if (allText.length === 1) return allText[0];

  // Если два текстовых нода и первый очень узкий (маркер списка) — берём второй
  const first = allText[0];
  if (first.width <= 20 && allText.length >= 2) {
    return allText[1];
  }

  return allText[0];
}

/**
 * Заполняет текстовый нод bold-спанами (setRangeFontName).
 * Предполагает, что шрифт Regular уже загружен в компоненте.
 * @param targetNode — если передан, пишет именно в него (не ищет через findTextNode)
 */
async function fillInstanceSpans(instance: InstanceNode, spans: WizardSpan[], targetNode?: TextNode | null): Promise<TextNode | null> {
  const fullText = spans.map(s => s.text).join('');
  const textNode = targetNode || findContentTextNode(instance);
  if (!textNode) {
    Logger.warn(`[Wizard] Текстовый нод не найден в инстансе ${instance.name}`);
    return null;
  }

  // Загружаем шрифт компонента
  const baseFontName = textNode.fontName as FontName;
  try {
    await figma.loadFontAsync(baseFontName);
  } catch {
    // already loaded
  }

  // Также загружаем Bold вариант для спанов
  const boldFontName: FontName = { family: baseFontName.family, style: 'Bold' };
  try {
    await figma.loadFontAsync(boldFontName);
  } catch {
    Logger.debug(`[Wizard] Bold шрифт не найден: ${baseFontName.family} Bold`);
  }

  textNode.characters = fullText || ' ';

  // Применяем bold-форматирование
  let offset = 0;
  for (const span of spans) {
    const len = span.text.length;
    if (len === 0) continue;
    try {
      if (span.bold) {
        textNode.setRangeFontName(offset, offset + len, boldFontName);
      } else {
        textNode.setRangeFontName(offset, offset + len, baseFontName);
      }
    } catch {
      // Fallback — оставляем как есть
    }
    offset += len;
  }

  return textNode;
}

/**
 * Ищет дочерний нод по имени (рекурсивно).
 */
function findChildByName(node: BaseNode, name: string): SceneNode | null {
  if ('children' in node && node.children) {
    for (const child of node.children) {
      if ('name' in child && child.name === name && !child.removed) {
        return child as SceneNode;
      }
      const found = findChildByName(child, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Находит инстанс фавиконки внутри Source-чипа.
 * Ищет INSTANCE с именем содержащим «Favicon».
 */
function findFaviconInstance(sourceInstance: InstanceNode): InstanceNode | null {
  function walk(node: BaseNode): InstanceNode | null {
    if (node.type === 'INSTANCE' && node.name?.includes('Favicon') && !node.removed) {
      return node;
    }
    if ('children' in node && node.children) {
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(sourceInstance);
}

/**
 * Находит заполняемый слой внутри фавиконки (после переключения в Placeholder).
 * Ищет первый нод с fills (не текстовый).
 */
function findFillableLayer(node: BaseNode): SceneNode | null {
  if (node.type !== 'TEXT' && 'fills' in node && !node.removed) {
    return node as SceneNode;
  }
  if ('children' in node && node.children) {
    for (const child of node.children) {
      const found = findFillableLayer(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Ищет дочерние инстансы с именем «Source» внутри Markdown p+source и заполняет их.
 */
function findSourceInstances(instance: InstanceNode): InstanceNode[] {
  const sources: InstanceNode[] = [];
  function walk(node: BaseNode): void {
    if (node.type === 'INSTANCE' && node.name === 'Source' && !node.removed) {
      sources.push(node);
    }
    if ('children' in node && node.children) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }
  walk(instance);
  return sources;
}

/**
 * Находит первый нод с IMAGE fill или RECTANGLE внутри instance (для img-компонента).
 */
function findImageLayer(node: BaseNode): SceneNode | null {
  if ('fills' in node && Array.isArray((node as GeometryMixin).fills)) {
    const fills = (node as GeometryMixin).fills as readonly Paint[];
    if (fills.length > 0) {
      for (const fill of fills) {
        if (fill.type === 'IMAGE') return node as SceneNode;
      }
    }
  }

  // Также проверяем по имени — в img-компоненте есть слой «Image»
  if ('name' in node && (node as SceneNode).name === 'Image' && node.type !== 'TEXT') {
    return node as SceneNode;
  }

  if ('children' in node && (node as ChildrenMixin).children) {
    for (const child of (node as ChildrenMixin).children) {
      const found = findImageLayer(child);
      if (found) return found;
    }
  }

  return null;
}

// ============================================================================
// FONTS (for fallback rendering)
// ============================================================================

const FONT_REGULAR: FontName = { family: 'YS Text', style: 'Regular' };
const FONT_BOLD: FontName = { family: 'YS Text', style: 'Bold' };
const FONT_HEADING: FontName = { family: 'YS Text', style: 'Medium' };

async function loadFallbackFonts(): Promise<void> {
  const fonts = [FONT_REGULAR, FONT_BOLD, FONT_HEADING];
  for (const font of fonts) {
    try {
      await figma.loadFontAsync(font);
    } catch {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: font.style === 'Bold' ? 'Bold' : 'Regular' });
      } catch {
        // last resort
      }
    }
  }
}

// ============================================================================
// FALLBACK RENDERERS (programmatic frames)
// ============================================================================

function buildSpanText(spans: WizardSpan[]): string {
  return spans.map(s => s.text).join('');
}

async function createRichTextNode(
  spans: WizardSpan[],
  fontSize: number = 15,
  lineHeight: number = 22
): Promise<TextNode> {
  const textNode = figma.createText();
  const fullText = buildSpanText(spans);

  textNode.characters = fullText || ' ';
  textNode.fontSize = fontSize;
  textNode.lineHeight = { value: lineHeight, unit: 'PIXELS' };
  textNode.fills = [{ type: 'SOLID', color: { r: 0.07, g: 0.07, b: 0.07 } }];

  let offset = 0;
  for (const span of spans) {
    const len = span.text.length;
    if (len === 0) continue;
    try {
      if (span.bold) {
        textNode.setRangeFontName(offset, offset + len, FONT_BOLD);
      } else {
        textNode.setRangeFontName(offset, offset + len, FONT_REGULAR);
      }
    } catch {
      // Fallback
    }
    offset += len;
  }

  return textNode;
}

async function fallbackHeading(comp: WizardHeading): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = comp.type;
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.paddingTop = 24;
  frame.paddingBottom = 8;
  frame.fills = [];

  const textNode = figma.createText();
  textNode.characters = comp.text || ' ';
  textNode.fontSize = 18;
  textNode.lineHeight = { value: 24, unit: 'PIXELS' };
  textNode.fontName = FONT_HEADING;
  textNode.fills = [{ type: 'SOLID', color: { r: 0.07, g: 0.07, b: 0.07 } }];

  frame.appendChild(textNode);
  textNode.layoutSizingHorizontal = 'FILL';

  return frame;
}

async function fallbackParagraph(comp: WizardParagraph): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = comp.footnotes.length > 0 ? 'p+source' : 'p';
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 4;
  frame.paddingBottom = 8;
  frame.fills = [];

  if (comp.spans.length > 0) {
    const textNode = await createRichTextNode(comp.spans);
    frame.appendChild(textNode);
    textNode.layoutSizingHorizontal = 'FILL';
  }

  if (comp.footnotes.length > 0) {
    const sourcesFrame = figma.createFrame();
    sourcesFrame.name = 'sources';
    sourcesFrame.layoutMode = 'HORIZONTAL';
    sourcesFrame.primaryAxisSizingMode = 'AUTO';
    sourcesFrame.counterAxisSizingMode = 'AUTO';
    sourcesFrame.itemSpacing = 8;
    sourcesFrame.fills = [];

    for (const fn of comp.footnotes) {
      const sourceFrame = figma.createFrame();
      sourceFrame.name = 'source';
      sourceFrame.layoutMode = 'HORIZONTAL';
      sourceFrame.primaryAxisSizingMode = 'AUTO';
      sourceFrame.counterAxisSizingMode = 'AUTO';
      sourceFrame.itemSpacing = 4;
      sourceFrame.cornerRadius = 12;
      sourceFrame.paddingTop = 4;
      sourceFrame.paddingBottom = 4;
      sourceFrame.paddingLeft = 8;
      sourceFrame.paddingRight = 8;
      sourceFrame.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];

      const label = figma.createText();
      label.characters = fn.text || fn.href;
      label.fontSize = 12;
      label.lineHeight = { value: 16, unit: 'PIXELS' };
      label.fontName = FONT_REGULAR;
      label.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];

      sourceFrame.appendChild(label);
      sourcesFrame.appendChild(sourceFrame);
    }

    frame.appendChild(sourcesFrame);
    sourcesFrame.layoutSizingHorizontal = 'FILL';
  }

  return frame;
}

async function fallbackListItem(comp: WizardList, index: number): Promise<FrameNode> {
  const item = comp.items[index];
  const frame = figma.createFrame();
  frame.name = comp.type === 'ul' ? 'dashed list' : 'numbered list';
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 8;
  frame.fills = [];

  const bullet = figma.createText();
  bullet.characters = comp.type === 'ul' ? '—' : `${index + 1}.`;
  bullet.fontSize = 15;
  bullet.lineHeight = { value: 22, unit: 'PIXELS' };
  bullet.fontName = FONT_REGULAR;
  bullet.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];

  frame.appendChild(bullet);

  if (item.spans.length > 0) {
    const textNode = await createRichTextNode(item.spans);
    frame.appendChild(textNode);
    textNode.layoutSizingHorizontal = 'FILL';
  }

  return frame;
}

async function fallbackImage(comp: WizardImage): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = 'img';
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.paddingTop = 8;
  frame.paddingBottom = 8;
  frame.fills = [];

  const imgFrame = figma.createFrame();
  imgFrame.name = comp.alt || 'image';
  imgFrame.resize(690, 460);
  imgFrame.cornerRadius = 12;
  imgFrame.fills = [{ type: 'SOLID', color: { r: 0.93, g: 0.93, b: 0.93 } }];

  if (comp.src) {
    try {
      const response = await fetch(comp.src);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const image = figma.createImage(new Uint8Array(buffer));
        imgFrame.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
      }
    } catch {
      Logger.debug(`[Wizard] Не удалось загрузить изображение: ${comp.src.substring(0, 80)}`);
    }
  }

  frame.appendChild(imgFrame);
  imgFrame.layoutSizingHorizontal = 'FILL';

  return frame;
}

async function fallbackVideo(comp: WizardVideo): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = 'video';
  frame.layoutMode = 'VERTICAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = 4;
  frame.paddingTop = 8;
  frame.paddingBottom = 8;
  frame.fills = [];

  const thumbFrame = figma.createFrame();
  thumbFrame.name = 'thumbnail';
  thumbFrame.resize(690, 388);
  thumbFrame.cornerRadius = 12;
  thumbFrame.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];

  frame.appendChild(thumbFrame);
  thumbFrame.layoutSizingHorizontal = 'FILL';

  if (comp.title) {
    const titleNode = figma.createText();
    titleNode.characters = comp.title;
    titleNode.fontSize = 14;
    titleNode.fontName = FONT_REGULAR;
    titleNode.fills = [{ type: 'SOLID', color: { r: 0.07, g: 0.07, b: 0.07 } }];
    frame.appendChild(titleNode);
    titleNode.layoutSizingHorizontal = 'FILL';
  }

  return frame;
}

// ============================================================================
// LIBRARY RENDERERS
// ============================================================================

/**
 * Рендерит заголовок (h1–h6) через библиотечный Markdown-компонент.
 */
async function renderHeading(comp: WizardHeading): Promise<SceneNode> {
  if (!cachedMarkdown) {
    return fallbackHeading(comp);
  }

  try {
    const variant = comp.type as MarkdownVariant;
    const instance = createMarkdownInstance(variant);
    instance.name = `${comp.type}: ${(comp.text || '').substring(0, 60)}`;

    await fillInstanceText(instance, comp.text);
    return instance;
  } catch (e) {
    Logger.warn(`[Wizard] Heading fallback: ${e instanceof Error ? e.message : String(e)}`);
    return fallbackHeading(comp);
  }
}

/**
 * Рендерит параграф через библиотечный Markdown-компонент.
 * Если есть footnotes — Type=p+source + Show Source=true.
 * Если нет — Type=p.
 */
async function renderParagraph(comp: WizardParagraph): Promise<SceneNode> {
  if (!cachedMarkdown) {
    return fallbackParagraph(comp);
  }

  try {
    const hasFootnotes = comp.footnotes.length > 0;
    const variant: MarkdownVariant = hasFootnotes ? 'p+source' : 'p';
    const instance = createMarkdownInstance(variant);

    // Show Source
    if (hasFootnotes) {
      try {
        instance.setProperties({ 'Show Source#6002:0': true });
      } catch {
        Logger.debug('[Wizard] Не удалось установить Show Source');
      }
    } else {
      try {
        instance.setProperties({ 'Show Source#6002:0': false });
      } catch {
        // Может не существовать для варианта p
      }
    }

    // Заполняем текст с bold-спанами
    if (comp.spans.length > 0) {
      await fillInstanceSpans(instance, comp.spans);
    }

    // Очищаем inline-текст в блоке sources (дефолтный «и еще вот такие истории»)
    if (hasFootnotes) {
      try {
        const sourcesWrapper = findChildByName(instance, 'sources');
        if (sourcesWrapper) {
          // Inline text node — это прямой текстовый потомок sources (не внутри Source-чипа)
          for (const child of (sourcesWrapper as FrameNode).children || []) {
            if (child.type === 'TEXT' && !child.removed) {
              await figma.loadFontAsync(child.fontName as FontName);
              child.characters = ' ';
              break;
            }
          }
        }
      } catch {
        Logger.debug('[Wizard] Не удалось очистить inline текст sources');
      }
    }

    // Заполняем Source-чипы (footnotes): текст + фавиконка + скрываем лишние
    if (hasFootnotes) {
      const sourceInstances = findSourceInstances(instance);
      const footnoteCount = comp.footnotes.length;

      for (let i = 0; i < sourceInstances.length; i++) {
        const sourceInst = sourceInstances[i];

        // Скрываем лишние Source-чипы (в компоненте их 3, данных может быть меньше)
        if (i >= footnoteCount) {
          sourceInst.visible = false;
          continue;
        }

        const fn = comp.footnotes[i];

        // Заполняем label текст
        const label = findTextNode(sourceInst);
        if (label) {
          try {
            await figma.loadFontAsync(label.fontName as FontName);
            label.characters = fn.text || fn.href;
          } catch {
            Logger.debug(`[Wizard] Не удалось заполнить Source #${i + 1} label`);
          }
        }

        // Заполняем favicon: переключаем ID → Placeholder, затем применяем IMAGE fill
        if (fn.iconUrl) {
          const faviconInst = findFaviconInstance(sourceInst);
          if (faviconInst) {
            try {
              faviconInst.setProperties({ 'ID': 'Placeholder' });

              const fillLayer = findFillableLayer(faviconInst);
              if (fillLayer && 'fills' in fillLayer) {
                const response = await fetch(fn.iconUrl);
                if (response.ok) {
                  const buffer = await response.arrayBuffer();
                  const image = figma.createImage(new Uint8Array(buffer));
                  (fillLayer as GeometryMixin).fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
                }
              }
            } catch {
              Logger.debug(`[Wizard] Не удалось загрузить favicon #${i + 1}: ${fn.iconUrl.substring(0, 60)}`);
            }
          }
        }
      }
    }

    const preview = buildSpanText(comp.spans).substring(0, 60);
    instance.name = `${variant}: ${preview}`;

    return instance;
  } catch (e) {
    Logger.warn(`[Wizard] Paragraph fallback: ${e instanceof Error ? e.message : String(e)}`);
    return fallbackParagraph(comp);
  }
}

/**
 * Рендерит список — возвращает МАССИВ инстансов (по одному на пункт).
 * ul → dashed list, ol → numbered list.
 */
async function renderList(comp: WizardList): Promise<SceneNode[]> {
  const variant: MarkdownVariant = comp.type === 'ul' ? 'dashed list' : 'numbered list';
  const nodes: SceneNode[] = [];

  for (let i = 0; i < comp.items.length; i++) {
    const item = comp.items[i];

    if (!cachedMarkdown) {
      nodes.push(await fallbackListItem(comp, i));
      continue;
    }

    try {
      const instance = createMarkdownInstance(variant);
      const itemText = item.spans.map(s => s.text).join('');
      instance.name = `${variant}: ${itemText.substring(0, 60)}`;

      // Заполняем текст пункта
      if (item.spans.length > 0) {
        await fillInstanceSpans(instance, item.spans);
      }

      nodes.push(instance);
    } catch (e) {
      Logger.warn(`[Wizard] List item #${i + 1} fallback: ${e instanceof Error ? e.message : String(e)}`);
      nodes.push(await fallbackListItem(comp, i));
    }
  }

  return nodes;
}

/**
 * Рендерит изображение через библиотечный img-компонент.
 */
async function renderImage(comp: WizardImage): Promise<SceneNode> {
  if (!cachedImg) {
    return fallbackImage(comp);
  }

  try {
    const instance = cachedImg.createInstance();
    instance.name = `img: ${(comp.alt || '').substring(0, 80)}`;

    // Заполняем Image-слой
    if (comp.src) {
      const imageLayer = findImageLayer(instance);
      if (imageLayer && 'fills' in imageLayer) {
        try {
          const response = await fetch(comp.src);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const image = figma.createImage(new Uint8Array(buffer));
            (imageLayer as GeometryMixin).fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
          }
        } catch {
          Logger.debug(`[Wizard] Не удалось загрузить изображение: ${comp.src.substring(0, 80)}`);
        }
      }
    }

    // Заполняем Title (alt текст) — ищем первый текстовый нод
    if (comp.alt) {
      const titleNode = findTextNode(instance);
      if (titleNode) {
        try {
          await figma.loadFontAsync(titleNode.fontName as FontName);
          titleNode.characters = comp.alt;
        } catch {
          Logger.debug('[Wizard] Не удалось заполнить Title в img-компоненте');
        }
      }
    }

    return instance;
  } catch (e) {
    Logger.warn(`[Wizard] Image fallback: ${e instanceof Error ? e.message : String(e)}`);
    return fallbackImage(comp);
  }
}

/**
 * Рендерит видео (fallback-only, нет библиотечного компонента).
 */
async function renderVideo(comp: WizardVideo): Promise<SceneNode> {
  return fallbackVideo(comp);
}

// ============================================================================
// DISPATCH
// ============================================================================

/**
 * Рендерит один WizardComponent → SceneNode или SceneNode[] (для списков).
 */
async function renderWizardComponent(comp: WizardComponent): Promise<SceneNode | SceneNode[] | null> {
  switch (comp.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return renderHeading(comp as WizardHeading);
    case 'p':
      return renderParagraph(comp as WizardParagraph);
    case 'ul':
    case 'ol':
      return renderList(comp as WizardList);
    case 'img':
      return renderImage(comp as WizardImage);
    case 'video':
      return renderVideo(comp as WizardVideo);
    default:
      Logger.debug(`[Wizard] Неизвестный тип компонента: ${(comp as { type: string }).type}`);
      return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Рендерит один WizardPayload (один ответ Алисы) в Figma-фрейм.
 * Возвращает фрейм «Answer Content» с auto-layout вертикальным.
 */
export async function renderWizardPayload(
  wizard: WizardPayload
): Promise<{ frame: FrameNode; componentCount: number; errors: string[] }> {
  const errors: string[] = [];
  let componentCount = 0;

  // Инициализация: библиотечные компоненты + fallback шрифты
  await ensureComponents();
  if (!libraryAvailable) {
    await loadFallbackFonts();
  }

  // Основной контейнер
  const answerFrame = figma.createFrame();
  answerFrame.name = 'FuturisSearch — Answer Content';
  answerFrame.layoutMode = 'VERTICAL';
  answerFrame.primaryAxisSizingMode = 'AUTO';
  answerFrame.counterAxisSizingMode = 'AUTO';
  answerFrame.itemSpacing = 0;
  answerFrame.paddingTop = 16;
  answerFrame.paddingBottom = 16;
  answerFrame.paddingLeft = 20;
  answerFrame.paddingRight = 20;
  answerFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  answerFrame.cornerRadius = 16;

  // Рендерим каждый компонент
  for (const comp of wizard.components) {
    try {
      const rendered = await renderWizardComponent(comp);
      if (rendered === null) continue;

      // renderList возвращает массив — раскрываем
      const nodes = Array.isArray(rendered) ? rendered : [rendered];
      for (const node of nodes) {
        answerFrame.appendChild(node);
        // img-компоненты не растягиваем — они имеют фиксированную ширину
        const isImgInstance = node.type === 'INSTANCE' && node.name.startsWith('img:');
        if (!isImgInstance && 'layoutSizingHorizontal' in node) {
          (node as FrameNode | InstanceNode).layoutSizingHorizontal = 'FILL';
        }
        componentCount++;
      }
    } catch (e) {
      const msg = `Error rendering ${comp.type}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      Logger.error(`[Wizard] ${msg}`);
    }
  }

  return { frame: answerFrame, componentCount, errors };
}

/**
 * Рендерит массив WizardPayload[] в фреймы.
 * Вызывается из page-creator для добавления в SERP-страницу.
 */
export async function renderWizards(
  wizards: WizardPayload[]
): Promise<WizardProcessingResult & { frames: FrameNode[] }> {
  const result: WizardProcessingResult & { frames: FrameNode[] } = {
    wizardCount: 0,
    componentCount: 0,
    errors: [],
    frames: []
  };

  if (!wizards || wizards.length === 0) return result;

  Logger.info(`[Wizard] Рендеринг ${wizards.length} wizard-блоков...`);

  for (const wizard of wizards) {
    try {
      const rendered = await renderWizardPayload(wizard);
      result.frames.push(rendered.frame);
      result.wizardCount++;
      result.componentCount += rendered.componentCount;
      result.errors.push(...rendered.errors);

      Logger.info(`[Wizard] ${wizard.type}: ${rendered.componentCount} компонентов`);
    } catch (e) {
      const msg = `Failed to render wizard ${wizard.type}: ${e instanceof Error ? e.message : String(e)}`;
      result.errors.push(msg);
      Logger.error(`[Wizard] ${msg}`);
    }
  }

  Logger.info(`[Wizard] Готово: ${result.wizardCount} wizard, ${result.componentCount} компонентов, ${result.errors.length} ошибок`);

  return result;
}
