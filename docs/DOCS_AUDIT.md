# Аудит документации Contentify для вайбкодинга

## Резюме

Документация проекта **сильная по содержанию**, но **неоптимальная по структуре** для AI-агентов. Главная проблема — фрагментация: 5800+ строк разбросаны по 24 файлам в 4 локациях, с дублированием и без чёткой навигации.

**Текущий объём:**

| Локация | Файлы | Строки | Роль |
|---------|-------|--------|------|
| `.cursorrules` | 1 | 271 | Контекст проекта (Cursor) |
| `CLAUDE.md` | 1 | 159 | Правила разработки (Claude) |
| `docs/` | 19 | 4500+ | Архитектура, гайды, планы |
| `.cursor/` | 3 | 367 | Задачи, дебаг, контекст |
| `PLAN-*.md` (корень) | 5 | ~500 | Планы (часть устаревшие) |

---

## Диагноз: 7 проблем

### 1. Дублирование между .cursorrules и CLAUDE.md

Оба файла загружаются в контекст AI-агента. Перекрытие ~60%:

| Тема | .cursorrules | CLAUDE.md |
|------|-------------|-----------|
| Архитектура Extension→Relay→Plugin | §Архитектура | §2 Architecture |
| Snippet типы | §Snippet | — |
| Container типы | §Container | — |
| CSVRow поля | §CSVRow | — |
| Handler приоритеты | §Handler | §2.4 |
| ES5 ограничение | §Хард-ограничения | §1.1 Golden Rule |
| Schema vs Handler | §Паттерны расширения | §2.1 Schema-first |
| Сборка | §Сборка | §3 Workspace Commands |
| Коммиты | — | §4 Commit Rules |
| Anti-patterns | — | §5 Anti-patterns |
| Тестирование | — | §6 Testing |
| Key Files | — | §7 Key Files |

**Цена:** ~200 токенов впустую на каждом запросе + путаница при противоречиях.

### 2. CLAUDE.md перегружен неактуальными MCP-секциями

Секции 8-10 (Design & Figma Workflow, Component Development, Figma MCP Selection Guide) описывают внешние инструменты (Playwright MCP, Context7, talk-to-figma), которые:
- не подключены в текущих MCP серверах
- дублируют информацию из `docs/FIGMA_MCP_SETUP.md`
- занимают 30% файла, но не помогают при кодинге

### 3. docs/ смешивает "вечные" и "временные" документы

| Тип | Файлы | Проблема |
|-----|-------|---------|
| Архитектура (вечные) | ARCHITECTURE, GLOSSARY, STRUCTURE, EXTENDING | ОК |
| Setup (вечные) | BROWSER_EXTENSION_SETUP, PAGE_BUILDER_SETUP, FIGMA_MCP_SETUP, REMOTE_CONFIG, PORT_MAP | ОК |
| Исследования (snapshot) | ESNIPPET_FIGMA_STRUCTURE, ESNIPPET_INVESTIGATION, ESNIPPET_SOURCE_VS_FIGMA | Полезны при работе с ESnippet, но не размечены |
| Планы (временные) | MCP_BRIDGE_UPGRADE_PLAN, UI_REFACTOR_PLAN, FIGMA-RENAMING-CHECKLIST | Статус непонятен — актуальны или выполнены? |
| Промпты (AI-специфика) | WIZARD_AGENT_PROMPT, VALIDATION-AGENT-PROMPT | 760 строк. Не документация — промпты для AI workflow |

### 4. .cursor/ дублирует docs/, но частично устарел

- `context.md` — краткая выжимка .cursorrules (полностью избыточна)
- `common-tasks.md` — подмножество EXTENDING.md с неточными путями (`extension/content.js` вместо `packages/extension/src/content.ts`, `relay/server.js` вместо `packages/relay/src/index.ts`)
- `debug-guide.md` — уникальный контент, полезный

### 5. Нет "маршрутизатора" для AI-агента

AI-агент не знает, какой файл читать под какую задачу. Сейчас он либо читает всё (дорого), либо угадывает (ненадёжно). Нужна **карта навигации** в CLAUDE.md:

```
Задача → Читай этот файл
```

### 6. PLAN-*.md в корне — мусор или нет?

5 файлов-планов (`PLAN-cleanup.md`, `PLAN-bridge-config-ports.md`, etc.) лежат в корне без статусов и дат. AI-агент может принять их за актуальные задачи.

### 7. Нет примеров "до/после" для AI

EXTENDING.md отличный, но ему не хватает полных примеров реальных коммитов — diff'ов, которые показывают "вот так выглядит готовое изменение целиком".

---

## План оптимизации

### Фаза 1: Убрать дублирование (высокий приоритет)

**1.1. Разделить ответственность .cursorrules и CLAUDE.md**

`.cursorrules` → **ЧТО** (read-only контекст проекта):
- Миссия и архитектура (Extension → Relay → Plugin)
- Ключевые концепции (Snippet, Container, CSVRow, Handler, Schema)
- Структура проекта (дерево файлов)
- Хард-ограничения (ES5, postMessage, no Node.js)
- Протокол сообщений

