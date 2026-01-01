/**
 * Logger v2 — Система логирования с уровнями и батчингом
 *
 * Уровни:
 *   SILENT (0)  — ничего
 *   ERROR (1)   — только ошибки
 *   SUMMARY (2) — итоговая статистика (по умолчанию)
 *   VERBOSE (3) — детальные этапы
 *   DEBUG (4)   — всё включая поиск нод
 */

export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  SUMMARY = 2,
  VERBOSE = 3,
  DEBUG = 4
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  source?: string;
}

// Настройки по умолчанию
let currentLevel: LogLevel = LogLevel.SUMMARY;
let uiLoggingEnabled = true;

// Батчинг для UI
const pendingLogs: LogEntry[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_INTERVAL_MS = 100;
const BATCH_SIZE_LIMIT = 50;

// Статистика для агрегации
interface LogStats {
  totalMessages: number;
  byLevel: Record<LogLevel, number>;
  bySource: Record<string, number>;
}

const stats: LogStats = {
  totalMessages: 0,
  byLevel: {
    [LogLevel.SILENT]: 0,
    [LogLevel.ERROR]: 0,
    [LogLevel.SUMMARY]: 0,
    [LogLevel.VERBOSE]: 0,
    [LogLevel.DEBUG]: 0
  },
  bySource: {}
};

/**
 * Отправляет накопленные логи в UI
 */
function flushToUI(): void {
  if (pendingLogs.length === 0 || !uiLoggingEnabled) return;

  // Отправляем батч сообщений
  const batch = pendingLogs.splice(0, pendingLogs.length);

  // Формируем сообщения для UI
  for (const entry of batch) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const figmaGlobal = (globalThis as any).figma;
      if (figmaGlobal && figmaGlobal.ui && typeof figmaGlobal.ui.postMessage === 'function') {
        figmaGlobal.ui.postMessage({ type: 'log', message: entry.message });
      }
    } catch {
      // Игнорируем ошибки postMessage
    }
  }

  batchTimer = null;
}

/**
 * Добавляет лог в очередь для UI
 */
function queueForUI(entry: LogEntry): void {
  if (!uiLoggingEnabled) return;

  pendingLogs.push(entry);

  // Принудительный flush при достижении лимита
  if (pendingLogs.length >= BATCH_SIZE_LIMIT) {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    flushToUI();
    return;
  }

  // Отложенный flush
  if (!batchTimer) {
    batchTimer = setTimeout(flushToUI, BATCH_INTERVAL_MS);
  }
}

/**
 * Основная функция логирования
 */
function log(level: LogLevel, message: string, source?: string, ...args: unknown[]): void {
  // Zero-cost check
  if (level > currentLevel) return;

  // Статистика
  stats.totalMessages++;
  stats.byLevel[level]++;
  if (source) {
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;
  }

  // Формируем сообщение с аргументами
  let fullMessage = message;
  if (args.length > 0) {
    const argsStr = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    fullMessage = `${message} ${argsStr}`;
  }

  // Добавляем source prefix если есть
  const displayMessage = source ? `[${source}] ${fullMessage}` : fullMessage;

  // Console output (всегда синхронно)
  switch (level) {
    case LogLevel.ERROR:
      console.error(displayMessage);
      break;
    case LogLevel.SUMMARY:
    case LogLevel.VERBOSE:
      console.log(displayMessage);
      break;
    case LogLevel.DEBUG:
      console.log(displayMessage);
      break;
  }

  // Queue for UI (батчинг)
  const entry: LogEntry = {
    level,
    message: displayMessage,
    timestamp: Date.now(),
    source
  };
  queueForUI(entry);
}

/**
 * Logger API — обратно совместимый интерфейс
 */
