# Extension Package — Chrome Extension

## Role

Парсит DOM Яндекс SERP, извлекает данные из сниппетов, отправляет на Relay.
**Единственный путь парсинга** — no file drop, no clipboard paste.

## Key Files

| File                | Role                                                  |
| ------------------- | ----------------------------------------------------- |
| `src/content.ts`    | Content script — DOM parsing, data extraction         |
| `src/background.ts` | Service worker — relay communication, message routing |
| `src/popup.ts`      | Popup UI                                              |
| `src/options.ts`    | Options page                                          |
| `manifest.json`     | Extension manifest (version here must match root)     |

## Architecture

```
Yandex SERP page → content.ts (parse DOM) → background.ts → POST /push → Relay
```

## Rules

- Modern TypeScript (NOT ES5 — sandbox constraint doesn't apply here)
- DOM parsing logic lives ONLY in `content.ts`
- Version in `manifest.json` must stay in sync with root `package.json`
- See `docs/PARSING_ARCHITECTURE.md` for parsing details

## Build

```bash
npm run build -w packages/extension
```
