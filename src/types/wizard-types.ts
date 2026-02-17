/**
 * Типы данных для колдунщиков (wizards) — «Ответ Алисы» и др.
 *
 * Формат совместим с расширением коллег (mishamisha/llm-answers-exporter).
 * JSON-схема описана в mishamisha/llm-answers-exporter-0.1.0/src/types/schema.js
 */

// ============================================================================
// COMPONENT TYPES
// ============================================================================

export interface WizardSpan {
  text: string;
  bold: boolean;
}

export interface WizardFootnote {
  text: string;       // e.g. "ru.wikipedia.org*"
  href: string;       // e.g. "https://ru.wikipedia.org/wiki/..."
  iconUrl: string;    // e.g. "https://favicon.yandex.net/favicon/v2/..."
  debug: null | Record<string, unknown>;
}

export interface WizardHeading {
  type: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  text: string;
}

export interface WizardParagraph {
  type: 'p';
  spans: WizardSpan[];
  footnotes: WizardFootnote[];
}

export interface WizardListItem {
  spans: WizardSpan[];
  footnotes: WizardFootnote[];
}

export interface WizardList {
  type: 'ul' | 'ol';
  items: WizardListItem[];
}

export interface WizardImage {
  type: 'img';
  src: string;
  alt: string;
}

export interface WizardVideo {
  type: 'video';
  poster: string;
  title: string;
  host: string;
  channelTitle: string;
  views: string;
  date: string;
  duration: string;
}

export interface WizardTable {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export type WizardComponent =
  | WizardHeading
  | WizardParagraph
  | WizardList
  | WizardImage
  | WizardVideo
  | WizardTable;

// ============================================================================
// WIZARD PAYLOAD
// ============================================================================

export type WizardType = 'FuturisSearch';

export interface WizardPayload {
  type: WizardType;
  components: WizardComponent[];
}

// ============================================================================
// WIZARD COMPONENT KEYS (Figma library)
// ============================================================================

/**
 * Ключи Figma-компонентов для wizard-блоков.
 *
 * - `markdown` — компонент Markdown с variant property `Type`:
 *   h1, h2, h3, h4, h5, h6, p, p+source, bullet list, numbered list, dashed list, quote
 *   Boolean property: `Show Source#6002:0` — видимость блока источников
 * - `img` — компонент изображения
 */
export interface WizardComponentKeys {
  markdown: string;
  img: string;
}

/**
 * Допустимые значения variant property `Type` компонента Markdown.
 */
export type MarkdownVariant =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'p' | 'p+source'
  | 'bullet list' | 'numbered list' | 'dashed list'
  | 'quote';

// ============================================================================
// PROCESSING RESULT
// ============================================================================

export interface WizardProcessingResult {
  wizardCount: number;
  componentCount: number;
  errors: string[];
}
