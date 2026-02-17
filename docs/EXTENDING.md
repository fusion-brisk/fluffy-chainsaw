# Расширение Contentify

Пошаговые гайды для добавления новой функциональности.

## 0. Выбор подхода: Schema vs. Handler

| Когда | Подход |
|-------|--------|
| Boolean/string свойства на контейнере | **Schema** — одна строка в `.ts` файле |
| Вложенные свойства (EShopName.name) | **Schema** — `nestedInstances` |
| Сложная вложенная логика (EPriceGroup: EPrice + OldPrice + Fintech) | **Handler** |
| Заполнение слотов (доставка, BNPL items) | **Handler** |
| Instance swap (imageType: EThumb ↔ EThumbGroup) | **Handler** |
| Текстовые fallback с поиском по DOM | **Handler** или **Structural hook** |

**Правило:** если логика сводится к `trySetProperty(container, [...], value, field)` — это schema. Если нужен обход дерева, async операции или findAll — это handler.

---

## 0.1. Добавление свойства в существующую Schema

Самый частый случай — добавить новое boolean/string свойство для контейнера.

### Пример: добавить `withNewFeature` в EShopItem

```typescript
// src/schema/eshop-item.ts — добавить в containerProperties:
{
  propertyNames: ['withNewFeature'],
  fieldName: '#NewFeature',
  equals: { field: '#NewFeature', value: 'true' }
}
```

### 4 режима значений PropertyMapping

```typescript
// 1. hasValue — boolean: поле непустое
{ propertyNames: ['brand'], fieldName: '#Brand', hasValue: '#Brand' }

// 2. stringValue — string: значение as-is
{ propertyNames: ['organicTitle'], fieldName: '#OrganicTitle', stringValue: '#OrganicTitle', skipIfEmpty: true }

// 3. equals — boolean: точное совпадение
{ propertyNames: ['withFintech'], fieldName: '#withFintech', equals: { field: '#EPriceGroup_Fintech', value: 'true' } }

// 4. compute — произвольная функция (для сложной логики)
{ propertyNames: ['withButton'], fieldName: '#BUTTON', compute: function(row, container) { return computeWithButton(row, container); } }
```

### Добавление transform-функции

Если значение зависит от нескольких полей, создайте функцию в `src/schema/transforms.ts`:

```typescript
export function computeMyFeature(row: CSVRow): boolean {
  return row['#FieldA'] === 'true' || !!((row['#FieldB'] || '') as string).trim();
}
```

---

## 0.2. Создание новой Schema для нового контейнера

### Шаг 1: Создать файл schema

```typescript
// src/schema/my-component.ts
import type { ComponentSchema } from './types';

export var MY_COMPONENT_SCHEMA: ComponentSchema = {
  containerNames: ['MyComponent'],
  containerProperties: [
    { propertyNames: ['withFeature'], fieldName: '#Feature', equals: { field: '#Feature', value: 'true' } },
    { propertyNames: ['title'], fieldName: '#Title', stringValue: '#Title', skipIfEmpty: true }
  ],
  nestedInstances: [
    {
      instanceName: 'EShopName',
      properties: [
        { propertyNames: ['name'], fieldName: '#ShopName', stringValue: '#ShopName', skipIfEmpty: true }
      ]
    }
  ],
  replacesHandlers: ['MyComponent']  // какие handlers заменяет
};
```

### Шаг 2: Зарегистрировать в registry

```typescript
// src/handlers/registry.ts
import { MY_COMPONENT_SCHEMA } from '../schema/my-component';

this.register('MyComponent', (context: HandlerContext) => {
  const { container, row, instanceCache } = context;
  if (!container || !row || !instanceCache) return;
  if (container.type !== 'INSTANCE' || container.removed) return;
  applySchema(container as InstanceNode, row, MY_COMPONENT_SCHEMA, instanceCache);
}, {
  priority: HandlerPriority.VARIANTS,
  mode: 'sync',
  containers: ['MyComponent'],
  description: 'MyComponent schema-based mapping'
});
```

### Шаг 3: skipForContainers (если нужно)

Если существующие handlers дублируют логику вашей schema, добавьте `skipForContainers`:

