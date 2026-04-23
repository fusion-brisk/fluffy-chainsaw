/**
 * WhatsNewContent — Changelog list for the "Что нового" panel.
 *
 * Rendered inside PanelLayout at the 'extended' window tier (420×520).
 * Uses .whats-new-* CSS classes for visual consistency with other panels.
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

const TYPE_LABEL: Record<ChangeEntry['type'], string> = {
  feat: 'NEW',
  fix: 'FIX',
  refactor: 'CHG',
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

export const WhatsNewContent: React.FC = memo(() => (
  <div className="whats-new">
    {CHANGELOG.map((entry) => (
      <section key={entry.version} className="whats-new__section">
        <header className="whats-new__section-header">
          <span className="whats-new__version">v{entry.version}</span>
          <span className="whats-new__date">{entry.date}</span>
        </header>
        <ul className="whats-new__list">
          {entry.changes.map((change, i) => (
            <li key={i} className="whats-new__item">
              <span className={`whats-new__badge whats-new__badge--${change.type}`}>
                {TYPE_LABEL[change.type]}
              </span>
              <span className="whats-new__text">{change.text}</span>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
));

WhatsNewContent.displayName = 'WhatsNewContent';
