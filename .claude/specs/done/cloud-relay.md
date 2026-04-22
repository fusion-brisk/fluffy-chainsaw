# Cloud Relay — Yandex Cloud Migration

**Status:** in-progress
**Started:** 2026-04-22
**Owner:** valeriy.shch

> **Resume:** "Continue spec in `.claude/specs/in-progress/cloud-relay.md`"

## Problem

Текущий local relay (pkg-бинарь + LaunchAgent в `~/.contentify/`) даёт слишком много непропорциональной боли:

- **Code signing / Gatekeeper** — macOS бинарь нужно подписывать ($99/yr Apple Developer ID), иначе Gatekeeper убивает процесс.
- **Self-update стабильно ломается** — v2.6.0 убил сам себя (`launchctl stop` → SIGTERM → exit(0) → launchd не рестартил). Почти день сессии Apr 17 ушёл на починку и выпуск v2.6.1 (см. [relay-self-healing.md](.claude/specs/in-progress/relay-self-healing.md)).
- **LaunchAgent конфигурация** — plist с `KeepAlive`, `ThrottleInterval`, `ExitTimeOut`, восстановление после clean exit, self-kill через stop.
- **Platform coverage** — собран только `contentify-relay-host-arm64`. Intel Mac, Windows, Linux юзеры не покрыты.
- **Port 3847 может конфликтовать** — `lsof -i :3847` каждый раз перед стартом.
- **Persistence path bugs** — pkg virtual fs `/snapshot/...` read-only, `__dirname` не работает (см. [pkg-binary-pitfalls.md](pkg-binary-pitfalls.md)).

**Offline никогда не был реальной фичей.** Figma сам требует интернет, плагин тоже. Local relay создавал иллюзию "локального" решения ценой всей боли выше, не давая ничего взамен.

Есть доступ к **Yandex Cloud** → перенос relay в облако снимает всю локальную инфраструктуру. Деплой один раз — все клиенты получают обновление мгновенно, без бинарников, codesign, LaunchAgent, OTA. **Local relay полностью удаляется в рамках этого плана.**

## Solution

Полностью заменить локальный relay на **Yandex Cloud Function + YDB serverless** с 1:1-совместимым HTTP API. Session-based изоляция через 6-значный код. Cloud URL baked-in в `config.ts` — не runtime-настройка. Клиент всегда идёт в cloud, localhost не запрашивается. `packages/relay/`, installer script, LaunchAgent tooling — **удаляются**.

```
Extension → HTTPS POST /push?session=XXX → YC Function → YDB queue
                                                              ↓
Plugin ← HTTPS GET /peek?session=XXX (poll) ← YC Function ←
```

## Out of scope

- **WebSocket / SSE** — MVP на polling. `useRelayConnection.ts` уже умеет polling, latency для пуша раз в пару минут не критична. WS возвращаем в Phase 2 через Serverless Container, если будет нужно.
- **POST /result + GET /result** — плагин экспортит Figma-кадры для visual comparison. Feature приостанавливается на время миграции, возвращается в Phase 2 через Yandex Object Storage.
- **POST /reimport** — тоже Phase 2 (нужен `last_import` storage в YDB).
- **Screenshots в push payload** — сейчас до 5MB base64. YDB string limit + overhead делают это дорого. В Phase 2 — через Object Storage (extension грузит напрямую, передаёт URL).
- **Apple Developer ID / notarization** — больше не нужно, бинарника нет.

## Goals

1. Cloud Function с `/push /peek /ack /reject /status /clear /health` работает 1:1 с local API.
2. Session-based изоляция через 6-значный код, данные разных пользователей не пересекаются.
3. Extension и Plugin переключаются на cloud через baked-in URL + session code. Без хибрида.
4. **`packages/relay/` полностью удалён** — весь installer/update/LaunchAgent tooling. Spec `relay-self-healing.md` закрыт как obsolete.
5. Manual deploy через `yc` CLI задокументирован, запускается из `packages/cloud-relay/scripts/deploy.sh`.

## Architecture

### Stack

- **Yandex Cloud Function** (Node.js 22 runtime) — один function с HTTP-триггером, роутинг по `req.path`/`req.httpMethod`. Stateless.
- **YDB в serverless-режиме** — таблица `queue_entries` для персистентной очереди. Free tier покрывает 1M operations/month.
- **Function URL** прямо — MVP не использует API Gateway (лишняя сущность). URL формата `https://functions.yandexcloud.net/d4e...`.

### Data model

YDB table `queue_entries`:

```yql
CREATE TABLE queue_entries (
  session_id     Utf8 NOT NULL,
  entry_id       Utf8 NOT NULL,
  payload        Json,
  meta           Json,
  pushed_at      Timestamp,
  acknowledged   Bool,
  last_peeked_at Timestamp,
  expires_at     Timestamp,
  PRIMARY KEY (session_id, entry_id)
)
WITH (
  TTL = Interval("PT24H") ON expires_at
);
```

Все операции scoped по `session_id` — никогда не возвращаем строки других сессий.

### Session code

