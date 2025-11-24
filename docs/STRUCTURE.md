# Структура проекта Contentify

Этот документ описывает архитектуру плагина Figma "Contentify", карту взаимосвязей файлов и протокол коммуникации.

## Обзор директорий

### Корень проекта
*   `package.json`: Определяет зависимости и скрипты сборки.
*   `manifest.json`: Манифест плагина Figma. Определяет точки входа (`dist/code.js`, `dist/ui-embedded.html`) и права доступа.
*   `rollup.config.mjs`: Конфигурация сборщика Rollup. Отвечает за транспиляцию TypeScript и React в ES5 (для совместимости с Figma).
*   `tsconfig.json`: Настройки TypeScript.
*   `dist/`: Директория с результатами сборки (генерируется автоматически).

### `src/` - Исходный код

#### Точки входа
*   **`code.ts`**: (Logic Thread) Главный файл логики плагина.
    *   Инициализирует плагин.
    *   Обрабатывает сообщения от UI (`figma.ui.onmessage`).
    *   Управляет слоями Figma, данными и вызовом обработчиков.
*   **`ui.tsx`**: (UI Thread) Главный файл интерфейса (React).
    *   Рендерит UI.
    *   Обрабатывает ввод пользователя (drag & drop, выбор файлов).
    *   Парсит файлы (HTML/MHTML) в JSON.
    *   Отправляет данные в `code.ts`.

#### Модули логики (Logic Thread)
*   `component-handlers.ts`: Логика для специфических компонентов (Brand, Price, Label, Barometer).
*   `image-handlers.ts`: Класс `ImageProcessor` для скачивания, обработки и кэширования изображений.
*   `text-handlers.ts`: Функции для работы с текстом и загрузки шрифтов (`loadFonts`, `processTextLayers`).
*   `logger.ts`: Утилита для логирования.
*   `config.ts`: Константы и конфигурация.

#### Модули UI (UI Thread)
*   `ui.html`: Шаблон HTML для UI (каркас).
*   `styles.css`: Глобальные стили.
*   `utils.ts`: Утилиты для UI (парсинг Yandex Search результатов, работа с HTML/MHTML).

#### Общие
*   `types.ts`: TypeScript интерфейсы, общие для UI и Logic. **Важно:** Определяет протокол `postMessage`.

## Протокол коммуникации (postMessage)

Общение между потоком UI (iframe) и потоком Logic (sandbox) происходит асинхронно через `postMessage`.

### UI -> Logic (`UIMessage`)
Обрабатывается в `src/code.ts` (`figma.ui.onmessage`).

| Тип | Данные | Описание |
| :--- | :--- | :--- |
| `import-csv` | `{ rows: CSVRow[], scope: string }` | Основная команда. Передает распаршенные данные для заполнения макета. |
| `check-selection` | `–` | Запрос статуса выделения (для валидации UI). |
| `get-settings` | `–` | Запрос сохраненных настроек (scope). |
| `save-settings` | `{ settings: UserSettings }` | Сохранение настроек пользователя (scope). |
| `get-theme` | `–` | Запрос текущей темы Figma (обычно применяется автоматически). |
| `test` | `{ message: string }` | Тестовое сообщение (ping). |
| `close` | `–` | Закрытие плагина. |

### Logic -> UI (`CodeMessage`)
Отправляется из `src/code.ts`, принимается в `src/ui.tsx` (`window.onmessage`).

| Тип | Данные | Описание |
| :--- | :--- | :--- |
| `log` | `{ message: string }` | Текстовое сообщение для лога в UI. |
| `error` | `{ message: string }` | Сообщение об ошибке. |
| `selection-status` | `{ hasSelection: boolean }` | Ответ на `check-selection`. Влияет на UI предупреждения. |
| `settings-loaded` | `{ settings: UserSettings }` | Ответ на `get-settings`. |
| `progress` | `{ current, total, message }` | Обновление прогресс-бара (не используется активно в текущем коде, но зарезервировано). |
| `stats` | `{ stats: ProcessingStats }` | Финальная статистика: кол-во обработанных, успех/ошибки изображений. |
| `done` | `{ count: number }` | Сигнал завершения работы. Снимает лоадер. |

## Схема потока данных (Data Flow)

1.  **Загрузка:** Пользователь перетаскивает HTML/MHTML файл в UI.
2.  **Парсинг (UI):** `ui.tsx` (с помощью `utils.ts`) парсит файл в массив объектов `CSVRow[]`.
3.  **Передача:** UI отправляет `import-csv` с данными в Logic.
4.  **Поиск (Logic):** `code.ts` сканирует страницу/выделение, находит слои с `#` и группирует их.
5.  **Обработка (Logic):**
    *   Применяет текстовые данные.
    *   Вызывает `component-handlers.ts` для логики компонентов.
    *   Асинхронно обрабатывает изображения через `image-handlers.ts`.
6.  **Отчет (Logic -> UI):** В процессе отправляются логи, а в конце — статистика (`stats`) и сигнал завершения (`done`).

