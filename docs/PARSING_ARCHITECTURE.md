# Архитектура парсинга Contentify

> Промпт для агента по улучшению парсинга и Figma-компонентов

## Цель задания

Проанализировать текущую схему парсинга данных в Contentify и предложить доработки Figma-компонентов, которые:

1. Позволят более точно обрабатывать существующие данные из Яндекса
2. Упростят добавление новых типов сниппетов и полей
3. Устранят несогласованности между слоями в Figma и полями данных

---

## Архитектура системы парсинга

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│   ИСТОЧНИКИ ДАННЫХ      │     │      ПАРСИНГ            │     │   ПРИМЕНЕНИЕ В FIGMA    │
├─────────────────────────┤     ├─────────────────────────┤     ├─────────────────────────┤
│                         │     │                         │     │                         │
│ Browser Extension       │────▶│ extension/content.js    │     │ handlers/registry.ts    │
│ (живая страница Яндекса)│     │ - getComputedStyle()    │     │ - 25+ handlers          │
│                         │     │ - DOM traversal         │     │ - приоритеты 0-50       │
│                         │     │                         │     │                         │
│ MHTML/HTML файл         │────▶│ snippet-parser.ts       │────▶│ data-assignment.ts      │
│ (drag-and-drop в плагин)│     │ - CSS cache             │     │ - маппинг row→container │
│                         │     │ - parsing-rules.ts      │     │ - группировка           │
│                         │     │                         │     │                         │
└─────────────────────────┘     │ CSVRow[]                │     │ text-handlers.ts        │
                                │ (унифицированный формат)│     │ image-handlers.ts       │
                                └─────────────────────────┘     └─────────────────────────┘
```

### Два пути парсинга

| Путь | Файл | Контекст | Особенности |
|------|------|----------|-------------|
| **Browser Extension** | `extension/content.js` | Живая страница Яндекса | `getComputedStyle()` для фавиконок, полный DOM |
| **Plugin Fallback** | `src/utils/snippet-parser.ts` | MHTML/HTML файл | CSS-кэш, parsing-rules.ts |

Оба пути генерируют **CSVRow[]** — унифицированный формат данных.

---

## Типы сниппетов (SnippetType)

```typescript
type SnippetType = 
  | 'EShopItem'           // Карточка магазина в списке "Цены в магазинах"
  | 'EOfferItem'          // Оффер магазина в попапе выбора магазина
  | 'EProductSnippet2'    // Товарная плитка (галерея товаров)
  | 'Organic_withOfferInfo' // Органический результат с ценой
  | 'Organic'             // Обычный органический результат
  | 'ESnippet'            // Универсальный сниппет (промо)
  | 'Snippet';            // Legacy
```

### Маппинг на Figma-компоненты

| SnippetType | Figma Component | Описание |
|-------------|-----------------|----------|
| `EShopItem` | EShopItem | Карточка магазина |
| `EOfferItem` | EOfferItem | Оффер в попапе |
| `EProductSnippet2` | EProductSnippet | Товарная плитка |
| `Organic_withOfferInfo` | Organic | Органика с ценой |
| `Organic` | Organic | Обычная органика |
| `ESnippet` | ESnippet | Универсальный |

---

## Типы контейнеров (containerType)

Контейнеры группируют сниппеты на странице SERP:

| containerType | Содержимое | Селектор на странице |
|---------------|------------|---------------------|
| `ProductsTiles` | Галерея EProductSnippet2 | `data-fast-name="products_mode_constr"` |
| `EShopList` | Список EShopItem | Множественные `.EShopItem` |
| `EOfferList` | Список EOfferItem | Множественные `.EOfferItem` |
| `EntityOffers` | Групповые офферы | `.entity-offers` |
| `AdvProductGallery` | Рекламная галерея | `.AdvProductGallery` |
| `OrganicList` | Органические результаты | Обычные `li.serp-item` |
| `Single` | Одиночный сниппет | Нет группировки |

---

## Структура данных CSVRow

### Идентификация

```typescript
'#SnippetType': SnippetType;       // Тип сниппета
'#serpItemId': string;             // ID контейнера (<li data-cid="...">)
'#containerType': string;          // Тип группы (ProductsTiles, EShopList, ...)
'#platform': 'desktop' | 'touch';  // Платформа источника
```

### Основной контент

```typescript
'#OrganicTitle': string;           // Заголовок товара/сниппета
'#OrganicText': string;            // Описание
'#OrganicImage': string;           // URL изображения товара
'#ThumbImage': string;             // Thumbnail изображение
'#Image1': string;                 // Доп. изображение 1 (EThumbGroup)
'#Image2': string;                 // Доп. изображение 2
'#Image3': string;                 // Доп. изображение 3
```

### Магазин

```typescript
'#ShopName': string;               // Название магазина
'#OrganicHost': string;            // Домен магазина
'#FaviconImage': string;           // URL фавиконки
'#OfficialShop': 'true'|'false';   // Официальный магазин
'#ShopInfo-Ugc': string;           // Рейтинг магазина (текст)
'#ShopRating': string;             // Рейтинг магазина (число)
'#EReviews_shopText': string;      // "62,8K отзывов на магазин"
```

### Цены

```typescript
'#OrganicPrice': string;           // Текущая цена ("12 990 ₽")
'#OldPrice': string;               // Старая цена ("15 990 ₽")
'#DiscountPercent': string;        // Процент скидки ("−19%")
'#discount': string;               // Форматированная скидка

