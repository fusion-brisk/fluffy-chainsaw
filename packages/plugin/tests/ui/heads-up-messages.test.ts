import { describe, expect, it } from 'vitest';

import { formatHeadsUpPhase } from '../../src/ui/utils/heads-up-messages';

describe('formatHeadsUpPhase', () => {
  it('parsing → "Расширение собирает данные…"', () => {
    expect(formatHeadsUpPhase({ phase: 'parsing', ts: 0 })).toBe('Расширение собирает данные…');
  });

  it('uploading_json → "Загружаем структуру…"', () => {
    expect(formatHeadsUpPhase({ phase: 'uploading_json', ts: 0 })).toBe('Загружаем структуру…');
  });

  it('uploading_screenshots formats current/total', () => {
    expect(
      formatHeadsUpPhase({ phase: 'uploading_screenshots', current: 7, total: 27, ts: 0 }),
    ).toBe('Грузим скриншоты 7/27…');
  });

  it('uploading_screenshots without current/total falls back to generic', () => {
    expect(formatHeadsUpPhase({ phase: 'uploading_screenshots', ts: 0 })).toBe('Грузим скриншоты…');
  });

  it('finalizing → "Завершаем загрузку…"', () => {
    expect(formatHeadsUpPhase({ phase: 'finalizing', ts: 0 })).toBe('Завершаем загрузку…');
  });

  it('error returns the message field', () => {
    expect(formatHeadsUpPhase({ phase: 'error', message: 'Сеть упала', ts: 0 })).toBe('Сеть упала');
  });

  it('error without message returns generic fallback', () => {
    expect(formatHeadsUpPhase({ phase: 'error', ts: 0 })).toBe('Ошибка расширения');
  });
});
