# Contentify

Figma-плагин для автозаполнения макетов данными из поисковой выдачи Яндекса.

## Что это?

Contentify помогает дизайнерам быстро создавать в Figma макеты из библиотечных компонентов на основе реальной выдачи поиска Яндекса. Плагин:

- **Создаёт макеты** — автоматически строит структуру страницы с карточками товаров
- **Заполняет данными** — применяет реальные цены, названия, изображения к компонентам
- **Сохраняет время** — готовый макет вместо ручного копирования данных

## Архитектура

Данные текут через Yandex Cloud — ни бинарников, ни локальных серверов:

```
Browser Extension → HTTPS → Cloud Relay (YC Function + YDB) → HTTPS → Figma Plugin
     (парсинг)                    (очередь)                        (создание)
```

1. **Browser Extension** — парсит страницу Яндекса, отправляет данные в облако
2. **Cloud Relay** — Yandex Cloud Function + YDB (serverless), очередь по session code
3. **Figma Plugin** — забирает данные и создаёт/заполняет макет

Session code (6 символов A-Z0-9) генерируется в плагине при первом запуске и вводится в options расширения — это изолирует разных пользователей в облачной очереди.

## Packages

| Package                | Role                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `packages/plugin`      | Figma plugin (TypeScript + React, ES5 sandbox)             |
| `packages/extension`   | Chrome extension (Manifest V3, parses Yandex SERP)         |
| `packages/cloud-relay` | Yandex Cloud Function (Node 22, HTTP API + YDB serverless) |
| `packages/jsx-emitter` | JSX compilation helper                                     |

## Quick Start

### Разработка

```bash
# Установка зависимостей
npm install

# Сборка плагина
npm run build

# Watch mode (plugin only)
npm run dev

# Запуск тестов
npm run test

# Полная проверка (typecheck + lint + test + build)
npm run verify
```

### Установка в Figma

1. Открыть Figma
2. Plugins → Development → Import plugin from manifest
3. Выбрать `manifest.json` из `packages/plugin/`

### Установка Extension

1. `npm run build -w packages/extension`
2. Открыть `chrome://extensions` → **Developer mode** → **Load unpacked**
3. Выбрать `packages/extension/`
4. В options расширения вставить session code (генерируется в плагине)

### Deploy Cloud Relay

См. [`packages/cloud-relay/README.md`](packages/cloud-relay/README.md).

## Документация

| Документ                                                         | Описание                                         |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                     | Детальная карта проекта, потоки данных           |
| [docs/GLOSSARY.md](docs/GLOSSARY.md)                             | Термины: Snippet, Container, CSVRow, Handler     |
| [docs/EXTENDING.md](docs/EXTENDING.md)                           | Гайды по расширению (handlers, поля, компоненты) |
| [docs/STRUCTURE.md](docs/STRUCTURE.md)                           | Детали архитектуры модулей                       |
| [packages/cloud-relay/README.md](packages/cloud-relay/README.md) | Deploy runbook для YC Function                   |

## Для AI-разработки

Проект оптимизирован для разработки через Claude Code:

- **`CLAUDE.md`** — корневые правила проекта (auto-loaded)
- **`packages/*/CLAUDE.md`** — per-package правила
- **`.claude/rules/`** — тематические ограничения (ES5 sandbox, UI state, CSS)
- **`.claude/specs/`** — спеки фич (in-progress + done)

## Технологии

- **TypeScript** — типизация
- **React 18** — UI плагина
- **Rollup + Babel** — сборка плагина в ES5
- **Node.js 22** — cloud relay runtime (YC Function)
- **YDB serverless** — очередь
- **Vitest** — тестирование

## Ограничения

- Figma Plugin sandbox требует ES5 (транспиляция через Babel для `src/sandbox/`)
- Никаких Node.js API в рантайме плагина
- UI ↔ Code общение только через `postMessage`
- Cloud relay требует интернет — offline-режим не поддерживается (Figma тоже требует сеть)

## Команды

| Команда                  | Описание                        |
| ------------------------ | ------------------------------- |
| `npm run build`          | Сборка плагина                  |
| `npm run dev`            | Watch mode (plugin)             |
| `npm run test`           | Запуск тестов                   |
| `npm run lint`           | ESLint проверка                 |
| `npm run lint:fix`       | ESLint с автоисправлением       |
| `npm run verify`         | typecheck + lint + test + build |
| `npm run release <bump>` | Version bump + tag + push       |

## Лицензия

Proprietary
