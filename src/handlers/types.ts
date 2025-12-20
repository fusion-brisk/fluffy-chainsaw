/**
 * Общие типы для обработчиков компонентов
 */

import { CSVRow } from '../types/csv-fields';

/**
 * Контекст для обработчиков компонентов
 * Передаётся во все handler-функции
 */
export interface HandlerContext {
  /** Контейнер-сниппет (INSTANCE или FRAME) */
  container: BaseNode;
  /** Уникальный ключ контейнера (обычно container.id) */
  containerKey: string;
  /** Данные строки CSV для этого контейнера */
  row: CSVRow | null;
}

/**
 * Результат выполнения обработчика
 */
export interface HandlerResult {
  /** Имя обработчика */
  handlerName: string;
  /** Успешно ли выполнен */
  success: boolean;
  /** Время выполнения в мс */
  duration: number;
  /** Сообщение об ошибке (если есть) */
  error?: string;
  /** Дополнительные данные */
  data?: Record<string, unknown>;
}

/**
 * Метаданные обработчика для Registry
 */
export interface HandlerMetadata {
  /** Приоритет выполнения (меньше = раньше) */
  priority: number;
  /** Режим выполнения: sync, async, parallel */
  mode: 'sync' | 'async' | 'parallel';
  /** Ограничение по типам контейнеров (пусто = все) */
  containers: string[];
  /** Зависимости от других обработчиков */
  dependsOn: string[];
  /** Описание обработчика */
  description: string;
}

/**
 * Зарегистрированный обработчик
 */
export interface RegisteredHandler {
  /** Уникальное имя обработчика */
  name: string;
  /** Функция обработчика */
  handler: (context: HandlerContext) => void | Promise<void>;
  /** Метаданные */
  metadata: HandlerMetadata;
}

/**
 * Тип для синхронного обработчика
 */
export type SyncHandler = (context: HandlerContext) => void;

/**
 * Тип для асинхронного обработчика
 */
export type AsyncHandler = (context: HandlerContext) => Promise<void>;

/**
 * Общий тип обработчика
 */
export type Handler = SyncHandler | AsyncHandler;

