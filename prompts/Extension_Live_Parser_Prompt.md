# Chrome Extension: Live Page Parser

## Контекст
В Figma-плагине EProductSnippet уже реализован парсинг HTML-файлов (сохранённых MHTML) поисковой выдачи Яндекса. Парсер извлекает данные из товарных сниппетов и создаёт структуры `CSVRow` для заполнения Figma-компонентов.

Сейчас связка работает так:
1. **Extension** → собирает мок-данные → отправляет на Relay
2. **Relay** (`localhost:3847`) → хранит данные в очереди
3. **Figma Plugin** → получает данные → создаёт фрейм с текстом

## Задача
Доработать Chrome Extension, чтобы он извлекал **реальные данные** из загруженной страницы поисковой выдачи Яндекса, используя те же CSS-селекторы и логику, что и парсер в плагине.

## Архитектура парсинга в плагине

### Основные файлы
- `src/utils/snippet-parser.ts` — главный парсер, функция `parseYandexSearchResults(html)`
- `src/parsing-rules.ts` — конфигурация CSS-селекторов
- `src/types/csv-fields.ts` — типизация полей данных `CSVRow`
- `src/utils/dom-utils.ts` — утилиты для работы с DOM
- `src/utils/price-extractor.ts` — извлечение и форматирование цен

### Типы сниппетов (SnippetType)
```typescript
type SnippetType = 
  | 'EShopItem'           // Карточка магазина (вкладка "Товары")
  | 'EOfferItem'          // Предложение в попапе "Цены в магазинах"
  | 'EProductSnippet2'    // Товарная карточка (сетка/карусель)
  | 'Organic_withOfferInfo' // Органика с ценой
  | 'Organic'             // Обычный органический результат
```

### Ключевые поля CSVRow (приоритет для MVP)

#### Обязательные
| Поле | Описание | Селекторы |
|------|----------|-----------|
| `#SnippetType` | Тип сниппета | По классу контейнера |
| `#OrganicTitle` | Заголовок товара | `.OrganicTitle`, `.EProductSnippet2-Title`, `.EShopItem-Title` |
| `#OrganicPrice` | Текущая цена | `.EPrice-Value` (не в `.EPrice_view_old`) |
| `#ShopName` | Название магазина | `.EShopName .Line-AddonContent`, `.EShopItem-ShopName` |
| `#OrganicHost` | Домен магазина | Из URL или `.Path` |

#### Важные
| Поле | Описание | Селекторы |
|------|----------|-----------|
| `#ProductURL` | URL товара | `href` основной ссылки |
| `#OrganicImage` | Изображение товара | `.EThumb-Image`, `.Organic-OfferThumb img` |
| `#OldPrice` | Старая цена | `.EPrice_view_old .EPrice-Value` |
| `#DiscountPercent` | Скидка | `.LabelDiscount .Label-Content` |
| `#FaviconImage` | Фавиконка магазина | `.Favicon-Icon`, data-атрибуты спрайта |

#### Дополнительные (Phase 2)
| Поле | Описание |
|------|----------|
| `#ProductRating` | Рейтинг товара (0-5) |
| `#ShopInfo-Ugc` | Рейтинг магазина |
| `#EReviews_shopText` | Отзывы магазина |
| `#EDeliveryGroup-Item-1..3` | Варианты доставки |
| `#Fintech_Type` | Тип рассрочки (split, pay, ozon) |
| `#EPriceBarometer_View` | Барометр цен (below-market, in-market, above-market) |

### Контейнеры сниппетов (CSS-селекторы)
```javascript
const CONTAINER_SELECTORS = [
  '.EProductSnippet2',
  '.EShopItem',
  '.Organic',
  '.EOfferItem',
  '[class*="ProductSnippet"]',
  '[class*="Organic"]'
];
```

### Логика определения типа сниппета
```javascript
function getSnippetType(container) {
  const className = container.className || '';
  if (className.includes('EOfferItem')) return 'EOfferItem';
  if (className.includes('EProductSnippet2')) return 'EProductSnippet2';
  if (className.includes('EShopItem')) return 'EShopItem';
  if (className.includes('Organic_withOfferInfo')) return 'Organic_withOfferInfo';
  if (className.includes('Organic')) return 'Organic';
  return 'Organic';
}
```

### Формат данных для Relay
```typescript
interface RelayPayload {
  schemaVersion: 1;
  source: {
    url: string;    // URL страницы
    title: string;  // Заголовок страницы
  };
  capturedAt: string; // ISO timestamp
  items: CSVRow[];    // Массив распарсенных сниппетов
}

// CSVRow — объект с полями #OrganicTitle, #OrganicPrice, etc.
```

## Требования к реализации

### 1. Content Script (парсер)
Создать `extension/content.js` — скрипт, который:
- Находит все контейнеры сниппетов на странице
- Фильтрует рекламные (`.AdvProductGallery`, `.Organic_withAdvLabel`)
- Извлекает данные используя селекторы из `parsing-rules.ts`
- Возвращает массив `CSVRow`

### 2. Popup → Content Script
`popup.js` должен:
- Инжектить content script в активную вкладку
- Получать распарсенные данные
- Отправлять на Relay

### 3. Обработка особенностей живой страницы
- Изображения: `src` может быть `data:` placeholder, использовать `data-src` или `srcset`
- Цены: могут быть с неразрывными пробелами (thin space `\u2009`)
- Фавиконки: часто в CSS-спрайтах, fallback на `https://{host}/favicon.ico`

## Эталонная структура CSVRow (минимальный набор)
```javascript
{
  '#SnippetType': 'EProductSnippet2',
  '#ProductURL': 'https://market.yandex.ru/...',
  '#OrganicTitle': 'iPhone 15 Pro Max 256GB',
  '#ShopName': 'M.Video',
  '#OrganicHost': 'mvideo.ru',
  '#OrganicImage': 'https://avatars.mds.yandex.net/...',
  '#OrganicPrice': '149 990',   // Форматирование: thin space каждые 3 цифры
  '#OldPrice': '179 990',
  '#DiscountPercent': '17',
  '#discount': '–17%',
  '#FaviconImage': 'https://mvideo.ru/favicon.ico'
}
```

## Файлы для изучения
1. `src/utils/snippet-parser.ts` — функция `extractRowData()` (1600+ строк)
2. `src/parsing-rules.ts` — все CSS-селекторы
3. `src/types/csv-fields.ts` — полный список полей
4. `src/utils/price-extractor.ts` — форматирование цен
5. `src/utils/dom-utils.ts` — `findSnippetContainers()`, `extractProductURL()`

## Ограничения
- Не использовать eval, innerHTML для создания DOM
- Не модифицировать страницу пользователя
- Учитывать что страница может быть не Яндексом — возвращать пустой массив

## Порядок работы
1. Изучить `snippet-parser.ts` и `parsing-rules.ts`
2. Создать `extension/content.js` с функцией `extractSnippets()`
3. Обновить `extension/popup.js` для вызова content script
4. Протестировать на реальных страницах поиска Яндекса
5. Убедиться что данные приходят в Figma в правильном формате

## Пример вызова из popup.js
```javascript
async function extractPageData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
  
  // content.js должен возвращать данные через функцию
  const data = results[0].result;
  
  return {
    schemaVersion: 1,
    source: { url: tab.url, title: tab.title },
    capturedAt: new Date().toISOString(),
    items: data.rows // CSVRow[]
  };
}
```
