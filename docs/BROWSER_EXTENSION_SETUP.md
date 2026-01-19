# Настройка связки Chrome Extension ↔ Figma Plugin

Это руководство описывает полный процесс настройки и использования связки для отправки данных из браузера в Figma плагин.

## Архитектура

```
┌─────────────────┐     HTTP      ┌─────────────────┐     fetch      ┌─────────────────┐
│ Chrome Extension│ ────────────► │  Relay Server   │ ◄──────────── │   Figma Plugin  │
│   (popup.js)    │   POST/ingest │  (Node/Express) │  GET/payload   │  (ui.tsx/code.ts)│
└─────────────────┘               └─────────────────┘               └─────────────────┘
        │                                 │                                  │
        │ 1. Collect page data           │ 2. Store payload                │ 
        │ 2. POST to relay               │    Return token                 │
        │ 3. Copy token to clipboard     │                                  │
        │ 4. Open Figma (optional)       │                                  │
        │                                 │                                  │
        │                                 │ 4. User pastes token           │
        │                                 │ 5. Plugin fetches payload       │
        │                                 │ 6. Plugin processes data        │
        └─────────────────────────────────┴──────────────────────────────────┘
```

## Шаг 1: Запуск Relay Server

```bash
cd relay
npm install
npm start
```

Сервер запустится на `http://localhost:3847`. Проверка:

```bash
curl http://localhost:3847/health
# {"status":"ok","activeTokens":0,"uptime":...}
```

## Шаг 2: Установка Chrome Extension

1. Откройте `chrome://extensions/`
2. Включите **Developer mode**
3. Нажмите **Load unpacked**
4. Выберите папку `extension/`

## Шаг 3: Сборка Figma Plugin

```bash
npm run build
# или для разработки:
npm run dev
```

Плагин использует файлы из `dist/`:
- `dist/code.js` — логика плагина
- `dist/ui-embedded.html` — интерфейс

## Шаг 4: Проверка end-to-end

### В браузере:

1. Откройте любую страницу с товарами (например, поиск на Яндекс Маркете)
2. Нажмите на иконку расширения EProductSnippet
3. Убедитесь, что Relay URL = `http://localhost:3847`
4. Нажмите **Send to Figma**
5. Убедитесь, что видите статус "Отправлено!" и token скопирован

### В Figma:

1. Откройте Figma файл
2. Plugins → EProductSnippet
3. В секции **Connect from Browser**:
   - Вставьте token (Ctrl/Cmd+V)
   - Нажмите **Fetch**
   - Дождитесь статуса "Received"
   - Нажмите **Apply to Figma**
4. На холсте появится фрейм с импортированными данными

## Логирование

### Relay Server
Все события логируются в консоль в JSON формате:
```json
{"timestamp":"2024-01-01T12:00:00.000Z","level":"info","message":"Payload ingested",...}
```

### Extension
Логи отображаются в popup внизу. Также доступны в DevTools (правый клик на popup → Inspect).

### Figma Plugin
Логи отображаются в секции BrowserConnect и дублируются в консоль браузера.

## Устранение неполадок

### "Token не найден"
- Token одноразовый и удаляется после первого чтения
- Token истекает через 5 минут
- Повторите отправку из расширения

### "Ошибка сети"
- Убедитесь, что Relay сервер запущен
- Проверьте URL в настройках расширения
- Figma UI может иметь CORS ограничения — relay настроен с `cors: '*'`

### "Не найдено товаров"
- Extension использует эвристические селекторы
- Если товары не распознаны — используются mock-данные
- Для production нужно расширить логику сбора в `popup.js`

## Конфигурация

### Relay Server
| Переменная | Значение | Описание |
|------------|----------|----------|
| PORT | 3847 | Порт сервера |
| TTL | 5 мин | Время жизни token |

### Extension
Настраивается в popup:
- **Relay URL**: адрес relay сервера
- **Figma File URL**: URL для автоматического открытия Figma

### Plugin
Relay URL настраивается в компоненте BrowserConnect (по умолчанию `http://localhost:3847`).

## Безопасность

⚠️ **Важно**: текущая реализация предназначена для локальной разработки.

Для production:
1. Используйте HTTPS для relay
2. Добавьте аутентификацию
3. Ограничьте CORS origins
4. Используйте rate limiting
5. Храните token в secure storage

