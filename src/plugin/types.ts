/**
 * Типы для plugin-модулей
 */

import { LayerDataItem } from '../types';
import { CSVRow } from '../types/csv-fields';

// Реэкспорт для обратной совместимости
export type { CSVRow };

/** Результат группировки контейнеров */
export interface ContainerGroup {
  containerKey: string;
  container: SceneNode;
  layers: SceneNode[];
}

/** Результат назначения строки контейнеру */
export interface ContainerRowAssignment {
  row: CSVRow;
  rowIndex: number;
}

/** Контекст обработки import-csv */
export interface ImportContext {
  rows: CSVRow[];
  scope: 'page' | 'selection';
  resetBeforeImport: boolean;
  startTime: number;
}

/** Результат сборки контейнеров */
export interface ContainerCollectionResult {
  snippetGroups: Map<string, SceneNode[]>;
  allContainers: SceneNode[];
}

/** Результат маппинга строк на контейнеры */
export interface RowMappingResult {
  containerRowAssignments: Map<string, ContainerRowAssignment>;
  layerData: LayerDataItem[];
  processedContainers: number;
}

/** Callback для обновления прогресса */
export type ProgressCallback = (current: number, total: number, message: string, operationType: string) => void;

/** Типы сообщений от UI */
export type MessageType =
  | 'test'
  | 'get-theme'
  | 'close'
  | 'get-pages'
  | 'check-selection'
  | 'get-settings'
  | 'save-settings'
  | 'get-parsing-rules'
  | 'check-remote-rules-update'
  | 'apply-remote-rules'
  | 'dismiss-rules-update'
  | 'reset-rules-cache'
  | 'get-remote-url'
  | 'set-remote-url'
  | 'check-whats-new'
  | 'mark-whats-new-seen'
  | 'reset-snippets'
  | 'import-csv';

/** Интерфейс входящего сообщения */
export interface PluginMessage {
  type: MessageType;
  [key: string]: unknown;
}