```typescript
this.register('BrandLogic', handleBrandLogic, {
  // ...
  skipForContainers: ['EShopItem', 'EOfferItem', 'MyComponent']  // добавить
});
```

---

## 1. Добавление нового Handler

Handlers — императивные функции для сложной логики, которую нельзя описать декларативно.

### Шаг 1: Создать функцию handler

Создайте функцию в соответствующем файле `src/handlers/*.ts`:

```typescript
// src/handlers/my-handlers.ts

import { HandlerContext } from './types';
import { Logger } from '../logger';
import { getCachedInstance, trySetProperty } from '../property-utils';

/**
 * Обработчик для MyComponent
 * 
 * Управляет свойством myProperty на основе поля #MyField
 */
export async function handleMyComponent(context: HandlerContext): Promise<void> {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;
  
  // Получить значение из данных
  const hasFeature = row['#MyField'] === 'true';
  
  // Найти инстанс компонента (используем кэш!)
  const myInstance = getCachedInstance(instanceCache!, 'MyComponent');
  if (!myInstance) {
    Logger.debug('[MyComponent] Инстанс не найден');
    return;
  }
  
  // Установить свойство
  const success = trySetProperty(myInstance, ['myProperty', 'My Property'], hasFeature, '#MyField');
  
  if (success) {
    Logger.debug(`[MyComponent] myProperty=${hasFeature}`);
  }
}
```

### Шаг 2: Зарегистрировать в registry

Добавьте в `src/handlers/registry.ts`:

```typescript
import { handleMyComponent } from './my-handlers';

// В методе initialize()
this.register('MyComponent', handleMyComponent, {
  priority: HandlerPriority.VARIANTS,  // 10
  mode: 'async',
  containers: ['EShopItem', 'EOfferItem'],  // опционально — ограничить контейнерами
  description: 'Управление свойством myProperty'
});
```

### Шаг 3: Экспортировать (опционально)

Если handler используется напрямую, добавьте в `src/component-handlers.ts`:

```typescript
export { handleMyComponent } from './handlers/my-handlers';
```

### Приоритеты handlers

| Приоритет | Когда использовать |
|-----------|-------------------|
| `CRITICAL (0)` | Структурные изменения, от которых зависят другие handlers |
| `VARIANTS (10)` | Переключение variant properties |
| `VISIBILITY (20)` | Показ/скрытие элементов |
| `TEXT (30)` | Текстовые поля и значения |
| `FALLBACK (40)` | Fallback-логика, выполняется последней |
| `FINAL (50)` | Финальная пост-обработка |

### Пример: handleEMarketCheckoutLabel

```typescript
export function handleEMarketCheckoutLabel(context: HandlerContext): void {
  const { container, row, instanceCache } = context;
  if (!container || !row) return;

  const hasLabel = row['#EMarketCheckoutLabel'] === 'true';
  const labelInstance = getCachedInstance(instanceCache!, 'EMarketCheckoutLabel');
  
  if (labelInstance) {
    try {
      labelInstance.visible = hasLabel;
      Logger.debug(`[EMarketCheckoutLabel] visible=${hasLabel}`);
    } catch (e) {
      Logger.error('[EMarketCheckoutLabel] Ошибка:', e);
    }
  }
}
```

---

## 2. Добавление нового поля в CSVRow

### Шаг 1: Добавить тип в csv-fields.ts

```typescript
// src/types/csv-fields.ts

export interface CSVFields {
  // ... существующие поля ...
  
  /** Мое новое поле */
  '#MyNewField'?: string;
  
  /** Булево поле */
  '#MyBooleanField'?: 'true' | 'false';
}
```

### Шаг 2: Добавить в константы (если нужно)

```typescript
// Для булевых полей
export const BOOLEAN_FIELDS: (keyof CSVFields)[] = [
  // ... существующие ...
  '#MyBooleanField'
];

// Для изображений
export const IMAGE_FIELDS: (keyof CSVFields)[] = [
  // ... существующие ...
  '#MyImageField'
];
```

### Шаг 3: Добавить парсинг в extension

В `extension/content.js`, функция `extractRowData()`:

