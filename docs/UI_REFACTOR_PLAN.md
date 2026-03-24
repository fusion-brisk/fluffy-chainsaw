# Contentify UI Refactor Plan

> Поэтапный план рефакторинга UI плагина по результатам design critique.
> Каждая фаза — отдельный PR. Порядок учитывает зависимости между задачами.

---

## Фаза 0: Quick Wins (0.5 дня)

**Цель:** Быстрые фиксы без архитектурных изменений.

### 0.1 — Убрать конфетти на ошибку

**Файлы:** `components/Confetti.tsx`, `ui.tsx`

**Что сделать:**
- Удалить `ERROR_COLORS` массив и всю логику `type: 'error'` из `Confetti.tsx`
- В `ui.tsx` убрать передачу `type="error"` — Confetti рендерится только при `type="success"`
- Если компонент вызывается с `type="error"` где-то ещё — убрать эти вызовы

**Acceptance criteria:**
- Confetti отображается ТОЛЬКО при успешном импорте
- На ошибку — тихий ErrorCard без анимаций
- `ConfettiProps.type` становится необязательным или убирается (всегда success)

**Сложность:** XS (30 мин)

---

### 0.2 — Фикс контраста tertiary text

**Файлы:** `styles.css`

**Что сделать:**
- Заменить `--color-text-tertiary: #999999` (contrast ratio 2.8:1) на `#767676` (ratio 4.5:1, проходит WCAG AA)
- Проверить все места использования tertiary color — подсказки, плейсхолдеры, таймстемпы в логах

**Acceptance criteria:**
- Все текстовые элементы проходят WCAG 2.1 AA (minimum 4.5:1 для normal text)
- Визуально tertiary text остаётся "приглушённым", но читаемым

**Сложность:** XS (15 мин)

---

### 0.3 — Вынести "Очистить очередь" из ImportConfirmDialog

**Файлы:** `components/ImportConfirmDialog.tsx`, `ui.tsx`

**Что сделать:**
- Убрать кнопку "Очистить очередь" из ImportConfirmDialog
- Добавить действие clear queue в StatusBar (как dropdown action при клике на relay pill, или как отдельная кнопка в expanded state)
- ImportConfirmDialog остаётся с тремя действиями: Primary (Создать артборд) + Secondary (Заполнить выделение) + Cancel

**Acceptance criteria:**
- ImportConfirmDialog содержит максимум 3 action-кнопки
- Очистка очереди доступна из StatusBar
- Destructive action визуально отделена от confirm flow

**Сложность:** S (1 час)

---

## Фаза 1: StatusBar Simplification (1 день)

**Зависимости:** Фаза 0.3 (clear queue перенесён в StatusBar)

### 1.1 — Unified status indicator

**Файлы:** `components/StatusBar.tsx`, `styles.css`

**Что сделать:**
- Заменить 3 отдельных пилла (MCP, Relay, Extension) на единый индикатор:
  - Всё ок → маленькая зелёная точка (8px), без текста
  - Ошибка → развернуть в конкретное сообщение: "Relay отключён — переподключение..." с action-кнопкой
  - Hover на зелёную точку → tooltip с деталями ("Relay ✓ Extension ✓ MCP ✓")
- Inspector (⚙️) и Logs (≡) кнопки оставить, но см. Фазу 5 для Logs

**Текущая логика (сохранить):**
```
relayConnected && extensionInstalled → compact
!relayConnected || !extensionInstalled → expanded with problem highlighted
```

**Новая логика:**
```
all OK → single green dot (8px), opacity 0.6, hover → tooltip
any error → expanded pill: icon + message + action button
```

**Acceptance criteria:**
- При нормальной работе StatusBar занимает ~16px (точка + padding)
- При ошибке — одно конкретное сообщение с действием (не три пилла)
- Inspector кнопка остаётся
- Детальный статус каждого сервиса доступен через hover/tooltip

**Сложность:** M (4 часа)

---

## Фаза 2: Window Size Consolidation (1 день)

**Зависимости:** нет (но лучше после Фазы 1, чтобы StatusBar не ломался)

### 2.1 — Стандартизация размеров окна

**Файлы:** `src/types.ts` (UI_SIZES), `ui.tsx` (resizeUI), все компоненты

**Текущие размеры (8 конфигураций):**
```ts
checking:       320 × 56    // ← оставить как Compact
ready:          400 × 380   // ← Standard
confirming:     340 × 340   // ← Standard (адаптировать контент)
processing:     340 × 300   // ← Standard (адаптировать контент)
success:        340 × 320   // ← Standard (адаптировать контент)
extensionGuide: 380 × 520   // ← Extended
whatsNew:       380 × 520   // ← Extended (или убрать, см. Фаза 4)
logsViewer:     380 × 520   // ← Extended
inspector:      420 × 520   // ← Extended
```