- **Plugin generates** при первом запуске: `Math.random().toString(36).slice(2, 8).toUpperCase()` → 6 символов A-Z0-9.
- Сохраняется в `figma.clientStorage.setAsync('session-code', code)`.
- Показывается юзеру в Setup Flow с кнопкой «Copy». Setup flow **блокирует** переход дальше без сгенерированного кода.
- **Extension reads** из `chrome.storage.local.sessionCode`. Юзер вставляет вручную в options page. Без session code push отваливается с UI-ошибкой «Configure session code in options».
- Cloud URL **baked-in** в `packages/plugin/src/config.ts` и `packages/extension/src/config.ts` как единая константа `CLOUD_RELAY_URL`. Dev override через env var на билде, не runtime.
- Все клиентские fetch'и append'ят `?session=${code}`. Запросов без session code не бывает.

### API surface

| Endpoint    | Method   | MVP        | Notes                                                                                       |
| ----------- | -------- | ---------- | ------------------------------------------------------------------------------------------- |
| `/push`     | POST     | ✅         | `{ payload, meta }` → создаёт строку в YDB. Screenshots в payload — drop + warn до Phase 2. |
| `/peek`     | GET      | ✅         | Возвращает первую `acknowledged=false` запись сессии, устанавливает `last_peeked_at`.       |
| `/ack`      | POST     | ✅         | `{ entryId }` → удаляет строку. Идемпотентно (возвращает `alreadyRemoved=true` если нет).   |
| `/reject`   | POST     | ✅         | `{ entryId }` → сбрасывает `last_peeked_at=NULL`.                                           |
| `/status`   | GET      | ✅         | `{ version, queueSize, pendingCount, hasData, firstEntry }`                                 |
| `/clear`    | DELETE   | ✅         | Удаляет все строки сессии.                                                                  |
| `/health`   | GET      | ✅         | `{ ok: true, version: CLOUD_RELAY_VERSION }` статический ответ, не требует sessionId.       |
| `/result`   | POST/GET | ❌ Phase 2 | Нужен Object Storage.                                                                       |
| `/reimport` | POST     | ❌ Phase 2 | Нужен `last_import` storage в YDB.                                                          |
| WS `/`      | -        | ❌         | Polling only.                                                                               |

### File structure

**New package:** `packages/cloud-relay/`

```
packages/cloud-relay/
├── package.json           # Cloud Function dependencies
├── tsconfig.json
├── README.md              # Deploy instructions
├── src/
│   ├── handler.ts         # HTTP entry (dispatch by path/method)
│   ├── ydb.ts             # YDB client singleton + ensureTable()
│   ├── session.ts         # Session code extraction + validation
│   ├── routes/
│   │   ├── push.ts
│   │   ├── peek.ts
│   │   ├── ack.ts
│   │   ├── reject.ts
│   │   ├── status.ts
│   │   ├── clear.ts
│   │   └── health.ts
│   ├── types.ts           # QueueEntry, Payload (duplicates relay types)
│   └── version.ts         # CLOUD_RELAY_VERSION
├── tests/
│   └── handler.test.ts    # Dispatch table tests (YDB mocked)
├── schema/
│   └── queue.yql          # Table DDL
└── scripts/
    ├── deploy.sh          # yc serverless function version create
    ├── bootstrap-ydb.sh   # One-time YDB table creation
    └── teardown.sh        # Cleanup for dev iterations
```

**Modified files:**

| File                                                       | Change                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugin/src/config.ts`                            | Add `CLOUD_RELAY_URL` constant + `SESSION_CODE_KEY`. Drop `PORTS.RELAY`.                                                                                |
| `packages/plugin/src/ui/ui.tsx:44-57`                      | Load `sessionCode` из clientStorage. Relay URL всегда cloud, без fallback.                                                                              |
| `packages/plugin/src/ui/hooks/useRelayConnection.ts`       | Drop WebSocket целиком. Always polling. Append `?session=${code}` к каждому fetch.                                                                      |
| `packages/plugin/src/ui/components/SetupFlow.tsx`          | Шаг «Session code» — генерит, показывает, Copy. Next заблокирован без code.                                                                             |
| `packages/plugin/src/sandbox/code.ts`                      | Message handlers `get-session-code` / `set-session-code` через `figma.clientStorage`.                                                                   |
| `packages/plugin/src/ui/components/RelayOfflineBanner.tsx` | Rename → `CloudUnreachableBanner.tsx`. Текст: «Нет связи с Cloud Relay. Проверь интернет.» Убрать launchctl команду.                                    |
| `packages/extension/src/config.ts` (new file)              | `export const CLOUD_RELAY_URL = '...'`.                                                                                                                 |
| `packages/extension/public/options.html`                   | Drop `relayUrl` input. Add session code input (6 char A-Z0-9).                                                                                          |
| `packages/extension/src/options.ts`                        | Drop relayUrl load/save/test. Only session code + test `/health?session=XXX` call.                                                                      |
| `packages/extension/src/shared-utils.ts`                   | Drop `getRelayUrl`. Add `getSessionCode`.                                                                                                               |
| `packages/extension/src/background.ts`                     | Drop Native Host logic (`connectToNativeHost`, `ensureRelayRunning`). Push идёт в `CLOUD_RELAY_URL` + sessionCode. Без sessionCode — UI error, no push. |
| `packages/extension/src/popup.ts`                          | Show session code status (configured / missing).                                                                                                        |
| root `package.json`                                        | Add `packages/cloud-relay` to workspaces.                                                                                                               |

**Deleted files and directories:**

| Path                                                              | Reason                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/relay/`                                                 | Entire package — replaced by cloud function                                                   |
| `tools/install-relay.sh`                                          | Нет бинарника для установки                                                                   |
| `packages/plugin/src/ui/hooks/useBuildCheck.ts` _(review)_        | Проверяет build-hash от relay; если больше не нужен — удалить                                 |
| `.github/workflows/*` — jobs для сборки `contentify-relay-host-*` | Нечего билдить                                                                                |
| `.claude/specs/in-progress/relay-self-healing.md`                 | Obsolete — relay удалён полностью. Move to `done/` с пометкой `superseded by cloud-relay.md`. |
| `docs/PORT_MAP.md` — строка про порт 3847                         | Порт больше не используется                                                                   |
| Native Messaging host manifest (`com.contentify.relay.json`)      | Native Host не нужен                                                                          |
| `EXTENSION_URLS.RELAY_INSTALL_SCRIPT` в `config.ts`               | Удалить константу и все ссылки на неё                                                         |