```javascript
// Для текстового поля
const myElement = container.querySelector('.MySelector, [class*="MySelector"]');
if (myElement) {
  row['#MyNewField'] = myElement.textContent?.trim() || '';
}

// Для булевого поля (наличие элемента)
const hasFeature = container.querySelector('.FeatureSelector');
row['#MyBooleanField'] = hasFeature ? 'true' : 'false';

// Для Variant Property из CSS-классов
const myComponent = container.querySelector('.MyComponent');
if (myComponent) {
  const classes = myComponent.className || '';
  if (classes.includes('MyComponent_type_optionA')) {
    row['#MyComponent_Type'] = 'optionA';
  } else if (classes.includes('MyComponent_type_optionB')) {
    row['#MyComponent_Type'] = 'optionB';
  }
}
```

### Шаг 4: Добавить правило парсинга (опционально)

В `src/parsing-rules.ts` или `config/parsing-rules.json`:

```typescript
// parsing-rules.ts
'#MyNewField': {
  domSelectors: ['.MySelector', '[class*="MySelector"]'],
  jsonKeys: ['myField', 'myNewField'],
  type: 'text'  // или 'boolean', 'image', 'price', 'attribute'
}
```

```json
// config/parsing-rules.json
{
  "version": 2,
  "rules": {
    "#MyNewField": {
      "domSelectors": [".MySelector"],
      "jsonKeys": ["myField"],
      "type": "text"
    }
  }
}
```

---

## 3. Добавление нового компонента

### Шаг 1: Получить ключ компонента из Figma

Выполните в Figma Dev Console (выделив нужный компонент):

```javascript
const sel = figma.currentPage.selection[0];
if (sel) {
  console.log('Имя:', sel.name);
  console.log('ID:', sel.id);
  console.log('Тип:', sel.type);
  
  if (sel.type === 'INSTANCE') {
    const main = sel.mainComponent;
    if (main) {
      console.log('Главный компонент:');
      console.log('  Имя:', main.name);
      console.log('  Key:', main.key);
      
      if (main.parent?.type === 'COMPONENT_SET') {
        console.log('ComponentSet:');
        console.log('  Имя:', main.parent.name);
        console.log('  Key:', main.parent.key);
      }
    }
  }
  
  // Свойства
  if (sel.componentProperties) {
    console.log('Properties:');
    for (const [k, v] of Object.entries(sel.componentProperties)) {
      console.log(`  "${k}": ${v.value} (${v.type})`);
    }
  }
}
```

### Шаг 2: Добавить в component-map.ts

```typescript
// src/page-builder/component-map.ts

export const SNIPPET_COMPONENT_MAP: Record<SnippetType, ComponentConfig> = {
  // ... существующие ...
  
  'MyNewSnippetType': {
    key: 'abc123def456...',  // Ключ из Figma
    name: 'MyComponent',
    defaultVariant: {
      'View': 'Default',
      'Size': 'M'
    },
  },
};
```

### Шаг 3: Добавить тип сниппета

```typescript
// src/types/csv-fields.ts
export type SnippetType = 
  | 'EShopItem'
  | 'MyNewSnippetType'  // Добавить
  | ...;

// src/page-builder/types.ts
export type SnippetType = 
  | 'EShopItem'
  | 'MyNewSnippetType'  // Добавить
  | ...;
```

### Шаг 4: Добавить парсинг типа в extension

```javascript
// extension/content.js, функция getSnippetType()
function getSnippetType(container) {
  const className = container.className || '';
  
  if (className.includes('MyNewComponent')) return 'MyNewSnippetType';
  // ... остальные проверки ...
}
```

### Шаг 5: Добавить обработку в structure-builder.ts (если нужно)

```typescript
// src/page-builder/structure-builder.ts

// В sortContentNodes(), добавить приоритет
const priority: Record<string, number> = {
  'EQuickFilters': -1,
  'MyNewSnippetType': 5,  // Позиция в сортировке
  'ESnippet': 10,
  // ...
};
```

### Шаг 6: Создать специальную функцию создания (если нужно)

