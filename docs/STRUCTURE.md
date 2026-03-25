# Структура проекта Contentify

Этот документ описывает архитектуру плагина Figma "Contentify", карту взаимосвязей файлов и протокол коммуникации.

## Обзор директорий

### Корень проекта
*   `package.json`: Определяет зависимости и скрипты сборки.
*   `manifest.json`: Манифест плагина Figma. Определяет точки входа (`dist/code.js`, `dist/ui-embedded.html`) и права доступа.
*   `rollup.config.mjs`: Конфигурация сборщика Rollup. Отвечает за транспиляцию TypeScript и React в ES5 (для совместимости с Figma).
*   `tsconfig.json`: Настройки TypeScript.
*   `dist/`: Директория с результатами сборки (генерируется автоматически).

### `src/` - Исходный код

#### Точки входа
*   **`code.ts`**: (Logic Thread) Главный файл логики плагина.
    *   Инициализирует плагин.
    *   Обрабатывает сообщения от UI (`figma.ui.onmessage`).
    *   Управляет слоями Figma, данными и вызовом обработчиков.
*   **`ui.tsx`**: (UI Thread) Главный файл интерфейса (React).
    *   Рендерит UI.
    *   Обрабатывает ввод пользователя (drag & drop, выбор файлов).
    *   Парсит файлы (HTML/MHTML) в JSON.
    *   Отправляет данные в `code.ts`.

#### Модули логики (Logic Thread)
*   `component-handlers.ts`: Реэкспорт handlers и schema engine.
*   `schema/`: **Декларативный маппинг** — schemas для EShopItem, EOfferItem, EProductSnippet, ESnippet (см. ниже).
*   `handlers/`: **Императивные handlers** — сложная логика (EPriceGroup, EDeliveryGroup, BNPL, кнопки).
*   `image-handlers.ts`: Класс `ImageProcessor` для скачивания, обработки и кэширования изображений.
*   `text-handlers.ts`: Функции для работы с текстом и загрузки шрифтов (`loadFonts`, `processTextLayers`).
*   `logger.ts`: Утилита для логирования.
*   `config.ts`: Константы и конфигурация.

#### `src/schema/` — Декларативный Schema Engine

| Файл | Описание |
|------|----------|
| `types.ts` | Типы: `ComponentSchema`, `PropertyMapping`, `NestedInstanceMapping`, `ComputedTransform` |
| `engine.ts` | Generic `applySchema()` — обходит schema, резолвит значения, вызывает `trySetProperty` |
| `transforms.ts` | 24 чистые функции-трансформы для вычисления значений |
| `eshop-item.ts` | EShopItem: 11 container props + 2 nested (EShopName) |
| `eoffer-item.ts` | EOfferItem: 10 container props |
| `eproduct-snippet.ts` | EProductSnippet/2: 4 container props + 1 nested (EShopName) |
| `esnippet.ts` | ESnippet/Snippet: 21 container prop |
| `esnippet-hooks.ts` | Structural hooks: сайтлинки, промо-текст, EThumb fallback, clipsContent |

#### Модули UI (UI Thread)
*   `ui.html`: Шаблон HTML для UI (каркас).
*   `styles.css`: Глобальные стили.
*   `styles-logs.css`: Стили для панели логов.

##### `src/ui/ui.tsx` — Thin Orchestrator (~390 LOC)

After refactoring, `ui.tsx` is a thin orchestrator that delegates to 7 hooks:

```
App (~390 LOC)
├── useResizeUI()        → animated window resize
├── usePanelManager()    → activePanel, openPanel, closePanel
├── useImportFlow()      → pending, info, confirm, cancel, stats
├── useRelayConnection() → relay connection + data polling (existing)
├── usePluginMessages()  → message routing (existing)
├── useVersionCheck()    → update banners (existing)
├── useMcpStatus()       → MCP indicator (existing)
└── Render: showMainContent guard + panel overlays
```

