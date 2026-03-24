# MCP Bridge Upgrade Plan — Contentify × figma-console-mcp

> **Контекст:** Наш embedded MCP bridge в Contentify plugin работает, но при сравнении с figma-console-mcp (github.com/southleft/figma-console-mcp) обнаружены пробелы, которые могут вызывать нестабильность и снижают производительность. Этот документ — полный план для Claude Code агента.

## Архитектура (текущая vs целевая)

```
                        ТЕКУЩАЯ                                    ЦЕЛЕВАЯ

figma-console-mcp (9223-9232)              figma-console-mcp (9223-9232)
        ↕ WebSocket                                ↕ WebSocket
bridge-ui.js (UI iframe)                   bridge-ui.js (UI iframe)
        ↕ postMessage                              ↕ postMessage
bridge-handlers.ts (sandbox)               bridge-handlers.ts (sandbox)
        ↕ eval() / Figma API                       ↕ eval() / Figma API
Figma document                             Figma document

Проблемы:                                  Решения:
- showUI() рвёт WebSocket                 - soft reload через postMessage
- нет batch operations                    - BATCH_EXECUTE handler
- нет enablePrivatePluginApi              - manifest.json fix
- race condition при init                 - отложенный showUI
- нет zombie cleanup                      - heartbeat + stale detection
```

---

## Задачи (в порядке приоритета)

### Phase 1: Critical Fixes (стабильность)

#### 1.1 manifest.json — enablePrivatePluginApi

**Файл:** `packages/plugin/manifest.json`

**Что делать:**
```json
{
  "name": "Contentify",
  "id": "1501168176424945547",
  "api": "1.0.0",
  "main": "dist/code.js",
  "capabilities": [],
  "enableProposedApi": false,
  "enablePrivatePluginApi": true,
  "documentAccess": "dynamic-page",
  "editorType": ["figma"],
  "ui": "dist/ui-embedded.html",
  "networkAccess": {
    "allowedDomains": ["*", "https://avatars.mds.yandex.net/", "https://favicon.yandex.net/"],
    "devAllowedDomains": ["*"],
    "reasoning": "Required to load images, content from external URLs, and MCP bridge WebSocket connections."
  }
}
```

**Зачем:** `enablePrivatePluginApi: true` разблокирует расширенные async-методы для variables и components, которые использует figma-console-mcp. Без этого флага некоторые API-вызовы из bridge-handlers.ts могут молча фейлиться.

**Важно:** Это НЕ влияет на публикацию плагина. Development-плагины (imported from manifest) поддерживают этот флаг без ограничений.

---

#### 1.2 Устранить race condition при инициализации

**Файлы:**
- `packages/plugin/src/sandbox/code.ts`

**Проблема:**
1. `installConsoleCapture()` вызывается ДО `showUI()` — ✅ правильно
2. Ранний `figma.ui.onmessage` handler ставится на строке 174 — ✅ правильно
3. НО: `showUI()` на строке 184 **пересоздаёт iframe**, и bridge-ui.js начинает сканирование портов заново
4. Между `showUI()` и завершением WebSocket handshake проходит 500-3000ms
5. Если figma-console-mcp шлёт команду в этом окне — она теряется

**Решение:**
Перенести `fetchAndSendVariablesData()` в callback, который bridge-ui.js вызывает после первого успешного WebSocket connect:

```typescript
// В code.ts — добавить обработчик MCP_BRIDGE_READY
// bridge-ui.js шлёт его после первого WebSocket connect
case 'MCP_BRIDGE_READY':
  fetchAndSendVariablesData().catch(err =>
    Logger.debug('MCP Bridge: error fetching variables after ready: ' + err)
  );
  break;
```

В bridge-ui.js добавить отправку `MCP_BRIDGE_READY` после первого успешного connect:

```javascript
// В wsScanAndConnect(), после первого foundAny = true:
if (!window.__mcpBridgeInitSent) {
  window.__mcpBridgeInitSent = true;
  parent.postMessage({ pluginMessage: { type: 'MCP_BRIDGE_READY' } }, '*');
}
```

---

#### 1.3 Защитить WebSocket от showUI / RELOAD_UI

**Файлы:**
- `packages/plugin/src/sandbox/mcp-bridge/bridge-handlers.ts` (handleReloadUI)
- `packages/plugin/src/sandbox/code.ts`

**Проблема:**
`handleReloadUI` (строка 1233) вызывает `figma.showUI()` — это **убивает** iframe и все WebSocket-соединения. Figma-console-mcp шлёт RELOAD_UI когда хочет обновить bridge.

**Решение:**
Заменить `showUI` в `handleReloadUI` на soft reload через postMessage:

```typescript
// bridge-handlers.ts
function handleReloadUI(requestId: string): void {
  replySuccess('RELOAD_UI_RESULT', requestId, {});
  // Soft reload: tell bridge-ui.js to rescan without destroying iframe
  figma.ui.postMessage({ type: 'SOFT_RELOAD' });
}
```