```typescript
// src/page-builder/page-creator.ts

async function createMyComponentPanel(
  node: StructureNode,
  platform: 'desktop' | 'touch'
): Promise<FrameNode | null> {
  const data = node.data || {};
  
  // Создаём контейнер
  const panel = figma.createFrame();
  panel.name = 'MyComponent';
  panel.layoutMode = 'HORIZONTAL';
  panel.primaryAxisSizingMode = 'AUTO';
  panel.counterAxisSizingMode = 'AUTO';
  panel.itemSpacing = 8;
  
  // Импортируем и создаём инстанс
  const config = MY_COMPONENT_CONFIG[platform];
  const component = await figma.importComponentByKeyAsync(config.key);
  if (component) {
    const instance = component.createInstance();
    panel.appendChild(instance);
    
    // Установить текст напрямую
    const textNode = findTextNode(instance);
    if (textNode) {
      await figma.loadFontAsync(textNode.fontName as FontName);
      textNode.characters = data['#MyField'] || '';
    }
  }
  
  return panel;
}

// В renderStructureNode()
if (node.type === 'MyNewSnippetType') {
  const panel = await createMyComponentPanel(node, platform);
  if (panel) return { element: panel, count: 1 };
  return { element: null, count: 0 };
}
```

---

## 4. Частые проблемы и решения

### Свойство не устанавливается через setProperties

**Причина:** Свойство exposed из вложенного компонента имеет суффикс `#12345:0`

**Решение:** Использовать `trySetProperty` с массивом возможных имён:

```typescript
// Плохо
instance.setProperties({ 'withDelivery': true }); // Ошибка!

// Хорошо
trySetProperty(instance, ['withDelivery'], true, '#withDelivery');
```

### Имя свойства в Figma отличается от ожидаемого

**Пример:** `[EXP] Calculation` вместо `expCalculation`

**Решение:** Добавить все варианты в массив:

```typescript
trySetProperty(instance, ['[EXP] Calculation', 'expCalculation', 'Calculation'], value, '#field');
```

### Текст нельзя изменить через properties

**Причина:** Текст не exposed как component property

**Решение:** Найти TextNode и изменить напрямую:

```typescript
import { findTextNode } from '../utils/node-search';

const textNode = findTextNode(instance);
if (textNode) {
  await figma.loadFontAsync(textNode.fontName as FontName);
  textNode.characters = 'New text';
}
```

### Барометр/элемент показывается когда не должен

**Причина:** Данные приходят с флагом `true`, но для этого типа сниппета он не нужен

**Решение:** Проверять тип контейнера:

```typescript
const containerName = ('name' in container) ? String(container.name) : '';
const isProductSnippet = containerName === 'EProductSnippet';
const hasBarometer = isProductSnippet ? false : (row['#flag'] === 'true');
```

### Favicon URL некорректный

**Причина:** Домен не очищен от протокола

**Решение:** Очистка в парсере:

```javascript
let domain = rawDomain;
if (domain.includes('://')) {
  domain = new URL(domain).hostname;
}
domain = domain.replace(/^www\./, '');
```

### Старая цена не устанавливается

**Причина:** Не найден EPrice с `view=old`

**Решение:** Проверять свойство view:

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

---

## 5. Диагностика

### Логирование в Figma

```typescript
// Logger может фильтроваться по уровню
// Используй console.log для гарантированного вывода при отладке
console.log(`[DEBUG] value=${value}`);

// Обычное логирование
Logger.info('Важное сообщение');
Logger.debug('Отладка');  // Только при DEBUG уровне
Logger.warn('Предупреждение');
Logger.error('Ошибка:', error);
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

### Дамп всех свойств

```typescript
import { debugComponentProperties } from './property-utils';

debugComponentProperties(instance);  // Выведет все свойства в консоль
```

---

## 6. Сборка и тестирование

```bash
# Сборка
npm run build

# Watch mode
npm run build:watch

# Запуск с Relay
npm run dev

# Тесты
npm run test
npm run test:watch
```

После сборки перезапустите плагин в Figma (закрыть и открыть заново).

---

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md) — карта проекта
- [GLOSSARY.md](GLOSSARY.md) — термины и концепции
- [STRUCTURE.md](STRUCTURE.md) — детали модулей
