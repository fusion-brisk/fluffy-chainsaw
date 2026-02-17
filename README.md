# Contentify

Figma-плагин для автозаполнения макетов данными из поисковой выдачи Яндекса.

## Что это?

Contentify помогает дизайнерам быстро создавать в Figma макеты из библиотечных компонентов на основе реальной выдачи поиска Яндекса. Плагин:

- **Создаёт макеты** — автоматически строит структуру страницы с карточками товаров
- **Заполняет данными** — применяет реальные цены, названия, изображения к компонентам
- **Сохраняет время** — готовый макет вместо ручного копирования данных

## Архитектура

Система состоит из трёх компонентов:

```
Browser Extension → Relay Server → Figma Plugin
     (парсинг)      (localhost)     (создание)
```

1. **Browser Extension** — парсит страницу Яндекса, извлекает данные сниппетов
2. **Relay Server** — передаёт данные между браузером и Figma (localhost:3847)
3. **Figma Plugin** — получает данные и создаёт/заполняет макет

## Quick Start

### Разработка

```bash
# Установка зависимостей
npm install

# Сборка плагина
npm run build

# Разработка с hot reload и Relay сервером
npm run dev

# Только сборка с watch
npm run build:watch

# Запуск тестов
npm run test
```

### Установка в Figma

1. Открыть Figma
2. Plugins → Development → Import plugin from manifest
3. Выбрать `manifest.json` из корня проекта

### Установка Extension

1. Открыть `chrome://extensions`
2. Включить "Developer mode"
3. "Load unpacked" → выбрать папку `extension/`

## Структура проекта

```
.
├── src/                    # Исходный код плагина
│   ├── code.ts             # Entry point (Figma sandbox)
│   ├── ui.tsx              # React UI
│   ├── schema/             # Декларативный маппинг данных → Figma
│   ├── handlers/           # Императивные обработчики (сложная логика)
│   ├── plugin/             # Модули обработки данных
│   ├── page-builder/       # Создание страниц
│   ├── utils/              # Утилиты парсинга
│   └── types/              # TypeScript типы
│
├── extension/              # Chrome Extension
│   ├── content.js          # Парсинг страницы
│   ├── background.js       # Service Worker
│   └── popup.html          # UI popup
│
├── relay/                  # Relay сервер
│   └── server.js           # Express API
│
├── docs/                   # Документация
│   ├── ARCHITECTURE.md     # Карта проекта
│   ├── GLOSSARY.md         # Термины
│   └── EXTENDING.md        # Гайды по расширению
│
├── .cursor/                # Контекст для AI-разработки
│   ├── context.md          # Краткий контекст
│   ├── common-tasks.md     # Частые задачи
│   └── debug-guide.md      # Отладка
│
└── dist/                   # Результат сборки
```

## Документация

| Документ | Описание |
|----------|----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Детальная карта проекта, диаграммы, потоки данных |
| [GLOSSARY.md](docs/GLOSSARY.md) | Термины и концепции: Snippet, Container, CSVRow, Handler |
| [EXTENDING.md](docs/EXTENDING.md) | Пошаговые гайды добавления handlers, полей, компонентов |
| [STRUCTURE.md](docs/STRUCTURE.md) | Детали архитектуры модулей |

## Для AI-разработки

Проект оптимизирован для разработки через Cursor с Claude:

- **`.cursorrules`** — полный контекст проекта, автоматически подключается
- **`.cursor/`** — дополнительные гайды для AI

При работе с AI рекомендуется:
1. Читать `.cursorrules` для понимания ограничений
2. Использовать `docs/EXTENDING.md` для типовых задач
3. Смотреть `.cursor/debug-guide.md` для отладки

## Технологии

- **TypeScript** — типизация
- **React 18** — UI плагина
- **Rollup + Babel** — сборка в ES5
- **Express** — Relay сервер
- **Vitest** — тестирование

## Ограничения

- Figma Plugin API требует ES5 (транспиляция через Babel)
- Никаких Node.js API в рантайме плагина
- UI ↔ Code общение только через postMessage

## Команды

| Команда | Описание |
|---------|----------|
| `npm run build` | Полная сборка |
| `npm run build:watch` | Watch mode |
| `npm run dev` | Build + Relay server |
| `npm run relay` | Только Relay server |
| `npm run test` | Запуск тестов |
| `npm run lint` | ESLint проверка |
| `npm run lint:fix` | ESLint с автоисправлением |

## Лицензия

Proprietary
