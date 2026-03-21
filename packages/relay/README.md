# EProductSnippet Relay Server

Промежуточный сервер для передачи данных из Chrome Extension в Figma Plugin.

## Установка и запуск

```bash
cd relay
npm install
npm start
```

Сервер запустится на `http://localhost:3847`

## API

### POST /ingest
Принимает payload от расширения, возвращает одноразовый token.

**Request:**
```json
{
  "payload": {
    "schemaVersion": 1,
    "source": { "url": "...", "title": "..." },
    "capturedAt": "2024-01-01T12:00:00Z",
    "items": [...]
  },
  "meta": {
    "pageUrl": "...",
    "pageTitle": "...",
    "ua": "..."
  }
}
```

**Response:**
```json
{
  "token": "uuid-string",
  "expiresAt": "2024-01-01T12:05:00Z"
}
```

### GET /payload?token=...
Возвращает payload по token. Token одноразовый — удаляется после чтения.

**Response (200):**
```json
{
  "payload": { ... },
  "meta": { ... }
}
```

**Error responses:**
- 404: Token не найден или уже использован
- 410: Token истёк (TTL 5 минут)

### GET /health
Проверка работоспособности.

**Response:**
```json
{
  "status": "ok",
  "activeTokens": 0,
  "uptime": 123.45
}
```

## Настройки

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| PORT | 3847 | Порт сервера |
| TTL | 5 мин | Время жизни token |
| MAX_PAYLOAD_SIZE | 2MB | Макс. размер payload |