##### `src/ui/hooks/` — Custom React Hooks

| Hook | LOC | Responsibility |
|------|-----|---------------|
| `usePanelManager.ts` | ~50 | Panel overlay state (setup/logs/inspector). Single `activePanel` instead of 3 booleans. Saves/restores previous appState size. |
| `useResizeUI.ts` | ~75 | Animated resize via `sendMessageToPlugin('resize-ui')`. Maps state → size tier → eased animation. |
| `useImportFlow.ts` | ~265 | Import lifecycle: pending data, confirmation, processing, success. Owns relay payload ref, entry ack, min-delay timing. |
| `useRelayConnection.ts` | ~420 | WebSocket + HTTP polling to relay server. Parses incoming data, manages connection state. |
| `usePluginMessages.ts` | ~240 | Routes `window.onmessage` events to handler callbacks. |
| `useVersionCheck.ts` | ~120 | Compares relay/extension versions, shows update banners. |
| `useMcpStatus.ts` | ~40 | MCP bridge connection indicator. |
| `index.ts` | — | Re-exports all hooks. |

#### `src/utils/` — Утилиты парсинга (модульная архитектура)

После оптимизации (Фазы 1-4) утилиты разделены на специализированные модули:

| Модуль | Описание |
|--------|----------|
| `index.ts` | Реэкспорт всех модулей (единая точка входа) |
| `regex.ts` | Все regex константы + `getCachedRegex()`, `escapeRegex()` |
| `encoding.ts` | `fixEncoding()`, `getTextContent()` — работа с кодировкой |
| `network.ts` | `fetchWithRetry()`, `convertImageToBase64()`, `processCSVRows()` |
| `plugin-bridge.ts` | `log()`, `sendMessageToPlugin()`, `applyFigmaTheme()`, `shuffleArray()` |
| `dom-utils.ts` | `findSnippetContainers()`, `filterTopLevelContainers()`, `getStyleTags()` (оптимизирован) |
| `dom-cache.ts` | **Phase 5:** `buildContainerCache()`, `queryFromCache()`, `queryFirstMatch()` — кэширование DOM |
| `mhtml-parser.ts` | `parseMhtmlFile()` — парсинг MHTML файлов |
| `json-parser.ts` | `parseJsonFromNoframes()`, `extractSnippetsFromJson()` |
| `css-cache.ts` | **Phase 4:** `buildCSSCache()`, `getRulesByClass()` — кэширование CSS |
| `favicon-extractor.ts` | `extractFavicon()` — Chain of Responsibility (5 экстракторов) |
| `price-extractor.ts` | `extractPrices()`, `formatPriceWithThinSpace()` |
| `snippet-parser.ts` | `parseYandexSearchResults()`, `extractRowData()`, `deduplicateRows()` |

##### Архитектура favicon-extractor.ts

Использует паттерн **Chain of Responsibility** для извлечения фавиконок:

```
InlineStyleExtractor → SpriteClassExtractor → CssRuleExtractor → RawHtmlExtractor → ImgSrcExtractor
```

1. **InlineStyleExtractor** — inline-стили (background-image в style атрибуте)
2. **SpriteClassExtractor** — CSS классы спрайтов (Favicon-PageX, Favicon-EntryX)
3. **CssRuleExtractor** — CSS правила по классам элемента
4. **RawHtmlExtractor** — поиск спрайтов в CSS/HTML при наличии background-position
5. **ImgSrcExtractor** — fallback на img src

###### Логика выбора спрайта (SpriteClassExtractor)

При наличии нескольких CSS-спрайтов с одним `Favicon-Page`:
```css
.Favicon-Page0.Favicon-Entry1.Favicon { ... }  /* Спрайт 1: 3 домена */
.Favicon-Page0.Favicon { ... }                  /* Спрайт 2: 11 доменов */
```