## Tasks

### Phase 1 — Cloud Function MVP

#### Task 1: Scaffold `packages/cloud-relay` package

**Files:**

- Create: `packages/cloud-relay/package.json`
- Create: `packages/cloud-relay/tsconfig.json`
- Create: `packages/cloud-relay/.gitignore`
- Create: `packages/cloud-relay/README.md`
- Modify: root `package.json` (add workspace)

- [ ] **Step 1:** Verify current `ydb-sdk` package name + Node.js 22 support on Yandex Cloud Functions via `mcp__context7__resolve-library-id` + `query-docs`. Note correct import syntax в README.

- [ ] **Step 2:** Create `packages/cloud-relay/package.json`:

```json
{
  "name": "@contentify/cloud-relay",
  "version": "0.1.0",
  "private": true,
  "main": "dist/handler.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "deploy": "bash scripts/deploy.sh",
    "bootstrap-ydb": "bash scripts/bootstrap-ydb.sh"
  },
  "dependencies": {
    "ydb-sdk": "^6.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 3:** Create `tsconfig.json` с `target: es2022`, `module: commonjs`, `outDir: dist`, `strict: true`.

- [ ] **Step 4:** Add to root `package.json` → `workspaces`: `"packages/cloud-relay"`.

- [ ] **Step 5:** `npm install` at root, verify workspace linked.

- [ ] **Step 6:** Commit: `chore(cloud-relay): scaffold package`.

#### Task 2: YDB client + schema

**Files:**

- Create: `packages/cloud-relay/src/ydb.ts`
- Create: `packages/cloud-relay/schema/queue.yql`
- Create: `packages/cloud-relay/scripts/bootstrap-ydb.sh`

- [ ] **Step 1:** Create YDB table DDL в `schema/queue.yql` (как в Architecture выше).

- [ ] **Step 2:** Create `src/ydb.ts` — singleton client через `Driver` from `ydb-sdk`, reads `YDB_ENDPOINT` + `YDB_DATABASE` + metadata-based auth (Function inherits SA token from YC environment).

- [ ] **Step 3:** Expose helpers: `insertEntry()`, `findFirstPending(sessionId)`, `markPeeked(sessionId, entryId)`, `deleteEntry(sessionId, entryId)`, `clearSession(sessionId)`, `getStatus(sessionId)`. All take session_id as first arg.

- [ ] **Step 4:** Create `scripts/bootstrap-ydb.sh` using `ydb -p <profile> yql -f schema/queue.yql`.

- [ ] **Step 5:** Manually create YDB database в YC Console (serverless mode), run bootstrap script. Document endpoint+database в `README.md`.

- [ ] **Step 6:** Commit: `feat(cloud-relay): YDB client + schema`.

#### Task 3: HTTP handler dispatch

**Files:**

- Create: `packages/cloud-relay/src/handler.ts`
- Create: `packages/cloud-relay/src/session.ts`
- Create: `packages/cloud-relay/src/types.ts`
- Create: `packages/cloud-relay/src/version.ts`

- [ ] **Step 1:** Copy `QueueEntry`, `QueueEntryPayload`, `QueueEntryMeta` types from `packages/relay/src/types.ts` в `cloud-relay/src/types.ts`. Это последний раз когда мы ссылаемся на `packages/relay/` — после этого package удаляется в Task 11.

- [ ] **Step 2:** Create `src/session.ts`:

```ts
const SESSION_RE = /^[A-Z0-9]{6}$/;

