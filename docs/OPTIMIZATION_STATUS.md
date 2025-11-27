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

## 📋 План (осталось)

### Фаза 3: Рефакторинг extractFavicon (~4ч)
- Разбить на Chain of Responsibility паттерн
- Отдельные экстракторы: InlineStyleExtractor, SpriteClassExtractor, CssRuleExtractor, RawHtmlExtractor, ImgSrcExtractor

### Фаза 4: Кэширование CSS-парсинга (~2ч)
- Один проход по CSS при инициализации
- Map для faviconRules по className

### Фаза 5: Оптимизация DOM-обхода (~2ч)
- TreeWalker вместо множественных querySelectorAll

### Фаза 6: Потоковая обработка MHTML (опционально, ~3ч)

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
Продолжаем оптимизацию Figma-плагина Contentify.

Прочитай @docs/OPTIMIZATION_STATUS.md — там статус и план.
Прочитай структуру src/utils/ — модули для оптимизации.

Начни с Фазы 3: рефакторинг extractFavicon (Chain of Responsibility).
После каждого изменения пересобирай проект.
```

## 📁 Структура модулей после Фазы 2

| Модуль | Размер | Описание |
|--------|--------|----------|
| regex.ts | ~130 строк | Все regex константы + кэширование |
| encoding.ts | ~45 строк | Функции работы с кодировкой |
| network.ts | ~120 строк | HTTP запросы, конвертация изображений |
| plugin-bridge.ts | ~110 строк | Коммуникация с Figma плагином |
| dom-utils.ts | ~120 строк | Вспомогательные функции для DOM |
| mhtml-parser.ts | ~120 строк | Парсинг MHTML файлов |
| json-parser.ts | ~400 строк | Парсинг JSON из Яндекса |
| favicon-extractor.ts | ~600 строк | Извлечение фавиконок (основной кандидат на рефакторинг) |
| price-extractor.ts | ~60 строк | Извлечение цен |
| snippet-parser.ts | ~400 строк | Парсинг сниппетов Яндекса |
| index.ts | ~60 строк | Реэкспорт всех модулей |
