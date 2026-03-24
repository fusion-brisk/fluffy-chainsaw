# Contentify UI Refactor Plan v2

> Обновлённый план по результатам визуального аудита реального UI (скриншоты).
> Заменяет v1. Каждая фаза — отдельный PR. Порядок учитывает зависимости.
>
> **Как использовать:** Копируй промпт нужной фазы в Claude Code. Каждый промпт самодостаточен.

---

## Фаза 0: Critical Bugs (30 мин)

> Баги, ломающие визуал прямо сейчас.

### 0.1 — `glass-button` без стилей

**Проблема:** `ComponentInspector.tsx` использует классы `glass-button glass-button--small` для кнопок "Copy All" и "Close" (строки 50, 52). Эти классы **не определены в `styles.css`** — кнопки рендерятся с browser defaults (чёрный бордер, прямоугольные углы, системный шрифт).

**Файлы:** `packages/plugin/src/ui/components/ComponentInspector.tsx`

**Фикс:** Заменить `glass-button glass-button--small` на `btn-secondary` (уже определён в styles.css).

```tsx
// Было:
<button type="button" className="glass-button glass-button--small" onClick={handleCopyAll}>Copy All</button>
<button type="button" className="glass-button glass-button--small" onClick={onClose}>Close</button>

// Стало:
<button type="button" className="btn-secondary" onClick={handleCopyAll}>Копировать всё</button>
<button type="button" className="btn-secondary" onClick={onClose}>Закрыть</button>
```

**Сложность:** XS (5 мин)

---

### 0.2 — StatusBar overflow: "Инспектор" обрезан

**Проблема:** При hover на StatusBar пиллы MCP + Relay + Расширение добавляются к уже существующим "Инспектор" + "Логи". Суммарная ширина превышает viewport → "Инспектор" обрезается слева (видно `ектор`).

**Файлы:** `packages/plugin/src/ui/components/StatusBar.tsx`, `styles.css`

**Фикс:**
- Добавить `overflow-x: auto` или `flex-wrap: wrap` на `.status-bar`
- ИЛИ (лучше): при expanded state скрывать лейблы "Инспектор"/"Логи" и показывать только иконки (⚙/≡), чтобы освободить место для статусных пиллов

**Сложность:** S (30 мин)

---

### Промпт для Фазы 0:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 0.
Контекст: CLAUDE.md в корне проекта.

Задача:
1. В ComponentInspector.tsx (строки 50, 52) заменить className "glass-button glass-button--small"
   на "btn-secondary". Также заменить текст кнопок: "Copy All" → "Копировать всё", "Close" → "Закрыть".

2. В StatusBar.tsx / styles.css: исправить overflow при expanded state.
   При hover на StatusBar все pills должны быть видны без обрезки.
   Подход: добавить flex-wrap: wrap на .status-bar или сократить лейблы
   "Инспектор"→"⚙" и "Логи"→"≡" в expanded state.

После: npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

---

## Фаза 1: Language Unification — Русский (1-2 часа)

> Весь UI переводится на русский. Внутренний инструмент для русскоязычной команды.

### Проблемные места (полный список):

**LogViewer.tsx:**
- Строка 87: `← Back` → `← Назад`
- Строка 88: `Logs` → `Логи`
- Строка 99: `Errors only` → `Только ошибки`
- Строка 100: `Summary+` → `Сводка+`
- Строка 101: `Verbose+` → `Подробно+`
- Строка 102: `All (Debug)` → `Всё (отладка)`
- Строка 105: `Export JSON` → `Экспорт JSON`
- Строка 108: `Clear` → `Очистить`
- Строка 120: `No log messages` → `Нет сообщений`

**ComponentInspector.tsx:**
- Строка 47: `Component Inspector` → `Инспектор компонентов`
- Строка 50: `Copy All` → `Копировать всё` (уже из Фазы 0)
- Строка 52: `Close` → `Закрыть` (уже из Фазы 0)
- Строка 59: `Select a component instance...` → `Выберите экземпляр компонента в Figma для просмотра ключа и свойств.`
- Строка 65: `Instance` → `Экземпляр`
- Строка 69: `Component` → `Компонент`
- Строка 75: `Key` → `Ключ`
- Строка 84: `Set` → `Набор`
- Строка 88: `Set Key` → `Ключ набора`
- Строка 98: `Properties` → `Свойства`

