# Port Allocation

All port constants are defined in `packages/plugin/src/config.ts` (`PORTS` object).

## Active Ports

| Port | Process | Started by | Protocol |
|------|---------|-----------|----------|
| 3845 | Figma Local Dev Mode MCP | Figma Desktop (auto) | HTTP (MCP over SSE) |
| 3847 | Contentify Relay Server | `npm run dev -w packages/relay` | HTTP + WebSocket |
| 9223–9232 | figma-console-mcp WS server | Claude Code / Cursor (auto) | WebSocket |

## How figma-console-mcp picks a port

`figma-console-mcp` tries ports 9223 → 9224 → ... → 9232 until it finds a free one.
The Figma plugin's `bridge-ui.js` scans all 10 ports every 10 seconds and connects to all found servers.

## Multi-project / multi-session scenarios

### Safe: one Claude Code + Contentify relay

No port conflicts. Relay (3847) and MCP WS (9223+) are different ranges.

### Safe: figma-console + talk-to-figma simultaneously

Each takes a different port in 9223-9232. `bridge-ui.js` connects to both.
Minor issue: both receive the same broadcast events (SELECTION_CHANGE, etc.) — duplicated traffic but no functional problem.

### Risky: two Claude Code sessions on the same machine

Each spawns its own figma-console-mcp on different ports (e.g. 9223 and 9224).
`bridge-ui.js` connects to BOTH. Commands from either session execute in the same Figma file.

**Mitigation:** close one session, or stop the MCP server in the session that doesn't need Figma access.

### Risky: relay port 3847 already occupied

If another process uses 3847, relay fails with EADDRINUSE.

**Mitigation:** `lsof -i :3847` to find the conflicting process. Kill it or change PORT env var:
`PORT=3848 npm run dev -w packages/relay` (note: update `PORTS.RELAY` in config.ts too).

### Broken: Contentify plugin + standalone Desktop Bridge

Both scan 9223-9232. They fight over the same WebSocket connections.
`figma-console-mcp` sends `Replaced by new connection` (close code 1000), causing reconnect cycles every few seconds.

**Fix:** run only one bridge plugin at a time. See below.

## Contentify vs Standalone Desktop Bridge

The Contentify plugin **already includes** an embedded MCP bridge (same code as Desktop Bridge).

| Scenario | What to run | Notes |
|----------|------------|-------|
| Working on Contentify project | Only Contentify plugin | Embedded bridge connects to figma-console-mcp automatically |
| Working on other Figma files | Only Desktop Bridge plugin | Standard figma-console setup |
| Both plugins running | Not recommended | Two bridges compete for the same WebSocket connection |

If both are running, you'll see `[MCP Bridge] WebSocket disconnected` / `Reconnected` cycling in DevTools console. Fix: close one of the plugins.