`CLAUDE.md` → **КАК** (правила работы для AI):
- Golden Rules (без дублирования контекста)
- Architecture Decisions (решения, не описания)
- Code Style
- Anti-patterns
- Commit Rules
- Testing
- **НОВОЕ: Навигатор по документации** (задача → файл)

**1.2. Вырезать из CLAUDE.md секции 8-10**

Переместить в `docs/FIGMA_MCP_SETUP.md` (где им место).

### Фаза 2: Реструктуризовать docs/ (средний приоритет)

**2.1. Добавить README-индекс в docs/**

```markdown
# docs/README.md

## Архитектура
- ARCHITECTURE.md — карта системы, sequence diagrams, data flow
- GLOSSARY.md — термины и типы
- STRUCTURE.md — модули, кэши, оптимизации
- PARSING_ARCHITECTURE.md — парсер extension

## Гайды
- EXTENDING.md — добавление свойств, handlers, компонентов
- BROWSER_EXTENSION_SETUP.md — установка расширения
- PAGE_BUILDER_SETUP.md — page builder
- FIGMA_MCP_SETUP.md — настройка MCP для Figma
- REMOTE_CONFIG_GUIDE.md — удалённые правила парсинга
- PORT_MAP.md — карта портов

## Исследования (ESnippet)
- ESNIPPET_FIGMA_STRUCTURE.md
- ESNIPPET_INVESTIGATION.md
- ESNIPPET_SOURCE_VS_FIGMA.md

## Планы (проверить актуальность!)
- MCP_BRIDGE_UPGRADE_PLAN.md
- UI_REFACTOR_PLAN.md
- FIGMA-RENAMING-CHECKLIST.md
```

**2.2. Пометить планы статусами**

Добавить в каждый PLAN-файл и план в docs/ шапку:
```markdown
<!-- STATUS: active | completed | abandoned -->
<!-- UPDATED: 2025-XX-XX -->
```

### Фаза 3: Навигатор для AI-агентов (высокий приоритет)

Добавить в CLAUDE.md секцию "Навигатор":

```markdown
## Навигатор: Задача → Документ

| Задача | Основной файл | Также полезно |
|--------|--------------|---------------|
| Понять архитектуру | docs/ARCHITECTURE.md | docs/GLOSSARY.md |
| Добавить свойство | docs/EXTENDING.md §0.1 | Схемы в src/sandbox/schema/ |
| Добавить handler | docs/EXTENDING.md §1 | src/sandbox/handlers/registry.ts |
| Добавить поле CSVRow | docs/EXTENDING.md §2 | src/types/csv-fields.ts |
| Добавить компонент | docs/EXTENDING.md §3 | docs/PAGE_BUILDER_SETUP.md |
| Дебаг заполнения | .cursor/debug-guide.md | docs/PORT_MAP.md |
| Работа с ESnippet | docs/ESNIPPET_*.md | src/sandbox/schema/esnippet.ts |
| Настроить MCP bridge | docs/FIGMA_MCP_SETUP.md | docs/PORT_MAP.md |
| Парсинг extension | docs/PARSING_ARCHITECTURE.md | docs/STRUCTURE.md §utils |
| Релиз | .cursorrules §Релиз | — |
```

### Фаза 4: Очистка .cursor/ (низкий приоритет)

- Удалить `context.md` (дубль .cursorrules)
- Обновить пути в `common-tasks.md` (packages/ prefix) или удалить, т.к. дублирует EXTENDING.md
- Оставить `debug-guide.md` — он уникален

### Фаза 5: Архивация PLAN-файлов (низкий приоритет)

- Проверить каждый PLAN-*.md на актуальность
- Выполненные → удалить или переместить в `docs/archive/`
- Актуальные → переместить в `docs/` с шапкой статуса

---

## Метрики эффективности

### До оптимизации
- AI читает .cursorrules (271) + CLAUDE.md (159) = **430 строк** в контексте автоматически
- Из них ~130 строк — дублирование
- Нет навигатора → агент тратит 2-3 лишних запроса на поиск нужного файла

### После оптимизации (цель)
- .cursorrules: ~180 строк (только контекст, без инструкций)
- CLAUDE.md: ~120 строк (только правила + навигатор, без описаний архитектуры)
- Навигатор: агент находит нужный файл за 0 лишних запросов
- Итого: **~300 строк** в авто-контексте, 0 дублей, мгновенная навигация

### ROI
- Экономия ~130 строк контекста на каждом запросе ≈ **~200 токенов**
- Экономия 2-3 tool calls на навигацию ≈ **~2000 токенов на задачу**
- Снижение ошибок из-за противоречивой документации

---

## Приоритеты реализации

| # | Действие | Усилие | Импакт | Риск |
|---|----------|--------|--------|------|
| 1 | Навигатор в CLAUDE.md | 15 мин | Высокий | Нулевой |
| 2 | Дедуплицировать .cursorrules ↔ CLAUDE.md | 30 мин | Высокий | Средний (могут сломаться привычки Cursor) |
| 3 | Вырезать MCP-секции из CLAUDE.md | 10 мин | Средний | Нулевой |
| 4 | README-индекс для docs/ | 15 мин | Средний | Нулевой |
| 5 | Статусы на PLAN-файлы | 10 мин | Низкий | Нулевой |
| 6 | Очистка .cursor/ | 10 мин | Низкий | Нулевой |