**LogViewer.tsx LEVEL_LABELS:**
- Строка 24: `ERROR` → `ОШИБКА`
- Строка 25: `INFO` → `ИНФО`
- Строка 26: `VERBOSE` → `ПОДРОБНО`
- Строка 27: `DEBUG` → `ОТЛАДКА`

### Промпт для Фазы 1:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 1.
Контекст: CLAUDE.md в корне проекта.

Задача: Перевести весь UI плагина на русский язык. Сейчас LogViewer и ComponentInspector
на английском, а остальной UI на русском — это неконсистентно.

Файлы для изменения:
1. packages/plugin/src/ui/components/logs/LogViewer.tsx — все строки UI на русский
2. packages/plugin/src/ui/components/ComponentInspector.tsx — все лейблы на русский

Правила перевода:
- "Back" → "Назад"
- "Logs" → "Логи"
- "Component Inspector" → "Инспектор компонентов"
- "Instance" → "Экземпляр"
- "Properties" → "Свойства"
- Технические значения (имена компонентов, ключи, типы VARIANT) НЕ переводить
- Кнопки: "Export JSON" → "Экспорт JSON", "Clear" → "Очистить", "Close" → "Закрыть"
- Фильтры: "Errors only" → "Только ошибки", "Summary+" → "Сводка+", "Verbose+" → "Подробно+", "All (Debug)" → "Всё (отладка)"
- Empty states: "No log messages" → "Нет сообщений", "Select a component instance..." → "Выберите экземпляр компонента в Figma для просмотра ключа и свойств."

После: npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

---

## Фаза 2: Unified Navigation Components (2-3 часа)

> Три разных back button → один. LogViewer/Inspector layout fix.

### 2.1 — Единый BackButton

**Проблема:** Три разных реализации кнопки "назад":
1. **Гайды** (RelayGuide, ExtensionGuide): `btn-back` scoped в `.extension-guide--figma`, `border-radius: var(--btn-radius)`
2. **LogViewer:** `btn-back-pill`, `border-radius: 16px`, другой padding
3. **Inspector:** `btn-secondary` (после фазы 0), вообще другой паттерн — "Close" вместо "← Назад"

**Файлы:**
- Новый: `packages/plugin/src/ui/components/BackButton.tsx`
- Изменить: `RelayGuide.tsx`, `ExtensionGuide.tsx`, `LogViewer.tsx`, `ComponentInspector.tsx`
- CSS: `styles.css` — единый стиль `.btn-back`

**Решение:** Создать `<BackButton onClick={onClose} />` с единым стилем:
```tsx
export const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" className="btn-back" onClick={onClick} aria-label="Назад">
    ← Назад
  </button>
);
```

Стиль — pill (`border-radius: 16px`), позиция — всегда верхний левый угол панели.

### 2.2 — LogViewer / Inspector: full-screen replacement вместо split-view

**Проблема:** Сейчас LogViewer и Inspector рендерятся **под** ReadyView — два view одновременно без визуального разделения. ReadyView сжимается сверху, панель появляется снизу. Это сломанный layout.

**Файлы:** `ui.tsx`

**Решение:** LogViewer и Inspector должны **заменять** основной view целиком (как гайды). Используют Extended size tier. ReadyView скрывается когда открыт LogViewer или Inspector.

В `ui.tsx` — rendering logic:
```tsx
// Сейчас (плохо): ReadyView + LogViewer рендерятся одновременно
// Нужно: если showLogs || showInspector → рендерить только панель, НЕ ReadyView
```

### Промпт для Фазы 2:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 2.
Контекст: CLAUDE.md в корне проекта.

Задача 1 — Unified BackButton:
Создай компонент packages/plugin/src/ui/components/BackButton.tsx:
- Текст: "← Назад"
- Класс: btn-back (pill style, border-radius: 16px)
- Позиция: всегда top-left своего контейнера (align-self: flex-start)
- Props: { onClick: () => void; label?: string }
- Замени все кнопки "назад" во всех компонентах на <BackButton>:
  - RelayGuide.tsx (btn-back)
  - ExtensionGuide.tsx (btn-back)
  - LogViewer.tsx (btn-back-pill, текст "← Back")
  - ComponentInspector.tsx (замени кнопку "Закрыть" на <BackButton>)
- Оставь один стиль в styles.css: .btn-back с border-radius: 16px, padding: 6px 12px
- Удали .btn-back-pill и scoped .extension-guide--figma .btn-back если больше не нужны

