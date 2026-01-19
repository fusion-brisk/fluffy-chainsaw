# UI & Extension Protocol Guide

## Обзор архитектуры

Система состоит из трёх частей:
1. **Chrome Extension** (`extension/`) — парсит страницы Яндекса, отправляет данные на Relay
2. **Relay Server** (`relay/`) — Node.js сервер для передачи данных между Extension и Plugin
3. **Figma Plugin UI** (`src/ui.tsx`, `src/components/`) — React-интерфейс плагина

```
┌─────────────────┐     POST /push      ┌─────────────┐     GET /pull      ┌─────────────────┐
│ Chrome Extension│ ──────────────────► │ Relay Server│ ◄──(auto-polling)── │ Figma Plugin UI │
│   (popup.js)    │     (one click)     │ :3847       │                     │   (ui.tsx)      │
└─────────────────┘                     └─────────────┘                     └─────────────────┘
                                                                                    │
                                                                                    │ postMessage
                                                                                    ▼
                                                                            ┌─────────────────┐
                                                                            │ Figma Plugin    │
                                                                            │   (code.ts)     │
                                                                            └─────────────────┘
```

## UX Flow (v1.2)

### Плагин Figma
- **RelayIndicator** в toolbar — компактная иконка-индикатор:
  - 🟢 Зелёная — relay доступен, готов к импорту
  - ⚪ Серая — relay недоступен
  - Клик — открывает popover с настройками relay URL
- **Auto-polling** — плагин каждые 2 секунды проверяет relay на наличие данных
- **ImportConfirmDialog** — при получении данных показывает диалог "Создать артборд «query»?"

### Расширение браузера
- **Минималистичный popup** — одна большая иконка:
  - 🟢 Зелёная — на странице Яндекса, relay доступен
  - ⚪ Серая — неподходящий домен или relay недоступен
  - Клик — сразу парсит и отправляет данные в Figma
- **Options page** — настройки relay URL (ПКМ → Options)

---

## 1. Chrome Extension

### Файловая структура
```
extension/
├── manifest.json      # Manifest V3
├── popup.html         # Минималистичный popup (иконка)
├── popup.js           # Popup логика (один клик → отправка)
├── options.html       # Страница настроек
├── options.js         # Логика настроек (relay URL)
├── content.js         # Content script (парсинг)
├── icons/             # Иконки расширения
└── README.md
```

### manifest.json
```json
{
  "manifest_version": 3,
  "name": "EProductSnippet Parser",
  "version": "1.1.0",
  "permissions": ["activeTab", "scripting", "storage", "clipboardWrite"],
  "host_permissions": [
    "http://localhost:*/*",
    "https://*.yandex.ru/*",
    "https://*.ya.ru/*"
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

### content.js — Парсер страницы

Content script выполняется в контексте страницы и возвращает данные через `chrome.scripting.executeScript()`.

**Формат возвращаемых данных:**
```javascript
{
  rows: CSVRow[]  // Массив распарсенных сниппетов
}
```

**CSVRow — ключевые поля:**
```javascript
{
  '#SnippetType': 'EProductSnippet2' | 'EShopItem' | 'EOfferItem' | 'Organic_withOfferInfo' | 'Organic',
  '#ProductURL': 'https://...',
  '#OrganicTitle': 'Название товара',
  '#ShopName': 'Название магазина',
  '#OrganicHost': 'domain.ru',
  '#OrganicImage': 'https://...image.jpg',
  '#OrganicPrice': '149 990',  // С thin space (U+2009)
  '#Currency': '₽',
  '#OldPrice': '179 990',
  '#discount': '–17%',
  '#DiscountPercent': '17',
  '#FaviconImage': 'https://domain.ru/favicon.ico',
  '#ProductRating': '4.8',
  '#ShopInfo-Ugc': '4.5',
  '#EDeliveryGroup-Item-1': 'Завтра, бесплатно',
  '#Fintech_Type': 'split' | 'pay' | 'ozon',
  '#EPriceBarometer_View': 'below-market' | 'in-market' | 'above-market',
  '#BUTTON': 'true' | 'false',
  '#ButtonView': 'primaryShort' | 'primaryLong' | 'secondary' | 'white',
  '#query': 'поисковый запрос'
}
```

### popup.js — UI расширения

**Основные функции:**
```javascript
// Парсинг страницы
async function parsePageData(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  return results[0]?.result;
}