// EPriceGroup модификаторы
'#EPriceGroup_Discount': 'true'|'false';   // Показывать блок скидки
'#EPriceGroup_OldPrice': 'true'|'false';   // Показывать старую цену
'#EPriceGroup_Fintech': 'true'|'false';    // Показывать рассрочку

// EPrice
'#EPrice_View': 'default'|'special';       // Вид цены (special = акцентная)
```

### Кнопки

```typescript
'#BUTTON': 'true'|'false';         // Показывать кнопку
'#ButtonView': string;             // primaryShort, primaryLong, secondary, white
'#ButtonType': string;             // checkout, shop
'#EButton_visible': 'true'|'false';
'#EMarketCheckoutLabel': 'true'|'false';  // Лейбл "Купить на Маркете"
```

### Барометр цен (EPriceBarometer)

```typescript
'#ELabelGroup_Barometer': 'true'|'false';
'#EPriceBarometer_View': 'below-market'|'in-market'|'above-market';
'#EPriceBarometer_isCompact': 'true'|'false';  // Компактный для EShopItem
```

### Рейтинги и отзывы

```typescript
'#ProductRating': string;          // Рейтинг товара (0-5)
'#ReviewsNumber': string;          // Количество отзывов
'#EQuote-Text': string;            // Текст цитаты из отзыва
'#EQuote-AuthorAvatar': string;    // Аватар автора цитаты
```

### Доставка

```typescript
'#EDeliveryGroup': 'true'|'false'; // Показывать блок доставки
'#DeliveryList': string;           // Список опций доставки
'#EBnpl': 'true'|'false';          // BNPL (рассрочка)
```

### Модификаторы компонентов

```typescript
// EOfferItem
'#EOfferItem_defaultOffer': 'true'|'false';
'#EOfferItem_hasButton': 'true'|'false';
'#EOfferItem_hasReviews': 'true'|'false';
'#EOfferItem_hasDelivery': 'true'|'false';

// EShopItem
'#EShopItem_priceDisclaimer': 'true'|'false';
'#EShopItem_favoriteBtn': 'true'|'false';
```

### Реклама

```typescript
'#isAdv': 'true'|'false';          // Рекламный сниппет (AdvProductGallery)
'#isPromo': 'true'|'false';        // Промо-сниппет (Organic_Adv)
'#AdvGalleryTitle': string;        // Заголовок рекламной галереи
```

---

## Правила парсинга (parsing-rules.ts)

Каждое поле имеет правило извлечения:

```typescript
interface FieldRule {
  domSelectors: string[];  // CSS-селекторы (по приоритету)
  jsonKeys: string[];      // JSON-ключи (fallback)
  type?: 'text' | 'image' | 'price' | 'boolean' | 'attribute';
  domAttribute?: string;   // Атрибут для извлечения (href, src, value)
}
```

### Примеры правил

```typescript
'#OrganicTitle': {
  domSelectors: [
    '.OrganicTitleContentSpan',
    '[class*="OrganicTitleContentSpan"]',
    'h2.OrganicTitle-LinkText',
    '.EProductSnippet2-Title',
    '.EShopItem-Title',
    '.OrganicTitle'
  ],
  jsonKeys: ['title', 'name', 'headline'],
  type: 'text'
}