Задача 2 — Full-screen panels:
В ui.tsx измени логику рендеринга:
- Когда showLogs=true → рендерить ТОЛЬКО LogViewer (не ReadyView поверх)
- Когда showInspector=true → рендерить ТОЛЬКО ComponentInspector (не ReadyView поверх)
- LogViewer и Inspector используют Extended size (420×520)
- При закрытии панели — возврат к предыдущему state/size
- Гайды уже работают как full-screen replacement — используй тот же паттерн

После: npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

---

## Фаза 3: Design Tokens Cleanup (2-3 часа)

> 9 разных font-size → 6 токенов. Hardcoded values → CSS variables.

### 3.1 — Typography scale

**Проблема:** В styles.css определены 4 CSS-переменные (`--font-size-xs` через `--font-size-lg`), но по всему файлу 5+ hardcoded значений (14px, 16px, 18px, 20px, 32px). Итого 9 ступеней шкалы для плагина 400px шириной.

**Решение — расширить шкалу до 7 токенов:**

```css
:root {
  --font-size-xs:  10px;   /* метаданные, таймстемпы, property types */
  --font-size-sm:  11px;   /* лейблы, pills, secondary text */
  --font-size-base: 12px;  /* body text, кнопки */
  --font-size-lg:  13px;   /* emphasized body */
  --font-size-xl:  14px;   /* section titles, dialog titles */
  --font-size-2xl: 16px;   /* view titles */
  --font-size-3xl: 18px;   /* primary view titles (ReadyView, SuccessView) */
}
```

Убрать: `20px` и `32px` — заменить на `--font-size-3xl` (18px). Если нужен крупный icon text — использовать отдельный класс, не font-size token.

**Font-weight — 3 значения:**
```css
:root {
  --font-weight-regular:  400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;
}
```

Убрать: `font-weight: 700` — заменить на `--font-weight-semibold`.

### 3.2 — Replace all hardcoded values

В `styles.css` заменить все `font-size: Npx` на `font-size: var(--font-size-*)` и все `font-weight: N` на `font-weight: var(--font-weight-*)`.

### Промпт для Фазы 3:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 3.
Контекст: CLAUDE.md в корне проекта.

Задача: Стандартизировать типографику в styles.css.

Шаг 1 — Расширить CSS custom properties в :root:
  --font-size-xs:  10px;
  --font-size-sm:  11px;
  --font-size-base: 12px;
  --font-size-lg:  13px;
  --font-size-xl:  14px;   /* НОВЫЙ */
  --font-size-2xl: 16px;   /* НОВЫЙ */
  --font-size-3xl: 18px;   /* НОВЫЙ */

  --font-weight-regular:  400;  /* НОВЫЙ */
  --font-weight-medium:   500;  /* НОВЫЙ */
  --font-weight-semibold: 600;  /* НОВЫЙ */

Шаг 2 — Заменить ВСЕ hardcoded font-size в styles.css:
  font-size: 10px  → font-size: var(--font-size-xs)
  font-size: 11px  → font-size: var(--font-size-sm)
  font-size: 12px  → font-size: var(--font-size-base)
  font-size: 13px  → font-size: var(--font-size-lg)
  font-size: 14px  → font-size: var(--font-size-xl)
  font-size: 16px  → font-size: var(--font-size-2xl)
  font-size: 18px  → font-size: var(--font-size-3xl)
  font-size: 20px  → font-size: var(--font-size-3xl)  /* downsize */
  font-size: 32px  → font-size: var(--font-size-3xl)  /* downsize — для иконок используй отдельный подход */

Шаг 3 — Заменить ВСЕ hardcoded font-weight:
  font-weight: 400  → font-weight: var(--font-weight-regular)
  font-weight: 500  → font-weight: var(--font-weight-medium)
  font-weight: 600  → font-weight: var(--font-weight-semibold)
  font-weight: 700  → font-weight: var(--font-weight-semibold)  /* downgrade */

Шаг 4 — Также проверить inline styles в .tsx файлах (fontSize в style={{}})
  и заменить на CSS-классы где возможно.

Не меняй визуальный результат — только заменяй hardcoded values на tokens.
Исключение: 20px и 32px стали 18px — это intentional downsize.

