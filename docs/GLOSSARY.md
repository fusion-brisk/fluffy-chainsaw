# Глоссарий Contentify

Справочник терминов и концепций для быстрого понимания проекта.

## Основные термины

### Snippet (сниппет)
Карточка товара или результата в поисковой выдаче Яндекса. Каждый сниппет содержит информацию о товаре: название, цену, магазин, изображение и т.д.

### Container (контейнер)
Figma-инстанс компонента из библиотеки, в который заполняются данные. Контейнер ищется по имени из списка `SNIPPET_CONTAINER_NAMES`.

### CSVRow
Структура данных одного сниппета — объект с полями, начинающимися с `#`. Формируется парсером из HTML и передаётся в плагин для заполнения Figma-компонентов.

### Handler
Функция обработки специфичной логики компонента. Handlers выполняются в порядке приоритетов и применяют данные к Figma-инстансам.

### HandlerContext
Контекст, передаваемый каждому handler:
```typescript
interface HandlerContext {
  container: BaseNode;       // Figma контейнер
  containerKey: string;      // ID контейнера
  row: CSVRow;              // Данные для заполнения
  instanceCache?: Map<...>; // Кэш найденных инстансов
}
```

### LayerDataItem
Связь между слоем Figma и данными из CSVRow:
```typescript
interface LayerDataItem {
  layer: SceneNode;         // Figma слой
  rowIndex: number;         // Индекс строки данных
  fieldName: string;        // Имя поля (#OrganicTitle)
  fieldValue: string;       // Значение поля
  isImage: boolean;         // Это изображение?
  isText: boolean;          // Это текст?
}
```

---

## Типы сниппетов (SnippetType)

| Тип | Описание | Компонент Figma |
|-----|----------|-----------------|
| `EShopItem` | Карточка магазина с ценой | EShopItem |
| `EOfferItem` | Оффер (предложение магазина) | EOfferItem |
| `EProductSnippet2` | Товарный сниппет (новый) | EProductSnippet2 |
| `EProductSnippet` | Товарный сниппет (legacy) | EProductSnippet |
| `ProductTile-Item` | Карточка в плитке товаров | ProductTile-Item |
| `Organic_withOfferInfo` | Органика с ценой | Organic_withOfferInfo |
| `Organic` | Обычный органический результат | ESnippet, Snippet |
| `ESnippet` | Универсальный сниппет | ESnippet |
| `Snippet` | Базовый сниппет | Snippet |

---

## Типы контейнеров (SNIPPET_CONTAINER_NAMES)

```typescript
const SNIPPET_CONTAINER_NAMES = [
  'EShopItem',           // Карточки магазинов Яндекс.Маркета
  'EProductSnippet2',    // Сниппеты товаров (новый формат)
  'ESnippet',            // Общий сниппет
  'EProductSnippet',     // Устаревший формат
  'EOfferItem',          // Офер
  'Snippet',             // Базовый сниппет
  'Organic_withOfferInfo', // Органик с офером
  'ProductTile-Item',    // Карточка товара в плитке
];
```

---

## Поля данных (CSVFields)

### Идентификация

| Поле | Тип | Описание |
|------|-----|----------|
| `#SnippetType` | SnippetType | Тип сниппета для маппинга |
| `#ProductURL` | string | URL страницы товара |
| `#query` | string | Поисковый запрос |

### Основной контент

| Поле | Тип | Описание |
|------|-----|----------|
| `#OrganicTitle` | string | Заголовок товара |
| `#OrganicText` | string | Описание/текст сниппета |
| `#OrganicHost` | string | Домен магазина |
| `#OrganicPath` | string | Путь URL после домена |
| `#OrganicImage` | string (URL) | Изображение товара |

### Магазин

| Поле | Тип | Описание |
|------|-----|----------|
| `#ShopName` | string | Название магазина |
| `#FaviconImage` | string (URL) | Фавиконка магазина |
| `#OfficialShop` | 'true'/'false' | Официальный магазин |
| `#ShopInfo-Ugc` | string | Рейтинг магазина |
| `#EReviews_shopText` | string | Текст отзывов ("62,8K отзывов") |

### Рейтинг товара

| Поле | Тип | Описание |
|------|-----|----------|
| `#ProductRating` | string | Рейтинг товара (0-5) |
| `#ReviewsNumber` | string | Количество отзывов |

### Цены