export const Logger = {
  /**
   * Устанавливает уровень логирования
   */
  setLevel(level: LogLevel): void {
    currentLevel = level;
    console.log(`[Logger] Level set to ${LogLevel[level]}`);
  },

  /**
   * Возвращает текущий уровень
   */
  getLevel(): LogLevel {
    return currentLevel;
  },

  /**
   * Включает/выключает отправку логов в UI
   */
  setUILogging(enabled: boolean): void {
    uiLoggingEnabled = enabled;
  },

  /**
   * Принудительно отправляет все накопленные логи в UI
   */
  flush(): void {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    flushToUI();
  },

  /**
   * Возвращает статистику логирования
   */
  getStats(): LogStats {
    return { ...stats };
  },

  /**
   * Сбрасывает статистику
   */
  resetStats(): void {
    stats.totalMessages = 0;
    stats.byLevel = {
      [LogLevel.SILENT]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.SUMMARY]: 0,
      [LogLevel.VERBOSE]: 0,
      [LogLevel.DEBUG]: 0
    };
    stats.bySource = {};
  },

  // === УРОВНИ ЛОГИРОВАНИЯ ===

  /**
   * Ошибки — всегда логируются (кроме SILENT)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(message: string, ...args: any[]): void {
    log(LogLevel.ERROR, message, undefined, ...args);
  },

  /**
   * Предупреждения — уровень ERROR+
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn(message: string, ...args: any[]): void {
    // Warnings показываются на уровне ERROR и выше
    if (currentLevel >= LogLevel.ERROR) {
      console.warn(message, ...args);
      queueForUI({
        level: LogLevel.ERROR,
        message: args.length > 0 ? `${message} ${args.join(' ')}` : message,
        timestamp: Date.now()
      });
    }
  },

  /**
   * Информационные сообщения — уровень SUMMARY+
   * Используется для ключевых этапов: начало, завершение, итоги
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, ...args: any[]): void {
    log(LogLevel.SUMMARY, message, undefined, ...args);
  },

  /**
   * Summary — итоговая статистика (alias для info)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary(message: string, ...args: any[]): void {
    log(LogLevel.SUMMARY, message, undefined, ...args);
  },

  /**
   * Verbose — детальные этапы
   * Используется для информации о каждом контейнере
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verbose(message: string, ...args: any[]): void {
    log(LogLevel.VERBOSE, message, undefined, ...args);
  },

  /**
   * Debug — максимальная детализация
   * Используется для поиска нод, кэширования, отладки
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, ...args: any[]): void {
    log(LogLevel.DEBUG, message, undefined, ...args);
  },

  /**
   * Debug с указанием источника
   * Используется для группировки логов по модулям
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debugFrom(source: string, message: string, ...args: any[]): void {
    log(LogLevel.DEBUG, message, source, ...args);
  },

  // === АГРЕГАЦИЯ ===

  /**
   * Логирует агрегированную статистику handlers
   */
  logHandlerStats(handlerStats: Map<string, { count: number; totalTime: number; avgTime: number }>): void {
    if (currentLevel < LogLevel.SUMMARY) return;

    const entries = Array.from(handlerStats.entries())
      .filter(([, s]) => s.count > 0)
      .sort((a, b) => b[1].totalTime - a[1].totalTime);

    if (entries.length === 0) return;

    const lines: string[] = ['📊 Handler Stats:'];
    for (const [name, s] of entries.slice(0, 10)) {
      const avg = s.avgTime.toFixed(0);
      const total = (s.totalTime / 1000).toFixed(1);
      lines.push(`   ${name}: ${s.count}× (avg ${avg}ms, total ${total}s)`);
    }

    log(LogLevel.SUMMARY, lines.join('\n'));
  },

  /**
   * Логирует агрегированную статистику контейнеров
   */
  logContainerStats(containerCounts: Record<string, number>): void {
    if (currentLevel < LogLevel.SUMMARY) return;

    const entries = Object.entries(containerCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) return;

    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    const breakdown = entries.map(([name, count]) => `${name}: ${count}`).join(', ');

    log(LogLevel.SUMMARY, `📦 Обработано ${total} контейнеров: ${breakdown}`);
  },

  /**
   * Логирует итог обработки изображений
   */
  logImageStats(successful: number, failed: number, totalTime: number): void {
    if (currentLevel < LogLevel.SUMMARY) return;

    const timeStr = (totalTime / 1000).toFixed(1);
    if (failed > 0) {
      log(LogLevel.SUMMARY, `🖼️ Изображения: ${successful} успешно, ${failed} ошибок (${timeStr}s)`);
    } else {
      log(LogLevel.SUMMARY, `🖼️ Изображения: ${successful} успешно (${timeStr}s)`);
    }
  },

  /**
   * Логирует итог обработки текстов
   */
  logTextStats(count: number, totalTime: number): void {
    if (currentLevel < LogLevel.SUMMARY) return;

    const timeStr = (totalTime / 1000).toFixed(1);
    log(LogLevel.SUMMARY, `📝 Тексты: ${count} слоёв (${timeStr}s)`);
  }
};
