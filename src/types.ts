// Common types shared between UI and Code
import type { ParsingSchema } from './parsing-rules';
import type { CSVRow as CSVRowType } from './types/csv-fields';

// CSVRow реэкспортируется из types/csv-fields.ts (типизированный)
export type { CSVRow, CSVFields, StrictCSVRow, SnippetType } from './types/csv-fields';

// Локальный alias для использования в этом файле
type CSVRow = CSVRowType;
export { REQUIRED_FIELDS, IMAGE_FIELDS, BOOLEAN_FIELDS, NUMERIC_FIELDS } from './types/csv-fields';

// Реэкспорт маппинга
export type { FieldMappingType, FieldMappingConfig, ComponentMappingGroup } from './types/field-mapping';
export { FIELD_MAPPINGS, getMappingForComponent, getMappingsForField, getAllDataFields } from './types/field-mapping';

// Реэкспорт валидации
export type { ValidationResult, ValidationError, ValidationWarning } from './types/validation';
export { validateRow, validateRows, hasRequiredFields, getMissingRequiredFields } from './types/validation';

export interface LayerDataItem {
  layer: SceneNode;
  rowIndex: number;
  fieldName: string;
  fieldValue: string | undefined;
  isImage: boolean;
  isText: boolean;
  isShape: boolean;
  row: CSVRow | null;
}

export interface DetailedError {
  id: string;
  type: 'image' | 'text' | 'font' | 'other';
  message: string;
  layerName?: string;
  rowIndex?: number;
  url?: string;
}

export interface ProcessingStats {
  processedInstances: number;
  totalInstances: number;
  successfulImages: number;
  skippedImages: number;
  failedImages: number;
  errors?: DetailedError[];
}

export interface ProgressData {
  current: number;
  total: number;
  message?: string;
  operationType?: string;
}

export interface Config {
  CORS_PROXY: string;
  CORS_KEY: string;
  FETCH_TIMEOUT: number;
  RETRY_ATTEMPTS: number;
  RETRY_DELAY: number;
}

export interface SheetData {
  ok: boolean;
  sheets: string[];
  error?: string;
}

export interface UserSettings {
  scope?: 'selection' | 'page';
  remoteConfigUrl?: string;
  resetBeforeImport?: boolean;
}

export interface PluginSettings {
  remoteUrl: string;
}

// Экспортируем ParsingSchema как ParsingRulesData для совместимости
export type ParsingRulesData = ParsingSchema;

export interface ParsingRulesMetadata {
  rules: ParsingSchema;
  source: 'embedded' | 'cached' | 'remote';
  lastUpdated: number; // timestamp
  hash?: string; // для проверки изменений
  remoteUrl?: string;
}

// ============================================================================
// PLUGIN MESSAGE PROTOCOL
// ============================================================================
// Communication between UI (iframe) and Code (Figma sandbox) via postMessage.
// UI sends UIMessage, Code responds with CodeMessage.
// ============================================================================

/**
 * Messages sent from UI → Code (via parent.postMessage)
 * 
 * Categories:
 * - IMPORT: import-csv (main action)
 * - LIFECYCLE: close, get-theme, test
 * - SELECTION: check-selection, get-pages
 * - SETTINGS: get-settings, save-settings, get-remote-url, set-remote-url
 * - PARSING RULES: get-parsing-rules, check-remote-rules-update, apply-remote-rules, 
 *                  dismiss-rules-update, reset-rules-cache
 * - WHATS NEW: check-whats-new, mark-whats-new-seen
 */
export type UIMessage = 
  // === IMPORT ===
  | { type: 'import-csv'; rows: CSVRow[]; scope: string; filter?: string; resetBeforeImport?: boolean }
  // === RESET ===
  | { type: 'reset-snippets'; scope: string }  // Reset all snippets to default state
  // === LIFECYCLE ===
  | { type: 'test'; message: string }
  | { type: 'get-theme' }  // Theme detected via prefers-color-scheme, handler is no-op
  | { type: 'close' }
  // === SELECTION ===
  | { type: 'get-pages' }  // Response: 'pages'
  | { type: 'check-selection' }  // Response: 'selection-status'
  // === SETTINGS ===
  | { type: 'save-settings'; settings: UserSettings }
  | { type: 'get-settings' }  // Response: 'settings-loaded'
  | { type: 'get-remote-url' }  // Response: 'remote-url-loaded'
  | { type: 'set-remote-url'; url: string }
  // === PARSING RULES ===
  | { type: 'get-parsing-rules' }  // Response: 'parsing-rules-loaded'
  | { type: 'check-remote-rules-update' }  // Response: 'rules-update-available' (if update exists)
  | { type: 'apply-remote-rules'; hash: string }
  | { type: 'dismiss-rules-update' }
  | { type: 'reset-rules-cache' }
  // === WHATS NEW ===
  | { type: 'check-whats-new' }  // Response: 'whats-new-status'
  | { type: 'mark-whats-new-seen'; version: string };

/**
 * Messages sent from Code → UI (via figma.ui.postMessage)
 * 
 * Categories:
 * - LOGGING: log, error
 * - PROGRESS: progress, stats, done
 * - STATE: selection-status, pages
 * - SETTINGS: settings-loaded, remote-url-loaded
 * - PARSING RULES: parsing-rules-loaded, rules-update-available
 * - WHATS NEW: whats-new-status
 */
export type CodeMessage = 
  // === LOGGING ===
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  // === STATE ===
  | { type: 'pages'; pages: string[] }
  | { type: 'selection-status'; hasSelection: boolean }
  // === PROGRESS ===
  | { type: 'progress'; current: number; total: number; message?: string; operationType?: string }
  | { type: 'stats'; stats: ProcessingStats }
  | { type: 'done'; count: number }
  // === RESET ===
  | { type: 'reset-done'; count: number }  // Response to reset-snippets
  // === SETTINGS ===
  | { type: 'settings-loaded'; settings: UserSettings }
  | { type: 'remote-url-loaded'; url: string }
  // === PARSING RULES ===
  | { type: 'parsing-rules-loaded'; metadata: ParsingRulesMetadata }
  | { type: 'rules-update-available'; newVersion: number; currentVersion: number; hash: string }
  // === WHATS NEW ===
  | { type: 'whats-new-status'; shouldShow: boolean; currentVersion: string };

/** Combined message type for window.onmessage handler */
export type PluginMessage = UIMessage | CodeMessage;

// [REFACTOR-CHECKPOINT-1] Tab-based UI types
export type TabType = 'import' | 'logs';

export type UIState = 'idle' | 'loading';

// ============================================================================
// HANDLER CONTEXT
// ============================================================================
// Context passed to component handlers during processing
// ============================================================================

/**
 * Context object passed to all component handlers
 */
export interface HandlerContext {
  container: BaseNode;
  containerKey: string;
  row: CSVRow | null;
}