export function extractSessionId(event: YcHttpEvent): string | null {
  const query = event.queryStringParameters?.session || '';
  if (SESSION_RE.test(query)) return query;
  return null;
}
```

- [ ] **Step 3:** Create `src/handler.ts` entry point — maps `(method, path)` to route modules, returns 400 on missing/invalid session, 404 on unknown path, 500 on uncaught error. CORS headers `Access-Control-Allow-Origin: *` + preflight support.

```ts
export async function handler(event: YcHttpEvent): Promise<YcHttpResponse> {
  if (event.httpMethod === 'OPTIONS') return cors({ statusCode: 204 });

  const path = event.path || '/';
  if (path === '/health') return routes.health(event);

  const sessionId = extractSessionId(event);
  if (!sessionId) return cors({ statusCode: 400, body: { error: 'Missing or invalid session' } });

  const key = `${event.httpMethod} ${path}`;
  const route = ROUTES[key];
  if (!route) return cors({ statusCode: 404, body: { error: 'Not found' } });

  try {
    return cors(await route(event, sessionId));
  } catch (err) {
    console.error('[handler]', err);
    return cors({ statusCode: 500, body: { error: 'Internal error' } });
  }
}
```

- [ ] **Step 4:** `src/version.ts`:

```ts
export const CLOUD_RELAY_VERSION = '0.1.0';
```

- [ ] **Step 5:** Commit: `feat(cloud-relay): handler dispatch + session extraction`.

#### Task 4: Route handlers (push, peek, ack, reject, status, clear, health)

**Files:**

- Create: `packages/cloud-relay/src/routes/push.ts`
- Create: `packages/cloud-relay/src/routes/peek.ts`
- Create: `packages/cloud-relay/src/routes/ack.ts`
- Create: `packages/cloud-relay/src/routes/reject.ts`
- Create: `packages/cloud-relay/src/routes/status.ts`
- Create: `packages/cloud-relay/src/routes/clear.ts`
- Create: `packages/cloud-relay/src/routes/health.ts`

- [ ] **Step 1:** `push.ts`:
  - Parse `{ payload, meta }` from body.
  - If `payload.screenshots` — drop + warn (Phase 2).
  - Validate data payload size ≤ 5MB.
  - Generate `entryId = ${Date.now()}-${Math.random().toString(36).slice(2, 11)}`.
  - Insert row, set `expires_at = now() + 24h`.
  - Return `{ success: true, queueSize, entryId }`.

- [ ] **Step 2:** `peek.ts`:
  - `findFirstPending(sessionId)` → first `acknowledged=false` ordered by `pushed_at`.
  - If none → `{ hasData: false, queueSize: 0 }`.
  - Else: set `last_peeked_at = now()`, return `{ hasData, entryId, payload, meta, pushedAt, pendingCount }`.

- [ ] **Step 3:** `ack.ts`:
  - Parse `{ entryId }`.
  - `deleteEntry(sessionId, entryId)`.
  - Идемпотентно: если строки нет → `{ success: true, alreadyRemoved: true, queueSize }`.

- [ ] **Step 4:** `reject.ts`:
  - Parse `{ entryId }`.
  - `UPDATE SET last_peeked_at = NULL WHERE session_id=? AND entry_id=?`.
  - Return `{ success: true, queueSize }`.

- [ ] **Step 5:** `status.ts`:
  - Count rows where `session_id=?`.
  - Count pending (acknowledged=false).
  - Fetch first entry preview (id, itemCount из payload).
  - Return `{ version: CLOUD_RELAY_VERSION, queueSize, pendingCount, hasData, firstEntry }`.

- [ ] **Step 6:** `clear.ts`:
  - `DELETE WHERE session_id=?`.
  - Return `{ success: true, cleared: count }`.

- [ ] **Step 7:** `health.ts`:
  - Return `{ ok: true, version: CLOUD_RELAY_VERSION, timestamp: Date.now() }`. Не требует sessionId.

- [ ] **Step 8:** Register routes в `handler.ts`:

```ts
const ROUTES: Record<string, Route> = {
  'POST /push': push,
  'GET /peek': peek,
  'POST /ack': ack,
  'POST /reject': reject,
  'GET /status': status,
  'DELETE /clear': clear,
};
```

- [ ] **Step 9:** Commit: `feat(cloud-relay): route handlers for MVP API`.

#### Task 5: Tests (handler dispatch + session validation)

**Files:**

- Create: `packages/cloud-relay/tests/handler.test.ts`
- Create: `packages/cloud-relay/tests/session.test.ts`
- Create: `packages/cloud-relay/vitest.config.ts`

- [ ] **Step 1:** `session.test.ts` — табличные тесты для `extractSessionId`:
  - Валидный код `ABC123` → возвращает.
  - Пустой query → `null`.
  - Lowercase `abc123` → `null` (regex отбрасывает).
  - Длина 5/7 → `null`.
  - Спецсимволы → `null`.

- [ ] **Step 2:** `handler.test.ts` — mock `ydb.ts`, проверить:
  - `OPTIONS *` → 204 + CORS headers.
  - `GET /health` → 200 без sessionId.
  - `POST /push` без session → 400.
  - `POST /push?session=ABC123` → вызывает `routes.push`.
  - Неизвестный path → 404.
  - Route бросает → 500 + error в body.

- [ ] **Step 3:** `npm run test -w packages/cloud-relay` зелёный.

- [ ] **Step 4:** Commit: `test(cloud-relay): dispatch + session tests`.

#### Task 6: Deploy script + manual first deploy

**Files:**

- Create: `packages/cloud-relay/scripts/deploy.sh`
- Modify: `packages/cloud-relay/README.md`

- [ ] **Step 1:** Verify `yc serverless function version create` flags via `yc --help` or [YC docs](https://cloud.yandex.com/docs/functions/). Note flags for: runtime, entrypoint, env vars, SA, memory, timeout.

- [ ] **Step 2:** `scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

yc serverless function version create \
  --function-name=contentify-relay \
  --runtime=nodejs22 \
  --entrypoint=handler.handler \
  --memory=256m \
  --execution-timeout=30s \
  --source-path=dist \
  --environment=YDB_ENDPOINT=$YDB_ENDPOINT,YDB_DATABASE=$YDB_DATABASE \
  --service-account-id=$SA_ID