| Поле | Тип | Описание |
|------|-----|----------|
| `#OrganicPrice` | string | Текущая цена |
| `#OldPrice` | string | Старая цена (зачёркнутая) |
| `#DiscountPercent` | string | Процент скидки (число) |
| `#discount` | string | Текст скидки ("−17%") |

### EPriceGroup

| Поле | Тип | Описание |
|------|-----|----------|
| `#EPriceGroup_Discount` | 'true'/'false' | Показать скидку |
| `#EPriceGroup_OldPrice` | 'true'/'false' | Показать старую цену |
| `#EPriceGroup_Fintech` | 'true'/'false' | Показать Fintech |
| `#EPrice_View` | 'default'/'special' | View EPrice |
| `#Fintech_Type` | string | Тип Fintech (split, pay) |

### Кнопки

| Поле | Тип | Описание |
|------|-----|----------|
| `#BUTTON` | 'true'/'false' | Показать кнопку |
| `#ButtonView` | string | Вид кнопки |
| `#ButtonType` | 'checkout'/'shop' | Тип кнопки |
| `#EMarketCheckoutLabel` | 'true'/'false' | Лейбл "Покупки" |

### Доставка и BNPL

| Поле | Тип | Описание |
|------|-----|----------|
| `#EDeliveryGroup` | 'true'/'false' | Показать доставку |
| `#DeliveryList` | string | Список вариантов доставки |
| `#EBnpl` | 'true'/'false' | Показать BNPL иконки |

### Изображения

| Поле | Тип | Описание |
|------|-----|----------|
| `#ThumbImage` | string (URL) | Thumbnail изображение |
| `#Image1`, `#Image2`, `#Image3` | string (URL) | Изображения для EThumbGroup |
| `#EQuote-AuthorAvatar` | string (URL) | Аватар автора цитаты |

---

## Handler приоритеты

| Приоритет | Константа | Описание | Примеры |
|-----------|-----------|----------|---------|
| 0 | `CRITICAL` | Структурные изменения | EPriceGroup, EPriceView |
| 10 | `VARIANTS` | Variant properties | BrandLogic, EOfferItem, EShopItem |
| 20 | `VISIBILITY` | Показ/скрытие элементов | EButton, OfficialShop |
| 30 | `TEXT` | Текстовые поля | LabelDiscountView, QuoteText |
| 40 | `FALLBACK` | Финальные обработки | ESnippetOrganicTextFallback |
| 50 | `FINAL` | Пост-обработка | MetaVisibility |

---

## Property Utils

### trySetProperty
Умная установка свойства с fallback:
```typescript
trySetProperty(instance, ['myProperty', 'My Property'], value, '#MyField');
```

### processVariantProperty
Установка Variant Property:
```typescript
processVariantProperty(instance, 'type=Split', '#Fintech_Type');
```

### getCachedInstance
Получение инстанса из кэша (O(1) вместо O(n)):
```typescript
const epg = getCachedInstance(context.instanceCache!, 'EPriceGroup');
```

---

## Протокол сообщений

### UI → Code (UIMessage)

| Type | Payload | Описание |
|------|---------|----------|
| `import-csv` | `{ rows, scope }` | Импорт данных |
| `apply-relay-payload` | `{ payload }` | Данные от Extension |
| `build-page` | `{ rows, html }` | Создание страницы |
| `cancel-import` | — | Отмена импорта |
| `get-settings` | — | Запрос настроек |

### Code → UI (CodeMessage)

| Type | Payload | Описание |
|------|---------|----------|
| `progress` | `{ current, total, message, operationType }` | Прогресс |
| `stats` | `{ processedInstances, successfulImages, failedImages, errors }` | Статистика |
| `done` | `{ count }` | Завершение |
| `log` | `{ message }` | Лог-сообщение |
| `error` | `{ message }` | Ошибка |

---

## UI состояния (AppState)

| State | Описание |
|-------|----------|
| `checking` | Проверка подключения к Relay |
| `ready` | Ожидание данных |
| `confirming` | Диалог подтверждения |
| `processing` | Обработка данных |
| `success` | Результат с статистикой |
| `setup` | Relay не подключён |
| `fileDrop` | Fallback для файлов |

---

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md) — детальная карта проекта
- [EXTENDING.md](EXTENDING.md) — примеры расширения
- [STRUCTURE.md](STRUCTURE.md) — детали модулей
