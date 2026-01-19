# Дебаг применения данных в Contentify

## Архитектура плагина

### Общая схема потока данных

```
HTML (браузер)
     ↓
[extension/content.js] — парсинг HTML → CSVRow[]
     ↓
[Browser Extension] — отправка данных
     ↓
[src/ui.tsx] — получение данных через Relay/WebSocket
     ↓
postMessage('APPLY_DATA' | 'CREATE_ARTBOARD')
     ↓
[src/code.ts] — основной контроллер плагина
     ↓
[src/page-builder/] — создание структуры и компонентов
     ↓
[src/handlers/] — применение данных к компонентам
     ↓
Figma (инстансы компонентов)
```

---

## Ключевые файлы

### 1. Парсинг HTML → CSVRow

**Файл:** `extension/content.js`

**Функции:**
- `extractSnippets()` — главная функция, возвращает `{ rows: CSVRow[] }`
- `extractRowData(serpItem)` — извлекает данные из одного `<li.serp-item>`
- `getSerpItemContainerType(serpItem)` — определяет тип контейнера (EntityOffers, ProductsTiles, AdvProductGallery, Single)
- `extractStandardSnippet(container, snippetType)` — извлекает стандартные поля
- `getSnippetType(container)` — определяет тип сниппета по CSS-классам

**Ключевые поля CSVRow:**
```javascript
{
  '#SnippetType': 'ESnippet' | 'EProductSnippet2' | 'EOfferItem' | ...,
  '#serpItemId': 'data-cid значение',
  '#containerType': 'EntityOffers' | 'ProductsTiles' | 'AdvProductGallery',
  '#OrganicTitle': 'Заголовок',
  '#OrganicHost': 'example.com',
  '#withThumb': 'true' | 'false',
  // ... другие поля
}
```

**Дебаг парсинга:**
```javascript
// В консоли браузера на странице Яндекса:
contentifyExtractSnippets().then(r => console.log(r.rows));
```

---

### 2. Типы данных

**Файл:** `src/types/csv-fields.ts`

Содержит:
- `CSVFields` — интерфейс со всеми полями
- `SnippetType` — типы сниппетов
- `BOOLEAN_FIELDS` — поля, которые должны быть boolean
- `REQUIRED_FIELDS` — обязательные поля по типам

---

### 3. Построение структуры страницы

**Файл:** `src/page-builder/structure-builder.ts`

**Функции:**
- `buildPageStructure(rows)` — строит дерево `SerpPageStructure`
- `groupBySerpItemId(rows)` — группирует rows по `#serpItemId`
- `detectSnippetType(row)` — определяет Figma-тип по `#SnippetType`
- `sortContentNodes(nodes)` — сортирует по порядку появления

**Логика группировки:**
```
Если rows с одинаковым #serpItemId > 1:
  → Создаётся контейнер (EntityOffers / ProductsTiles / AdvProductGallery)
  → Все rows становятся дочерними узлами
Иначе:
  → Одиночный сниппет без контейнера
```

---

### 4. Создание компонентов в Figma

**Файл:** `src/page-builder/page-creator.ts`

**Функции:**
- `createSerpPage(rows, options)` — главная функция создания артборда
- `renderStructureNode(node, platform, errors, parentContainerType)` — рендерит узел структуры
- `createSnippetInstance(node, platform, parentContainerType)` — создаёт инстанс компонента
- `applyDataToInstance(instance, element)` — применяет данные через handlers

**Ключевой момент — выбор компонента:**
```typescript
const config = getComponentConfig(node.type as SnippetType);
const component = await figma.importComponentByKeyAsync(config.key);
const instance = component.createInstance();
```

---

### 5. Конфигурация компонентов

**Файл:** `src/page-builder/component-map.ts`

**Структуры:**
- `SNIPPET_COMPONENT_MAP` — маппинг типов на конфигурацию компонентов
- `CONTAINER_CONFIG_MAP` — конфигурация контейнеров (Auto Layout)
- `FILTER_COMPONENTS` — компоненты для EQuickFilters

**Пример конфигурации:**
```typescript
'ESnippet': {
  key: '9cc1db3b34bdd3cedf0a3a29c86884bc618f4fdf',
  name: 'ESnippet',
  defaultVariant: {
    'Platform': 'Desktop',
    'withButton': true,
    'withThumb': true,
    // ...
  },
}
```

---

### 6. Handlers — применение данных

**Файлы:**
- `src/handlers/registry.ts` — регистрация handlers
- `src/handlers/snippet-handlers.ts` — handlers для ESnippet, EOfferItem
- `src/handlers/price-handlers.ts` — handlers для цен
- `src/handlers/label-handlers.ts` — handlers для лейблов