Приоритет выбора:
1. Если элемент имеет класс `Favicon-Entry1` → ищем правило с Entry
2. Если элемент **без** Entry класса → ищем правило **без** Entry в селекторе
3. Fallback: первое подходящее правило

###### Определение индекса иконки (calculateIndexFromPosition)

Для вертикальных спрайтов индекс вычисляется по `background-position-y`:

```
index = |offset| / stride
```

**Эвристика stride** (приоритет над bgSizeValue из CSS):
- Если offset кратен 20 → stride = 20px
- Если offset кратен 16 → stride = 16px
- Если offset кратен 24 → stride = 24px
- Если offset кратен 32 → stride = 32px

Это важно, т.к. `background-size: 16px 176px` может означать ширину 16px,
а реальный шаг между иконками = 20px (определяется по inline-стилям).

##### Архитектура css-cache.ts (Phase 4)

```typescript
interface CSSCache {
  byClass: Map<string, CSSRuleEntry[]>;  // Быстрый lookup по классу
  bySelector: Map<string, CSSRuleEntry>; // Lookup по селектору
  spriteUrls: string[];                   // Кэш sprite URL
  allCssText: string;                     // Весь CSS (для fallback)
  stats: { totalRules, faviconRules, spriteRules };
}
```

Кэш строится **один раз** в `parseYandexSearchResults()` и передаётся во все экстракторы.

###### Ключевые функции

| Функция | Описание |
|---------|----------|
| `buildCSSCache()` | Парсит все `<style>` теги, индексирует правила |
| `getRulesByClass()` | Возвращает **все** правила с данным классом |
| `getRuleByClassPattern()` | Ищет правило по комбинации page+entry классов |
| `getFirstSpriteUrl()` | Возвращает первый найденный URL спрайта |

**Важно:** `getRuleByClassPattern(pageClass, undefined)` ищет правило **без** `entry` в селекторе,
чтобы не спутать `.Favicon-Page0.Favicon` с `.Favicon-Page0.Favicon-Entry1.Favicon`.

##### Архитектура dom-cache.ts (Phase 5)

```typescript
interface ContainerCache {
  element: Element;
  byClass: Map<string, Element[]>;    // className -> Element[]
  firstByClass: Map<string, Element>; // className -> первый Element
  byTag: Map<string, Element[]>;      // tagName -> Element[]
  stats: { totalElements, totalClasses };
}
```

- **TreeWalker** для единственного обхода DOM контейнера
- **O(1) lookup** вместо O(n) querySelector
- `queryFromCache()`, `queryFirstMatch()` — замена для querySelector
- Кэш строится для **каждого контейнера** перед extractRowData()

#### `src/ui/components/` — React компоненты UI

| Компонент | Описание |
|-----------|----------|
| `ReadyView.tsx` | Основной экран готовности |
| `ProcessingView.tsx` | Индикатор прогресса импорта |
| `ImportConfirmDialog.tsx` | Диалог подтверждения импорта (scope, screenshots) |
| `SuccessView.tsx` | Экран успешного завершения |
| `SetupFlow.tsx` | Настройка relay + расширения |
| `StatusBar.tsx` | Индикаторы состояния (relay, extension, MCP) |
| `UpdateBanner.tsx` | Баннер обновления relay/extension |
| `ComponentInspector.tsx` | Инспектор свойств компонента |
| `Confetti.tsx` | Анимация конфетти при успехе |
| `logs/LogViewer.tsx` | Панель логов (Ctrl+Shift+L) |

#### Общие
*   `types.ts`: TypeScript интерфейсы, общие для UI и Logic. **Важно:** Определяет протокол `postMessage`.

## Протокол коммуникации (postMessage)

Общение между потоком UI (iframe) и потоком Logic (sandbox) происходит асинхронно через `postMessage`.

### UI -> Logic (`UIMessage`)
Обрабатывается в `src/code.ts` (`figma.ui.onmessage`).

