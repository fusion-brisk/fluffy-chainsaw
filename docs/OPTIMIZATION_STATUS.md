# Статус оптимизации utils.ts

## ✅ Завершено

### Фаза 1: Оптимизация regex (DONE)
- Удалены дублированные regex константы
- Добавлены 6 новых констант: `NOFRAMES_JSON_REGEX`, `RATING_INVALID_START_REGEX`, `FAVICON_V2_PATH_REGEX`, `PRICE_NUMBERS_REGEX`, `LINK_STYLESHEET_REGEX`
- Заменены 22 inline regex на константы
- Исправлены TS warnings
- Сборка успешна ✅

### Фаза 2: Разделение на модули (DONE)
```
src/utils/
  ├── index.ts           # Реэкспорт всех модулей
  ├── regex.ts           # Все regex константы + getCachedRegex, escapeRegex
  ├── encoding.ts        # fixEncoding, getTextContent
  ├── network.ts         # CONFIG, fetchWithRetry, convertImageToBase64, processCSVRows, createSheetFromParsedData
  ├── plugin-bridge.ts   # log, sendMessageToPlugin, applyFigmaTheme, closePlugin, loadPagesList, loadSheetsList, shuffleArray
  ├── mhtml-parser.ts    # parseMhtmlFile
  ├── dom-utils.ts       # findSnippetContainers, filterTopLevelContainers, isInsideAdvProductGallery, extractProductURL, getStyleTags
  ├── favicon-extractor.ts  # extractFavicon (~600 строк)
  ├── price-extractor.ts    # extractPrices, formatPriceWithThinSpace
  ├── snippet-parser.ts     # extractRowData, deduplicateRows, parseYandexSearchResults
  └── json-parser.ts        # parseJsonFromNoframes, extractFaviconFromJson, collectAllFields, extractSnippetsFromJson
```
- Все функции перенесены из utils.ts в модули
- Старый utils.ts удален
- ui.tsx обновлен для импорта из utils/index
- Сборка успешна ✅

### Фаза 3: Рефакторинг extractFavicon (DONE)
- Разбит на Chain of Responsibility паттерн
- 5 отдельных экстракторов:
  - `InlineStyleExtractor` — inline-стили (background-image в style атрибуте)
  - `SpriteClassExtractor` — CSS классы спрайтов (Favicon-PageX, Favicon-EntryX)
  - `CssRuleExtractor` — CSS правила по классам элемента
  - `RawHtmlExtractor` — поиск спрайтов в CSS/HTML при наличии background-position
  - `ImgSrcExtractor` — fallback на img src
- Вспомогательные функции: `processSpriteUrl`, `processSpriteWithPosition`, `calculateIndexFromPosition`
- Сборка успешна ✅

### Багфикс: Неправильное сопоставление фавиконок (DONE)
- **Проблема:** spriteState.currentIndex последовательно инкрементировался, что приводило к смещению иконок
- **Причина:** Порядок сниппетов в DOM не совпадает с порядком иконок в спрайте (рекламные блоки, пропущенные индексы)
- **Решение:**
  - Убран fallback на `spriteState.currentIndex++`
  - Индекс определяется ТОЛЬКО по данным конкретного сниппета:
    1. Класс `Favicon-Page0_pos_X` → прямой индекс X
    2. `background-position-y` / `background-size` → вычисляемый индекс
  - Исправлен `calculateIndexFromPosition` для формата `0px -20px` (берёт Y-координату)
- Протестировано на реальном HTML файле ✅

### Фаза 4: Кэширование CSS-парсинга (DONE)
- **Проблема:** `getStyleTags()` вызывался многократно для каждого сниппета в каждом экстракторе
- **Решение:**
  - Новый модуль `src/utils/css-cache.ts`:
    - `CSSCache` интерфейс с Map<className, CSSRuleEntry[]>
    - `buildCSSCache()` — один проход при инициализации парсинга
    - `getRulesByClass()`, `getRuleByClassPattern()`, `getFirstSpriteUrl()` — быстрый lookup
  - Обновлён `FaviconContext` — добавлено поле `cssCache: CSSCache`
  - Рефакторинг экстракторов:
    - `SpriteClassExtractor` — использует кэш вместо regex по styleTags
    - `CssRuleExtractor` — использует кэш вместо перебора CSS
    - `RawHtmlExtractor` — использует `getFirstSpriteUrl()` из кэша
  - Обновлён `parseYandexSearchResults()` — строит кэш один раз