После: npm run build -w packages/plugin
```

---

## Фаза 4: StatusBar UX Rework (3-4 часа)

> Hover-to-reveal → always-visible compact status.

### Проблема

`onMouseEnter/onMouseLeave` для раскрытия статуса — хрупкий паттерн:
- Нет способа проверить статус без hover
- Touch-устройства: hover не работает
- Overflow при expand (Фаза 0.2 — workaround, не решение)

### Решение — Single Status Indicator

Заменить текущую логику на:

```
┌──────────────────────────────────────────┐
│  [⚙]  [≡]                  ● Всё ОК     │  ← normal state
│  [⚙]  [≡]       ⚠ Relay офлайн  [Fix]  │  ← error state
└──────────────────────────────────────────┘
```

**Normal state (all connected):**
- Зелёная точка + "Всё ОК" — всегда видно, без hover
- Click → expand с деталями (MCP ✓, Relay ✓, Расширение ✓) — toggle, не hover
- Inspector (⚙) и Logs (≡) — кнопки-иконки без текста (экономия места)

**Error state (any disconnected):**
- Жёлтая/красная точка + конкретное сообщение ("Relay офлайн")
- Action button для фикса
- Всегда expanded

### Промпт для Фазы 4:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 4.
Контекст: CLAUDE.md в корне проекта.

Задача: Переработать StatusBar.tsx.

Текущее поведение: hover-to-reveal пиллов MCP/Relay/Расширение. При hover overflow.
Новое поведение:

1. Убрать onMouseEnter/onMouseLeave логику
2. Кнопки "Инспектор" и "Логи" → иконки без текста:
   - Инспектор: только иконка ⚙ (10px), title="Инспектор компонентов"
   - Логи: только иконка ≡ (10px), title="Просмотр логов"

3. Status indicator:
   - allGood=true → показать: зелёная точка + "Всё ОК ✓" (как сейчас, но БЕЗ hover-expand)
   - allGood=true + click → toggle expanded: показать MCP/Relay/Расширение пиллы. Второй click → collapse.
   - allGood=false → всегда показать первый проблемный сервис: "⚠ {name} офлайн" + кнопка "Настроить"

4. Удалить state `expanded` и MouseEnter/MouseLeave handlers
5. Добавить state `detailsOpen` для click-toggle
6. Overflow: с иконками-кнопками и single status pill — overflow невозможен

После: npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

---

## Фаза 5: Window Size Consolidation (4-6 часов)

> 8+ размеров → 3 tier'а. Окно перестаёт прыгать.

### Текущие размеры (`src/types.ts`):

```ts
checking:       320 × 56
ready:          400 × 380
confirming:     340 × 340
processing:     340 × 300
success:        340 × 320
extensionGuide: 380 × 520
whatsNew:       380 × 520
logsViewer:     380 × 520
inspector:      420 × 520
```

### Новые размеры (3 tier'а):

```ts
export const UI_SIZES = {
  compact:  { width: 320, height: 56 },   // checking only
  standard: { width: 400, height: 400 },   // ready, confirming, processing, success
  extended: { width: 420, height: 520 },   // guides, logs, inspector
} as const;
```

### Маппинг AppState → tier:

```ts
const STATE_TO_TIER: Record<string, keyof typeof UI_SIZES> = {
  checking: 'compact',
  ready: 'standard',
  confirming: 'standard',
  processing: 'standard',
  success: 'standard',
  extensionGuide: 'extended',
  relayGuide: 'extended',
  logsViewer: 'extended',
  inspector: 'extended',
  whatsNew: 'extended',  // если ещё используется
};
```

### Промпт для Фазы 5:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 5.
Контекст: CLAUDE.md в корне проекта.

Задача: Консолидировать размеры окна плагина.

Шаг 1 — В src/types.ts заменить UI_SIZES:
  export const UI_SIZES = {
    compact:  { width: 320, height: 56 },
    standard: { width: 400, height: 400 },
    extended: { width: 420, height: 520 },
  } as const;

Шаг 2 — В ui.tsx обновить resizeUI():
  - Создать маппинг AppState → tier (compact/standard/extended)
  - checking → compact
  - ready, confirming, processing, success → standard
  - extensionGuide, relayGuide, logsViewer, inspector, whatsNew → extended
  - Анимация только при смене tier'а (standard↔extended), не при каждом state change
  - Внутри одного tier'а — мгновенный transition контента без ресайза окна

Шаг 3 — Адаптировать компоненты под фиксированную высоту:
  - standard (400px height): ImportConfirmDialog, ProcessingView, SuccessView
    должны вписываться без скролла
  - extended (520px height): гайды, логи, инспектор — скролл только внутри content area

Шаг 4 — Убрать все прямые ссылки на старые ключи UI_SIZES
  (ready, confirming, processing, etc.) по всему коду.

После: npm run typecheck -w packages/plugin && npm run build -w packages/plugin
Проверить: все стейты отображаются корректно, контент не обрезается.
```

