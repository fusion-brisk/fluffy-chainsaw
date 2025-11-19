// Types for UI components and data structures

export interface CSVRow {
  [key: string]: string;
}

export interface ProcessingStats {
  processedInstances: number;
  totalInstances: number;
  successfulImages: number;
  skippedImages: number;
  failedImages: number;
}

export interface ProgressData {
  current: number;
  total: number;
  operationType: 'images' | 'instances';
}

export interface PluginMessage {
  type: 'import-csv' | 'log' | 'progress' | 'stats' | 'done' | 'error' | 'test' | 'close' | 'get-theme' | 'check-selection' | 'selection-status' | 'get-pages' | 'pages-list';
  rows?: CSVRow[];
  filter?: string;
  scope?: 'selection' | 'page' | 'document';
  shuffle?: boolean;
  message?: string;
  current?: number;
  total?: number;
  operationType?: 'images' | 'instances';
  stats?: ProcessingStats;
  count?: number;
  hasSelection?: boolean;
  pages?: string[];
}

export interface UIMessage {
  pluginMessage: PluginMessage;
}

export interface SheetData {
  ok: boolean;
  sheets: string[];
}

export interface Config {
  CORS_PROXY: string;
  CORS_KEY: string;
  FETCH_TIMEOUT: number;
  RETRY_ATTEMPTS: number;
  RETRY_DELAY: number;
}

export interface ThemeColors {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-tertiary': string;
  '--bg-hover': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--text-tertiary': string;
  '--border-primary': string;
  '--border-secondary': string;
  '--border-focus': string;
  '--accent-primary': string;
  '--accent-hover': string;
  '--accent-active': string;
  '--error': string;
  '--success': string;
  '--warning': string;
}