**Как работают handlers:**
```typescript
// registry.ts регистрирует handlers:
handlerRegistry.register({
  name: 'handleESnippetProps',
  handler: handleESnippetProps,
  appliesTo: (ctx) => ctx.container?.name === 'ESnippet',
});

// Handler получает контекст:
interface HandlerContext {
  container: SceneNode;    // Инстанс компонента
  row: CSVRow;             // Данные из HTML
  instanceCache: Map;      // Кэш вложенных инстансов
}
```

---

## Частые проблемы и их дебаг

### Проблема 1: Данные не парсятся

**Симптомы:** Поле пустое в CSVRow

**Дебаг:**
1. Открыть консоль браузера на странице Яндекса
2. Выполнить `contentifyExtractSnippets()`
3. Проверить наличие нужного поля в rows

**Решение:** Обновить селекторы в `extractStandardSnippet()` или добавить новый extractor.

---

### Проблема 2: Неправильный тип сниппета

**Симптомы:** Создаётся не тот компонент (например, EProductSnippet2 вместо ESnippet)

**Дебаг:**
1. Проверить `#SnippetType` в CSVRow
2. Проверить `getSnippetType()` в content.js
3. Проверить `detectSnippetType()` в structure-builder.ts

**Решение:** Обновить логику определения типа.

---

### Проблема 3: Свойство не применяется к компоненту

**Симптомы:** Boolean-свойство (withThumb, withReviews) не меняется

**Дебаг:**
1. Проверить что поле есть в CSVRow
2. Проверить handler в snippet-handlers.ts
3. Проверить доступные свойства компонента:
```typescript
// В handler:
console.log('Props:', Object.keys(instance.componentProperties));
```
4. Проверить что `trySetProperty()` находит нужное свойство

**Решение:** 
- Добавить правильное имя свойства в массив имён `trySetProperty(instance, ['withThumb', 'Thumb'], value, '#withThumb')`
- Убедиться что компонент опубликован с этим свойством

---

### Проблема 4: Текст не заполняется

**Симптомы:** Текстовый слой остаётся с placeholder-текстом

**Дебаг:**
1. Проверить имя слоя в Figma (должно быть `#FieldName`)
2. Проверить что данные есть в CSVRow
3. Проверить что `findTextLayerByName()` находит слой

**Решение:** Переименовать слой в Figma или обновить селектор в handler.

---

### Проблема 5: Неправильный порядок элементов

**Симптомы:** Сниппеты идут не в том порядке, что в HTML

**Дебаг:**
1. Проверить `#serpItemId` в CSVRow (должен соответствовать data-cid)
2. Проверить `order` в StructureNode
3. Проверить `sortContentNodes()` — не должно быть сортировки по типу

**Решение:** Убедиться что сортировка идёт по `order`, а не по типу.

---

### Проблема 6: Контейнер не создаётся / создаётся лишний

**Симптомы:** Группа сниппетов не объединена или одиночный сниппет в контейнере

**Дебаг:**
1. Проверить `#serpItemId` — у всех элементов группы должен быть одинаковый ID
2. Проверить `#containerType` — должен быть правильный тип
3. Проверить `groupBySerpItemId()` — как группируются rows

**Решение:** Убедиться что парсер правильно определяет `#serpItemId` и `#containerType`.

---

## Логирование

### Включить подробные логи

В `src/logger.ts` установить уровень:
```typescript
Logger.setLevel('debug'); // или 'verbose'
```

### Ключевые точки логирования

```typescript
// structure-builder.ts
Logger.debug(`[StructureBuilder] Группа serpItemId=${id}: ${count} элементов → ${containerType}`);

// page-creator.ts
console.log(`[PageCreator] ${node.type}: platform=${platform}, key=${key}`);

// handlers
Logger.debug(`[ESnippet] withThumb=${hasThumb}`);
```

---

## Чеклист дебага

1. [ ] Данные парсятся в content.js? (консоль браузера)
2. [ ] Правильный `#SnippetType`?
3. [ ] Правильный `#serpItemId` для группировки?
4. [ ] Компонент импортируется? (ключ актуален и опубликован)
5. [ ] Свойство существует в компоненте?
6. [ ] Handler вызывается для этого компонента?
7. [ ] `trySetProperty` находит свойство?
8. [ ] Текстовый слой имеет правильное имя (`#FieldName`)?

---

## Полезные команды

### Консоль браузера (страница Яндекса)
```javascript
// Получить все спарсенные данные
contentifyExtractSnippets().then(r => console.table(r.rows));

// Найти конкретный элемент
document.querySelector('[data-cid="3"]');
```

### Консоль Figma
```javascript
// Свойства выделенного компонента
console.log(figma.currentPage.selection[0].componentProperties);

// Ключ главного компонента
figma.currentPage.selection[0].mainComponent.key;

// Все дочерние элементы
figma.currentPage.selection[0].findAll(n => true).map(n => n.name);
```
