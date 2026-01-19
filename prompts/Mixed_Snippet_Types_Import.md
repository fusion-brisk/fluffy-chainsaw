# Импорт страниц с разными типами сниппетов

## Контекст проекта

Figma-плагин **EProductSnippet** (Contentify) автоматически заполняет макеты данными из HTML/MHTML файлов поисковой выдачи Яндекса.

### Архитектура

```
HTML/MHTML → snippet-parser.ts → CSVRow[] → handlers → Figma Layers
```

- **UI Thread**: парсинг HTML, извлечение `CSVRow[]`
- **Logic Thread**: поиск контейнеров, применение данных через handlers

## Типы сниппетов

### Определённые типы (`src/types/csv-fields.ts`)

```typescript
export type SnippetType = 
  | 'EShopItem'           // Карточка магазина (список магазинов)
  | 'EOfferItem'          // Предложение в попапе "Цены в магазинах"
  | 'EProductSnippet2'    // Карточка товара (галерея)
  | 'EProductSnippet'     // Карточка товара (legacy)
  | 'ProductTile-Item'    // Плитка товара
  | 'Organic_withOfferInfo' // Органический сниппет с ценой
  | 'Organic'             // Базовый органический сниппет
  | 'Organic_Adv'         // Рекламный сниппет
  | 'ESnippet'            // Универсальный сниппет
  | 'Snippet';            // Legacy сниппет
```

### Определение типа в парсере (`src/utils/snippet-parser.ts`)

```typescript
// Строка ~86-92
const snippetTypeValue = 
  container.className.includes('EOfferItem') ? 'EOfferItem' :
  container.className.includes('EProductSnippet2') ? 'EProductSnippet2' : 
  container.className.includes('EShopItem') ? 'EShopItem' : 
  container.className.includes('ProductTile-Item') ? 'ProductTile-Item' :
  container.className.includes('Organic_withOfferInfo') ? 'Organic_withOfferInfo' :
  'Organic';
```

### Обязательные поля (`src/types/csv-fields.ts`)

```typescript
export const REQUIRED_FIELDS: Record<SnippetType, (keyof CSVFields)[]> = {
  'EShopItem': ['#SnippetType', '#ShopName', '#OrganicPrice'],
  'EOfferItem': ['#SnippetType', '#ShopName', '#OrganicPrice'],
  'EProductSnippet2': ['#SnippetType', '#OrganicTitle', '#OrganicPrice'],
  'EProductSnippet': ['#SnippetType', '#OrganicTitle', '#OrganicPrice'],
  'ProductTile-Item': ['#SnippetType', '#OrganicTitle'],
  'Organic_withOfferInfo': ['#SnippetType', '#OrganicTitle', '#OrganicPrice'],
  'Organic': ['#SnippetType', '#OrganicTitle'],
  'Organic_Adv': ['#SnippetType', '#OrganicTitle'],
  'ESnippet': ['#SnippetType'],
  'Snippet': ['#SnippetType']
};
```

## Ключевые файлы

### Парсинг
| Файл | Описание |
|------|----------|
| `src/utils/snippet-parser.ts` | Главный парсер HTML → CSVRow |
| `src/utils/dom-utils.ts` | Поиск контейнеров сниппетов |
| `src/page-builder/structure-parser.ts` | Парсинг структуры страницы |

### Handlers (Registry Pattern)
| Файл | Описание |
|------|----------|
| `src/handlers/registry.ts` | Централизованная регистрация handlers |
| `src/handlers/snippet-handlers.ts` | EOfferItem, EShopItem, ESnippet handlers |
| `src/handlers/price-handlers.ts` | EPriceGroup, скидки, Fintech |
| `src/handlers/label-handlers.ts` | Лейблы, барометр, checkout |
| `src/handlers/delivery-handlers.ts` | EDeliveryGroup, BNPL |

### Page Builder (режим `build`)
| Файл | Описание |
|------|----------|
| `src/page-builder/component-map.ts` | Маппинг типов на компоненты |
| `src/page-builder/structure-builder.ts` | Построение структуры страницы |
| `src/page-builder/page-creator.ts` | Создание Figma-фреймов |

## Текущая проблема

Страница поисковой выдачи может содержать **смешанные типы сниппетов**:
- EProductSnippet2 (галерея товаров)
- EShopItem (список магазинов)
- EOfferItem (предложения магазинов)
- Organic сниппеты (текстовые результаты)

### Пример структуры страницы

```
<div class="serp-list">
  <li data-cid="0">
    <!-- AdvProductGallery с EProductSnippet2 -->
    <div class="AdvProductGallery">
      <div class="EProductSnippet2">...</div>
      <div class="EProductSnippet2">...</div>
    </div>
  </li>
  <li data-cid="1">
    <!-- EShopGroup с EShopItem -->
    <div class="EShopGroup">
      <div class="EShopItem">...</div>
      <div class="EShopItem">...</div>
    </div>
  </li>
  <li data-cid="2">
    <!-- Organic сниппет -->
    <div class="Organic Organic_withOfferInfo">...</div>
  </li>
  <li data-cid="3">
    <!-- EOfferGroup с EOfferItem -->
    <div class="EOfferGroup">
      <div class="EOfferItem">...</div>
    </div>
  </li>
</div>
```

## Задачи для доработки

### 1. Группировка сниппетов по `data-cid`

- Парсер должен сохранять `#serpItemId` (из `data-cid`) для группировки
- Сниппеты из одного `<li>` должны группироваться в один контейнер

### 2. Определение типа контейнера

- `AdvProductGallery` → для EProductSnippet2
- `EShopGroup` → для EShopItem
- `EOfferGroup` → для EOfferItem
- `EntityOffers` → для Organic с ценой

### 3. Маппинг на Figma-компоненты

Компоненты из библиотеки DC • ECOM (`src/page-builder/component-map.ts`):

```typescript
SNIPPET_COMPONENT_MAP: Record<SnippetType, ComponentConfig>
CONTAINER_CONFIG: Record<ContainerType, ContainerConfig>
```

### 4. Сохранение порядка элементов

- Порядок сниппетов должен соответствовать DOM-порядку
- Группы должны сохранять относительный порядок

## API для работы

### Парсинг

```typescript
// Главная функция парсинга
parseYandexSearchResults(html: string, fullMhtml?: string): { rows: CSVRow[], error?: string }

// Извлечение данных из контейнера
extractRowData(container: Element, doc: Document, ...): { row: CSVRow | null, spriteState }
```

### Page Builder

```typescript
// Создание страницы из HTML
createSerpPage(html: string, options: PageCreationOptions): Promise<PageCreationResult>

// Определение типа сниппета
detectSnippetType(row: CSVRow): SnippetType

// Получение конфигурации компонента
getComponentConfig(type: SnippetType): ComponentConfig | null
```

### Handlers

```typescript
// Контекст для handlers
interface HandlerContext {
  container: BaseNode;
  containerKey: string;
  row: CSVRow | null;
  instanceCache?: InstanceCache;
}

// Регистрация handler
handlerRegistry.register(name, handler, { priority, mode, containers })
```

## Тестовые примеры

Папка `examples/` содержит HTML-файлы для тестирования:
- `model_coffeemaker.html` — страница с товарами
- `wide_coffeemaker.html` — широкий макет
- `t-shirt.html` — одежда

## Ограничения

1. **ES5 в code.ts** — транспиляция через Babel до IE11
2. **Без Node.js API** — только браузерное и Figma API
3. **postMessage** — асинхронная коммуникация UI ↔ Logic

## Команды

```bash
npm run build      # Сборка
npm run dev        # Watch режим
npm test           # Тесты
```
