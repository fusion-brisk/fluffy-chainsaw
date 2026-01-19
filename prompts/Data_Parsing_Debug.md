# Data Parsing & Debug Guide

## Обзор проблемы

Парсинг данных происходит в двух местах:
1. **Plugin** (`src/utils/snippet-parser.ts`) — парсит MHTML файлы
2. **Extension** (`extension/content.js`) — парсит живую страницу

Логика должна быть идентичной, но есть различия в доступе к CSS.

---

## 1. Проблема с фавиконками

### Симптомы
- Фавиконки не применяются к компонентам в Figma
- `#FaviconImage` пустой или неверный
- Спрайт-логика не работает

### Причина: CSS-спрайты

На Яндексе фавиконки — это **CSS-спрайты**:
```html
<div class="Favicon Favicon-Page0 Favicon-Page0_pos_3 Favicon-Entry4"></div>
```

CSS определяет:
```css
.Favicon-Page0.Favicon-Entry4 {
  background-image: url(https://favicon.yandex.net/favicon/v2/www.mvideo.ru;www.dns-shop.ru;...);
  background-size: 16px 320px;  /* Ширина спрайта */
}

.Favicon-Page0_pos_3 {
  background-position: 0 -60px;  /* Смещение для 4-й иконки (20px * 3) */
}
```

### Разница MHTML vs Live Page

| Аспект | MHTML (Plugin) | Live Page (Extension) |
|--------|----------------|----------------------|
| CSS доступ | `<style>` теги в HTML | Через `getComputedStyle()` |
| Классы | Сохранены | Доступны |
| Inline стили | Сохранены | Доступны |
| Спрайт URL | В CSS правилах | Нужен `getComputedStyle()` |

### Решение для Extension

В `content.js` функция `extractFavicon()` должна использовать `getComputedStyle()`:

```javascript
function extractFavicon(container) {
  const faviconSelectors = [
    '.Favicon-Icon',
    '.Favicon[class*="Favicon-Page"]',
    '.Favicon',
    '.Path .Favicon'
  ];
  
  for (const selector of faviconSelectors) {
    const el = container.querySelector(selector);
    if (!el) continue;
    
    // 1. Проверяем inline style
    const inlineStyle = el.getAttribute('style') || '';
    const inlineBgMatch = inlineStyle.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
    if (inlineBgMatch && inlineBgMatch[1]) {
      return processBackgroundUrl(inlineBgMatch[1], el);
    }
    
    // 2. Используем getComputedStyle (живая страница!)
    const computed = window.getComputedStyle(el);
    const bgImage = computed.backgroundImage;
    
    if (bgImage && bgImage !== 'none') {
      const urlMatch = bgImage.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
      if (urlMatch && urlMatch[1]) {
        const bgPosition = computed.backgroundPosition || '';
        const bgSize = computed.backgroundSize || '';
        return processSpriteUrl(urlMatch[1], bgPosition, bgSize, el);
      }
    }
    
    // 3. Fallback: img внутри
    const img = el.querySelector('img');
    if (img && img.src && !img.src.startsWith('data:')) {
      return img.src.startsWith('http') ? img.src : `https:${img.src}`;
    }
  }
  
  return '';
}

/**
 * Обрабатывает URL спрайта с несколькими доменами
 */
function processSpriteUrl(bgUrl, bgPosition, bgSize, el) {
  // Если URL не содержит список доменов (;) — возвращаем как есть
  if (!bgUrl.includes('favicon.yandex.net/favicon/v2/') || !bgUrl.includes(';')) {
    return bgUrl.startsWith('http') ? bgUrl : `https:${bgUrl}`;
  }
  
  // Извлекаем список доменов
  const v2Match = bgUrl.match(/favicon\.yandex\.net\/favicon\/v2\/([^?]+)/);
  if (!v2Match) return bgUrl;
  
  const domains = v2Match[1].split(';').filter(d => d.trim());
  if (domains.length === 0) return bgUrl;
  
  // Определяем индекс по классу _pos_X или background-position
  let index = 0;
  
  // Приоритет 1: класс Favicon-PageX_pos_Y
  const posClassMatch = el.className.match(/Favicon-Page\d+_pos_(\d+)/);
  if (posClassMatch) {
    index = parseInt(posClassMatch[1], 10);
  }
  // Приоритет 2: background-position
  else if (bgPosition) {
    const posValues = bgPosition.match(/-?\d+(?:\.\d+)?px/g);
    if (posValues && posValues.length > 0) {
      // Y-offset (второе значение или единственное)
      const yOffset = Math.abs(parseFloat(posValues[posValues.length > 1 ? 1 : 0]));
      // Стандартные размеры иконок: 20px, 16px, 24px
      const stride = yOffset % 20 === 0 ? 20 : (yOffset % 16 === 0 ? 16 : 20);
      index = Math.round(yOffset / stride);
    }
  }
  
  // Проверяем границы
  if (index < 0 || index >= domains.length) {
    console.warn(`[Favicon] Index ${index} out of bounds (0-${domains.length - 1})`);
    index = 0;
  }
  
  const domain = domains[index].trim().split('?')[0].split('/')[0];
  return `https://favicon.yandex.net/favicon/v2/${encodeURIComponent(domain)}?size=32&stub=1`;
}
```

---

## 2. Типы сниппетов (SnippetType)

### Текущие типы

| Тип | Описание | Характеристики |
|-----|----------|----------------|
| `EProductSnippet2` | Карточка товара (сетка) | Картинка, цена, рейтинг |
| `EShopItem` | Карточка магазина (вкладка Товары) | Магазин, цена, доставка |
| `EOfferItem` | Предложение в попапе | Магазин, цена, кнопка |
| `Organic_withOfferInfo` | Органика с ценой | Заголовок, текст, цена |
| `Organic` | Обычный результат | Заголовок, текст, ссылка |
| `ProductTile-Item` | Плитка товара | Аналог EProductSnippet2 |

### Добавление нового типа

#### Шаг 1: Определение в getSnippetType()

`extension/content.js`:
```javascript
function getSnippetType(container) {
  const className = container.className || '';
  
  // ВАЖНО: порядок проверок от специфичного к общему!
  if (className.includes('EOfferItem')) return 'EOfferItem';
  if (className.includes('EProductSnippet2')) return 'EProductSnippet2';
  if (className.includes('EShopItem')) return 'EShopItem';
  if (className.includes('ProductTile-Item')) return 'ProductTile-Item';
  if (className.includes('Organic_withOfferInfo')) return 'Organic_withOfferInfo';
  
  // === НОВЫЙ ТИП ===
  if (className.includes('NewSnippetType')) return 'NewSnippetType';
  
  return 'Organic';
}
```

`src/utils/snippet-parser.ts` (строка ~85):
```typescript
const snippetTypeValue = 
  container.className.includes('EOfferItem') ? 'EOfferItem' :
  container.className.includes('EProductSnippet2') ? 'EProductSnippet2' : 
  container.className.includes('EShopItem') ? 'EShopItem' : 
  container.className.includes('ProductTile-Item') ? 'ProductTile-Item' :
  container.className.includes('Organic_withOfferInfo') ? 'Organic_withOfferInfo' :
  // === НОВЫЙ ТИП ===
  container.className.includes('NewSnippetType') ? 'NewSnippetType' :
  'Organic';