'#OrganicImage': {
  domSelectors: [
    '.Organic-OfferThumb img',
    '.EProductSnippet2-Thumb img',
    '.EShopItem-Leading img',    // Touch
    '.EShopItem-Left img',       // Desktop
    '.EThumb-Image'
  ],
  jsonKeys: ['image', 'thumbnail'],
  type: 'image'
}

'#ShopName': {
  domSelectors: [
    '.EShopName .Line-AddonContent',
    '.EShopName',
    '.EShopItem-ShopName .EShopName',
    '.EProductSnippet2-ShopInfoTitle'
  ],
  jsonKeys: ['shopName', 'shop', 'vendor'],
  type: 'text'
}
```

---

## Система Handlers

Handlers применяют данные CSVRow к Figma-компонентам в определённом порядке.

### Приоритеты выполнения

| Приоритет | Категория | Описание |
|-----------|-----------|----------|
| 0 | CRITICAL | Структурные изменения (EPriceGroup) |
| 10 | VARIANTS | Переключение variant properties |
| 20 | VISIBILITY | Показ/скрытие элементов |
| 30 | TEXT | Текстовые поля |
| 40 | FALLBACK | Финальные обработки |

### Список handlers

```typescript
// CRITICAL (0)
'EPriceGroup'      // Цены, скидки, Fintech
'EPriceView'       // EPrice view (special/default)

// VARIANTS (10)
'BrandLogic'       // Brand variant
'EPriceBarometer'  // Барометр цен
'EMarketCheckoutLabel'  // Лейбл чекаута
'MarketCheckoutButton'  // BUTTON variant на контейнере
'EOfferItem'       // Модификаторы карточки предложения
'EShopItem'        // Модификаторы карточки магазина
'ESnippetProps'    // Boolean пропсы ESnippet
'EProductSnippet'  // Модификаторы карточки товара
'ShopInfoBnpl'     // BNPL иконки

// VISIBILITY (20)
'EButton'          // EButton view и visible
'OfficialShop'     // Галочка официального магазина
'RatingReviewQuoteVisibility'  // Скрывает группу если нет данных
'InfoIcon'         // Иконка "Инфо" в EPriceGroup-Fintech

// TEXT (30)
'LabelDiscountView'  // View лейбла скидки
'QuoteText'        // Текст цитаты
'OrganicPath'      // Путь URL

// FALLBACK (40)
'ESnippetOrganicTextFallback'      // Fallback для текста
'ESnippetOrganicHostFromFavicon'   // Host из favicon URL
```

### HandlerContext

```typescript
interface HandlerContext {
  container: InstanceNode;     // Figma-инстанс контейнера
  row: CSVRow;                 // Данные строки
  instanceCache: Map<string, InstanceNode>;  // Кэш вложенных инстансов
  snippetType: string;         // Тип сниппета
}
```

---

## Маппинг данных на слои Figma

### Именование слоёв

Слои данных в Figma-компонентах начинаются с `#`:

| Имя слоя Figma | Тип слоя | Поле CSVRow |
|----------------|----------|-------------|
| `#OrganicTitle` | TEXT | `row['#OrganicTitle']` |
| `#OrganicPrice` | TEXT | `row['#OrganicPrice']` |
| `#OldPrice` | TEXT | `row['#OldPrice']` |
| `#discount` | TEXT | `row['#discount']` |
| `#ShopName` | TEXT | `row['#ShopName']` |
| `#OrganicHost` | TEXT | `row['#OrganicHost']` |
| `#OrganicImage` | RECTANGLE (fill) | `row['#OrganicImage']` |
| `#FaviconImage` | RECTANGLE (fill) | `row['#FaviconImage']` |
| `#ThumbImage` | RECTANGLE (fill) | `row['#ThumbImage']` |

### Способы применения данных

```typescript
// 1. Текстовые слои — прямая замена
textNode.characters = row['#OrganicTitle'];

// 2. Изображения — заливка через imageFill
const imageHash = figma.createImage(bytes).hash;
node.fills = [{ type: 'IMAGE', imageHash, scaleMode: 'FILL' }];

// 3. Variant Properties — через setProperties
instance.setProperties({ 'View': 'secondary' });

// 4. Exposed Boolean Properties
trySetProperty(instance, ['withButton'], true);

// 5. Видимость
node.visible = row['#BUTTON'] === 'true';
```