```

- [ ] **Step 3:** Manually (first time):
  - Создать YC folder `contentify`.
  - Создать Service Account с ролями `ydb.editor`, `serverless.functions.invoker`.
  - Создать YDB database (serverless mode), выполнить `bootstrap-ydb.sh`.
  - Создать function с HTTP trigger (public access).
  - Запустить `deploy.sh`.
  - Зафиксировать invoke URL → записать в `packages/plugin/src/config.ts` и `packages/extension/src/config.ts` как `CLOUD_RELAY_URL`.

- [ ] **Step 4:** Verify live:

```bash
SESSION=TEST01
BASE_URL=https://functions.yandexcloud.net/d4e...

curl -s "$BASE_URL/health" | jq
curl -s "$BASE_URL/status?session=$SESSION" | jq
curl -s -X POST "$BASE_URL/push?session=$SESSION" \
  -H 'Content-Type: application/json' \
  -d '{"payload":{"rawRows":[{"#query":"test"}]},"meta":{}}' | jq
curl -s "$BASE_URL/peek?session=$SESSION" | jq
```

Expected: health returns `{ok:true}`, push returns entryId, peek returns same payload.

- [ ] **Step 5:** Document all в `packages/cloud-relay/README.md`.

- [ ] **Step 6:** Commit: `feat(cloud-relay): deploy script + first live deploy`.

### Phase 2 — Client integration (cloud-only, no fallback)

#### Task 7: Plugin session code + hardcoded cloud URL

**Files:**

- Modify: `packages/plugin/src/config.ts`
- Modify: `packages/plugin/src/sandbox/code.ts`
- Modify: `packages/plugin/src/ui/components/SetupFlow.tsx`
- Modify: `packages/plugin/src/ui/ui.tsx`

- [ ] **Step 1:** В `config.ts`:
  - Drop `PORTS.RELAY` (и `PORTS` объект если пустой).
  - Add `export const CLOUD_RELAY_URL = 'https://functions.yandexcloud.net/...'` (из Task 6).
  - Add `export const SESSION_CODE_KEY = 'contentify-session-code'`.
  - Drop `EXTENSION_URLS.RELAY_INSTALL_SCRIPT`.

- [ ] **Step 2:** В `sandbox/code.ts` добавить message handlers:
  - `get-session-code` → `figma.clientStorage.getAsync(SESSION_CODE_KEY)` → postMessage обратно.
  - `set-session-code` → `figma.clientStorage.setAsync(SESSION_CODE_KEY, code)`.

  ES5-совместимо (Babel target). Не используем `async/await` без нужды, не используем `Promise.allSettled`.

- [ ] **Step 3:** В `SetupFlow.tsx` новый обязательный шаг «Session code»:
  - Текст: «Введите этот код в расширении Chrome (Options → Session code):».
  - 6 символов A-Z0-9, генерируются кнопкой «Generate».
  - Кнопка «Copy» → clipboard.
  - Кнопка «Next» disabled пока code не сгенерирован.
  - При сохранении вызывает `set-session-code`.
  - CSS: hover trap class в global `:not()` chain (см. `.claude/rules/ui-css.md`); fallbacks для `var(--figma-color-*)`.

- [ ] **Step 4:** В `ui.tsx:44-57` заменить `relayUrl`-логику:

```ts
const [sessionCode, setSessionCode] = useState<string | null>(null);

// Load on mount
useEffect(() => {
  sendMessageToPlugin({ type: 'get-session-code' });
}, []);

// Handler in usePluginMessages — setSessionCode(msg.code)