**Новые размеры (3 конфигурации):**
```ts
export const UI_SIZES = {
  compact:  { width: 320, height: 56 },   // checking
  standard: { width: 400, height: 400 },   // ready, confirming, processing, success
  extended: { width: 420, height: 520 },   // guides, logs, inspector
} as const;
```

**Что сделать:**
- Обновить `UI_SIZES` в `types.ts`
- Обновить `resizeUI()` в `ui.tsx` — маппинг AppState → size tier
- Адаптировать контент компонентов под фиксированную высоту 400px:
  - `ImportConfirmDialog`: убрать лишние отступы, вписать в 400px
  - `ProcessingView`: progress bar + tips вписать в 400px
  - `SuccessView`: статистика + auto-close bar вписать в 400px
- Для Extended: все панели используют одинаковый 420×520

**Acceptance criteria:**
- Окно плагина имеет ровно 3 размера
- Переходы ready↔confirming↔processing↔success НЕ меняют размер окна
- Анимация ресайза происходит только при переходе между tier'ами
- Контент не обрезается и не скроллится (кроме LogViewer)

**Сложность:** L (6 часов)

---

## Фаза 3: Setup Wizard Unification (1 день)

**Зависимости:** Фаза 2 (Extended size tier)

### 3.1 — Объединить три гайда в один stepper

**Файлы:** Новый `components/SetupFlow.tsx`, удалить `SetupWizard.tsx` + `ExtensionGuide.tsx` + `RelayGuide.tsx`

**Текущее состояние:**
- `SetupWizard.tsx` — 2 шага (download relay, download extension)
- `ExtensionGuide.tsx` — 4 шага (download zip, copy URL, dev mode, load unpacked)
- `RelayGuide.tsx` — 4 шага (download, unzip, install, verify)
- Нет общего прогресса, пользователь не знает сколько осталось

**Новый компонент `SetupFlow.tsx`:**
```
┌─────────────────────────────┐
│  Настройка Contentify       │
│  ████████░░░░░░  Шаг 2 / 6 │
│                             │
│  [Текущий шаг с инструкцией]│
│                             │
│  ◀ Назад     Далее ▶        │
│              Пропустить      │
└─────────────────────────────┘
```