// Отправка на Relay
async function sendToRelay(payload, relayUrl) {
  await fetch(`${relayUrl}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, meta: { url: tab.url } })
  });
}
```

**Формат payload для Relay:**
```javascript
{
  schemaVersion: 1,
  source: {
    url: 'https://ya.ru/search?text=...',
    title: 'Заголовок страницы'
  },
  capturedAt: '2026-01-08T10:33:55.001Z',
  items: [...],      // Трансформированные данные
  rawRows: CSVRow[]  // Сырые CSVRow для плагина
}
```

---

## 2. Relay Server

### Запуск
```bash
cd relay && npm start
# Сервер на http://localhost:3847
```

### API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/push` | Добавить данные в очередь |
| GET | `/pull` | Получить данные из очереди |
| GET | `/status` | Статус очереди |
| DELETE | `/clear` | Очистить очередь |

**POST /push — Request:**
```json
{
  "payload": {
    "schemaVersion": 1,
    "source": { "url": "...", "title": "..." },
    "rawRows": [...]
  },
  "meta": { "url": "..." }
}
```

**GET /pull — Response:**
```json
{
  "hasData": true,
  "payload": { ... },
  "remainingQueue": 0
}
```

---

## 3. Figma Plugin UI

### Технологии
- **React 18** — UI фреймворк
- **TypeScript** — типизация
- **CSS** — нативные стили Figma (`src/styles.css`)
- **Rollup + Babel** — сборка

### Файловая структура
```
src/
├── ui.tsx                    # Главный компонент UI
├── ui.html                   # HTML шаблон
├── styles.css                # Стили
├── components/
│   ├── RelayIndicator.tsx    # Индикатор связи (заменяет BrowserConnect)
│   ├── ImportConfirmDialog.tsx # Диалог подтверждения импорта
│   ├── Header.tsx            # Заголовок с версией
│   ├── DropZone.tsx          # Зона загрузки файлов
│   ├── ScopeControl.tsx      # Выбор scope (Page/Selection)
│   ├── Toggle.tsx            # Переключатель
│   ├── VirtualList.tsx       # Виртуализированный список
│   ├── LazyTab.tsx           # Ленивая загрузка вкладок
│   ├── NoSelectionDialog.tsx # Диалог "нет выделения"
│   ├── UpdateDialog.tsx      # Диалог обновления
│   ├── WhatsNewDialog.tsx    # Диалог "что нового"
│   ├── Icons.tsx             # SVG иконки
│   ├── Confetti.tsx          # Анимация конфетти
│   ├── import/
│   │   ├── LiveProgressView.tsx  # Прогресс импорта
│   │   ├── CompletionCard.tsx    # Карточка завершения
│   │   └── ErrorCard.tsx         # Карточка ошибки
│   ├── logs/
│   │   └── LogsView.tsx      # Панель логов
│   └── settings/
│       └── SettingsView.tsx  # Панель настроек
├── hooks/
│   ├── index.ts
│   └── usePluginMessages.ts  # Хук для сообщений от плагина
└── utils/
    └── plugin-bridge.ts      # Утилиты коммуникации
```

### Коммуникация UI ↔ Plugin

**UI → Plugin (postMessage):**
```typescript
// src/utils/plugin-bridge.ts
export function sendMessageToPlugin(message: PluginMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

// Пример отправки
sendMessageToPlugin({ type: 'apply-relay-payload', payload: data });
```

**Plugin → UI (figma.ui.postMessage):**
```typescript
// src/code.ts
figma.ui.postMessage({
  type: 'relay-payload-applied',
  success: true,
  itemCount: 18,
  frameName: 'SERP Frame'
});
```

**UI — получение сообщений:**
```typescript
// src/hooks/usePluginMessages.ts
useEffect(() => {
  const handler = (event: MessageEvent) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;
    
    switch (msg.type) {
      case 'relay-payload-applied':
        // Обработка результата
        break;
    }
  };
  
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

---

## 4. Типы сообщений (Message Protocol)

### UI → Plugin Messages

| type | payload | Описание |
|------|---------|----------|
| `apply-relay-payload` | `{ payload: RelayPayload }` | Применить данные из расширения |
| `import-csv` | `{ rows: CSVRow[], html?: string }` | Импорт из CSV/MHTML |
| `build-page` | `{ rows: CSVRow[], query?: string, html?: string }` | Создать SERP страницу |
| `cancel-import` | — | Отменить импорт |
| `get-selection-info` | — | Запросить инфо о выделении |
| `update-settings` | `{ settings: Settings }` | Обновить настройки |

### Plugin → UI Messages

| type | payload | Описание |
|------|---------|----------|
| `relay-payload-applied` | `{ success, itemCount, frameName?, error? }` | Результат apply-relay-payload |
| `import-progress` | `{ current, total, phase, currentItem? }` | Прогресс импорта |
| `import-complete` | `{ totalRows, successCount, errorCount }` | Импорт завершён |
| `import-error` | `{ message, details? }` | Ошибка импорта |
| `selection-info` | `{ hasSelection, count, types }` | Инфо о выделении |
| `log` | `{ level, message, timestamp }` | Лог сообщение |

---

## 5. RelayIndicator Component (заменяет BrowserConnect)

Компонент `RelayIndicator.tsx` — компактный индикатор связи с расширением.

### Состояния (RelayStatus)
```typescript
type RelayStatus = 'disconnected' | 'checking' | 'ready' | 'receiving' | 'error';
```

### Интерфейс RelayPayload
```typescript
interface RelayPayload {
  schemaVersion: number;
  source: { url: string; title: string };
  capturedAt: string;
  items: Array<{ title?: string; priceText?: string; imageUrl?: string; href?: string; _rawCSVRow?: CSVRow }>;
  rawRows?: CSVRow[];
  _isMockData?: boolean;
}
```

### Основные функции
```typescript
// Auto-polling (каждые 2 секунды)
const checkRelay = async () => {
  const statusRes = await fetch(`${relayUrl}/status`);
  if (statusData.queueSize > 0) {
    const pullRes = await fetch(`${relayUrl}/pull`);
    const payload = pullRes.json().payload;
    onDataReceived(payload, query); // → показывает ImportConfirmDialog
  }
};
```

### UI Flow (автоматический)
```
[disconnected] ←→ [ready] (polling каждые 2 сек)
                    ↓ (данные получены)
           [ImportConfirmDialog] 
                    ↓
        "Создать" → apply-relay-payload → [done]
```

---

## 6. Стили (CSS)

### CSS Variables (Figma Design System)
```css
/* Цвета */
--figma-color-bg: #ffffff;
--figma-color-bg-secondary: #f5f5f5;
--figma-color-bg-brand: #0d99ff;
--figma-color-bg-success: #14ae5c;
--figma-color-bg-danger: #f24822;

--figma-color-text: #333333;
--figma-color-text-secondary: #666666;
--figma-color-text-tertiary: #999999;
--figma-color-text-brand: #0d99ff;
--figma-color-text-success: #14ae5c;
--figma-color-text-danger: #f24822;

--figma-color-border: #e5e5e5;

/* Размеры */
--figma-font-size-11: 11px;
--figma-font-size-12: 12px;
--figma-border-radius-small: 4px;
--figma-border-radius-medium: 6px;
```

### BrowserConnect стили
```css
.browser-connect {
  background: var(--figma-color-bg);
  border: 1px solid var(--figma-color-border);
  border-radius: var(--figma-border-radius-medium);
  padding: 12px;
  margin: 8px 0;
}

.browser-connect-btn-primary {
  background: var(--figma-color-bg-brand);
  color: white;
  border: none;
  border-radius: var(--figma-border-radius-small);
  padding: 8px 16px;
  cursor: pointer;
}

.browser-connect-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## 7. Обработка данных в code.ts

### Обработчик apply-relay-payload
```typescript
if (msg.type === 'apply-relay-payload') {
  const payload = msg.payload as RelayPayload;
  
  // 1. Извлекаем CSVRow данные
  let rows: CSVRow[] = payload.rawRows || [];
  if (rows.length === 0) {
    rows = payload.items
      .map(item => item._rawCSVRow)
      .filter(Boolean);
  }
  
  // 2. Извлекаем поисковый запрос
  const query = rows[0]?.['#query'] || extractQueryFromUrl(payload.source?.url);
  
  // 3. Создаём SERP страницу
  const result = await createSerpPage(rows, {
    query,
    platform: 'desktop',
    contentLeftWidth: 792
  });
  
  // 4. Отправляем результат в UI
  figma.ui.postMessage({
    type: 'relay-payload-applied',
    success: result.success,
    itemCount: result.createdCount,
    frameName: result.frame?.name
  });
}
```

---

## 8. Отладка

### Extension Console
```javascript
// В popup.js и content.js
console.log('🔍 [Content] Начинаю парсинг...');
console.log('📦 [Content] Найдено контейнеров:', containers.length);
console.log('✅ [Content] Извлечено сниппетов:', rows.length);
```

### Plugin Console (Figma DevTools)
```typescript
// В code.ts
Logger.info('📦 Получен payload от расширения');
Logger.info(`   Элементов: ${payload.items?.length || 0}`);
Logger.debug('🏗️ Создаём SERP страницу...');
```

### Relay Server Console
```
[PUSH] Received 18 items from https://ya.ru/...
[PULL] Sending payload with 18 items
```

---

## 9. Частые проблемы

### Extension не видит страницу Яндекса
- Проверьте `host_permissions` в manifest.json
- Перезагрузите расширение в `chrome://extensions`

### Relay недоступен
- Убедитесь что сервер запущен: `cd relay && npm start`
- Проверьте порт 3847

### Плагин создаёт текстовый список вместо компонентов
- Убедитесь что `rawRows` передаётся в payload
- Проверьте что `createSerpPage()` вызывается в обработчике

### Компоненты не находятся
- Проверьте что библиотека подключена к файлу
- Проверьте ключи компонентов в `component-map.ts`

---

## 10. Команды разработки

```bash
# Сборка плагина
npm run build

# Сборка в watch-режиме
npm run dev

# Запуск Relay сервера
cd relay && npm start

# Линтинг
npm run lint
```
