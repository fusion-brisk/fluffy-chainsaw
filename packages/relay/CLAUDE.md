# Relay Package — Localhost Server

## Role

HTTP + WebSocket сервер на localhost:3847. Очередь данных между Extension и Figma Plugin.

## Key Files

| File               | Role                            |
| ------------------ | ------------------------------- |
| `src/index.ts`     | Server entry point              |
| `src/queue.ts`     | In-memory queue for parsed data |
| `src/routes/`      | HTTP route handlers             |
| `src/websocket.ts` | WebSocket for real-time push    |
| `src/types.ts`     | Shared types                    |

## Architecture

```
Extension → POST /push → Queue → GET /pull → Plugin
                              → WebSocket → Plugin (real-time)
```

## Rules

- Modern TypeScript (NOT ES5)
- Runs as native messaging host on macOS
- Queue is in-memory (persisted to `.relay-queue.json` for crash recovery)
- See `docs/PORT_MAP.md` for port assignments

## Build

```bash
npm run build -w packages/relay
```