---

## Текущие проблемы и ограничения

### 1. Несогласованность именования

**Проблема**: Имена слоёв не всегда соответствуют полям CSVRow.

```
Figma слой          CSVRow поле           Статус
─────────────────────────────────────────────────
#ShopInfo-Ugc       #ShopInfo-Ugc         ✓ OK
#EReviews_shopText  #EReviews_shopText    ✓ OK
ShopRating          #ShopRating           ✗ Нет #
ProductRating       #ProductRating        ✗ Нет #
```

**Рекомендация**: Унифицировать — все data-слои с `#`.

### 2. Variant Properties vs Visible

**Проблема**: Разные способы управления видимостью.

```typescript
// Способ 1: visible
instance.visible = false;

// Способ 2: Variant enum
trySetProperty(instance, ['View'], 'hidden');

// Способ 3: Exposed boolean
trySetProperty(instance, ['withButton'], false);
```

**Рекомендация**: Стандартизировать через exposed boolean properties.

### 3. Глубокая вложенность

**Проблема**: Целевые слои сильно вложены.

```
EShopItem
└── .EShopItem-ShopInfo
    └── .EShopItem-ShopInfoTitle
        └── .EShopName
            └── .Line-AddonContent  ← целевой слой
```

**Рекомендация**: Expose вложенные значения через Component Properties.

### 4. Условная видимость групп

**Проблема**: Handler `RatingReviewQuoteVisibility` вручную скрывает группы.

```typescript
// Текущий код:
if (!productRating && !reviewsNumber && !quoteText) {
  ratingReviewQuoteGroup.visible = false;
}
```

**Рекомендация**: Exposed boolean `withRating`, `withReviews`, `withQuote`.

### 5. Platform-специфичные различия

**Проблема**: Touch и Desktop версии имеют разные селекторы.

```typescript
// Touch
'.EShopItem-Leading img'

// Desktop  
'.EShopItem-Left img'
```

**Решение**: Обе версии уже в parsing-rules.ts, проверять порядок приоритетов.

---

## Файлы для анализа

| Путь | Описание | LOC |
|------|----------|-----|
| `src/types/csv-fields.ts` | Типы полей CSVRow | ~280 |
| `src/parsing-rules.ts` | CSS-селекторы парсинга | ~925 |
| `src/handlers/registry.ts` | Реестр handlers | ~460 |
| `src/handlers/price-handlers.ts` | Обработка цен | ~300 |
| `src/handlers/snippet-handlers.ts` | Обработка сниппетов | ~600 |
| `src/handlers/button-handlers.ts` | Обработка кнопок | ~200 |
| `src/plugin/data-assignment.ts` | Маппинг row→container | ~670 |
| `src/page-builder/component-map.ts` | Ключи компонентов | ~620 |
| `extension/content.js` | Парсинг (browser) | ~2360 |
| `src/utils/snippet-parser.ts` | Парсинг (plugin) | ~2010 |

---

## Задачи для анализа

### 1. Аудит Figma-компонентов

- [ ] Какие слои используют имена с `#`, какие без?
- [ ] Какие свойства exposed, какие внутренние?
- [ ] Есть ли несоответствия между именами слоёв и полями CSVRow?
- [ ] Какие компоненты требуют глубокого обхода для доступа к слоям?

### 2. Анализ handlers

- [ ] Какие handlers делают сложные манипуляции через `trySetProperty`?
- [ ] Какие условия видимости можно вынести в exposed boolean?
- [ ] Какие handlers можно упростить изменением компонента?

### 3. Предложения по компонентам

- [ ] Какие Component Properties добавить?
- [ ] Как унифицировать именование слоёв?
- [ ] Какие вложенные значения expose наружу?
- [ ] Нужны ли новые варианты компонентов?

---

## Ожидаемый результат

1. **Список рекомендаций** по изменению Figma-компонентов
2. **Таблица новых Component Properties** с обоснованием
3. **План миграции** именования слоёв (если требуется)
4. **Упрощения handlers** за счёт изменений в компонентах
5. **Оценка трудозатрат** на каждое изменение