const relayUrl = useMemo(() => (sessionCode ? CLOUD_RELAY_URL : null), [sessionCode]);
```

- [ ] **Step 5:** Если `sessionCode === null` → show setup flow, не продолжать дальше.

- [ ] **Step 6:** `npm run test -w packages/plugin` зелёный. `npm run typecheck -w packages/plugin` без новых ошибок. `npm run build -w packages/plugin`.

- [ ] **Step 7:** Commit: `feat(plugin): cloud relay URL + session code storage`.

#### Task 8: Plugin useRelayConnection — drop WebSocket, polling-only

**Files:**

- Modify: `packages/plugin/src/ui/hooks/useRelayConnection.ts`
- Modify: `packages/plugin/src/ui/components/RelayOfflineBanner.tsx` → rename to `CloudUnreachableBanner.tsx`
- Modify: `packages/plugin/src/ui/styles.css` (rename CSS class)
- Modify: `packages/plugin/tests/ui/RelayOfflineBanner.test.tsx` → rename, update

- [ ] **Step 1:** В `useRelayConnection.ts`:
  - **Удалить** весь WebSocket block (`connectWebSocket`, `scheduleReconnect`, `wsRef`, `wsReconnectAttemptRef`, `wsReconnectTimeoutRef`, `wsConnectedRef`, `WS_RECONNECT_DELAYS`).
  - Оставить только polling path — всегда активен когда `enabled=true`.
  - Добавить `sessionCode` в options: `useRelayConnection({ relayUrl, sessionCode, enabled, ... })`. Если `sessionCode` null — hook возвращает `connected: false` и никаких запросов.
  - Построение URL:
    ```ts
    function buildUrl(path: string): string {
      return `${relayUrl}${path}?session=${sessionCode}`;
    }
    ```
  - Использовать `buildUrl('/peek')`, `buildUrl('/ack')`, `buildUrl('/clear')`, `buildUrl('/status')` etc.

- [ ] **Step 2:** В `ui.tsx` — передать `sessionCode` в `useRelayConnection`:

```ts
const relay = useRelayConnection({
  relayUrl: CLOUD_RELAY_URL,
  sessionCode,
  enabled: !!sessionCode && appState !== 'setup' && appState !== 'processing' && appState !== 'confirming',
  onDataReceived: ...,
  onConnectionChange: ...,
});
```

- [ ] **Step 3:** Rename `RelayOfflineBanner.tsx` → `CloudUnreachableBanner.tsx`:
  - Заголовок: «Нет связи с Cloud Relay».
  - Текст: «Проверьте интернет-соединение. Session code: `ABC123`».
  - Кнопка «Попробовать снова» → `relay.checkNow()`.
  - Убрать команду `launchctl kickstart` и ссылку на install script.
  - Обновить impoort в `ui.tsx`.

- [ ] **Step 4:** Обновить CSS класс (`relay-offline-banner` → `cloud-unreachable-banner`). Проверить grep: `grep -rn relay-offline-banner packages/plugin/src/ui/` → 0 совпадений.

- [ ] **Step 5:** Обновить test файл под новое имя компонента.

- [ ] **Step 6:** `npm run verify` в plugin.

- [ ] **Step 7:** Commit: `feat(plugin): cloud-only relay (drop WebSocket + offline banner rename)`.

#### Task 9: Extension — session code mandatory, cloud URL baked

**Files:**

- Create: `packages/extension/src/config.ts`
- Modify: `packages/extension/public/options.html`
- Modify: `packages/extension/src/options.ts`
- Modify: `packages/extension/src/shared-utils.ts`
- Modify: `packages/extension/src/background.ts`
- Modify: `packages/extension/src/popup.ts`
- Modify: `packages/extension/public/popup.html` (если нужно показать session code status)

- [ ] **Step 1:** Create `packages/extension/src/config.ts`:

```ts
export const CLOUD_RELAY_URL = 'https://functions.yandexcloud.net/...'; // same as plugin
```

- [ ] **Step 2:** `options.html`:
  - Drop field `relayUrl` + все связанные элементы.
  - Add field `sessionCode` (6 chars, pattern validation).
  - Test button → `fetch(${CLOUD_RELAY_URL}/health?session=${code})`.

- [ ] **Step 3:** `options.ts`:
  - Drop `DEFAULT_RELAY_URL`, relayUrl load/save/reset/test.
  - Add load/save/test для `sessionCode`.
  - UX: после сохранения показать статус «Session code saved. Push should work now.»

- [ ] **Step 4:** `shared-utils.ts`:
  - **Drop** `getRelayUrl()`.
  - **Add**:

```ts
export async function getSessionCode(): Promise<string | null> {
  const { sessionCode } = await chrome.storage.local.get('sessionCode');
  return typeof sessionCode === 'string' && /^[A-Z0-9]{6}$/.test(sessionCode) ? sessionCode : null;
}
```

- [ ] **Step 5:** `background.ts` — полный refactor:
  - **Удалить** `connectToNativeHost`, `ensureRelayRunning`, `NATIVE_HOST_NAME`, `nativePort`, `nativeHostAvailable`, `relayStarted`, весь Native Host код.
  - **Удалить** `checkRelayHealth` helper — заменить на `fetch(${CLOUD_RELAY_URL}/health?session=${code})`.
  - В `attemptPush` и основном push handler:

```ts
const sessionCode = await getSessionCode();
if (!sessionCode) {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#f24822' });
  showNotification({
    title: 'Contentify: Session code missing',
    message: 'Open extension options and enter your session code from Figma plugin.',
  });
  savePendingDataToStorage({ payload, meta }); // existing retry logic
  return false;
}

const url = `${CLOUD_RELAY_URL}/push?session=${sessionCode}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload, meta }),
  signal: AbortSignal.timeout(5000),
});
```

- [ ] **Step 6:** `popup.ts` — показать статус session code:
  - Если configured → green checkmark + first 2 chars («AB•••»).
  - Если missing → warning + кнопка «Open options».

- [ ] **Step 7:** `manifest.json` — проверить что Native Messaging permission снимается (если он был — drop `nativeMessaging` permission).

- [ ] **Step 8:** `npm run build -w packages/extension`. Перезагрузить extension в Chrome.

- [ ] **Step 9:** Commit: `feat(extension): cloud-only relay + session code mandatory`.

### Phase 3 — Remove local relay + smoke + ship

#### Task 10: End-to-end smoke test (cloud only)

- [ ] **Step 1:** В Figma plugin — Setup → Generate session code (`ABC123`) → copy.

- [ ] **Step 2:** В Chrome extension options → вставить `ABC123`, Save. Test connection → ✅.

- [ ] **Step 3:** Открыть Яндекс SERP, кликнуть extension icon → Push.

- [ ] **Step 4:** В Figma plugin появляется `ImportConfirmDialog` с данными. Подтвердить импорт.

- [ ] **Step 5:** Verify в YC console → Functions → contentify-relay → Logs → видно push + peek + ack для session ABC123.

- [ ] **Step 6:** YC Console → YDB → browser → `SELECT * FROM queue_entries WHERE session_id='ABC123'` — строка ушла (после ack).