В bridge-ui.js добавить обработчик:

```javascript
// В window.addEventListener('message', ...) добавить case:
case 'SOFT_RELOAD':
  // Rescan WebSocket connections without destroying iframe
  wsScanAndConnect();
  // Re-request variables data
  window.sendPluginCommand('REFRESH_VARIABLES', {}).catch(function() {});
  break;
```

---

### Phase 2: Performance (batch operations)

#### 2.1 BATCH_EXECUTE handler

**Файлы:**
- `packages/plugin/src/sandbox/mcp-bridge/bridge-handlers.ts`
- `packages/plugin/src/sandbox/mcp-bridge/bridge-ui.js`

**Что делать:**

В bridge-handlers.ts добавить в `BRIDGE_TYPES`:
```typescript
'BATCH_EXECUTE': true,
```

В switch-case:
```typescript
case 'BATCH_EXECUTE':
  await handleBatchExecute(msg, requestId);
  break;
```

Handler:
```typescript
async function handleBatchExecute(msg: any, requestId: string): Promise<void> {
  var commands = msg.commands as Array<{ type: string; params: Record<string, unknown> }>;
  if (!commands || !Array.isArray(commands) || commands.length === 0) {
    throw new Error('BATCH_EXECUTE requires non-empty commands array');
  }
  if (commands.length > 100) {
    throw new Error('BATCH_EXECUTE max 100 commands per batch');
  }

  var results: Array<{ success: boolean; result?: unknown; error?: string }> = [];

  for (var i = 0; i < commands.length; i++) {
    var cmd = commands[i];
    try {
      // Dispatch each command through existing handlers
      var fakeMsg = Object.assign({}, cmd.params, { type: cmd.type, requestId: '__batch_' + i });

      // Capture the reply by temporarily intercepting postMessage
      var captured: Record<string, unknown> | null = null;
      var origReply = reply;
      // ... (see implementation details below)

      results.push({ success: true, result: captured });
    } catch (err) {
      var errMsg = (err && typeof err === 'object' && 'message' in err) ? (err as Error).message : String(err);
      results.push({ success: false, error: errMsg });
    }
  }

  replySuccess('BATCH_EXECUTE_RESULT', requestId, {
    results: results,
    totalCommands: commands.length,
    successCount: results.filter(function(r) { return r.success; }).length
  });
}
```

**Альтернативный (проще) подход — batch через EXECUTE_CODE:**

Вместо нового handler типа, научить MCP сервер генерировать один большой JS-код для batch-операций и слать через EXECUTE_CODE. Это то, что делает figma-console-mcp:

```javascript
// figma-console-mcp генерирует:
const code = `
  const results = [];
  ${commands.map((cmd, i) => `
    try {
      const v${i} = await figma.variables.createVariableAsync('${cmd.name}', ...);
      results.push({ i: ${i}, ok: true, id: v${i}.id });
    } catch(e) {
      results.push({ i: ${i}, ok: false, error: e.message });
    }
  `).join('\n')}
  return results;
`;
// Одна отправка через EXECUTE_CODE → один round-trip
```

Этот подход уже работает с нашим текущим EXECUTE_CODE handler (bridge-handlers.ts:299-357). Дополнительного кода не нужно — просто figma-console-mcp должен знать, что EXECUTE_CODE поддерживается.

**Рекомендация:** Оба подхода. BATCH_EXECUTE для типизированных операций, EXECUTE_CODE для произвольного кода. Figma-console-mcp использует оба.

---

В bridge-ui.js добавить в methodMap:
```javascript
'BATCH_EXECUTE': function(params) {
  return window.sendPluginCommand('BATCH_EXECUTE', { commands: params.commands }, 300000);
},
```

---

### Phase 3: Robustness (надёжность)

#### 3.1 Heartbeat для WebSocket connections

**Файл:** `packages/plugin/src/sandbox/mcp-bridge/bridge-ui.js`

**Что делать:** Добавить ping/pong для детекции zombie-соединений:

```javascript
// После attachWsHandlers:
var heartbeatInterval = setInterval(function() {
  if (activeWs.readyState === 1) {
    try {
      activeWs.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    } catch(e) {
      clearInterval(heartbeatInterval);
    }
  } else {
    clearInterval(heartbeatInterval);
  }
}, 30000);

// В activeWs.onclose:
clearInterval(heartbeatInterval);
```

---

#### 3.2 Graceful reconnect после ошибки

**Файл:** `packages/plugin/src/sandbox/mcp-bridge/bridge-ui.js`

**Проблема:** При ошибке в handler, WebSocket может остаться в подвешенном состоянии.

**Решение:** Добавить try-catch вокруг всей обработки WS message с отправкой error-ответа:

```javascript
// В attachWsHandlers → onmessage, уже есть, но проверить:
// 1. Всегда отправлять ответ (даже при ошибке)
// 2. Не ломать WS при JSON.parse ошибке
```

Текущая реализация (строки 432-457) уже делает это правильно — ✅ без изменений.

---

#### 3.3 Connection dedup — предотвращение двойных подключений

**Файл:** `packages/plugin/src/sandbox/mcp-bridge/bridge-ui.js`

**Проблема:** Если два scan цикла запустятся одновременно (edge case), можно получить два WS на одном порте.

**Решение:** Уже есть `isPortConnected(port)` check — ✅. Но добавить проверку В onopen callback:

```javascript
testWs.onopen = function() {
  clearTimeout(timeout);
  // Double-check: port wasn't connected by another parallel scan
  if (isPortConnected(port)) {
    testWs.close();
    pending--;
    return;
  }
  foundAny = true;
  // ... rest of existing code
};
```

---

### Phase 4: Documentation & Config

#### 4.1 Обновить PORT_MAP.md

**Файл:** `docs/PORT_MAP.md`

Добавить секцию о heartbeat, BATCH_EXECUTE, и soft reload.

#### 4.2 Обновить config.ts

**Файл:** `packages/plugin/src/config.ts`

Добавить константу для heartbeat interval:

```typescript
MCP_BRIDGE_HEARTBEAT_MS: 30000,
MCP_BRIDGE_STALE_TIMEOUT_MS: 300000, // 5 min
```

---

### Phase 5: Verification

#### 5.1 Build check
```bash
npm run build
```

#### 5.2 Test check
```bash
npm run test
```

#### 5.3 Typecheck
```bash
npm run typecheck -w packages/plugin
```

#### 5.4 Manual verification checklist
- [ ] Plugin loads in Figma Desktop without errors
- [ ] figma-console-mcp connects on port 9223
- [ ] `figma_execute` tool works (creates a rectangle)
- [ ] `figma_get_variables` returns design tokens
- [ ] RELOAD_UI doesn't drop WebSocket connection
- [ ] Multiple figma-console-mcp instances on different ports all connect
- [ ] Console capture shows in MCP server logs

---

## Файлы для изменения (сводка)

| Файл | Изменение | Фаза |
|------|-----------|------|
| `packages/plugin/manifest.json` | + `enablePrivatePluginApi: true` | 1.1 |
| `packages/plugin/src/sandbox/code.ts` | + MCP_BRIDGE_READY handler, убрать eager fetchAndSendVariablesData | 1.2 |
| `packages/plugin/src/sandbox/mcp-bridge/bridge-handlers.ts` | soft reload в handleReloadUI, + BATCH_EXECUTE handler | 1.3, 2.1 |
| `packages/plugin/src/sandbox/mcp-bridge/bridge-ui.js` | + MCP_BRIDGE_READY, + SOFT_RELOAD, + heartbeat, + BATCH_EXECUTE в methodMap, + dedup в onopen | 1.2, 1.3, 2.1, 3.1, 3.3 |
| `packages/plugin/src/config.ts` | + heartbeat constants | 4.2 |
| `docs/PORT_MAP.md` | + документация изменений | 4.1 |

## Ограничения (НЕ МЕНЯТЬ)

1. **ES5 для sandbox** — `bridge-handlers.ts` компилируется Babel в ES5. Никаких `Object.fromEntries`, `Array.flat`, `Promise.allSettled` и т.д.
2. **bridge-ui.js** — чистый ES5 JavaScript (не TypeScript, не компилируется). Никаких arrow functions, const/let, template literals.
3. **CSVFields** — без index signature.
4. **Не трогать** extension и relay код — изменения только в plugin package.
5. **Не трогать** существующие Contentify message handlers (kebab-case) — только MCP bridge (UPPERCASE).

## Контекст из figma-console-mcp

Ключевые паттерны, которые мы адаптируем:

1. **Трёхслойный сэндвич** — MCP Server ↔ UI iframe (WebSocket) ↔ Plugin Sandbox (postMessage) — уже реализован у нас ✅
2. **Console capture** — monkey-patch console.* → postMessage → WebSocket — уже реализован ✅
3. **eval() в sandbox** — EXECUTE_CODE с timeout через Promise.race — уже реализован ✅
4. **Port scanning 9223-9232** — bridge-ui.js сканирует каждые 10 сек — уже реализован ✅
5. **enablePrivatePluginApi** — manifest flag для расширенных API — **НЕ реализован** ❌
6. **Batch operations** — один round-trip для 100+ операций — **НЕ реализован** ❌
7. **Soft reload** — обновление без пересоздания iframe — **НЕ реализован** ❌
8. **Heartbeat** — детекция zombie-соединений — **НЕ реализован** ❌
