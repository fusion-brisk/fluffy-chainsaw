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
export {
  validateRow,
  validateRows,
  hasRequiredFields,
  getMissingRequiredFields,
} from './types/validation';

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
  fieldsSet?: number;
  fieldsFailed?: number;
  handlerErrors?: number;
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
export interface UserSettings {
  /** @deprecated используй mode */
  scope?: 'selection' | 'page';
  remoteConfigUrl?: string;
  resetBeforeImport?: boolean;
  logLevel?: number; // default 2 (SUMMARY)
}

export interface PluginSettings {
  remoteUrl: string;
}

// ============================================================================
// DEBUG REPORT
// ============================================================================

export interface DebugReport {
  timestamp: string;
  operation: 'relay-import';
  success: boolean;
  duration: number;
  query?: string;
  platform?: string;
  structure?: {
    totalNodes: number;
    containers: number;
    byType: Record<string, number>;
  };
  created?: {
    total: number;
    byType?: Record<string, number>;
  };
  errors: Array<{ type: string; message: string; count?: number }>;
  images?: {
    success: number;
    failed: number;
    skipped: number;
  };
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
 * - IMPORT: apply-relay-payload (from browser extension)
 * - LIFECYCLE: close, get-theme, test
 * - SELECTION: check-selection, get-pages
 * - SETTINGS: get-settings, save-settings, get-remote-url, set-remote-url
 * - PARSING RULES: get-parsing-rules, check-remote-rules-update, apply-remote-rules,
 *                  dismiss-rules-update, reset-rules-cache
 * - WHATS NEW: check-whats-new, mark-whats-new-seen
 */
export type UIMessage =
  // === BROWSER RELAY ===
  | { type: 'apply-relay-payload'; payload: RelayPayload; scope?: string } // Apply data from browser extension via relay
  | {
      type: 'apply-feed-payload';
      payload: { cards: Array<Record<string, string>>; platform: string };
    } // Apply ya.ru feed cards
  // === RESET ===
  | { type: 'reset-snippets'; scope: string } // Reset all snippets to default state
  // === LIFECYCLE ===
  | { type: 'test'; message: string }
  | { type: 'get-theme' } // Theme detected via prefers-color-scheme, handler is no-op
  | { type: 'close' }
  | { type: 'close-plugin'; message?: string } // Close plugin with optional toast message
  // === SELECTION ===
  | { type: 'get-pages' } // Response: 'pages'
  | { type: 'check-selection' } // Response: 'selection-status'
  // === SETTINGS ===
  | { type: 'save-settings'; settings: UserSettings }
  | { type: 'get-settings' } // Response: 'settings-loaded'
  | { type: 'get-remote-url' } // Response: 'remote-url-loaded'
  | { type: 'set-remote-url'; url: string }
  // === SETUP WIZARD ===
  | { type: 'get-setup-skipped' } // Response: 'setup-skipped-loaded'
  | { type: 'save-setup-skipped' } // Persist that user skipped setup
  // === PARSING RULES ===
  | { type: 'get-parsing-rules' } // Response: 'parsing-rules-loaded'
  | { type: 'check-remote-rules-update' } // Response: 'rules-update-available' (if update exists)
  | { type: 'apply-remote-rules'; hash: string }
  | { type: 'dismiss-rules-update' }
  | { type: 'reset-rules-cache' }
  // === WHATS NEW ===
  | { type: 'check-whats-new' } // Response: 'whats-new-status'
  | { type: 'mark-whats-new-seen'; version: string }
  // === LOGGING ===
  | { type: 'set-log-level'; level: number } // 0=SILENT, 1=ERROR, 2=SUMMARY, 3=VERBOSE, 4=DEBUG
  | { type: 'get-log-level' } // Response: 'log-level-loaded'
  // === UI RESIZE ===
  | { type: 'resize-ui'; width: number; height: number } // Resize plugin window
  // === PLATFORM ===
  | { type: 'set-platform'; platform: 'desktop' | 'mobile' }; // UI platform info

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
  | { type: 'import-cancelled' } // Response to cancel-import
  // === BROWSER RELAY ===
  | {
      type: 'relay-payload-applied';
      success: boolean;
      itemCount?: number;
      frameName?: string;
      error?: string;
    } // Response to apply-relay-payload
  | { type: 'all-operations-complete' } // All async work done — safe to close plugin
  // === RESET ===
  | { type: 'reset-done'; count: number } // Response to reset-snippets
  // === SETTINGS ===
  | { type: 'settings-loaded'; settings: UserSettings }
  | { type: 'remote-url-loaded'; url: string }
  // === PARSING RULES ===
  | { type: 'parsing-rules-loaded'; metadata: ParsingRulesMetadata }
  | { type: 'rules-update-available'; newVersion: number; currentVersion: number; hash: string }
  // === WHATS NEW ===
  | { type: 'whats-new-status'; shouldShow: boolean; currentVersion: string }
  // === LOGGING ===
  | { type: 'log-level-loaded'; level: number } // Current log level
  // === SETUP WIZARD ===
  | { type: 'setup-skipped-loaded'; skipped: boolean } // Response to get-setup-skipped
  // === DEBUG ===
  | { type: 'debug-report'; report: unknown } // Debug report from page-creator
  // === COMPONENT INSPECTOR ===
  | { type: 'component-info'; components: ComponentInspectorData[] }; // Selected component info

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
 */
export type AppState =
  | 'setup'
  | 'checking'
  | 'ready'
  | 'confirming'
  | 'processing'
  | 'success'
  | 'error';

/**
 * Events that trigger state transitions in the FSM.
 * See docs/FSM_STATES.md for the full state diagram.
 */
export type AppEvent =
  | 'SETUP_COMPLETE'
  | 'CONNECTION_SUCCESS'
  | 'CONNECTION_FAILURE'
  | 'DATA_RECEIVED'
  | 'CONFIRM_IMPORT'
  | 'CANCEL_IMPORT'
  | 'IMPORT_COMPLETE'
  | 'IMPORT_FAILURE'
  | 'DISMISS_SUCCESS'
  | 'OPEN_PANEL'
  | 'CLOSE_PANEL';

/**
 * Type-safe FSM transition map: FSM_TRANSITIONS[currentState][event] → nextState.
 * Undefined entries mean the event is not valid in that state (no-op).
 */
export const FSM_TRANSITIONS: Record<AppState, Partial<Record<AppEvent, AppState>>> = {
  setup: { SETUP_COMPLETE: 'checking' },
  checking: { CONNECTION_SUCCESS: 'ready', CONNECTION_FAILURE: 'ready' },
  ready: { DATA_RECEIVED: 'confirming', OPEN_PANEL: 'ready', CLOSE_PANEL: 'ready' },
  confirming: { CONFIRM_IMPORT: 'processing', CANCEL_IMPORT: 'ready' },
  processing: { IMPORT_COMPLETE: 'success', IMPORT_FAILURE: 'error' },
  success: { DISMISS_SUCCESS: 'ready' },
  error: { DISMISS_SUCCESS: 'ready' },
};

/**
 * Размеры окна плагина — 3 tier'а.
 * compact:  default — ready, checking, processing, success, error
 * standard: confirming only (единственный момент решения)
 * extended: onboarding, logs, inspector, settings, what's new
 */
export const UI_SIZES = {
  compact: { width: 320, height: 56 },
  standard: { width: 320, height: 220 },
  extended: { width: 420, height: 520 },
} as const;

export type UITier = keyof typeof UI_SIZES;

/** Map any AppState or panel name to a size tier */
export const STATE_TO_TIER: Record<string, UITier> = {
  setup: 'extended',
  checking: 'compact',
  ready: 'compact',
  confirming: 'standard',
  processing: 'compact',
  success: 'compact',
  error: 'compact',
  extensionGuide: 'extended',
  relayGuide: 'extended',
  logsViewer: 'extended',
  inspector: 'extended',
  whatsNew: 'extended',
};

/**
 * Данные компонента для инспектора
 */
export interface ComponentInspectorData {
  name: string;
  id: string;
  componentKey: string;
  componentName: string;
  componentSetKey?: string;
  componentSetName?: string;
  properties: Record<string, { type: string; value: string | boolean }>;
}

/**
 * Информация о текущем запросе/импорте
 */
/** Structured import summary — per-entity counts for the confirm dialog */
export interface ImportSummaryData {
  snippetCount: number;
  wizardCount: number;
  filterCount: number;
  offerCount: number;
}

export interface ImportInfo {
  query: string;
  itemCount: number;
  source?: string;
  stage?: string;
  /** Human-readable breakdown: "42 сниппета, фильтры (5), сайдбар (8 офферов)" */
  summary?: string;
  /** Structured per-entity counts for the confirm dialog */
  summaryData?: ImportSummaryData;
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