```

#### Шаг 2: Добавление контейнера в селекторы

`extension/content.js`:
```javascript
const CONTAINER_SELECTORS = [
  '[class*="Organic_withOfferInfo"]',
  '[class*="EProductSnippet2"]',
  '.EShopItem',
  '.ProductTile-Item',
  '.EOfferItem',
  // === НОВЫЙ ТИП ===
  '.NewSnippetType',
  '[class*="NewSnippetType"]'
].join(', ');
```

`src/utils/dom-utils.ts`:
```typescript
const combinedSelector = [
  '[class*="Organic_withOfferInfo"]',
  '[class*="EProductSnippet2"]',
  '.EShopItem',
  '.ProductTile-Item',
  '.EOfferItem',
  // === НОВЫЙ ТИП ===
  '.NewSnippetType',
  '[class*="NewSnippetType"]'
].join(', ');
```

#### Шаг 3: Специальная обработка (если нужна)

`extension/content.js`:
```javascript
function extractStandardSnippet(container, snippetType) {
  // ... существующий код ...
  
  // === СПЕЦИАЛЬНАЯ ОБРАБОТКА NewSnippetType ===
  if (snippetType === 'NewSnippetType') {
    // Специфичные селекторы для этого типа
    const specialTitle = container.querySelector('.NewSnippetType-Title');
    if (specialTitle) {
      row['#OrganicTitle'] = getTextContent(specialTitle);
    }
    
    // Специфичные поля
    const specialField = container.querySelector('.NewSnippetType-SpecialField');
    if (specialField) {
      row['#SpecialField'] = getTextContent(specialField);
    }
  }
  
  // ... остальной код ...
}
```

`src/utils/snippet-parser.ts`:
```typescript
// После проверки EOfferItem (строка ~155)
if (snippetType === 'NewSnippetType') {
  // Специальная обработка
  const specialEl = queryFirstMatch(cache, ['.NewSnippetType-Title']);
  if (specialEl) {
    row['#OrganicTitle'] = getTextContent(specialEl);
  }
  // ... специфичная логика ...
  return { row, spriteState };
}
```

#### Шаг 4: Обновление парсинг-правил

`src/parsing-rules.ts`:
```typescript
// Добавить в rules:
'NewSnippetType': {
  domSelectors: ['.NewSnippetType', '[class*="NewSnippetType"]'],
  jsonKeys: [],
  type: 'boolean'
},
'NewSnippetType_Title': {
  domSelectors: ['.NewSnippetType-Title', '[class*="NewSnippetType-Title"]'],
  jsonKeys: ['title'],
  type: 'text'
},
// ... другие поля ...
```

#### Шаг 5: Компонент в Figma

1. Создать компонент `NewSnippetType` в библиотеке
2. Добавить в `src/page-builder/component-map.ts`:
```typescript
NewSnippetType: {
  key: 'COMPONENT_KEY_FROM_FIGMA',
  keyTouch: 'TOUCH_COMPONENT_KEY',  // если есть мобильная версия
  defaultProps: {
    // Дефолтные свойства
  }
}
```

---

## 3. Отладка парсинга

### Console логи в Extension

```javascript
// content.js — добавить в extractSnippets()
console.log('🔍 [Content] Контейнер:', container.className);
console.log('🔍 [Content] SnippetType:', snippetType);
console.log('🔍 [Content] Row:', JSON.stringify(row, null, 2));
```

### Инспекция элемента на странице

```javascript
// В DevTools консоли страницы Яндекса:

// Найти все сниппеты
document.querySelectorAll('.EProductSnippet2, .EShopItem, .Organic')

// Проверить фавиконку
const fav = document.querySelector('.Favicon-Page0');
const style = getComputedStyle(fav);
console.log('bgImage:', style.backgroundImage);
console.log('bgPosition:', style.backgroundPosition);
console.log('bgSize:', style.backgroundSize);