| Тип | Данные | Описание |
| :--- | :--- | :--- |
| `import-csv` | `{ rows: CSVRow[], scope: string }` | Основная команда. Передает распаршенные данные для заполнения макета. |
| `check-selection` | `–` | Запрос статуса выделения (для валидации UI). |
| `get-settings` | `–` | Запрос сохраненных настроек (scope). |
| `save-settings` | `{ settings: UserSettings }` | Сохранение настроек пользователя (scope). |
| `get-theme` | `–` | Запрос текущей темы Figma (обычно применяется автоматически). |
| `test` | `{ message: string }` | Тестовое сообщение (ping). |
| `close` | `–` | Закрытие плагина. |

### Logic -> UI (`CodeMessage`)
Отправляется из `src/code.ts`, принимается в `src/ui.tsx` (`window.onmessage`).

| Тип | Данные | Описание |
| :--- | :--- | :--- |
| `log` | `{ message: string }` | Текстовое сообщение для лога в UI. |
| `error` | `{ message: string }` | Сообщение об ошибке. |
| `selection-status` | `{ hasSelection: boolean }` | Ответ на `check-selection`. Влияет на UI предупреждения. |
| `settings-loaded` | `{ settings: UserSettings }` | Ответ на `get-settings`. |
| `progress` | `{ current, total, message }` | Обновление прогресс-бара (не используется активно в текущем коде, но зарезервировано). |
| `stats` | `{ stats: ProcessingStats }` | Финальная статистика: кол-во обработанных, успех/ошибки изображений. |
| `done` | `{ count: number }` | Сигнал завершения работы. Снимает лоадер. |

## Схема потока данных (Data Flow)

1.  **Загрузка:** Пользователь перетаскивает HTML/MHTML файл в UI.
2.  **Парсинг (UI):** `ui.tsx` (с помощью `utils.ts`) парсит файл в массив объектов `CSVRow[]`.
3.  **Передача:** UI отправляет `import-csv` с данными в Logic.
4.  **Поиск (Logic):** `code.ts` сканирует страницу/выделение, находит слои с `#` и группирует их.
5.  **Обработка (Logic):**
    *   Применяет текстовые данные.
    *   Вызывает `component-handlers.ts` для логики компонентов.
    *   Асинхронно обрабатывает изображения через `image-handlers.ts`.
6.  **Отчет (Logic -> UI):** В процессе отправляются логи, а в конце — статистика (`stats`) и сигнал завершения (`done`).

## История оптимизаций

| Фаза | Описание | Статус |
|------|----------|--------|
| 1 | Оптимизация regex: вынос inline regex в константы | ✅ |
| 2 | Разделение utils.ts на 12 модулей | ✅ |
| 3 | Рефакторинг favicon-extractor.ts (Chain of Responsibility) | ✅ |
| 4 | Кэширование CSS-парсинга (css-cache.ts) | ✅ |
| 5 | Оптимизация DOM-обхода (dom-cache.ts, TreeWalker) | ✅ |
| 6 | Потоковая обработка MHTML | 📋 Опционально |
| 7 | Schema Engine — декларативный маппинг для 4 типов контейнеров | ✅ |

Подробности в `docs/OPTIMIZATION_STATUS.md`.

## Исправленные баги

### Favicon: неправильный выбор спрайта (2024-11)

**Проблема:** Фавиконки применялись к неправильным сниппетам.

**Причина:** При наличии двух CSS-спрайтов с одним `Favicon-Page0`:
- `.Favicon-Page0.Favicon-Entry1.Favicon` (3 домена)
- `.Favicon-Page0.Favicon` (11 доменов)

Код выбирал первое попавшееся правило вместо правильного.

**Решение:**
1. `calculateIndexFromPosition`: эвристика stride (20/16/24/32) приоритетнее bgSizeValue
2. `getRuleByClassPattern`: при поиске без entryClass исключает правила с `entry`
3. `SpriteClassExtractor`: для элементов без Entry класса использует `getRuleByClassPattern`

