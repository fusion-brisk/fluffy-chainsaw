// Common types shared between UI and Code

export interface CSVRow {
  [key: string]: string;
}

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
}

// Messages sent from UI to Code
export type UIMessage = 
  | { type: 'import-csv'; rows: CSVRow[]; scope: string; filter?: string }
  | { type: 'test'; message: string }
  | { type: 'get-theme' }
  | { type: 'close' }
  | { type: 'get-pages' }
  | { type: 'check-selection' }
  | { type: 'save-settings'; settings: UserSettings }
  | { type: 'get-settings' };

// Messages sent from Code to UI
export type CodeMessage = 
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'pages'; pages: string[] }
  | { type: 'selection-status'; hasSelection: boolean }
  | { type: 'progress'; current: number; total: number; operationType?: string }
  | { type: 'stats'; stats: ProcessingStats }
  | { type: 'done'; count: number }
  | { type: 'settings-loaded'; settings: UserSettings };

// Combined type
export type PluginMessage = UIMessage | CodeMessage;