// Извлечь домены из спрайта
const url = style.backgroundImage.match(/url\("([^"]+)"\)/)[1];
const domains = url.match(/favicon\/v2\/([^?]+)/)[1].split(';');
console.log('Domains:', domains);
```

### Логи в Plugin (Figma DevTools)

```typescript
// В snippet-parser.ts
Logger.debug(`🔍 [PARSE] Container class: ${container.className}`);
Logger.debug(`🔍 [PARSE] SnippetType: ${snippetType}`);
Logger.debug(`🔍 [PARSE] #FaviconImage: ${row['#FaviconImage'] || '(пусто)'}`);
```

Открыть логи: **Plugins → Development → Open Console**

---

## 4. Чек-лист отладки фавиконок

### В Extension (content.js)

- [ ] `extractFavicon()` находит `.Favicon` элемент?
- [ ] `getComputedStyle()` возвращает `backgroundImage`?
- [ ] URL содержит `;` (список доменов)?
- [ ] `backgroundPosition` доступен?
- [ ] Индекс вычисляется корректно?
- [ ] Итоговый URL валидный?

### В Plugin (snippet-parser.ts)

- [ ] CSS кэш построен? (`cssCache.stats.faviconRules`)
- [ ] Элемент `.Favicon` найден в контейнере?
- [ ] `extractFavicon()` возвращает URL?
- [ ] Спрайт-логика срабатывает?
- [ ] `row['#FaviconImage']` заполнен?

### В Figma (page-creator.ts)

- [ ] `applyFavicon()` вызывается?
- [ ] Слой `#FaviconImage` найден в инстансе?
- [ ] `fillImageByUrl()` успешен?
- [ ] Изображение отображается?

---

## 5. Частые проблемы

### Проблема: Фавиконка пустая в Extension

**Причина**: `getComputedStyle()` не используется.

**Решение**: Использовать `window.getComputedStyle(el)` вместо `el.style`.

### Проблема: Неверный индекс в спрайте

**Причина**: Неверный расчёт stride (шага между иконками).

**Решение**: Эвристика по кратности:
```javascript
const yOffset = 60; // из background-position: 0 -60px
let stride = 20;
if (yOffset % 20 === 0) stride = 20;
else if (yOffset % 16 === 0) stride = 16;
else if (yOffset % 24 === 0) stride = 24;
const index = Math.round(yOffset / stride); // 60 / 20 = 3
```

### Проблема: Новый тип сниппета не парсится

**Чек-лист**:
1. Добавлен в `CONTAINER_SELECTORS`?
2. Добавлен в `getSnippetType()`?
3. Добавлена специальная обработка (если нужна)?
4. Добавлены правила в `parsing-rules.ts`?
5. Extension и Plugin синхронизированы?

### Проблема: Компонент не создаётся в Figma

**Чек-лист**:
1. Компонент есть в библиотеке?
2. Ключ добавлен в `component-map.ts`?
3. Библиотека подключена к файлу?
4. `SnippetType` соответствует ключу в map?

---

## 6. Файлы для изучения

| Файл | Назначение |
|------|------------|
| `extension/content.js` | Парсинг живой страницы |
| `src/utils/snippet-parser.ts` | Парсинг MHTML (эталон) |
| `src/utils/favicon-extractor.ts` | Логика извлечения фавиконок |
| `src/utils/dom-utils.ts` | Поиск контейнеров |
| `src/parsing-rules.ts` | CSS селекторы для полей |
| `src/page-builder/page-creator.ts` | Создание инстансов в Figma |
| `src/page-builder/component-map.ts` | Маппинг типов → компоненты |

---

## 7. Тестирование

### Тест Extension

1. Открыть страницу: `https://ya.ru/search?text=iphone`
2. Открыть DevTools → Console
3. Выполнить:
```javascript
// Ручной тест парсинга
const containers = document.querySelectorAll('.EProductSnippet2, .EShopItem');
containers.forEach((c, i) => {
  const fav = c.querySelector('.Favicon');
  if (fav) {
    const style = getComputedStyle(fav);
    console.log(`[${i}] bgImage:`, style.backgroundImage?.substring(0, 100));
    console.log(`[${i}] bgPosition:`, style.backgroundPosition);
  }
});
```

### Тест Plugin

1. Загрузить MHTML файл
2. Открыть Figma DevTools (Plugins → Development → Open Console)
3. Проверить логи `[FAVICON EXTRACT]`
4. Убедиться что `#FaviconImage` заполняется

### E2E тест

1. Открыть страницу Яндекса
2. Кликнуть на Extension → отправить данные
3. В Figma: Pull → Apply
4. Проверить что фавиконки отображаются в макете
