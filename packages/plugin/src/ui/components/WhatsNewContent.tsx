/**
 * WhatsNewContent — Changelog list for the "Что нового" panel.
 *
 * Uses inline styles with project CSS variables — no new CSS classes.
 * Displayed inside PanelLayout at the 'extended' window tier (420×520).
 */

import React, { memo } from 'react';

interface ChangeEntry {
  text: string;
  type: 'feat' | 'fix' | 'refactor';
}

interface VersionEntry {
  version: string;
  date: string;
  changes: ChangeEntry[];
}

const TYPE_ICONS: Record<ChangeEntry['type'], string> = {
  feat: '✦',
  fix: '○',
  refactor: '↻',
};

const CHANGELOG: VersionEntry[] = [
  {
    version: '3.1.0',
    date: 'Апрель 2026',
    changes: [
      {
        text: 'Автопэйринг: один клик на ya.ru?contentify_pair=<code> — без ручного ввода',
        type: 'feat',
      },
      { text: 'Импорт быстрее на 37% (49→31с на 78 сниппетов)', type: 'feat' },
      { text: 'Прогресс с фразами: «Разбор структуры», «Размещаем N/M», «Готово!»', type: 'feat' },
      {
        text: 'SourceMeta: корректный парсинг «Курьер · Из магазина» в сниппетах товаров',
        type: 'fix',
      },
      { text: 'Repair mode: принудительный ре-пэйринг из меню', type: 'feat' },
      { text: 'Стабильность: устранены ~45 ошибок stale-ref в хот-пути', type: 'fix' },
    ],
  },
  {
    version: '2.7.0',
    date: 'Апрель 2026',
    changes: [
      { text: 'Export HTML — экспорт выделения в HTML с JSX-кодом и превью', type: 'feat' },
      { text: 'JSX-эмиттер — генерация React-кода из Figma-компонентов', type: 'feat' },
      { text: 'EProductSnippetExp — masonry-сниппет для ProductsMixedGrid', type: 'feat' },
      { text: 'VtbCard парсинг + расширенное покрытие Fintech типов', type: 'fix' },
      { text: 'Выравнивание SERP-колонки и spacing productTilesWrapper', type: 'fix' },
      { text: 'Удалено 305 строк мёртвого кода', type: 'refactor' },
    ],
  },
  {
    version: '2.6.0',
    date: 'Апрель 2026',
    changes: [
      { text: 'ProductsImagesMixedGrid — новый формат выдачи', type: 'feat' },
      { text: 'EProductCard — парсинг боковой панели', type: 'feat' },
      { text: '199 новых тестов (266→465)', type: 'feat' },
      { text: 'Accessibility: ARIA-разметка, фокус-трап, клавиатурная навигация', type: 'feat' },
      { text: 'CSS-фолбэки для всех Figma-переменных', type: 'fix' },
      { text: '6 багов UI-состояний: resize, confetti, таймеры', type: 'fix' },
    ],
  },
  {
    version: '3.0.0',
    date: 'Апрель 2026',
    changes: [
      { text: 'Relay переехал в Yandex Cloud — локальный бинарник больше не нужен', type: 'feat' },
      { text: 'Онбординг: session code связывает плагин с расширением через облако', type: 'feat' },
      { text: 'Убран пункт меню «Повторить импорт» (не поддерживается облаком)', type: 'refactor' },
      { text: 'Удалена проверка stale-build и связанная инфраструктура', type: 'refactor' },
    ],
  },
  {
    version: '2.5.0',
    date: 'Март 2026',
    changes: [
      { text: 'Wizard: вставка по serpItemId, высота из extension', type: 'feat' },
      { text: 'Fill Selection: маршрутизация данных через import-csv', type: 'fix' },
      { text: 'Очистка очереди (кнопка + DELETE /clear)', type: 'feat' },
      { text: 'EProductCard sidebar: парсинг + рендеринг', type: 'feat' },
      { text: 'Схемы: EShopName.isOfficial, ELabelGroup.withRating', type: 'feat' },
      { text: 'Title extraction, data: URI, variant mismatch', type: 'fix' },
      { text: 'Удалены секреты (CORS proxy, Apps Script URL)', type: 'fix' },
    ],
  },
  {
    version: '2.4.1',
    date: 'Февраль 2026',
    changes: [
      { text: 'Schema engine: декларативные маппинги для 4 контейнеров', type: 'feat' },
      { text: 'Удалено 624 LOC мёртвых обработчиков', type: 'refactor' },
      { text: 'Line.setProperties({ value }) — единый паттерн', type: 'refactor' },
      { text: 'BNPL: boolean-свойства вместо .visible хаков', type: 'refactor' },
      { text: '13× console.log → Logger.debug', type: 'refactor' },
    ],
  },
];

const styles = {
  container: {
    padding: '0 16px 16px',
  } as React.CSSProperties,
  section: {
    marginBottom: 16,
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottom: '1px solid var(--figma-color-border, #e5e5e5)',
  } as React.CSSProperties,
  version: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--figma-color-text, #333)',
  } as React.CSSProperties,
  date: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--figma-color-text-tertiary, #b3b3b3)',
  } as React.CSSProperties,
  item: {
    display: 'flex',
    gap: 6,
    padding: '2px 0',
    fontSize: 'var(--font-size-base)',
    lineHeight: '1.5',
    color: 'var(--figma-color-text, #333)',
  } as React.CSSProperties,
  icon: {
    flexShrink: 0,
    width: 14,
    textAlign: 'center' as const,
    color: 'var(--figma-color-text-secondary, #888)',
  } as React.CSSProperties,
};

export const WhatsNewContent: React.FC = memo(() => (
  <div style={styles.container}>
    {CHANGELOG.map((entry) => (
      <div key={entry.version} style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.version}>v{entry.version}</span>
          <span style={styles.date}>{entry.date}</span>
        </div>
        {entry.changes.map((change, i) => (
          <div key={i} style={styles.item}>
            <span style={styles.icon}>{TYPE_ICONS[change.type]}</span>
            <span>{change.text}</span>
          </div>
        ))}
      </div>
    ))}
  </div>
));

WhatsNewContent.displayName = 'WhatsNewContent';
