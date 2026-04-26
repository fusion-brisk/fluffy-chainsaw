/**
 * Heads-up phase → user-facing Russian narrative string.
 *
 * Used by the plugin's CompactStrip when AppState='incoming' to render the
 * extension's reported phase as a sentence. Pure formatter, no side effects.
 */

export type HeadsUpPhase =
  | 'parsing'
  | 'uploading_json'
  | 'uploading_screenshots'
  | 'finalizing'
  | 'error';

export interface HeadsUpStatePayload {
  phase: HeadsUpPhase;
  current?: number;
  total?: number;
  message?: string;
  ts: number;
}

export function formatHeadsUpPhase(state: HeadsUpStatePayload): string {
  switch (state.phase) {
    case 'parsing':
      return 'Расширение собирает данные…';
    case 'uploading_json':
      return 'Загружаем структуру…';
    case 'uploading_screenshots':
      if (typeof state.current === 'number' && typeof state.total === 'number') {
        return `Грузим скриншоты ${state.current}/${state.total}…`;
      }
      return 'Грузим скриншоты…';
    case 'finalizing':
      return 'Завершаем загрузку…';
    case 'error':
      return state.message && state.message.trim() ? state.message : 'Ошибка расширения';
    default:
      return 'Получаем данные…';
  }
}
