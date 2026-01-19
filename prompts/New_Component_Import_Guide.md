# Промпт: Добавление новых компонентов в Contentify

## Обзор архитектуры

Contentify — Figma-плагин для автозаполнения макетов данными из HTML (Яндекс SERP).

### Ключевые потоки данных:

```
HTML страница → extension/content.js (парсинг) → CSVRow[] → 
  → structure-builder.ts (группировка) → StructureNode[] →
  → page-creator.ts (создание в Figma) → handlers (применение данных)
```

## Ключевые файлы

### 1. Парсинг HTML (`extension/content.js`)
- **Задача**: Извлечение данных из HTML в формат CSVRow
- **Формат данных**: `{ '#FieldName': 'value', '#SnippetType': 'EProductSnippet2', ... }`
- **Ключевые функции**:
  - `extractSnippets()` — главная точка входа
  - `extractRowData(container)` — парсинг одного сниппета
  - `getSnippetType(container)` — определение типа по CSS-классам
  - Специальные экстракторы: `extractEQuickFilters()`, `extractEOfferItem()`, etc.

### 2. Конфигурация компонентов (`src/page-builder/component-map.ts`)
- **SNIPPET_COMPONENT_MAP** — маппинг типов сниппетов на ключи компонентов библиотеки
- **LAYOUT_COMPONENT_MAP** — Header, Footer, Pager, EQuickFilters
- **FILTER_COMPONENTS** — отдельные компоненты (FilterButton, SuggestButton)
- **CONTAINER_CONFIG_MAP** — Auto Layout контейнеры

### 3. Типы (`src/page-builder/types.ts`)
- `SnippetType` — типы сниппетов (ESnippet, EProductSnippet2, EShopItem, etc.)
- `LayoutElementType` — элементы страницы (Header, Footer, EQuickFilters)
- `ContainerType` — контейнеры (AdvProductGallery, EShopList)

### 4. Построение структуры (`src/page-builder/structure-builder.ts`)
- `buildPageStructure(rows)` — группирует rows в StructureNode[]
- `sortContentNodes(nodes)` — сортирует по приоритету
- Специальные элементы (EQuickFilters) обрабатываются отдельно от сниппетов

### 5. Создание в Figma (`src/page-builder/page-creator.ts`)
- `createSerpPage(rows, options)` — главная функция создания страницы
- `renderStructureNode(node, platform, errors)` — рендеринг узла
- `createSnippetInstance(node, platform)` — создание инстанса компонента
- `createEQuickFiltersPanel(node, platform)` — пример специального создания

### 6. Handlers (`src/handlers/`)
- **registry.ts** — регистрация всех handlers с приоритетами
- **price-handlers.ts** — EPriceGroup, цены, скидки, барометр
- **snippet-handlers.ts** — EProductSnippet, EShopItem, тексты
- **label-handlers.ts** — ELabelGroup, рейтинги, бренды

## Паттерн добавления нового компонента

### Шаг 1: Получить ключ компонента из Figma

```javascript
// Выполнить в Dev Console Figma на выделенном компоненте
const sel = figma.currentPage.selection[0];
if (sel) {
  console.log('📦 Имя:', sel.name);
  console.log('🆔 ID:', sel.id);
  console.log('📋 Тип:', sel.type);
  
  if (sel.type === 'INSTANCE') {
    const main = sel.mainComponent;
    if (main) {
      console.log('🎯 Главный компонент:');
      console.log('   Имя:', main.name);
      console.log('   Key:', main.key);
      
      if (main.parent?.type === 'COMPONENT_SET') {
        console.log('📦 ComponentSet:');
        console.log('   Имя:', main.parent.name);
        console.log('   Key:', main.parent.key);
      }
    }
  }
  
  // Свойства
  if (sel.componentProperties) {
    console.log('🔧 Properties:');
    for (const [k, v] of Object.entries(sel.componentProperties)) {
      console.log(`   "${k}": ${v.value} (${v.type})`);
    }
  }
}
```