- Сборка успешна ✅

### Фаза 5: Оптимизация DOM-обхода (DONE)
- **Проблема:** ~30 вызовов querySelector для КАЖДОГО контейнера, 3 отдельных querySelectorAll для поиска контейнеров
- **Решение:**
  - Новый модуль `src/utils/dom-cache.ts`:
    - `ContainerCache` — кэш элементов одного контейнера (Map по классам)
    - `buildContainerCache()` — TreeWalker для единственного обхода DOM
    - `queryFromCache()`, `queryFirstMatch()` — O(1) lookup вместо O(n) querySelector
  - Оптимизация `findSnippetContainers()`:
    - Один комбинированный селектор вместо трёх отдельных
  - Рефакторинг `extractRowData()`:
    - Принимает `ContainerCache` (опционально, для обратной совместимости)
    - ~15 querySelector заменены на `queryFirstMatch()` / `queryFromCache()`
  - Обновлён `parseYandexSearchResults()`:
    - Строит ContainerCache для каждого контейнера один раз
    - Логирование времени обработки
- Сборка успешна ✅

## ✅ Архитектурный рефакторинг (Phase 2-4)

### Phase 2: Декомпозиция code.ts (DONE)
- `src/code.ts`: 1163 → 129 строк (entry-point)
- Новые модули в `src/plugin/`:
  - `types.ts`, `message-router.ts`, `global-handlers.ts`
  - `data-assignment.ts`, `snippet-processor.ts`, `index.ts`
- Сборка успешна ✅

### Phase 3: Унификация handlers (DONE)
- `src/handlers/registry.ts` — Handler Registry с приоритетами
- `src/handlers/field-fallbacks.ts` — декларативные fallback chains
- Расширенные типы: HandlerResult, HandlerMetadata, RegisteredHandler
- Сборка успешна ✅

### Phase 4: Типизация данных (DONE)
- `src/types/csv-fields.ts` — CSVFields (~40 полей), SnippetType, REQUIRED_FIELDS
- `src/types/field-mapping.ts` — JSON-конфиг маппинга полей
- `src/types/validation.ts` — validateRow, validateRows, hasRequiredFields
- Сборка успешна ✅

### Phase 5: Интеграция registry в snippet-processor (DONE)
- **Проблема:** snippet-processor.ts вызывал 15+ handlers напрямую с ручной группировкой sync/async
- **Решение:**
  - Заменены прямые вызовы на `handlerRegistry.executeAll(context)`
  - Удалены импорты отдельных handlers, добавлен импорт `handlerRegistry`
  - Добавлено логирование HandlerResult[] с подсчётом успешных/ошибочных
  - Убрана переменная `componentPromises` — registry сам управляет порядком
- **Результат:** snippet-processor.ts: 295 → 259 строк (-36 строк boilerplate)
- Сборка успешна ✅

### Phase 6: Миграция на типизированный CSVRow (DONE)
- **Проблема:** Три разных определения `CSVRow` — нетипизированные `{ [key: string]: string }`
- **Решение:**
  - Унифицированы все CSVRow на типизированный из `types/csv-fields.ts`
  - `CSVRow = CSVFields & { [key: string]: string | undefined }` (~40 типизированных полей)
  - Обновлены `HandlerContext.row`, `field-fallbacks.ts`, `global-handlers.ts`
  - Добавлены проверки `undefined` в `data-assignment.ts`, `network.ts`, `button-handlers.ts`
  - Удалён мёртвый код для EOfferItem в `snippet-parser.ts`
- **Результат:** Type-safe доступ к полям CSV, автокомплит в IDE, compile-time проверки
- Сборка успешна ✅

