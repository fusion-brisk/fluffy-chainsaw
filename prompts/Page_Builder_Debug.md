# Page Builder Debug Session

## Цель
Отладка режима "Создать новый артборд" на примерах реальных HTML файлов.

## Тестовые файлы
- `examples/kitfort-coffemaker.html` — запрос "кофеварка kitfort kt-64", ~1MB
- `examples/t-shirt.html` — запрос футболки, ~977KB

Оба файла минифицированы (HTML без отступов в одну строку).

## Текущее состояние

### Работает:
1. ✅ UI показывает дропдаун с 3 режимами
2. ✅ Режим "Создать новый артборд" отправляет `build-page` сообщение
3. ✅ Парсинг HTML в UI (parseYandexSearchResults) работает — находит 40 результатов
4. ✅ code.js получает rows и пытается создать страницу

### Не работает:
1. ❌ Импорт компонентов: `Cannot import component with key "..." since it is unpublished`
2. ❌ Все 40 элементов определяются как ESnippet (нужно проверить #SnippetType в rows)

## Диагностика

### Шаг 1: Проверить какие типы сниппетов парсятся
В UI консоли после парсинга проверить:
```javascript
// После получения rows
rows.forEach((r, i) => console.log(i, r['#SnippetType']));
```

### Шаг 2: Получить валидные ключи компонентов
В рабочем файле с инстансами из опубликованной библиотеки:
```javascript
for (const n of figma.currentPage.selection) {
  if (n.type === 'INSTANCE' && n.mainComponent?.remote) {
    console.log(`${n.mainComponent.name}: '${n.mainComponent.key}'`);
  }
}
```

### Шаг 3: Обновить component-map.ts
Файл: `src/page-builder/component-map.ts`
Заменить ключи в SNIPPET_COMPONENT_MAP на полученные из опубликованной библиотеки.

## Архитектура Page Builder

```
UI (ui.tsx)
  │
  ├─ parseYandexSearchResults(html) → rows[]
  │   └─ каждый row содержит #SnippetType: 'ESnippet'|'EOfferItem'|...
  │
  └─ sendMessageToPlugin({ type: 'build-page', rows })
       │
       ▼
code.js (code.ts)
  │
  ├─ createPageFromRows(rows, options)
  │   ├─ detectSnippetType(row) → читает row['#SnippetType']
  │   ├─ getComponentConfig(type) → получает key из SNIPPET_COMPONENT_MAP
  │   └─ importComponent(key) → figma.importComponentByKeyAsync(key)
  │       └─ ❌ ОШИБКА: unpublished
  │
  └─ createPageFromStructure(structure)
      ├─ создаёт Auto Layout фрейм
      └─ для каждого element:
          ├─ createInstanceForElement() → component.createInstance()
          └─ applyDataToInstance() → handlerRegistry.executeAll()
```

## Ключевые файлы

### Маппинг компонентов
`src/page-builder/component-map.ts`
```typescript
export const SNIPPET_COMPONENT_MAP: Record<SnippetType, ComponentConfig> = {
  'ESnippet': {
    key: '...', // ← НУЖЕН КЛЮЧ ИЗ ОПУБЛИКОВАННОЙ БИБЛИОТЕКИ
    name: 'ESnippet',
    ...
  },
  ...
};
```

### Создание страницы
`src/page-builder/page-creator.ts`
- `createPageFromRows()` — входная точка из code.ts
- `detectSnippetType()` — определяет тип по row['#SnippetType']
- `createInstanceForElement()` — импортирует и создаёт инстанс
- `applyDataToInstance()` — заполняет данными через handlers

### Парсинг HTML
`src/utils/snippet-parser.ts`
- `parseYandexSearchResults()` — парсит HTML, возвращает rows[]
- Устанавливает `#SnippetType` для каждого row

## Следующие шаги

1. **Получить ключи** из опубликованной библиотеки DC • ECOM
2. **Обновить** `component-map.ts` с новыми ключами
3. **Протестировать** на `examples/kitfort-coffemaker.html`
4. **Проверить** что разные типы сниппетов корректно определяются

## Известные ограничения

- В sandbox Figma нет `DOMParser`, `performance` — парсинг только в UI
- Ключи компонентов работают только для опубликованных библиотек
- Для импорта нужен доступ к Team Library