### Шаг 2: Добавить тип в types.ts

```typescript
// Если это элемент страницы (не сниппет)
export type LayoutElementType =
  | 'Header'
  | 'Footer'
  | 'EQuickFilters'  // ← добавить
  | ...;

// Если это сниппет
export type SnippetType =
  | 'ESnippet'
  | 'NewSnippetType'  // ← добавить
  | ...;
```

### Шаг 3: Добавить конфигурацию в component-map.ts

```typescript
// Для сниппетов
export const SNIPPET_COMPONENT_MAP: Record<SnippetType, ComponentConfig> = {
  'NewSnippetType': {
    key: 'abc123...', // Ключ компонента из Figma
    name: 'ComponentName',
    defaultVariant: {
      'View': 'Default',
      // НЕ добавлять exposed properties которые не на верхнем уровне!
    },
  },
};

// Для отдельных компонентов (кнопки, иконки)
export const MY_COMPONENTS = {
  'MyButton': {
    key: 'componentset-key',
    variantKey: 'specific-variant-key',
    name: 'Component Name',
    defaultVariant: { 'Size': 'M' },
  },
} as const;
```

### Шаг 4: Добавить парсинг в content.js

```javascript
// Добавить функцию извлечения
function extractMyComponent() {
  const container = document.querySelector('.MyComponent');
  if (!container) return null;
  
  return {
    '#SnippetType': 'MyComponentType',
    '#FieldName': container.querySelector('.field')?.textContent?.trim() || '',
    // ...другие поля
  };
}

// Вызвать в extractSnippets()
function extractSnippets() {
  const results = [];
  
  // Специальные элементы
  const myComponent = extractMyComponent();
  if (myComponent) results.push(myComponent);
  
  // Сниппеты...
}
```

### Шаг 5: Добавить обработку в structure-builder.ts

```typescript
// В buildPageStructure(), перед группировкой сниппетов
for (const row of rows) {
  const type = row['#SnippetType'] || '';
  if (type === 'MyComponentType') {
    specialElements.push(row);
  } else {
    snippetRows.push(row);
  }
}

// В sortContentNodes(), добавить приоритет
const priority: Record<string, number> = {
  'EQuickFilters': -1,
  'MyComponentType': 0, // ← приоритет сортировки
  'ESnippet': 1,
  // ...
};
```

### Шаг 6: Добавить создание в page-creator.ts (если нужно специальное)

```typescript
// Функция создания
async function createMyComponentPanel(
  node: StructureNode,
  platform: 'desktop' | 'touch'
): Promise<FrameNode | null> {
  const data = node.data || {};
  
  // Создаём Auto Layout фрейм
  const panel = figma.createFrame();
  panel.name = 'MyComponent';
  panel.layoutMode = 'HORIZONTAL';
  // ...настройка
  
  // Импортируем компонент
  const component = await figma.importComponentByKeyAsync(MY_COMPONENTS.MyButton.variantKey);
  if (component) {
    const instance = component.createInstance();
    panel.appendChild(instance);
    
    // Установить текст напрямую (если не через properties)
    const textNode = findTextNode(instance);
    if (textNode) {
      await figma.loadFontAsync(textNode.fontName as FontName);
      textNode.characters = data['#MyField'] || '';
    }
    
    // Установить boolean property
    for (const propKey in instance.componentProperties) {
      if (propKey.startsWith('Left#')) {
        instance.setProperties({ [propKey]: false });
        break;
      }
    }
  }
  
  return panel;
}

// В renderStructureNode()
if (node.type === 'MyComponentType') {
  const panel = await createMyComponentPanel(node, platform);
  if (panel) return { element: panel, count: 1 };
  return { element: null, count: 0 };
}
```

### Шаг 7: Добавить handler (если нужна обработка данных)

