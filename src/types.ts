// Common types shared between UI and Code
import type { ParsingSchema } from './parsing-rules';
import type { CSVRow as CSVRowType } from './types/csv-fields';

// CSVRow реэкспортируется из types/csv-fields.ts (типизированный)
export type { CSVRow, CSVFields, SnippetType } from './types/csv-fields';

// Локальный alias для использования в этом файле
type CSVRow = CSVRowType;
export { REQUIRED_FIELDS, IMAGE_FIELDS, BOOLEAN_FIELDS, NUMERIC_FIELDS } from './types/csv-fields';

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

/**
 * Режим работы плагина (объединяет scope и mode)
 * - 'selection': заполнить выделенные компоненты
 * - 'page': заполнить все компоненты на странице
 * - 'build': создать новый фрейм из HTML
 */
export type PluginMode = 'selection' | 'page' | 'build';

export interface UserSettings {
  /** @deprecated используй mode */
  scope?: 'selection' | 'page';
  mode?: PluginMode;
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
  | { type: 'cancel-import' }  // Cancel current import operation
  // === BUILD PAGE ===
  | { type: 'build-page'; rows: CSVRow[]; html: string; wizards?: unknown[] }  // Create new page from HTML structure
  // === BROWSER RELAY ===
  | { type: 'apply-relay-payload'; payload: RelayPayload }  // Apply data from browser extension via relay
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
  // === SETUP WIZARD ===
  | { type: 'get-setup-skipped' }  // Response: 'setup-skipped-loaded'
  | { type: 'save-setup-skipped' }  // Persist that user skipped setup
  // === PARSING RULES ===
  | { type: 'get-parsing-rules' }  // Response: 'parsing-rules-loaded'
  | { type: 'check-remote-rules-update' }  // Response: 'rules-update-available' (if update exists)
  | { type: 'apply-remote-rules'; hash: string }
  | { type: 'dismiss-rules-update' }
  | { type: 'reset-rules-cache' }
  // === WHATS NEW ===
  | { type: 'check-whats-new' }  // Response: 'whats-new-status'
  | { type: 'mark-whats-new-seen'; version: string }
  // === LOGGING ===
  | { type: 'set-log-level'; level: number }  // 0=SILENT, 1=ERROR, 2=SUMMARY, 3=VERBOSE, 4=DEBUG
  | { type: 'get-log-level' }  // Response: 'log-level-loaded'
  // === UI RESIZE ===
  | { type: 'resize-ui'; width: number; height: number };  // Resize plugin window

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
  | { type: 'import-cancelled' }  // Response to cancel-import
  // === BUILD PAGE ===
  | { type: 'build-page-done'; count: number; frameName: string }  // Response to build-page
  // === BROWSER RELAY ===
  | { type: 'relay-payload-applied'; success: boolean; itemCount?: number; frameName?: string; error?: string }  // Response to apply-relay-payload
  // === RESET ===
  | { type: 'reset-done'; count: number }  // Response to reset-snippets
  // === SETTINGS ===
  | { type: 'settings-loaded'; settings: UserSettings }
  | { type: 'remote-url-loaded'; url: string }
  // === PARSING RULES ===
  | { type: 'parsing-rules-loaded'; metadata: ParsingRulesMetadata }
  | { type: 'rules-update-available'; newVersion: number; currentVersion: number; hash: string }
  // === WHATS NEW ===
  | { type: 'whats-new-status'; shouldShow: boolean; currentVersion: string }
  // === LOGGING ===
  | { type: 'log-level-loaded'; level: number };  // Current log level

/** Combined message type for window.onmessage handler */
export type PluginMessage = UIMessage | CodeMessage;

/** Payload format from browser extension via relay server */
export interface RelayPayload {
  schemaVersion: number;
  source: {
    url: string;
    title: string;
  };
  capturedAt: string;
  items: Array<{
    title?: string;
    priceText?: string;
    imageUrl?: string;
    href?: string;
  }>;
  _isMockData?: boolean;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Состояния интерфейса плагина:
 * - 'checking': проверка подключения к relay
 * - 'ready': готов к работе (независимо от relay)
 * - 'confirming': показываем диалог подтверждения импорта
 * - 'processing': обработка данных
 * - 'success': импорт успешно завершён
 * - 'fileDrop': показываем fallback для загрузки файлов
 */
export type AppState = 'checking' | 'ready' | 'confirming' | 'processing' | 'success' | 'fileDrop';

/**
 * Размеры окна плагина для разных состояний
 */
export const UI_SIZES = {
  checking: { width: 320, height: 56 },
  ready: { width: 400, height: 380 },
  confirming: { width: 340, height: 340 },
  processing: { width: 340, height: 300 },
  success: { width: 340, height: 320 },
  fileDrop: { width: 320, height: 280 },
  extensionGuide: { width: 380, height: 520 }
} as const;

/**
 * Информация о текущем запросе/импорте
 */
export interface ImportInfo {
  query: string;
  itemCount: number;
  source?: string;
  stage?: string;
}

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
