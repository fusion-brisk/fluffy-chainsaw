/**
 * Общие типы для обработчиков компонентов
 */

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
  row: { [key: string]: string } | null;
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