**Логика шагов:**
1. Установка Relay (download + run installer)
2. Проверка подключения Relay (auto-detect, skip если уже connected)
3. Установка Extension (download zip)
4. Загрузка в Chrome (chrome://extensions → dev mode → load unpacked)
5. Проверка подключения Extension (auto-detect)
6. Готово! (→ переход в ready state)

**Что сделать:**
- Создать `SetupFlow.tsx` с единым stepper
- Прогресс-бар сверху (шаг N из 6)
- Auto-skip шагов проверки если сервис уже подключён
- Удалить `SetupWizard.tsx`, `ExtensionGuide.tsx`, `RelayGuide.tsx`
- Обновить импорты и routes в `ui.tsx`

**Acceptance criteria:**
- Единый flow с линейным прогрессом
- Шаги проверки auto-skip при наличии подключения
- Back/Next навигация
- Skip доступен если relay уже connected
- Размер окна = Extended (420×520), не меняется в процессе setup

**Сложность:** L (6 часов)

---

## Фаза 4: WhatsNew → Inline Banner (0.5 дня)

**Зависимости:** Фаза 2 (Standard size tier)

### 4.1 — Заменить WhatsNewDialog на inline banner

**Файлы:** Удалить `components/WhatsNewDialog.tsx`, модифицировать `components/ReadyView.tsx`, `ui.tsx`

**Текущее:** Полноценный modal 380×520 с changelog entries, иконками типов, бейджами, датами.

**Новое:**
```
┌─────────────────────────────────┐
│  Готов к работе                 │
│                                 │
│  ┌───────────────────────────┐  │
│  │ ✨ v2.4: Поддержка EShop │  │
│  │    + 3 новых свойства     │  │
│  │    Подробнее →            │  │
│  └───────────────────────────┘  │
│                                 │
│  Ожидание данных от расширения  │
└─────────────────────────────────┘
```

**Что сделать:**
- Добавить `WhatsNewBanner` компонент (inline card, не modal)
- Показать 1-2 ключевых изменения текстом
- "Подробнее →" ведёт на внешнюю страницу (GitHub releases / docs)
- Banner показывается один раз после обновления, dismissable
- Убрать WhatsNewDialog и соответствующий UI_SIZE
- Убрать `whatsNew` из AppState / state machine

**Acceptance criteria:**
- Нет modal overlay для changelog
- ReadyView показывает inline banner при первом запуске после обновления
- Banner не мешает основному flow
- Полный changelog доступен по внешней ссылке

**Сложность:** M (3 часа)

---

## Фаза 5: LogViewer — Hidden Dev Tool (0.5 дня)

**Зависимости:** Фаза 1 (StatusBar refactored)

### 5.1 — Скрыть LogViewer за dev-жестом

**Файлы:** `components/StatusBar.tsx`, `ui.tsx`, `styles.css`

**Текущее:** Кнопка "≡" в StatusBar открывает LogViewer как полноценный стейт.

**Новое:**
- Убрать кнопку Logs из StatusBar
- LogViewer открывается через:
  - Keyboard shortcut: `Ctrl+Shift+L` (или `Cmd+Shift+L` на Mac)
  - Двойной клик на version badge (если есть)
  - Через Inspector → "Show logs"
- LogViewer сам по себе не меняется — только точка входа

**Что сделать:**
- Удалить `onLogsClick` из StatusBar props
- Добавить global keyboard listener в `ui.tsx` для Ctrl+Shift+L
- Добавить "Show logs" link в ComponentInspector
- Логи остаются доступными, но не занимают место в основном UI

**Acceptance criteria:**
- Нет кнопки логов в StatusBar
- LogViewer открывается по Ctrl+Shift+L
- ComponentInspector имеет ссылку на логи
- Обычный пользователь не видит dev-инструменты

**Сложность:** S (2 часа)

---

## Фаза 6: First-Time User Experience (1 день)

**Зависимости:** Фаза 3 (unified setup flow), Фаза 4 (WhatsNew banner)

### 6.1 — Micro-tutorial для ReadyView

**Файлы:** Новый `components/OnboardingHint.tsx`, модифицировать `components/ReadyView.tsx`

**Текущее:** "Готов к работе" + "Ожидание данных от расширения" — dead end для нового пользователя.

**Новое (first-time only):**
```
┌─────────────────────────────────┐
│  Готов к работе                 │
│                                 │
│  Как использовать:              │
│                                 │
│  1. Откройте ya.ru и введите    │
│     поисковый запрос            │
│                                 │
│  2. Нажмите иконку Contentify   │
│     в панели расширений         │
│                                 │
│  3. Данные автоматически        │
│     появятся здесь              │
│                                 │
│  [Понятно, скрыть]              │
└─────────────────────────────────┘
```

**Что сделать:**
- Создать `OnboardingHint.tsx` — 3 шага с иконками/иллюстрациями
- Показать при первом запуске (flag в localStorage / plugin clientStorage)
- "Понятно, скрыть" → сохранить flag, больше не показывать
- Для returning users — стандартный ReadyView без подсказки

**Acceptance criteria:**
- Новый пользователь видит пошаговую инструкцию
- После dismiss — стандартный ReadyView
- Flag сохраняется между сессиями (clientStorage)
- Инструкция понятна без внешней документации

**Сложность:** M (4 часа)

---

## Граф зависимостей

```
Фаза 0 (Quick Wins)
  ├── 0.1 Confetti ─────────────────── (независимая)
  ├── 0.2 Contrast ─────────────────── (независимая)
  └── 0.3 Clear Queue ──┐
                         │
Фаза 1 (StatusBar) ◄────┘
  │
  ├──► Фаза 5 (LogViewer hidden)
  │
Фаза 2 (Window Sizes) ◄──── (независимая, но лучше после Фазы 1)
  │
  ├──► Фаза 3 (Setup Wizard)
  ├──► Фаза 4 (WhatsNew inline)
  │
  └──► Фаза 6 (First-Time UX) ◄── Фаза 3 + Фаза 4
```

## Оценка общего объёма

| Фаза | Сложность | Оценка | Файлов затронуто |
|------|-----------|--------|-----------------|
| 0. Quick Wins | XS+XS+S | 2 часа | 4 |
| 1. StatusBar | M | 4 часа | 3 |
| 2. Window Sizes | L | 6 часов | 8+ |
| 3. Setup Wizard | L | 6 часов | 5 (3 удалить, 1 создать, 1 изменить) |
| 4. WhatsNew | M | 3 часа | 3 (1 удалить, 2 изменить) |
| 5. LogViewer | S | 2 часа | 3 |
| 6. First-Time UX | M | 4 часа | 2 (1 создать, 1 изменить) |
| **Итого** | | **~27 часов** | **~20 файлов** |

## Промпт для Claude Code

Каждая фаза запускается отдельным промптом. Формат:

```
Прочитай docs/UI_REFACTOR_PLAN.md, фазу N.

Контекст: Contentify — Figma-плагин для синхронизации Yandex SERP → Figma.
UI: React (packages/plugin/src/ui/), стили в styles.css, типы в src/types.ts.
Правила: CLAUDE.md в корне проекта.

Задача: [описание фазы]

После изменений:
1. npm run typecheck -w packages/plugin
2. npm run lint -w packages/plugin
3. npm run build -w packages/plugin
4. Проверь что UI рендерится без ошибок
```
