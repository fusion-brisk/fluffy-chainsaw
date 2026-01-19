# Page Builder — Инструкция по настройке

## Обзор

Page Builder — модуль для автоматического создания страниц Figma из HTML.
Плагин анализирует HTML-структуру SERP, создаёт Auto Layout фреймы 
и размещает инстансы компонентов из библиотеки DC • ECOM.

## Структура модуля

```
src/page-builder/
├── index.ts            # Экспорты модуля
├── types.ts            # TypeScript типы
├── component-map.ts    # Маппинг типов → компоненты
├── structure-parser.ts # Парсинг HTML структуры
└── page-creator.ts     # Создание страницы в Figma
```

## Шаг 1: Получение ключей компонентов

Прежде чем использовать Page Builder, необходимо получить ключи компонентов 
из библиотеки DC • ECOM.

### Вариант A: Автоматический скрипт

1. Откройте файл библиотеки **DC • ECOM** в Figma Desktop
2. Перейдите на страницу с нужными компонентами
3. Откройте Dev Console: `Plugins → Development → Open console`
4. Скопируйте содержимое `scripts/get-component-keys.js` и вставьте в консоль
5. Нажмите Enter
6. Скопируйте результат в `src/page-builder/component-map.ts`

### Вариант B: Ручной способ

1. Откройте библиотеку DC • ECOM
2. Выберите компонент (например, ESnippet)
3. Right-click → Copy/Paste → Copy link
4. В URL найдите `node-id=XXX:YYY` — это ID
5. Для получения key используйте Dev Console:
   ```javascript
   figma.currentPage.selection[0].key
   ```

## Шаг 2: Обновление component-map.ts

Откройте `src/page-builder/component-map.ts` и заполните ключи:

```typescript
export const SNIPPET_COMPONENT_MAP: Record<SnippetType, ComponentConfig> = {
  'ESnippet': {
    key: 'ВАШ_КЛЮЧ_ЗДЕСЬ',  // ← Вставьте ключ
    name: 'ESnippet',
    defaultVariant: {
      'Platform': 'desktop',
      'withButton': true,
    },
  },
  // ... остальные компоненты
};
```

## Шаг 3: Сборка плагина

```bash
npm run build
```

## Использование

### В коде плагина

```typescript
import { createPageFromHTML } from './page-builder';

// При получении HTML файла
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'build-page') {
    const result = await createPageFromHTML(msg.html, {
      width: 1280,
      platform: 'desktop',
    });
    
    figma.notify(`Создано ${result.createdCount} элементов`);
  }
};
```

### Проверка конфигурации

```typescript
import { validateComponentKeys } from './page-builder';

const missingKeys = validateComponentKeys();
if (missingKeys.length > 0) {
  console.warn('Отсутствуют ключи для:', missingKeys);
}
```

## Архитектура

### Поток данных

```
HTML файл
    ↓
parsePageStructure()  → PageStructure (элементы + порядок)
    ↓
createPageFromStructure()
    ↓
importComponentByKeyAsync()  → ComponentNode
    ↓
component.createInstance()   → InstanceNode
    ↓
handlerRegistry.executeAll() → Заполнение данными
    ↓
Готовая страница в Figma
```

### Группировка элементов

Последовательные элементы одного типа могут группироваться:

```typescript
// Было: [EShopItem, EShopItem, EShopItem, Organic]
// Стало: [EShopGroup(3 items), Organic]

import { groupSequentialElements } from './page-builder';

const grouped = groupSequentialElements(elements, 2); // мин. 2 для группы
```

## Компоненты групп

Группы — это компоненты с вложенными слотами для сниппетов.
Количество видимых элементов регулируется через component properties.

| Тип группы | Свойство | Макс. элементов |
|------------|----------|-----------------|
| EShopGroup | itemsCount | 6 |
| EOfferGroup | itemsCount | 10 |
| ProductTileRow | columns | 4 |
| OrganicBlock | resultsCount | 5 |

## Troubleshooting

### Компонент не создаётся

1. Проверьте, что ключ правильный: `validateComponentKeys()`
2. Убедитесь, что библиотека DC • ECOM подключена к документу
3. Проверьте консоль на ошибки импорта

### Данные не применяются

1. Проверьте, что handlers зарегистрированы
2. Убедитесь, что структура компонента соответствует ожидаемой
3. Проверьте логи: `Logger.setLevel(LogLevel.DEBUG)`

### Неправильный порядок элементов

1. Проверьте HTML — порядок берётся из DOM
2. Используйте `groupSequentialElements()` для группировки

