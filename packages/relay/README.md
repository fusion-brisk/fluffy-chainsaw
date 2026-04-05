# @contentify/relay

Local relay server bridging Chrome extension and Figma plugin.

## Development

npm start # Start server (port 3847)
npm run build # Compile TypeScript
npm run typecheck # TypeScript check

## Architecture

- `src/index.ts` — Express + WebSocket server entry
- `src/queue.ts` — Data queue with file persistence
- `src/websocket.ts` — WebSocket server + heartbeat
- `src/routes/` — API endpoints (push, pull, result, health, update, debug)
- `src/types.ts` — Shared type definitions