### Phase 7: Unit-тесты для handlers (DONE)
- **Инфраструктура:**
  - Vitest — быстрый тестовый фреймворк
  - `vitest.config.ts` — конфигурация
  - `tests/setup.ts` — моки Figma API (figma.*, InstanceNode, TextNode)
- **Тесты:**
  - `field-fallbacks.test.ts` — 21 тест (fallback chains, transforms)
  - `validation.test.ts` — 13 тестов (validateRow, hasRequiredFields)
  - `registry.test.ts` — 11 тестов (регистрация, приоритеты, executeAll)
- **Результат:** 45 тестов, все проходят ✅
- **Команды:**
  - `npm run test` — запуск тестов
  - `npm run test:watch` — watch mode
  - `npm run test:coverage` — с покрытием

### Phase 8: Streaming MHTML Parser (DONE)
- **Проблема:** `parseMhtmlFile` использовал `split()`, создавая массив всех частей в памяти
- **Решение:**
  - Новый модуль `src/utils/mhtml-streaming.ts`
  - Итеративный поиск частей с `indexOf()` + `substring()` (без split)
  - Ранний выход после нахождения HTML части
  - `parseMhtmlStreaming()` — синхронная версия
  - `parseMhtmlStreamingAsync()` — async с yield в event loop
  - Прогресс-коллбэк: `boundary` → `scanning` → `decoding` → `done`
- **Интеграция:**
  - Обновлён `ui.tsx` — используется async версия с логами прогресса
  - Статистика: время парсинга, количество частей, размеры
- **Тесты:** 13 новых тестов (58 всего)
- Сборка успешна ✅

## 📋 План (осталось)

### Phase 9: Дополнительные unit-тесты для handlers (опционально)

## 🔗 Зависимости

```
ui.tsx импортирует из utils/index:
  - applyFigmaTheme()
  - sendMessageToPlugin()
  - parseYandexSearchResults() → CSVRow[]
  - parseMhtmlFile()

code.ts получает CSVRow[] через postMessage
  - Ожидает поля: #OrganicTitle, #FaviconImage, #ProductRating, #EPriceGroup_Discount и др.
```

## 🛠️ Команды сборки

```bash
cd /Users/shchuchkin/Documents/GitHub/fluffy-chainsaw
export PATH="/Users/shchuchkin/.nvm/versions/node/v24.11.1/bin:$PATH"
npm run build
```

## 📝 Промпт для новой сессии

```
Продолжаем оптимизацию Figma-плагина EProductSnippet.

Прочитай @docs/OPTIMIZATION_STATUS.md — там статус и план.
Прочитай структуру src/utils/ — модули для оптимизации.

Начни с Фазы 4: кэширование CSS-парсинга.
После каждого изменения пересобирай проект.
```

## 📁 Структура модулей после Фазы 5

| Модуль | Размер | Описание |
|--------|--------|----------|
| regex.ts | ~130 строк | Все regex константы + кэширование |
| encoding.ts | ~45 строк | Функции работы с кодировкой |
| network.ts | ~120 строк | HTTP запросы, конвертация изображений |
| plugin-bridge.ts | ~110 строк | Коммуникация с Figma плагином |
| dom-utils.ts | ~120 строк | Вспомогательные функции для DOM (оптимизирован) |
| mhtml-parser.ts | ~120 строк | Парсинг MHTML файлов |
| json-parser.ts | ~400 строк | Парсинг JSON из Яндекса |
| css-cache.ts | ~380 строк | Кэширование CSS-парсинга (Phase 4) |
| **dom-cache.ts** | ~300 строк | **NEW: Кэширование DOM-обхода (Phase 5)** |
| favicon-extractor.ts | ~950 строк | Извлечение фавиконок (оптимизировано с CSS кэшем) |
| price-extractor.ts | ~60 строк | Извлечение цен |
| snippet-parser.ts | ~550 строк | Парсинг сниппетов Яндекса (оптимизировано с DOM кэшем) |
| index.ts | ~100 строк | Реэкспорт всех модулей |
