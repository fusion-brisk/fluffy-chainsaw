# EProductSnippet2 Grid Layout

## Задача

Добавить поддержку grid-формата верстки для сниппетов типа `EProductSnippet2`. Это карточки товаров в сетке (галерея), которые отличаются от линейного списка `EShopItem`.

---

## Текущая архитектура

### Типы сниппетов

| Тип | Описание | Формат |
|-----|----------|--------|
| `EShopItem` | Карточка магазина | Список (вертикальный) |
| `EProductSnippet2` | Карточка товара | **Grid (сетка)** |
| `EOfferItem` | Предложение в попапе | Список |
| `Organic_withOfferInfo` | Органика с ценой | Список |

### Ключевые файлы

1. **Парсинг данных:**
   - `extension/content.js` — парсинг живой страницы (Extension)
   - `src/utils/snippet-parser.ts` — парсинг MHTML (Plugin)

2. **Создание инстансов в Figma:**
   - `src/page-builder/page-creator.ts` — создание инстансов компонентов
   - `src/page-builder/component-map.ts` — маппинг типов → ключи компонентов
   - `src/page-builder/structure-builder.ts` — построение структуры страницы

3. **Обработчики данных:**
   - `src/handlers/price-handlers.ts` — цены, скидки, Fintech
   - `src/handlers/label-handlers.ts` — лейблы, барометр
   - `src/handlers/snippet-handlers.ts` — специфичная логика сниппетов

4. **Конфигурация:**
   - `src/config.ts` — COMPONENT_CONFIG, TEXT_FIELD_NAMES
   - `src/parsing-rules.ts` — CSS селекторы для парсинга

---

## HTML структура EProductSnippet2

```html
<div class="EProductSnippet2 EProductSnippet2_theme_desktop EProductSnippet2_size_m">
  <div class="EProductSnippet2-Container">
    <!-- Картинка -->
    <div class="EProductSnippet2-Thumb">
      <img class="EThumb-Image" src="...">
      <!-- Лейблы поверх картинки -->
      <div class="EThumb-Labels">
        <div class="EMarketCheckoutLabel">Покупки</div>
        <div class="ELabelRating">4.8</div>
      </div>
    </div>
    
    <!-- Контент -->
    <div class="EProductSnippet2-Content">
      <a class="EProductSnippet2-Title">Название товара</a>
      
      <!-- Цена -->
      <div class="EPriceGroup EPriceGroup_withLabelDiscount EPriceGroup_withPriceOld">
        <span class="EPrice EPriceGroup-Price">
          <span class="EPrice-Value">1 999</span>
          <span class="EPrice-Currency">₽</span>
        </span>
        <div class="EPriceGroup-Pair">
          <div class="LabelDiscount">−20%</div>
          <span class="EPrice EPrice_view_old">2 499 ₽</span>
        </div>
      </div>
      
      <!-- Магазин -->
      <div class="EShopName">
        <div class="Favicon"></div>
        <span>Магазин</span>
      </div>
    </div>
  </div>
</div>
```

---

## Что нужно реализовать

### 1. Grid-контейнер в Figma

- Создать Auto Layout Frame с `layoutMode: 'HORIZONTAL'` и `layoutWrap: 'WRAP'`
- Или использовать Grid Layout если доступен
- Параметры сетки:
  - Количество колонок: 2-4 (зависит от ширины)
  - Gap между элементами: 16px
  - Ширина карточки: фиксированная или адаптивная

### 2. Компонент EProductSnippet2

- Проверить наличие компонента в библиотеке Figma
- Добавить в `component-map.ts`:

```typescript
EProductSnippet2: {
  key: 'COMPONENT_KEY_FROM_FIGMA',
  keyTouch: 'TOUCH_COMPONENT_KEY',  // если есть мобильная версия
  defaultProps: {
    // Дефолтные свойства
  }
}
```

### 3. Логика размещения

В `structure-builder.ts` или `page-creator.ts`:

```typescript
// Определяем layout по типу сниппета
function getLayoutForSnippetType(snippetType: string): LayoutConfig {
  if (snippetType === 'EProductSnippet2') {
    return {
      mode: 'grid',
      columns: 3,
      gap: 16,
      itemWidth: 200  // или 'auto'
    };
  }
  return {
    mode: 'vertical',
    gap: 8
  };
}
```

### 4. Группировка сниппетов

- Сниппеты одного типа должны группироваться в один контейнер
- Разные типы — в разные контейнеры
- Порядок: EProductSnippet2 (grid) → EShopItem (list) → Organic (list)

---

## Пример Figma API для Grid

```typescript
// Создание grid-контейнера
const gridFrame = figma.createFrame();
gridFrame.name = 'ProductGrid';
gridFrame.layoutMode = 'HORIZONTAL';
gridFrame.layoutWrap = 'WRAP';  // ← Ключевое свойство для grid
gridFrame.primaryAxisAlignItems = 'MIN';
gridFrame.counterAxisAlignItems = 'MIN';
gridFrame.itemSpacing = 16;  // Gap между элементами
gridFrame.counterAxisSpacing = 16;  // Gap между строками

// Фиксированная ширина контейнера
gridFrame.resize(800, gridFrame.height);
gridFrame.primaryAxisSizingMode = 'FIXED';
gridFrame.counterAxisSizingMode = 'AUTO';

// Добавление карточек
for (const row of productRows) {
  const instance = await createInstance('EProductSnippet2', row);
  instance.layoutSizingHorizontal = 'FIXED';
  instance.resize(180, instance.height);  // Фиксированная ширина карточки
  gridFrame.appendChild(instance);
}
```

---

## Вопросы для уточнения

1. **Компонент EProductSnippet2** — уже есть в библиотеке Figma? Какой ключ?
2. **Ширина карточек** — фиксированная (180px, 200px) или адаптивная?
3. **Количество колонок** — фиксированное (3-4) или зависит от ширины контейнера?
4. **Touch версия** — нужна ли отдельная мобильная версия?
5. **Смешанный контент** — как обрабатывать страницы с EProductSnippet2 + EShopItem?

---

## Связанные файлы для изучения

```
src/page-builder/
├── component-map.ts      # Маппинг типов → компоненты
├── page-creator.ts       # Создание инстансов
├── structure-builder.ts  # Построение структуры
├── structure-parser.ts   # Парсинг структуры
├── types.ts              # Типы
└── index.ts              # Экспорты

src/handlers/
├── snippet-handlers.ts   # Обработка сниппетов
├── price-handlers.ts     # Цены
└── registry.ts           # Регистрация обработчиков

extension/
└── content.js            # Парсинг живой страницы
```

---

## Пример данных EProductSnippet2

```json
{
  "#SnippetType": "EProductSnippet2",
  "#OrganicTitle": "Смартфон Apple iPhone 15 Pro",
  "#OrganicImage": "https://avatars.mds.yandex.net/...",
  "#ThumbImage": "https://avatars.mds.yandex.net/...",
  "#OrganicPrice": "129 990",
  "#Currency": "₽",
  "#OldPrice": "149 990",
  "#DiscountPercent": "13",
  "#discount": "–13%",
  "#EPriceGroup_Discount": "true",
  "#EPriceGroup_OldPrice": "true",
  "#ShopName": "М.Видео",
  "#FaviconImage": "https://favicon.yandex.net/favicon/v2/mvideo.ru?size=32",
  "#ProductRating": "4.8",
  "#EMarketCheckoutLabel": "true",
  "#BUTTON": "true",
  "#ButtonView": "primaryShort",
  "#ButtonType": "checkout"
}
```