```typescript
// В src/handlers/my-handlers.ts
export async function handleMyComponent(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;
  
  const containerName = ('name' in container) ? String(container.name) : '';
  
  // Найти вложенный компонент
  const myInstance = getCachedInstance(instanceCache!, 'MyNestedComponent');
  if (!myInstance) return;
  
  // Установить свойство
  const value = row['#MyField'] === 'true';
  trySetProperty(myInstance, ['myProperty'], value, '#MyField');
}

// Зарегистрировать в registry.ts
this.register('MyComponent', handleMyComponent, {
  priority: HandlerPriority.VARIANTS,
  mode: 'async',
  containers: ['ParentContainer'], // опционально
  description: 'Описание'
});
```

## Частые проблемы и решения

### 1. Свойство не устанавливается через setProperties
**Причина**: Свойство exposed из вложенного компонента, имеет суффикс `#12345:0`
**Решение**: Использовать `trySetProperty` который ищет по префиксу

```typescript
// Плохо
instance.setProperties({ 'withDelivery': true }); // Ошибка!

// Хорошо
trySetProperty(instance, ['withDelivery'], true, '#withDelivery');
```

### 2. Имя свойства в Figma отличается от ожидаемого
**Пример**: `[EXP] Calculation` вместо `expCalculation`
**Решение**: Добавить все варианты в массив

```typescript
trySetProperty(instance, ['[EXP] Calculation', 'expCalculation'], value, '#field');
```

### 3. Текст нельзя изменить через properties
**Причина**: Текст не exposed как component property
**Решение**: Найти TextNode и изменить напрямую

```typescript
import { findTextNode } from '../utils/node-search';

const textNode = findTextNode(instance);
if (textNode) {
  await figma.loadFontAsync(textNode.fontName as FontName);
  textNode.characters = 'New text';
}
```

### 4. Барометр/элемент показывается когда не должен
**Причина**: Данные приходят с флагом `true`, но для этого типа сниппета он не нужен
**Решение**: Проверять тип контейнера

```typescript
const isProductSnippet = containerName === 'EProductSnippet';
const hasBarometer = isProductSnippet ? false : (row['#flag'] === 'true');
trySetProperty(instance, ['withBarometer'], hasBarometer, '#field');
```

### 5. Favicon URL некорректный
**Причина**: Домен не очищен от протокола
**Решение**: Очистка в парсере

```javascript
let domain = rawDomain;
if (domain.includes('://')) {
  domain = new URL(domain).hostname;
}
domain = domain.replace(/^www\./, '');
```

### 6. Старая цена не устанавливается
**Причина**: Не найден EPrice с `view=old`
**Решение**: Проверять свойство view, не имя родителя

```typescript
function isOldPriceInstance(ep: InstanceNode): boolean {
  for (const propKey in ep.componentProperties) {
    if (propKey.toLowerCase().startsWith('view')) {
      const val = ep.componentProperties[propKey].value;
      if (typeof val === 'string' && val.toLowerCase() === 'old') {
        return true;
      }
    }
  }
  return false;
}
```

## Диагностика

### Логирование в Figma
```typescript
// Logger.info/debug может фильтроваться
// Используй console.log для гарантированного вывода
console.log(`🔴 [Handler] Debug: value=${value}`);
```

### Проверка свойств компонента в Figma
```javascript
const sel = figma.currentPage.selection[0];
if (sel?.componentProperties) {
  for (const [k, v] of Object.entries(sel.componentProperties)) {
    console.log(`"${k}": ${v.value} (${v.type})`);
  }
}
```

### Проверка handlers
- Все handlers регистрируются в `src/handlers/registry.ts`
- Вызываются через `handlerRegistry.executeAll(context)`
- Приоритеты: CRITICAL (0) → VARIANTS (10) → VISIBILITY (20) → TEXT (30)

## Сборка и тестирование

```bash
npm run build  # Сборка
# Результат: dist/code.js, dist/ui.html

# В Figma:
# 1. Plugins → Development → Import plugin from manifest
# 2. Или просто перезапустить Figma для обновления кода
```