- [ ] **Step 7:** Clear queue из plugin → `SELECT count(*) WHERE session_id='ABC123'` → 0.

- [ ] **Step 8:** Simulate offline: в Chrome DevTools → Network → Offline → plugin показывает `CloudUnreachableBanner`. Включить online → banner исчезает сам.

- [ ] **Step 9:** Extension без session code: clear chrome.storage, push → extension показывает notification «Session code missing» + badge `!`.

#### Task 11: Remove local relay package + all related code

**Files to delete:**

- `packages/relay/` (entire directory)
- `tools/install-relay.sh`
- `com.contentify.relay.json` (Native Messaging host manifest, если был)
- `.github/workflows/` jobs для сборки relay бинаря

**Files to modify:**

- root `package.json` — drop `packages/relay` from workspaces
- `docs/PORT_MAP.md` — drop 3847 entry
- `docs/ARCHITECTURE.md` — обновить диаграмму (cloud вместо localhost)
- `.claude/specs/in-progress/relay-self-healing.md` — move to `done/` с пометкой «superseded by cloud-relay.md (relay removed entirely)»
- Root `CLAUDE.md` — удалить упоминания relay install, LaunchAgent, port 3847
- `packages/plugin/CLAUDE.md` — то же
- `packages/extension/CLAUDE.md` — то же

- [ ] **Step 1:** Grep для подтверждения что ни один файл за пределами удаляемых не импортит из `packages/relay/`:

```bash
grep -rn "from '.*relay'" packages/plugin/src packages/extension/src
grep -rn "@contentify/relay" packages/
```

Ожидаемо: 0 совпадений после Task 8/9. Если что-то нашлось — починить сначала.

- [ ] **Step 2:** `rm -rf packages/relay tools/install-relay.sh`.

- [ ] **Step 3:** Обновить root `package.json` workspaces — убрать `packages/relay`.

- [ ] **Step 4:** Удалить GitHub Actions jobs про relay build (если в CI есть отдельный step).

- [ ] **Step 5:** Обновить документацию:
  - `docs/PORT_MAP.md` — drop 3847.
  - `docs/ARCHITECTURE.md` — обновить диаграмму data flow.
  - Root `CLAUDE.md` — очистить от упоминаний local relay, LaunchAgent, port 3847, install script.
  - `packages/plugin/CLAUDE.md`, `packages/extension/CLAUDE.md` — то же.

- [ ] **Step 6:** Переместить `.claude/specs/in-progress/relay-self-healing.md` → `.claude/specs/done/relay-self-healing-superseded.md`. В начало файла — note:

```markdown
> **SUPERSEDED** by `cloud-relay.md`. Local relay удалён полностью 2026-XX-XX. Self-healing больше не актуален — нет бинарника, нет LaunchAgent.
```

- [ ] **Step 7:** `npm install` в root → workspace убран чисто.

- [ ] **Step 8:** `npm run verify` в plugin — зелёный (без relay dependencies).

- [ ] **Step 9:** `grep -rn "localhost:3847\|packages/relay\|RELAY_INSTALL\|launchctl\|contentify-relay-host" .` — 0 совпадений (кроме этого плана и git history).

- [ ] **Step 10:** Commit: `refactor: remove local relay package (superseded by cloud-relay)`.

#### Task 12: Documentation + version bump

**Files:**

