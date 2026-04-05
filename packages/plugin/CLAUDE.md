# Plugin Package — Figma Sandbox + UI

## Key Concepts

**Snippet** — карточка в выдаче Яндекса:
`EProductSnippet2` (товар с ценой), `EOfferItem` (оффер магазина), `EShopItem` (карточка магазина), `ESnippet`/`Snippet` (универсальный), `Organic` (органика).

**Container** — Figma-инстанс компонента, в который заполняются данные.

**CSVRow** — одна строка данных. Поля с `#` префиксом:

- Текст: `#OrganicTitle`, `#OrganicPrice`, `#OldPrice`, `#ShopName`, `#ProductRating`
- Изображения: `#OrganicImage`, `#ThumbImage`, `#FaviconImage`
- Флаги: `#EPriceGroup_Discount`, `#BUTTON`, `#EDeliveryGroup`, `#OfficialShop`
- Мета: `#SnippetType`, `#ButtonView`, `#EPrice_View`

Full list: `src/types/csv-fields.ts` (200+ fields, NO index signature).

## Runtime Split

| Directory      | Target            | APIs available                     |
| -------------- | ----------------- | ---------------------------------- |
| `src/sandbox/` | ES5 (Babel, IE11) | Figma API only, no DOM, no Node.js |
| `src/ui/`      | Modern browsers   | React 18, DOM, fetch               |

Communication: `figma.ui.postMessage()` ↔ `parent.postMessage()` only.
Images: loaded via CORS-proxy (`config.ts`), cached by `ImageProcessor`.

## Message Protocol

### UI → Code (sandbox)

- `import-csv` — `{ rows: CSVRow[], scope }` — импорт данных
- `apply-relay-payload` — данные от браузера через Relay
- `build-page` — создание страницы из HTML

### Code → UI

- `progress` — `{ current, total, message, operationType }`
- `stats` — статистика обработки
- `done` — `{ count }` — завершение

## Schema Engine (preferred path)

File: `src/sandbox/schema/*.ts`. Engine: `src/sandbox/schema/engine.ts` (~90 LOC).

PropertyMapping modes:

- `hasValue` — boolean if field is truthy
- `stringValue` — direct text mapping
- `equals` — boolean if field === value
- `compute` — pure function from `transforms.ts`

Schemas: `eshop-item.ts`, `eoffer-item.ts`, `esnippet.ts`, `eproduct-snippet.ts`.

## Handlers (complex logic only)

Registry: `src/sandbox/handlers/registry.ts`.
Priorities: CRITICAL(0) → VARIANTS(10) → VISIBILITY(20) → TEXT(30) → FALLBACK(40) → FINAL(50).
Complex handlers: EPriceGroup (`price-handlers.ts`), EButton, BNPL, delivery, label, snippet.

Unified setter: `trySetProperty(instance, [nameVariants], value, fieldName)`.
Nested Line/Label: `instance.setProperties({ value })`.

## Key Files

| File                                     | Role                                          |
| ---------------------------------------- | --------------------------------------------- |
| `src/sandbox/code.ts`                    | Entry point (Figma sandbox)                   |
| `src/sandbox/schema/types.ts`            | `ComponentSchema`, `PropertyMapping`          |
| `src/sandbox/handlers/registry.ts`       | Handler registry + schema wrappers            |
| `src/sandbox/handlers/price-handlers.ts` | EPriceGroup (most complex handler)            |
| `src/types/csv-fields.ts`                | 200+ explicit CSV fields                      |
| `src/config.ts`                          | Version, URLs, container names                |
| `src/logger.ts`                          | Logger class                                  |
| `src/ui/ui.tsx`                          | UI entry point — thin orchestrator (~390 LOC) |
| `src/ui/hooks/useImportFlow.ts`          | Import lifecycle (confirm, process, success)  |
| `src/ui/hooks/usePanelManager.ts`        | Panel overlay state (setup/logs/inspector)    |
| `src/ui/hooks/useResizeUI.ts`            | Animated window resize                        |

## Testing

| Change             | Test file                         |
| ------------------ | --------------------------------- |
| Transform function | `tests/schema/transforms.test.ts` |
| Schema mapping     | `tests/schema/engine.test.ts`     |
| Handler logic      | `tests/handlers/registry.test.ts` |
| CSV validation     | `tests/types/validation.test.ts`  |

Mock setup: `tests/setup.ts` (mocks Figma API).

## Anti-patterns

- Index signature on CSVFields → Explicit field in `csv-fields.ts`
- `instance.visible = false` → Boolean property via `trySetProperty`
- Empty `catch {}` → `catch (e) { Logger.debug('context', e) }`
- Tree traversal in handler → `getCachedInstance(cache, 'Name')`
- Handler for simple mapping → Schema `PropertyMapping`

## Build

```bash
npm run build -w packages/plugin
npm run typecheck -w packages/plugin
```