---

## Фаза 6: Setup Wizard Unification (6 часов)

> Три разрозненных гайда → один stepper.

### Промпт для Фазы 6:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 6.
Контекст: CLAUDE.md в корне проекта.

Задача: Объединить SetupWizard.tsx, ExtensionGuide.tsx, RelayGuide.tsx
в единый компонент SetupFlow.tsx.

Требования:
1. Создай packages/plugin/src/ui/components/SetupFlow.tsx
2. Единый прогресс-бар сверху: "Шаг N из M"
3. Шаги:
   - Шаг 1: Скачайте Relay (download button)
   - Шаг 2: Распакуйте и запустите установщик
   - Шаг 3: Проверка подключения Relay (auto-detect: если relayConnected → auto-skip)
   - Шаг 4: Скачайте расширение (.zip)
   - Шаг 5: Загрузите в Chrome (chrome://extensions → dev mode → load unpacked)
   - Шаг 6: Проверка расширения (auto-detect: если extensionInstalled → auto-skip)
4. Навигация: <BackButton> (из Фазы 2) для "← Назад", кнопка "Далее" для перехода
5. "Пропустить" — виден если relay уже connected
6. Размер: Extended tier (420×520)
7. Props: { relayConnected: boolean; extensionInstalled: boolean; onComplete: () => void; onBack: () => void; downloads: { relay: string; extension: string } }

8. Удалить: SetupWizard.tsx, ExtensionGuide.tsx, RelayGuide.tsx
9. Обновить импорты в ui.tsx — заменить все три на SetupFlow
10. В ui.tsx: вместо трёх отдельных стейтов (extensionGuide, relayGuide, setup)
    использовать один стейт 'setup' с SetupFlow

Используй <BackButton> из Фазы 2 для кнопки "назад".

После:
- npm run typecheck -w packages/plugin
- npm run lint -w packages/plugin
- npm run build -w packages/plugin
```

---

## Фаза 7: First-Time User Experience (3-4 часа)

### Промпт для Фазы 7:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 7.
Контекст: CLAUDE.md в корне проекта.

Задача: Добавить onboarding подсказку для новых пользователей в ReadyView.

1. Создай packages/plugin/src/ui/components/OnboardingHint.tsx:
   - 3 шага с номерами:
     1. "Откройте ya.ru и введите поисковый запрос"
     2. "Нажмите иконку Contentify в панели расширений Chrome"
     3. "Данные автоматически появятся здесь"
   - Кнопка "Понятно" → dismiss
   - Визуально: компактные карточки (как шаги в RelayGuide, но без кнопок)

2. В ReadyView.tsx:
   - Добавить prop `isFirstTime: boolean`
   - Если isFirstTime → показать <OnboardingHint onDismiss={...} /> вместо стандартного текста
   - Иконка inbox остаётся, заголовок "Ожидание данных" остаётся

3. В ui.tsx:
   - Хранить flag isFirstRun через parent.postMessage('get-client-storage', ...)
     или через useState с localStorage fallback
   - При dismiss → сохранить flag, больше не показывать

4. Стили: использовать существующие CSS-классы из гайдов (step numbers, card style)
   Не создавать новые классы если есть подходящие.

После: npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

---

## Фаза 8: Quick Polish (1-2 часа)

> Мелкие улучшения из первого критика, не вошедшие в основные фазы.

### 8.1 — Убрать конфетти на ошибку

**Проблема:** `Confetti.tsx` поддерживает `type: 'error'` с красными/оранжевыми частицами. Конфетти на ошибку — сарказм или баг.

**Фикс:** Удалить `ERROR_COLORS`, убрать `type: 'error'` из ConfettiProps. Confetti = только success.

### 8.2 — Фикс контраста tertiary text

**Проблема:** `--color-text-tertiary: #999999` — contrast ratio 2.8:1, не проходит WCAG AA.

**Фикс:** Заменить на `#767676` (ratio 4.5:1).

### 8.3 — WhatsNew modal → inline banner

**Проблема:** Полноценный modal для changelog — overkill для внутреннего инструмента.

**Фикс:** Заменить WhatsNewDialog.tsx на inline banner в ReadyView. 1-2 строки текста + "Подробнее →" на внешнюю страницу. Показывать один раз после обновления.

### 8.4 — LogViewer: скрыть за dev-жестом

**Проблема:** Кнопка "Логи" в StatusBar видна всем пользователям.

**Фикс:** После Фазы 4 (StatusBar rework) — LogViewer открывается по `Ctrl+Shift+L`. Убрать из обычного UI.

### Промпт для Фазы 8:

```
Прочитай docs/UI_REFACTOR_PLAN_v2.md, Фазу 8.
Контекст: CLAUDE.md в корне проекта.

Задача: 4 quick polish задачи.

8.1 — Confetti.tsx:
- Удалить ERROR_COLORS массив
- Удалить всю логику type: 'error' (или сделать type optional, default 'success')
- В ui.tsx убрать передачу type="error" если есть

8.2 — styles.css:
- Найти --color-text-tertiary (или аналогичную переменную со значением #999999)
- Заменить на #767676 (WCAG AA compliant, ratio 4.5:1)

8.3 — WhatsNew:
- Создать компонент WhatsNewBanner.tsx (inline card, не modal):
  - Показывает: "✨ v{version}: {главное изменение}" + "Подробнее →" (ссылка)
  - Dismissable (кнопка ✕)
  - Стиль: figma-card с accent border-left
- В ReadyView.tsx: показать WhatsNewBanner если есть новая версия
- В ui.tsx: убрать стейт 'whatsNew' из state machine
- Удалить WhatsNewDialog.tsx

8.4 — LogViewer access:
- В StatusBar.tsx: убрать кнопку "Логи" (onLogsClick)
- В ui.tsx: добавить global keydown listener для Ctrl+Shift+L → toggle logs
- В ComponentInspector: добавить ссылку "Показать логи" внизу

После: npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

---

## Граф зависимостей

```
Фаза 0 (Bugs)────────────────────────── (начинать сразу)
  │
  └──► Фаза 1 (Language) ──────────── (после 0.1, т.к. текст кнопок)
         │
         └──► Фаза 2 (Navigation) ──── (BackButton + layout fix)
                │
                ├──► Фаза 6 (Setup Wizard) ──► Фаза 7 (Onboarding)
                │
                └──► Фаза 4 (StatusBar UX) ──► Фаза 8.4 (LogViewer hidden)

Фаза 3 (Design Tokens) ────────────── (независимая, параллельно с 1-2)
Фаза 5 (Window Sizes) ─────────────── (после Фаз 2+4)
Фаза 8.1-8.3 (Polish) ─────────────── (независимые, в любой момент)
```

**Параллельные потоки:**
- Поток A: 0 → 1 → 2 → 6 → 7
- Поток B: 3 (в любой момент)
- Поток C: 4 → 8.4 (после Фазы 2)
- Поток D: 5 (после Фаз 2 + 4)
- Поток E: 8.1 + 8.2 + 8.3 (в любой момент, независимы)

## Сводка

| Фаза | Описание | Effort | Файлов |
|------|----------|--------|--------|
| 0 | Critical bugs (glass-button, overflow) | 30 мин | 3 |
| 1 | Язык → русский | 1-2 ч | 2 |
| 2 | Unified navigation + layout fix | 2-3 ч | 6 |
| 3 | Design tokens (typography) | 2-3 ч | 1 + inline |
| 4 | StatusBar UX (click, не hover) | 3-4 ч | 2 |
| 5 | Window sizes (3 tier'а) | 4-6 ч | 5+ |
| 6 | Setup wizard (единый stepper) | 6 ч | 5 |
| 7 | Onboarding (first-time UX) | 3-4 ч | 3 |
| 8 | Polish (confetti, contrast, WhatsNew, logs) | 1-2 ч | 5 |
| **Итого** | | **~24-32 ч** | **~25 файлов** |

## Чеклист после каждого PR

```bash
npm run typecheck -w packages/plugin  # Типы
npm run lint -w packages/plugin       # Линтер
npm run build -w packages/plugin      # Сборка
npm run test                          # Тесты (если затронуты schema/handlers)
```

Визуальная проверка:
- [ ] Все стейты отображаются (ready, confirming, processing, success)
- [ ] StatusBar читаем, не обрезается
- [ ] Гайды / логи / инспектор открываются и закрываются
- [ ] Back navigation работает из всех панелей
- [ ] Текст только на русском (кроме технических значений)
- [ ] Шрифты консистентны (нет "прыжков" размера между стейтами)