- Modify: root `CLAUDE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `packages/plugin/src/config.ts` (version)
- Modify: `packages/extension/manifest.json` (version)
- Modify: root `package.json` (version)
- Create: `packages/cloud-relay/README.md` — полный runbook

- [ ] **Step 1:** `packages/cloud-relay/README.md` — секции:
  - Overview (что делает, связь с plugin/extension)
  - YC setup (folder, SA roles, YDB database creation)
  - Deploy (`npm run deploy`, env vars)
  - Monitoring (YC logs dashboard, YDB console)
  - Troubleshooting (cold start latency, CORS issues, session code validation)
  - Session code rotation — как сменить (plugin Settings → Regenerate)

- [ ] **Step 2:** Обновить архитектурные диаграммы в `docs/ARCHITECTURE.md` — убрать localhost relay.

- [ ] **Step 3:** Version bump (major — breaking change, local relay удалён):
  - Root `package.json` → `3.0.0`.
  - `packages/plugin/src/config.ts` → `PLUGIN_VERSION = '3.0.0'`.
  - `packages/extension/manifest.json` → `3.0.0`.
  - `packages/extension/updates.xml` → `3.0.0`.
  - Добавить CHANGELOG entry `3.0.0` про cloud relay + removal of local relay.

- [ ] **Step 4:** `npm run verify` в plugin (typecheck + lint + test + build). Обновить тесты если нужно.

- [ ] **Step 5:** Commit: `docs: cloud relay runbook + v3.0.0 bump`.

- [ ] **Step 6:** Move `.claude/specs/in-progress/cloud-relay.md` → `.claude/specs/done/cloud-relay.md`.

## Edge cases

- **Duplicate push same entryId в кратком окне** — ok, YDB PK `(session_id, entry_id)` отклонит второй insert; entryId генерируется со случайным suffix, коллизии пренебрежимо редки.
- **Session code collision** — 6 символов A-Z0-9 = 2.1B комбинаций, для нескольких юзеров Contentify collision вероятность пренебрежимо мала. Если серьёзно волнует — 8 символов.
- **Cold start YC Function** — ~500ms первый запрос после idle. Для push это ок; для peek polling — первый tick может быть медленнее, но не критично.
- **YDB TTL не сработал** — `expires_at` колонка ставится на 24h. Даже если TTL сломается, staled entries не видны через peek (acknowledged check). Можно добавить ручной cleanup endpoint в Phase 2.
- **Offline в Chrome или Figma** — клиент показывает `CloudUnreachableBanner` (plugin) или sticky badge + pendingDataStorage (extension). При восстановлении сети — pending push отправляется автоматически.
- **Screenshots в push > 5MB** — push handler отбрасывает screenshots + пишет warn. UI плагина может показать банер «Screenshots temporarily unavailable» (отложено в Phase 2).
- **Extension configured, plugin не configured** — юзер пушит из extension, но в плагине session code другой или пуст. Данные улетают в cloud под session X, плагин слушает session Y → ничего не приходит. UX fix: plugin `ImportConfirmDialog` никогда не появляется → user открывает plugin options, видит свой code, понимает что ошибка в extension. Возможная помощь — периодический статус-пинг от extension с sessionCode в plugin отложен в Phase 2.
- **User удалил session code** — plugin сгенерит новый при следующем setup, но старые данные в YDB под старым кодом останутся до TTL (24h) + не видны. Не блокер.

## Verification

**Unit:**

- `npm run test -w packages/cloud-relay` — handler dispatch, session extraction.
- `npm run verify` в plugin перед PR.

**Integration (manual):**

- Task 10 checklist — full SERP → push → plugin flow через cloud. Offline/missing session code cases.

**Production smoke (после deploy):**

- YC Function metrics: invocation count, error rate < 1%, duration p95 < 1s.
- YDB metrics: RU consumption в пределах free tier.
- Plugin + extension поведение в реальной работе в течение первой недели.

## Constraints (from CLAUDE.md)

- **ES5 sandbox** не применяется к cloud-relay (Node 22 в YC Function). Применяется к изменениям в plugin sandbox — session code handlers в `code.ts` должны использовать ES5-safe API.
- **Logger only** в plugin/extension — не плодим `console.log`. В cloud-relay используем `console.log` (Node окружение, не sandbox).
- **Build Discipline** — после каждого изменения в extension/plugin сорцах: rebuild + reload.
- **Commit format** — `feat(cloud-relay):`, `feat(plugin):`, `feat(extension):`, `refactor:` с English imperative.
- **prettier** — `npx prettier --write` перед commit.
- **React rules** из `vercel:react-best-practices` — применяем к `ui.tsx` / `SetupFlow.tsx` / `CloudUnreachableBanner.tsx` изменениям.

## Completion criteria

### Phase 1 (Cloud Function)

- [ ] `packages/cloud-relay` scaffolded + TypeScript builds clean
- [ ] YDB schema deployed, table visible в YC console
- [ ] All MVP routes implemented + unit-tested
- [ ] Deployed to YC, `/health` + `/push` + `/peek` работают через curl
- [ ] Free tier quotas задокументированы

### Phase 2 (Clients — cloud-only)

- [ ] Plugin: `CLOUD_RELAY_URL` baked in config, session code generation + storage
- [ ] Plugin: SetupFlow блокирует без session code
- [ ] Plugin: `useRelayConnection` polling-only, WebSocket удалён
- [ ] Plugin: `RelayOfflineBanner` → `CloudUnreachableBanner`
- [ ] Extension: `CLOUD_RELAY_URL` baked, session code mandatory, Native Host код удалён
- [ ] `npm run verify` зелёный

### Phase 3 (Remove + ship)

- [ ] End-to-end manual test прошёл (cloud-only + offline cases)
- [ ] `packages/relay/` удалён, workspace очищен
- [ ] `tools/install-relay.sh` удалён
- [ ] `relay-self-healing.md` перемещён в `done/` с пометкой superseded
- [ ] Docs обновлены (CLAUDE.md ×3, PORT_MAP, ARCHITECTURE)
- [ ] `grep -rn localhost:3847` = 0 совпадений
- [ ] Version bumped to 3.0.0 (major — breaking change)
- [ ] Merged to main

## Verification points (docs lookup during implementation)

Перед началом каждой задачи — использовать `mcp__context7__query-docs` для актуальных API:

1. **Task 1-2:** `ydb-sdk` current package version + Driver init pattern for Node.js runtime.
2. **Task 3:** YC Cloud Function HTTP event shape (`event.path`, `event.queryStringParameters`, `event.httpMethod`, `event.body`).
3. **Task 6:** `yc serverless function version create` flags (может измениться).
4. **Task 7:** `figma.clientStorage` API (setAsync/getAsync signatures).

## Phase 2 (follow-up spec, out of this plan)

- WebSocket / SSE через Serverless Container (если polling станет узким местом).
- `/result` + Object Storage для экспорта Figma-кадров (visual comparison).
- `/reimport` с `last_import` storage в YDB.
- Screenshots в push через Object Storage (extension → presigned URL → Object Storage → URL в payload).
- Cloud Function monitoring dashboards в Yandex Monitoring.
- Extension ↔ Plugin session code sync через shared QR code или deep link (убрать copy-paste).
