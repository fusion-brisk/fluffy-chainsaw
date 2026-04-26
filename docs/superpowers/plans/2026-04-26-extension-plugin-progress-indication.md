# Extension → Plugin Progress Indication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user clicks the extension icon, the Figma plugin should show a live narrative ("Расширение собирает данные…", "Грузим скриншоты 12/27…") within ~1 second, instead of sitting at idle for 1–5 seconds while the extension parses, uploads JSON, and uploads screenshots.

**Architecture:** Extension fires lightweight `kind: 'heads-up'` POSTs to the existing `/push` endpoint before each long phase. Cloud-relay UPSERTs a single row per session into a new YDB table `session_heads_up` (TTL 30s). The existing `/status` endpoint returns this row in a new `headsUp` field. Plugin's existing 1-second polling reads it, transitions to a new `incoming` AppState, and renders the phase narrative. No long-poll, no new transport.

**Tech Stack:** Yandex Cloud Function (Node.js 22) + YDB serverless, React 18 + TypeScript (Figma plugin), Chrome MV3 service worker (extension), Vitest for all unit tests.

**Spec:** `.claude/specs/in-progress/extension-plugin-progress-indication.md`

---

## File Structure

| File                                                              | Responsibility                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/cloud-relay/src/types.ts`                               | `HeadsUpPhase`, `HeadsUpState`, `HeadsUpStatePayload` types              |
| `packages/cloud-relay/schema/heads-up.yql` (new)                  | DDL for `session_heads_up` table                                         |
| `packages/cloud-relay/src/ydb.ts`                                 | `upsertHeadsUp` / `getHeadsUp` / `clearHeadsUp` helpers                  |
| `packages/cloud-relay/src/routes/push.ts`                         | Discriminate `body.kind === 'heads-up'`, route to UPSERT path            |
| `packages/cloud-relay/src/routes/status.ts`                       | Include `headsUp` in response                                            |
| `packages/cloud-relay/src/routes/clear.ts`                        | Also clear `session_heads_up` row                                        |
| `packages/cloud-relay/tests/handler.test.ts`                      | Tests for all heads-up routes + backwards compat                         |
| `packages/plugin/src/types.ts`                                    | Extend `AppState` union with `'incoming'`                                |
| `packages/plugin/src/ui/utils/heads-up-messages.ts` (new)         | `formatHeadsUpPhase(state)` → Russian narrative string                   |
| `packages/plugin/src/ui/hooks/useRelayConnection.ts`              | Parse `headsUp` from /status, fire `onIncoming(state)`, watchdog         |
| `packages/plugin/src/ui/components/CompactStrip.tsx`              | Add `'incoming'` mode: spinner + message + Cancel link                   |
| `packages/plugin/src/ui/styles.css`                               | `.compact-strip__cancel-link` + hover-exclusion list                     |
| `packages/plugin/src/ui/ui.tsx`                                   | Wire `incomingMessage`, `onCancelIncoming`, FSM transitions              |
| `packages/plugin/tests/ui/heads-up-messages.test.ts` (new)        | Phase → string mapping                                                   |
| `packages/plugin/tests/ui/use-relay-connection.test.ts` (new)     | Hook behaviour: heads-up → incoming, watchdog, error                     |
| `packages/extension/src/background.ts`                            | `sendHeadsUp` helper with throttle, instrumentation in `handleIconClick` |
| `packages/extension/src/content.ts`                               | `parsing` heads-up via runtime.sendMessage at start of extraction        |
| `packages/plugin/tests/extension/heads-up-throttle.test.ts` (new) | Throttle behaviour + source-contract                                     |

---

## Phase 1 — Cloud-relay (Tasks 1–5)

### Task 1: Heads-up types + DDL

**Files:**

- Modify: `packages/cloud-relay/src/types.ts`
- Create: `packages/cloud-relay/schema/heads-up.yql`

- [ ] **Step 1: Add heads-up types to `packages/cloud-relay/src/types.ts`**

Append after the `QueueStatus` interface:

```ts
// ─── Heads-up state ─────────────────────────────────────────────────────────
//
// Lightweight progress signal from extension. One row per session, overwritten
// on each /push?kind=heads-up. TTL 30s purges stale rows. /status embeds the
// latest non-expired row in its response so the plugin can render narrative
// without an extra round-trip.

export type HeadsUpPhase =
  | 'parsing'
  | 'uploading_json'
  | 'uploading_screenshots'
  | 'finalizing'
  | 'error';

export interface HeadsUpState {
  sessionId: string;
  phase: HeadsUpPhase;
  current: number | null; // required for 'uploading_screenshots', else null
  total: number | null; // required for 'uploading_screenshots', else null
  message: string | null; // required for 'error', else null
  ts: Date;
  expiresAt: Date;
}

/** Wire shape included in /status response. Date → ms epoch for JSON safety. */
export interface HeadsUpStatePayload {
  phase: HeadsUpPhase;
  current?: number;
  total?: number;
  message?: string;
  ts: number;
}
```

- [ ] **Step 2: Create DDL file `packages/cloud-relay/schema/heads-up.yql`**

```yql
-- session_heads_up — one row per active session. Overwritten by /push?kind=heads-up.
-- TTL 30s reaps stale rows. Reads via /status?session=X.

CREATE TABLE session_heads_up (
  session_id Utf8 NOT NULL,
  phase      Utf8 NOT NULL,
  current    Int32,
  total      Int32,
  message    Utf8,
  ts         Timestamp NOT NULL,
  expires_at Timestamp NOT NULL,
  PRIMARY KEY (session_id)
)
WITH (
  TTL = Interval("PT30S") ON expires_at
);
```

- [ ] **Step 3: Run typecheck to confirm types compile**

```bash
npm run typecheck -w packages/cloud-relay
```

Expected: PASS (only types added, no consumers yet).

- [ ] **Step 4: Commit**

```bash
git add packages/cloud-relay/src/types.ts packages/cloud-relay/schema/heads-up.yql
git commit -m "feat(cloud-relay): add heads-up types + session_heads_up DDL"
```

> **Manual deploy note** (not part of automated pipeline): the DDL must be applied to YDB before Tasks 2–5 are useful in production. Run:
>
> ```bash
> yc ydb yql -e <endpoint> -d <database> -f packages/cloud-relay/schema/heads-up.yql
> ```
>
> Tests in Tasks 2–5 mock YDB at the helper boundary, so this manual step does not block local development.

---

### Task 2: YDB helpers — upsertHeadsUp / getHeadsUp / clearHeadsUp

**Files:**

- Modify: `packages/cloud-relay/src/ydb.ts`

- [ ] **Step 1: Append helpers to `packages/cloud-relay/src/ydb.ts`**

After the existing `getStatus` function, add:

```ts
import type { HeadsUpPhase, HeadsUpState } from './types';

const HEADS_UP_TABLE = 'session_heads_up';
const HEADS_UP_TTL_MS = 30_000;

interface HeadsUpFields {
  current?: number | null;
  total?: number | null;
  message?: string | null;
}

export async function upsertHeadsUp(
  sessionId: string,
  phase: HeadsUpPhase,
  fields: HeadsUpFields = {},
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + HEADS_UP_TTL_MS);
  const query = `
DECLARE $session_id AS Utf8;
DECLARE $phase AS Utf8;
DECLARE $current AS Int32?;
DECLARE $total AS Int32?;
DECLARE $message AS Utf8?;
DECLARE $ts AS Timestamp;
DECLARE $expires_at AS Timestamp;

UPSERT INTO ${HEADS_UP_TABLE} (
  session_id, phase, current, total, message, ts, expires_at
) VALUES (
  $session_id, $phase, $current, $total, $message, $ts, $expires_at
);`;

  await execute(query, {
    $session_id: TypedValues.utf8(sessionId),
    $phase: TypedValues.utf8(phase),
    $current:
      fields.current == null
        ? TypedValues.optionalNull(Types.INT32)
        : TypedValues.optional(TypedValues.int32(fields.current)),
    $total:
      fields.total == null
        ? TypedValues.optionalNull(Types.INT32)
        : TypedValues.optional(TypedValues.int32(fields.total)),
    $message:
      fields.message == null
        ? TypedValues.optionalNull(Types.UTF8)
        : TypedValues.optional(TypedValues.utf8(fields.message)),
    $ts: TypedValues.timestamp(now),
    $expires_at: TypedValues.timestamp(expiresAt),
  });
}

export async function getHeadsUp(sessionId: string): Promise<HeadsUpState | null> {
  const query = `
DECLARE $session_id AS Utf8;
DECLARE $now AS Timestamp;

SELECT session_id, phase, current, total, message, ts, expires_at
FROM ${HEADS_UP_TABLE}
WHERE session_id = $session_id AND expires_at > $now
LIMIT 1;`;

  const result = await execute(query, {
    $session_id: TypedValues.utf8(sessionId),
    $now: TypedValues.timestamp(new Date()),
  });
  const rows = firstResultRows(result);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    sessionId: String(row.session_id ?? ''),
    phase: String(row.phase ?? '') as HeadsUpPhase,
    current: row.current == null ? null : toNumber(row.current),
    total: row.total == null ? null : toNumber(row.total),
    message: row.message == null ? null : String(row.message),
    ts: asDate(row.ts),
    expiresAt: asDate(row.expires_at),
  };
}

export async function clearHeadsUp(sessionId: string): Promise<void> {
  const query = `
DECLARE $session_id AS Utf8;

DELETE FROM ${HEADS_UP_TABLE}
WHERE session_id = $session_id;`;

  await execute(query, {
    $session_id: TypedValues.utf8(sessionId),
  });
}
```

- [ ] **Step 2: Add re-exports to the type alias block at the top**

Find the existing line:

```ts
export type { QueueEntry, QueueEntryMeta, QueueEntryPayload, QueueStatus };
```

Replace with:

```ts
export type {
  HeadsUpPhase,
  HeadsUpState,
  QueueEntry,
  QueueEntryMeta,
  QueueEntryPayload,
  QueueStatus,
};
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck -w packages/cloud-relay
```

Expected: PASS.

- [ ] **Step 4: Run unit tests (must still pass — no behaviour change yet)**

```bash
npm run test -w packages/cloud-relay
```

Expected: PASS — existing handler tests unaffected because new helpers are not yet wired into routes.

- [ ] **Step 5: Commit**

```bash
git add packages/cloud-relay/src/ydb.ts
git commit -m "feat(cloud-relay): add upsertHeadsUp/getHeadsUp/clearHeadsUp helpers"
```

---

### Task 3: `POST /push` — route heads-up vs payload

**Files:**

- Modify: `packages/cloud-relay/src/routes/push.ts`
- Modify: `packages/cloud-relay/tests/handler.test.ts`

- [ ] **Step 1: Add failing test for heads-up branch**

In `packages/cloud-relay/tests/handler.test.ts`, extend the `vi.mock('../src/ydb', …)` block at the top:

```ts
vi.mock('../src/ydb', () => ({
  insertEntry: vi.fn().mockResolvedValue(undefined),
  findFirstPending: vi.fn().mockResolvedValue(null),
  markPeeked: vi.fn().mockResolvedValue(undefined),
  deleteEntry: vi.fn().mockResolvedValue({ removed: true }),
  rejectEntry: vi.fn().mockResolvedValue(undefined),
  clearSession: vi.fn().mockResolvedValue({ cleared: 0 }),
  getStatus: vi.fn().mockResolvedValue({ queueSize: 0, pendingCount: 0, firstEntry: null }),
  getDriver: vi.fn(),
  destroyDriver: vi.fn().mockResolvedValue(undefined),
  // NEW heads-up mocks
  upsertHeadsUp: vi.fn().mockResolvedValue(undefined),
  getHeadsUp: vi.fn().mockResolvedValue(null),
  clearHeadsUp: vi.fn().mockResolvedValue(undefined),
}));
```

Then append a new `describe` block at the end of the file:

```ts
describe('POST /push — heads-up branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes kind=heads-up to upsertHeadsUp and returns 204', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({
          kind: 'heads-up',
          phase: 'parsing',
        }),
      }),
    );
    expect(res.statusCode).toBe(204);
    expect(ydb.upsertHeadsUp).toHaveBeenCalledWith('ABC123', 'parsing', {
      current: null,
      total: null,
      message: null,
    });
    expect(ydb.insertEntry).not.toHaveBeenCalled();
  });

  it('forwards current/total for uploading_screenshots phase', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({
          kind: 'heads-up',
          phase: 'uploading_screenshots',
          current: 7,
          total: 27,
        }),
      }),
    );
    expect(res.statusCode).toBe(204);
    expect(ydb.upsertHeadsUp).toHaveBeenCalledWith('ABC123', 'uploading_screenshots', {
      current: 7,
      total: 27,
      message: null,
    });
  });

  it('rejects uploading_screenshots without current/total (400)', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ kind: 'heads-up', phase: 'uploading_screenshots' }),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(ydb.upsertHeadsUp).not.toHaveBeenCalled();
  });

  it('rejects unknown phase (400)', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ kind: 'heads-up', phase: 'totally_invented' }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects combined payload + heads-up body (400)', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({
          kind: 'heads-up',
          phase: 'parsing',
          payload: { rawRows: [] },
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('truncates error message to 500 chars', async () => {
    const longMessage = 'x'.repeat(1000);
    await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ kind: 'heads-up', phase: 'error', message: longMessage }),
      }),
    );
    expect(ydb.upsertHeadsUp).toHaveBeenCalledWith(
      'ABC123',
      'error',
      expect.objectContaining({ message: 'x'.repeat(500) }),
    );
  });

  it('legacy push (no kind field) still routes to insertEntry', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'POST',
        path: '/push',
        queryStringParameters: { session: 'ABC123' },
        body: JSON.stringify({ payload: { rawRows: [] }, meta: {} }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(ydb.insertEntry).toHaveBeenCalled();
    expect(ydb.upsertHeadsUp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they FAIL**

```bash
npm run test -w packages/cloud-relay -- --run
```

Expected: FAIL — heads-up tests fail because `push.ts` doesn't yet handle `kind: 'heads-up'`. Existing tests still pass.

- [ ] **Step 3: Implement heads-up branch in `packages/cloud-relay/src/routes/push.ts`**

Replace the existing imports and `PushBody` interface and `push` export. Full replacement file content:

```ts
/**
 * POST /push — extension publishes a queue entry OR a heads-up signal.
 *
 * Discriminator: `body.kind === 'heads-up'` routes to UPSERT into
 * `session_heads_up` (lightweight progress signal). Otherwise the existing
 * payload path runs unchanged.
 *
 * The heads-up branch is fire-and-forget from the extension's perspective —
 * it returns 204 No Content even on validation success, no entryId.
 */

import type { HeadsUpPhase, QueueEntry, QueueEntryMeta, QueueEntryPayload, Route } from '../types';
import { getStatus, insertEntry, upsertHeadsUp } from '../ydb';
import { parseBody } from './_util';

const MAX_DATA_PAYLOAD_SIZE = 5 * 1024 * 1024;
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HEADS_UP_MESSAGE_LEN = 500;

const HEADS_UP_PHASES: ReadonlyArray<HeadsUpPhase> = [
  'parsing',
  'uploading_json',
  'uploading_screenshots',
  'finalizing',
  'error',
];

interface PushBody {
  payload?: QueueEntryPayload;
  meta?: QueueEntryMeta;
  kind?: 'heads-up';
  phase?: HeadsUpPhase;
  current?: number;
  total?: number;
  message?: string;
}

function generateEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function measureDataSize(payload: QueueEntryPayload): number {
  let size = 0;
  if (payload.feedCards) size += JSON.stringify(payload.feedCards).length;
  if (payload.rawRows) size += JSON.stringify(payload.rawRows).length;
  if (payload.wizards) size += JSON.stringify(payload.wizards).length;
  if (payload.productCard) size += JSON.stringify(payload.productCard).length;
  return size;
}

function isHeadsUpPhase(value: unknown): value is HeadsUpPhase {
  return typeof value === 'string' && (HEADS_UP_PHASES as ReadonlyArray<string>).includes(value);
}

export const push: Route = async (event, sessionId) => {
  const body = parseBody<PushBody>(event);
  if (!body) {
    return { statusCode: 400, body: { error: 'Missing body' } };
  }

  // Heads-up branch — discriminated by `kind` field.
  if (body.kind === 'heads-up') {
    if (body.payload != null) {
      return {
        statusCode: 400,
        body: { error: 'Combined payload and heads-up not allowed in single request' },
      };
    }
    if (!isHeadsUpPhase(body.phase)) {
      return { statusCode: 400, body: { error: 'Invalid or missing heads-up phase' } };
    }
    if (body.phase === 'uploading_screenshots') {
      if (typeof body.current !== 'number' || typeof body.total !== 'number') {
        return {
          statusCode: 400,
          body: { error: 'uploading_screenshots requires current and total (numbers)' },
        };
      }
    }
    if (body.phase === 'error' && typeof body.message !== 'string') {
      return { statusCode: 400, body: { error: 'error phase requires a message string' } };
    }
    await upsertHeadsUp(sessionId, body.phase, {
      current: typeof body.current === 'number' ? body.current : null,
      total: typeof body.total === 'number' ? body.total : null,
      message:
        typeof body.message === 'string' ? body.message.slice(0, MAX_HEADS_UP_MESSAGE_LEN) : null,
    });
    return { statusCode: 204 };
  }

  // ── Payload branch (unchanged from prior behaviour) ────────────────────────
  if (!body.payload) {
    return { statusCode: 400, body: { error: 'Missing payload' } };
  }

  const payload = body.payload;
  const meta = body.meta ?? {};

  if (payload.screenshots) {
    console.warn('[push] dropping screenshots (Phase 2 feature)');
    delete payload.screenshots;
    delete (payload as { screenshotMeta?: unknown }).screenshotMeta;
  }

  let dataSize = 0;
  try {
    dataSize = measureDataSize(payload);
  } catch (err) {
    console.warn(
      '[push] payload size check failed, allowing through:',
      err instanceof Error ? err.message : err,
    );
  }

  if (dataSize > MAX_DATA_PAYLOAD_SIZE) {
    console.warn(`[push] rejected: payload too large (${(dataSize / 1024 / 1024).toFixed(2)}MB)`);
    return {
      statusCode: 413,
      body: {
        error: 'Payload too large',
        maxSizeMB: MAX_DATA_PAYLOAD_SIZE / 1024 / 1024,
        actualSizeMB: +(dataSize / 1024 / 1024).toFixed(2),
      },
    };
  }

  const now = new Date();
  const entryId = generateEntryId();
  const entry: QueueEntry = {
    sessionId,
    entryId,
    payload,
    meta,
    pushedAt: now,
    acknowledged: false,
    lastPeekedAt: null,
    expiresAt: new Date(now.getTime() + ENTRY_TTL_MS),
  };

  await insertEntry(entry);
  const status = await getStatus(sessionId);

  return {
    statusCode: 200,
    body: {
      success: true,
      queueSize: status.queueSize,
      entryId,
    },
  };
};
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
npm run test -w packages/cloud-relay -- --run
```

Expected: PASS — all heads-up branch tests + existing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cloud-relay/src/routes/push.ts packages/cloud-relay/tests/handler.test.ts
git commit -m "feat(cloud-relay): route POST /push heads-up to UPSERT, keep payload path intact"
```

---

### Task 4: `GET /status` — embed `headsUp` in response

**Files:**

- Modify: `packages/cloud-relay/src/routes/status.ts`
- Modify: `packages/cloud-relay/tests/handler.test.ts`

- [ ] **Step 1: Add failing test for `headsUp` in /status response**

Append in the same `describe('POST /push — heads-up branch', ...)` block in `handler.test.ts`, OR add a new `describe`:

```ts
describe('GET /status — headsUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns headsUp:null when getHeadsUp returns null', async () => {
    (ydb.getHeadsUp as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/status',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.headsUp).toBeNull();
  });

  it('returns serialized headsUp when present', async () => {
    const ts = new Date('2026-04-26T12:00:00Z');
    (ydb.getHeadsUp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessionId: 'ABC123',
      phase: 'uploading_screenshots',
      current: 7,
      total: 27,
      message: null,
      ts,
      expiresAt: new Date(ts.getTime() + 30000),
    });
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/status',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body || '{}');
    expect(body.headsUp).toEqual({
      phase: 'uploading_screenshots',
      current: 7,
      total: 27,
      ts: ts.getTime(),
    });
  });

  it('omits null fields from serialized headsUp', async () => {
    const ts = new Date('2026-04-26T12:00:00Z');
    (ydb.getHeadsUp as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      sessionId: 'ABC123',
      phase: 'parsing',
      current: null,
      total: null,
      message: null,
      ts,
      expiresAt: new Date(ts.getTime() + 30000),
    });
    const res = await handler(
      makeEvent({
        httpMethod: 'GET',
        path: '/status',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    const body = JSON.parse(res.body || '{}');
    expect(body.headsUp).toEqual({ phase: 'parsing', ts: ts.getTime() });
    expect(body.headsUp).not.toHaveProperty('current');
    expect(body.headsUp).not.toHaveProperty('total');
    expect(body.headsUp).not.toHaveProperty('message');
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL**

```bash
npm run test -w packages/cloud-relay -- --run
```

Expected: FAIL — `headsUp` field doesn't exist in /status response yet.

- [ ] **Step 3: Update `packages/cloud-relay/src/routes/status.ts`**

Replace entire file contents:

```ts
/**
 * GET /status — lightweight snapshot of the session queue + heads-up state.
 *
 * Embeds:
 *   - `firstEntry` preview when there's a pending payload (existing).
 *   - `headsUp` when the extension has signalled a recent in-flight phase
 *     via POST /push?kind=heads-up. Plugin uses this to render the
 *     `incoming` AppState narrative without a separate poll.
 */

import type { HeadsUpState, HeadsUpStatePayload, QueueEntry, Route } from '../types';
import { CLOUD_RELAY_VERSION } from '../version';
import { getHeadsUp, getStatus } from '../ydb';

interface FirstEntryPreview {
  id: string;
  itemCount: number;
  pushedAt: string;
  query: string;
}

function previewEntry(entry: QueueEntry): FirstEntryPreview {
  const { payload } = entry;
  const isFeed = payload.sourceType === 'feed';
  const itemCount = isFeed ? (payload.feedCards?.length ?? 0) : (payload.rawRows?.length ?? 0);
  const query = isFeed ? '' : (payload.rawRows?.[0]?.['#query'] ?? '');
  return {
    id: entry.entryId,
    itemCount,
    pushedAt: entry.pushedAt.toISOString(),
    query,
  };
}

function previewHeadsUp(state: HeadsUpState | null): HeadsUpStatePayload | null {
  if (!state) return null;
  const result: HeadsUpStatePayload = { phase: state.phase, ts: state.ts.getTime() };
  if (state.current != null) result.current = state.current;
  if (state.total != null) result.total = state.total;
  if (state.message != null) result.message = state.message;
  return result;
}

export const status: Route = async (_event, sessionId) => {
  const [snapshot, headsUp] = await Promise.all([getStatus(sessionId), getHeadsUp(sessionId)]);

  return {
    statusCode: 200,
    body: {
      version: CLOUD_RELAY_VERSION,
      queueSize: snapshot.queueSize,
      pendingCount: snapshot.pendingCount,
      hasData: snapshot.pendingCount > 0,
      firstEntry: snapshot.firstEntry ? previewEntry(snapshot.firstEntry) : null,
      headsUp: previewHeadsUp(headsUp),
    },
  };
};
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
npm run test -w packages/cloud-relay -- --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cloud-relay/src/routes/status.ts packages/cloud-relay/tests/handler.test.ts
git commit -m "feat(cloud-relay): include headsUp snapshot in /status response"
```

---

### Task 5: `DELETE /clear` — also wipe `session_heads_up`

**Files:**

- Modify: `packages/cloud-relay/src/routes/clear.ts`
- Modify: `packages/cloud-relay/tests/handler.test.ts`

- [ ] **Step 1: Add failing test**

Append to `handler.test.ts`:

```ts
describe('DELETE /clear — heads-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears both queue and heads-up', async () => {
    const res = await handler(
      makeEvent({
        httpMethod: 'DELETE',
        path: '/clear',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(ydb.clearSession).toHaveBeenCalledWith('ABC123');
    expect(ydb.clearHeadsUp).toHaveBeenCalledWith('ABC123');
  });

  it('returns cleared count from queue (heads-up does not change count)', async () => {
    (ydb.clearSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cleared: 3 });
    const res = await handler(
      makeEvent({
        httpMethod: 'DELETE',
        path: '/clear',
        queryStringParameters: { session: 'ABC123' },
      }),
    );
    const body = JSON.parse(res.body || '{}');
    expect(body.cleared).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL**

```bash
npm run test -w packages/cloud-relay -- --run
```

Expected: FAIL — `clearHeadsUp` not yet called from route.

- [ ] **Step 3: Update `packages/cloud-relay/src/routes/clear.ts`**

Replace entire file:

```ts
/**
 * DELETE /clear — wipe queue entries AND any active heads-up for the session.
 *
 * Used when the user explicitly resets their session ("Clear Queue" or
 * "Cancel" in the incoming-state UI), or when the extension detects corrupt
 * state. Returns the count of queue rows that were removed (heads-up rows
 * are not counted — at most one per session).
 */

import type { Route } from '../types';
import { clearHeadsUp, clearSession } from '../ydb';

export const clear: Route = async (_event, sessionId) => {
  const [{ cleared }] = await Promise.all([clearSession(sessionId), clearHeadsUp(sessionId)]);

  return {
    statusCode: 200,
    body: {
      success: true,
      cleared,
    },
  };
};
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
npm run test -w packages/cloud-relay -- --run
```

Expected: PASS.

- [ ] **Step 5: Run full verify before commit**

```bash
npm run typecheck -w packages/cloud-relay && npm run test -w packages/cloud-relay -- --run
```

Expected: PASS on both.

- [ ] **Step 6: Commit**

```bash
git add packages/cloud-relay/src/routes/clear.ts packages/cloud-relay/tests/handler.test.ts
git commit -m "feat(cloud-relay): DELETE /clear also wipes session_heads_up"
```

---

## Phase 2 — Plugin (Tasks 6–10)

### Task 6: Add `'incoming'` to `AppState`

**Files:**

- Modify: `packages/plugin/src/types.ts`

- [ ] **Step 1: Edit `packages/plugin/src/types.ts` line 291–298**

Find:

```ts
export type AppState =
  | 'setup'
  | 'checking'
  | 'ready'
  | 'confirming'
  | 'processing'
  | 'success'
  | 'error';
```

Replace with:

```ts
export type AppState =
  | 'setup'
  | 'checking'
  | 'ready'
  | 'incoming' // heads-up active, payload not yet arrived
  | 'confirming'
  | 'processing'
  | 'success'
  | 'error';
```

Also update the JSDoc just above (line ~280–290) to mention `incoming`. Find the comment block:

```ts
/**
 * Application states for the FSM.
 * - 'setup': initial setup flow
 * - 'checking': проверка подключения к relay
 * - 'ready': готов к работе (независимо от relay)
 * - 'confirming': показываем диалог подтверждения импорта
 * - 'processing': обработка данных
 * - 'success': импорт успешно завершён
 */
```

Replace with:

```ts
/**
 * Application states for the FSM.
 * - 'setup': initial setup flow
 * - 'checking': проверка подключения к relay
 * - 'ready': готов к работе (независимо от relay)
 * - 'incoming': расширение шлёт heads-up, payload ещё не пришёл
 * - 'confirming': показываем диалог подтверждения импорта
 * - 'processing': обработка данных
 * - 'success': импорт успешно завершён
 */
```

- [ ] **Step 2: Run typecheck — expect compile errors at switch sites**

```bash
npm run typecheck -w packages/plugin
```

Expected: FAIL — TypeScript narrowing in `ui.tsx`'s `compactStripMode` ternary is exhaustive on `AppState`, so the new variant must be handled. We address this in Task 10 (ui.tsx wiring). For now, accept that typecheck will fail until Task 10 lands.

> If the noise is unacceptable, add a temporary `// @ts-expect-error new state, wired in Task 10` near the failing switch — but Task 10 follows immediately, so prefer to chain.

- [ ] **Step 3: Commit (typecheck failure is expected and noted in commit message)**

```bash
git add packages/plugin/src/types.ts
git commit -m "feat(plugin): add 'incoming' to AppState (wiring follows in subsequent commits)"
```

---

### Task 7: `formatHeadsUpPhase` utility

**Files:**

- Create: `packages/plugin/src/ui/utils/heads-up-messages.ts`
- Create: `packages/plugin/tests/ui/heads-up-messages.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin/tests/ui/heads-up-messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatHeadsUpPhase } from '../../src/ui/utils/heads-up-messages';

describe('formatHeadsUpPhase', () => {
  it('parsing → "Расширение собирает данные…"', () => {
    expect(formatHeadsUpPhase({ phase: 'parsing', ts: 0 })).toBe('Расширение собирает данные…');
  });

  it('uploading_json → "Загружаем структуру…"', () => {
    expect(formatHeadsUpPhase({ phase: 'uploading_json', ts: 0 })).toBe('Загружаем структуру…');
  });

  it('uploading_screenshots formats current/total', () => {
    expect(
      formatHeadsUpPhase({ phase: 'uploading_screenshots', current: 7, total: 27, ts: 0 }),
    ).toBe('Грузим скриншоты 7/27…');
  });

  it('uploading_screenshots without current/total falls back to generic', () => {
    expect(formatHeadsUpPhase({ phase: 'uploading_screenshots', ts: 0 })).toBe('Грузим скриншоты…');
  });

  it('finalizing → "Завершаем загрузку…"', () => {
    expect(formatHeadsUpPhase({ phase: 'finalizing', ts: 0 })).toBe('Завершаем загрузку…');
  });

  it('error returns the message field', () => {
    expect(formatHeadsUpPhase({ phase: 'error', message: 'Сеть упала', ts: 0 })).toBe('Сеть упала');
  });

  it('error without message returns generic fallback', () => {
    expect(formatHeadsUpPhase({ phase: 'error', ts: 0 })).toBe('Ошибка расширения');
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL**

```bash
npm run test -w packages/plugin -- heads-up-messages
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement utility**

Create `packages/plugin/src/ui/utils/heads-up-messages.ts`:

```ts
/**
 * Heads-up phase → user-facing Russian narrative string.
 *
 * Used by the plugin's CompactStrip when AppState='incoming' to render the
 * extension's reported phase as a sentence. Pure formatter, no side effects.
 */

export type HeadsUpPhase =
  | 'parsing'
  | 'uploading_json'
  | 'uploading_screenshots'
  | 'finalizing'
  | 'error';

export interface HeadsUpStatePayload {
  phase: HeadsUpPhase;
  current?: number;
  total?: number;
  message?: string;
  ts: number;
}

export function formatHeadsUpPhase(state: HeadsUpStatePayload): string {
  switch (state.phase) {
    case 'parsing':
      return 'Расширение собирает данные…';
    case 'uploading_json':
      return 'Загружаем структуру…';
    case 'uploading_screenshots':
      if (typeof state.current === 'number' && typeof state.total === 'number') {
        return `Грузим скриншоты ${state.current}/${state.total}…`;
      }
      return 'Грузим скриншоты…';
    case 'finalizing':
      return 'Завершаем загрузку…';
    case 'error':
      return state.message && state.message.trim() ? state.message : 'Ошибка расширения';
    default:
      return 'Получаем данные…';
  }
}
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
npm run test -w packages/plugin -- heads-up-messages
```

Expected: PASS — all 7 cases.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin/src/ui/utils/heads-up-messages.ts packages/plugin/tests/ui/heads-up-messages.test.ts
git commit -m "feat(plugin): add formatHeadsUpPhase utility for incoming state narrative"
```

---

### Task 8: `useRelayConnection` — read `headsUp`, watchdog, callback

**Files:**

- Modify: `packages/plugin/src/ui/hooks/useRelayConnection.ts`
- Create: `packages/plugin/tests/ui/use-relay-connection.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin/tests/ui/use-relay-connection.test.ts`:

```ts
/**
 * useRelayConnection — heads-up flow tests.
 *
 * Mocks fetch globally and asserts the hook's callback contract: heads-up
 * present in /status response triggers onIncoming, watchdog after 10s of
 * stale ts triggers onIncomingExpired, error phase triggers onIncomingError.
 */

/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRelayConnection } from '../../src/ui/hooks/useRelayConnection';

const RELAY_URL = 'https://relay.test';
const SESSION = 'ABC123';

function statusResponse(extra: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      version: '1.0.0',
      queueSize: 0,
      pendingCount: 0,
      hasData: false,
      firstEntry: null,
      headsUp: null,
      ...extra,
    }),
  };
}

describe('useRelayConnection — heads-up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires onIncoming when /status returns headsUp', async () => {
    const onIncoming = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      statusResponse({
        headsUp: { phase: 'parsing', ts: Date.now() },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      useRelayConnection({
        relayUrl: RELAY_URL,
        sessionCode: SESSION,
        enabled: true,
        onDataReceived: vi.fn(),
        onConnectionChange: vi.fn(),
        onIncoming,
      }),
    );

    // Allow initial probe
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onIncoming).toHaveBeenCalledWith(expect.objectContaining({ phase: 'parsing' }));
  });

  it('fires onIncomingError when phase is "error"', async () => {
    const onIncomingError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        statusResponse({
          headsUp: { phase: 'error', message: 'Сеть упала', ts: Date.now() },
        }),
      ),
    );

    renderHook(() =>
      useRelayConnection({
        relayUrl: RELAY_URL,
        sessionCode: SESSION,
        enabled: true,
        onDataReceived: vi.fn(),
        onConnectionChange: vi.fn(),
        onIncomingError,
      }),
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onIncomingError).toHaveBeenCalledWith('Сеть упала');
  });

  it('fires onIncomingExpired when headsUp.ts is older than 10s', async () => {
    const onIncomingExpired = vi.fn();
    const stale = Date.now() - 11_000;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        statusResponse({
          headsUp: { phase: 'parsing', ts: stale },
        }),
      ),
    );

    renderHook(() =>
      useRelayConnection({
        relayUrl: RELAY_URL,
        sessionCode: SESSION,
        enabled: true,
        onDataReceived: vi.fn(),
        onConnectionChange: vi.fn(),
        onIncomingExpired,
      }),
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onIncomingExpired).toHaveBeenCalled();
  });

  it('payload (hasData=true) wins over headsUp (incoming-state skipped)', async () => {
    const onDataReceived = vi.fn();
    const onIncoming = vi.fn();
    // First /status: hasData=true with headsUp also present → /peek then /ack flow
    const fetchMock = vi
      .fn()
      // /status
      .mockResolvedValueOnce(
        statusResponse({
          hasData: true,
          pendingCount: 1,
          firstEntry: {
            id: 'e1',
            itemCount: 1,
            pushedAt: new Date().toISOString(),
            query: 'q',
          },
          headsUp: { phase: 'parsing', ts: Date.now() },
        }),
      )
      // /peek
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hasData: true,
          entryId: 'e1',
          payload: { rawRows: [{ '#OrganicTitle': 'x' }] },
          meta: { extensionVersion: '3.1.2' },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() =>
      useRelayConnection({
        relayUrl: RELAY_URL,
        sessionCode: SESSION,
        enabled: true,
        onDataReceived,
        onConnectionChange: vi.fn(),
        onIncoming,
      }),
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(onDataReceived).toHaveBeenCalled();
    expect(onIncoming).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL**

```bash
npm run test -w packages/plugin -- use-relay-connection
```

Expected: FAIL — `onIncoming` / `onIncomingError` / `onIncomingExpired` callbacks don't yet exist on the hook.

- [ ] **Step 3: Update `packages/plugin/src/ui/hooks/useRelayConnection.ts`**

Add to the imports / interfaces near the top:

```ts
import type { HeadsUpStatePayload } from '../utils/heads-up-messages';
```

Extend `UseRelayConnectionOptions`:

```ts
export interface UseRelayConnectionOptions {
  relayUrl: string;
  sessionCode: string | null;
  enabled: boolean;
  onDataReceived: (data: RelayDataEvent) => void;
  onConnectionChange: (connected: boolean) => void;
  onPaired?: () => void;
  onTiming?: (message: string) => void;
  /** Heads-up arrived (extension is mid-flight). Plugin transitions to incoming. */
  onIncoming?: (state: HeadsUpStatePayload) => void;
  /** Heads-up phase=='error' — extension reported a hard failure. */
  onIncomingError?: (message: string) => void;
  /** Watchdog: heads-up.ts older than 10s while we're in incoming. Plugin returns to ready. */
  onIncomingExpired?: () => void;
}
```

Watchdog threshold constant near other constants:

```ts
const HEADS_UP_STALE_MS = 10_000;
```

Inside the hook body, add a stable ref for the last incoming ts:

```ts
const onIncomingRef = useRef(onIncoming);
onIncomingRef.current = onIncoming;
const onIncomingErrorRef = useRef(onIncomingError);
onIncomingErrorRef.current = onIncomingError;
const onIncomingExpiredRef = useRef(onIncomingExpired);
onIncomingExpiredRef.current = onIncomingExpired;
const lastHeadsUpTsRef = useRef<number>(0);
```

Modify `checkRelay` to inspect the `headsUp` field of the /status response. Find:

```ts
const data = await response.json();

if (data.version) {
  setRelayVersion(data.version);
}

const hasPendingData = data.hasData || data.pendingCount > 0 || data.queueSize > 0;

if (hasPendingData) {
  await peekRelayData();
  return 'connected-with-data';
}

return 'connected';
```

Replace with:

```ts
const data = await response.json();

if (data.version) {
  setRelayVersion(data.version);
}

const hasPendingData = data.hasData || data.pendingCount > 0 || data.queueSize > 0;

if (hasPendingData) {
  // Payload wins over heads-up — let the existing peek path drive confirming.
  await peekRelayData();
  return 'connected-with-data';
}

// No payload — surface heads-up if the extension reported one.
const headsUp = data.headsUp as HeadsUpStatePayload | null | undefined;
if (headsUp) {
  if (Date.now() - headsUp.ts > HEADS_UP_STALE_MS) {
    // Stale signal — only reset to ready if we previously surfaced something.
    if (lastHeadsUpTsRef.current !== 0) {
      lastHeadsUpTsRef.current = 0;
      onIncomingExpiredRef.current?.();
    }
  } else if (headsUp.phase === 'error') {
    lastHeadsUpTsRef.current = 0;
    onIncomingErrorRef.current?.(headsUp.message ?? 'Ошибка расширения');
  } else {
    lastHeadsUpTsRef.current = headsUp.ts;
    onIncomingRef.current?.(headsUp);
  }
} else if (lastHeadsUpTsRef.current !== 0) {
  // /status no longer reports heads-up (TTL'd) — snap out of incoming.
  lastHeadsUpTsRef.current = 0;
  onIncomingExpiredRef.current?.();
}

return 'connected';
```

- [ ] **Step 4: Run tests to verify PASS**

```bash
npm run test -w packages/plugin -- use-relay-connection
```

Expected: PASS — all 4 cases.

- [ ] **Step 5: Run full plugin tests to confirm no regression**

```bash
npm run test -w packages/plugin -- --run
```

Expected: PASS — existing tests untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin/src/ui/hooks/useRelayConnection.ts packages/plugin/tests/ui/use-relay-connection.test.ts
git commit -m "feat(plugin): useRelayConnection emits incoming/error/expired callbacks from /status headsUp"
```

---

### Task 9: `CompactStrip` — `'incoming'` mode + Cancel link + CSS

**Files:**

- Modify: `packages/plugin/src/ui/components/CompactStrip.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

- [ ] **Step 1: Extend `CompactStripMode` union and props**

In `packages/plugin/src/ui/components/CompactStrip.tsx`, find:

```ts
export type CompactStripMode = 'checking' | 'ready' | 'processing' | 'success' | 'error';
```

Replace with:

```ts
export type CompactStripMode =
  | 'checking'
  | 'ready'
  | 'incoming'
  | 'processing'
  | 'success'
  | 'error';
```

Find `CompactStripProps` interface and add at the bottom (before closing brace):

```ts
  /** Heads-up narrative shown in 'incoming' mode (e.g., "Грузим скриншоты 7/27…") */
  incomingMessage?: string;
  /** Cancel handler for 'incoming' mode — clears queue and returns to ready. */
  onCancelIncoming?: () => void;
```

Add the prop to the destructured component signature:

```tsx
export const CompactStrip: React.FC<CompactStripProps> = memo(
  ({
    mode,
    connected,
    current,
    total,
    count,
    duration,
    errorMessage,
    processingMessage,
    incomingMessage,
    onCancelIncoming,
    lastQuery,
    lastImportCount,
    lastImportTime,
    hasPendingData,
    hasSelection,
    platform,
    baseHeight = STRIP_HEIGHT,
    onRequestResize,
    onMenuAction,
  }) => {
```

- [ ] **Step 2: Extend status icon switch**

Find the `switch (mode)` block that builds `statusIcon` (~line 256). Add a case for `incoming` BEFORE `case 'processing':`:

```tsx
case 'incoming':
  statusIcon = <div className="compact-strip__spinner compact-strip__spinner--incoming" />;
  break;
```

- [ ] **Step 3: Extend status text switch**

Find the second `switch (mode)` that builds `statusText`. Add case BEFORE `case 'processing':`:

```tsx
case 'incoming':
  statusText = incomingMessage && incomingMessage.trim()
    ? incomingMessage
    : 'Получаем данные…';
  break;
```

- [ ] **Step 4: Render Cancel link in 'incoming' mode**

Find the JSX section that renders the strip content. After the `<div className="compact-strip__spacer" />` line, just BEFORE the `<button … menu-btn …>` element, insert:

```tsx
{
  mode === 'incoming' && onCancelIncoming && (
    <button
      type="button"
      className="compact-strip__cancel-link"
      onClick={(e) => {
        e.stopPropagation();
        onCancelIncoming();
      }}
      aria-label="Отменить ожидание данных"
    >
      Отменить
    </button>
  );
}
```

- [ ] **Step 5: Add CSS styles**

In `packages/plugin/src/ui/styles.css`, find the existing `.compact-strip__spinner` rule. Add a sibling rule:

```css
.compact-strip__spinner--incoming {
  border-color: var(--figma-color-bg-brand, #0d99ff) transparent transparent transparent;
}
```

Then add at the end of the file's `compact-strip` block:

```css
.compact-strip__cancel-link {
  background: transparent;
  border: 1px solid transparent;
  color: var(--figma-color-text-secondary, #888);
  font-size: 11px;
  padding: 4px 8px;
  margin-right: 4px;
  cursor: pointer;
  border-radius: 4px;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}
.compact-strip__cancel-link:hover:not(:disabled) {
  background-color: var(--figma-color-bg-hover, #f5f5f5);
  color: var(--figma-color-text, #333);
}
```

- [ ] **Step 6: Update global hover exclusion list**

In `packages/plugin/src/ui/styles.css`, find the rule:

```css
button:hover:not(:disabled):not(.btn-primary):not(.btn-secondary):not(.btn-text) {
  background-color: var(--figma-color-bg-hover);
}
```

(The exact `:not()` chain may differ — match the actual rule.) Add `:not(.compact-strip__cancel-link)`:

```css
button:hover:not(:disabled):not(.btn-primary):not(.btn-secondary):not(.btn-text):not(
    .compact-strip__cancel-link
  ) {
  background-color: var(--figma-color-bg-hover, #f5f5f5);
}
```

- [ ] **Step 7: Verify CSS variable fallback compliance**

```bash
grep -n 'var(--figma-color-[^,)]*)' packages/plugin/src/ui/styles.css | grep -v ',' | head
```

Expected: returns 0 lines (every `var(--figma-color-*)` has a fallback).

- [ ] **Step 8: Build to confirm no TypeScript errors**

```bash
npm run typecheck -w packages/plugin
```

Expected: still failing on the AppState narrowing in `ui.tsx` (Task 10 fixes), but the new CompactStrip changes compile.

- [ ] **Step 9: Commit**

```bash
git add packages/plugin/src/ui/components/CompactStrip.tsx packages/plugin/src/ui/styles.css
git commit -m "feat(plugin): CompactStrip 'incoming' mode with Cancel link"
```

---

### Task 10: `ui.tsx` wiring — FSM, handlers, Cancel

**Files:**

- Modify: `packages/plugin/src/ui/ui.tsx`

- [ ] **Step 1: Add state for incoming message**

Near the top of `App` component (after the `progressData` state, ~line 65):

```tsx
const [incomingMessage, setIncomingMessage] = useState<string | undefined>();
```

- [ ] **Step 2: Import the formatter**

Near the other imports at the top of the file:

```tsx
import { formatHeadsUpPhase } from '../utils/heads-up-messages';
import type { HeadsUpStatePayload } from '../utils/heads-up-messages';
```

- [ ] **Step 3: Add heads-up handlers and pass to `useRelayConnection`**

Find the `relay = useRelayConnection({ ... })` call (~line 162). Add these before `onPaired`:

```tsx
onIncoming: useCallback(
  (state: HeadsUpStatePayload) => {
    setIncomingMessage(formatHeadsUpPhase(state));
    setAppState((prev) => {
      // Only enter 'incoming' from 'ready' — avoid clobbering confirming/processing/etc.
      if (prev === 'ready') return 'incoming';
      return prev;
    });
  },
  [],
),
onIncomingError: useCallback((message: string) => {
  setErrorMessage(message);
  setAppState((prev) => (prev === 'incoming' || prev === 'ready' ? 'error' : prev));
  setIncomingMessage(undefined);
}, []),
onIncomingExpired: useCallback(() => {
  setIncomingMessage(undefined);
  setAppState((prev) => (prev === 'incoming' ? 'ready' : prev));
}, []),
```

- [ ] **Step 4: Add `'incoming'` to the compact-states set**

Find:

```tsx
const isCompactState = ['checking', 'ready', 'processing', 'success', 'error'].includes(appState);
```

Replace with:

```tsx
const isCompactState = ['checking', 'ready', 'incoming', 'processing', 'success', 'error'].includes(
  appState,
);
```

- [ ] **Step 5: Update `compactStripMode` ternary**

Find:

```tsx
const compactStripMode =
  appState === 'error'
    ? 'error'
    : appState === 'checking'
      ? 'checking'
      : appState === 'processing'
        ? 'processing'
        : appState === 'success'
          ? 'success'
          : 'ready';
```

Replace with:

```tsx
const compactStripMode =
  appState === 'error'
    ? 'error'
    : appState === 'checking'
      ? 'checking'
      : appState === 'incoming'
        ? 'incoming'
        : appState === 'processing'
          ? 'processing'
          : appState === 'success'
            ? 'success'
            : 'ready';
```

- [ ] **Step 6: Wire `onCancelIncoming`**

Add a handler near the other panel handlers (~line 568):

```tsx
const handleCancelIncoming = useCallback(() => {
  setIncomingMessage(undefined);
  setAppState('ready');
  // Fire-and-forget: clear backend so next /status doesn't re-trigger us.
  void relay.clearQueue();
}, [relay]);
```

- [ ] **Step 7: Pass props to `CompactStrip`**

Find the `<CompactStrip … />` JSX (~line 716). Add `incomingMessage` and `onCancelIncoming`:

```tsx
<CompactStrip
  mode={compactStripMode}
  connected={relayConnected && extensionInstalled}
  current={progressData.current}
  total={progressData.total}
  count={importFlow.lastStats?.processedInstances || importFlow.lastStats?.totalInstances}
  duration={undefined}
  errorMessage={errorMessage}
  processingMessage={progressData.message}
  incomingMessage={incomingMessage}
  onCancelIncoming={handleCancelIncoming}
  lastQuery={importFlow.lastQuery}
  lastImportCount={lastImportCount}
  lastImportTime={lastImportTime}
  hasPendingData={importFlow.pending !== null}
  hasSelection={hasSelection}
  platform={platform}
  baseHeight={compactBaseHeight}
  onRequestResize={handleRequestResize}
  onMenuAction={handleMenuAction}
/>
```

- [ ] **Step 8: Update relay `enabled` to keep polling during incoming**

Find:

```tsx
enabled: !!sessionCode && appState !== 'processing' && appState !== 'confirming',
```

This is correct as-is — `incoming` is allowed (relay must keep polling to surface payload arrival or watchdog tick). No change needed; verify by reading line.

- [ ] **Step 9: Run typecheck to confirm no errors**

```bash
npm run typecheck -w packages/plugin
```

Expected: PASS — all AppState narrowing covered.

- [ ] **Step 10: Run full plugin tests**

```bash
npm run test -w packages/plugin -- --run
```

Expected: PASS.

- [ ] **Step 11: Build to confirm no runtime issues**

```bash
npm run build -w packages/plugin
```

Expected: build succeeds.

- [ ] **Step 12: Commit**

```bash
git add packages/plugin/src/ui/ui.tsx
git commit -m "feat(plugin): wire 'incoming' state — heads-up handlers, Cancel, CompactStrip props"
```

---

## Phase 3 — Extension (Tasks 11–12)

### Task 11: `sendHeadsUp` helper with throttle

**Files:**

- Modify: `packages/extension/src/background.ts`
- Create: `packages/plugin/tests/extension/heads-up-throttle.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin/tests/extension/heads-up-throttle.test.ts`:

```ts
/**
 * Source-contract test for the extension's sendHeadsUp helper.
 *
 * The extension package has no test runner, so we read background.ts as text
 * and assert (a) the helper exists with the expected throttle constant, and
 * (b) handleIconClick contains the required instrumentation calls. This is
 * the same pattern as tests/extension/delivery-badges.test.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const BG_PATH = path.resolve(__dirname, '../../../extension/src/background.ts');

describe('extension/background.ts — heads-up source contract', () => {
  const source = fs.readFileSync(BG_PATH, 'utf8');

  it('declares HEADS_UP_THROTTLE_MS = 200', () => {
    expect(source).toMatch(/HEADS_UP_THROTTLE_MS\s*=\s*200/);
  });

  it('exports / declares sendHeadsUp helper', () => {
    expect(source).toMatch(/function sendHeadsUp\b/);
  });

  it('handleIconClick fires sendHeadsUp("uploading_json") before main fetch', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]uploading_json['"]/);
  });

  it('screenshot loop fires sendHeadsUp("uploading_screenshots", { current, total })', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]uploading_screenshots['"][^)]*current[^)]*total/s);
  });

  it('finalizing heads-up after screenshots', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]finalizing['"]/);
  });

  it('error heads-up in catch block', () => {
    expect(source).toMatch(/sendHeadsUp\(\s*['"]error['"]/);
  });
});
```

- [ ] **Step 2: Run tests to verify FAIL**

```bash
npm run test -w packages/plugin -- heads-up-throttle
```

Expected: FAIL — none of the patterns exist yet.

- [ ] **Step 3: Add helper to `packages/extension/src/background.ts`**

After the existing `buildCloudUrl` function (~line 75), add:

```ts
// === Heads-up signaling ===
//
// Lightweight progress signal sent to relay alongside (and before) the heavy
// payload upload. Plugin polls /status, sees `headsUp` field, renders narrative.
// Fire-and-forget: never blocks main upload, never throws.
//
// Throttling: only the `uploading_screenshots` phase is throttled (it fires per
// screenshot). Other phases are sent immediately. Trailing-edge implementation
// guarantees the final K/M value always lands.

type HeadsUpPhase = 'parsing' | 'uploading_json' | 'uploading_screenshots' | 'finalizing' | 'error';

interface HeadsUpOpts {
  current?: number;
  total?: number;
  message?: string;
}

const HEADS_UP_THROTTLE_MS = 200;
let headsUpLastSentAt = 0;
let headsUpPending: { phase: HeadsUpPhase; opts: HeadsUpOpts } | null = null;
let headsUpTrailingTimer: ReturnType<typeof setTimeout> | null = null;

async function postHeadsUp(
  sessionCode: string,
  phase: HeadsUpPhase,
  opts: HeadsUpOpts,
): Promise<void> {
  try {
    await fetch(buildCloudUrl('/push', sessionCode), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'heads-up', phase, ...opts }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    // Fire-and-forget — log only.
    console.log('[HeadsUp] push failed:', (err as Error).message);
  }
}

async function sendHeadsUp(phase: HeadsUpPhase, opts: HeadsUpOpts = {}): Promise<void> {
  const sessionCode = await getSessionCode();
  if (!sessionCode) return;

  const isProgress = phase === 'uploading_screenshots';
  if (!isProgress) {
    headsUpLastSentAt = Date.now();
    void postHeadsUp(sessionCode, phase, opts);
    return;
  }

  const now = Date.now();
  if (now - headsUpLastSentAt >= HEADS_UP_THROTTLE_MS) {
    headsUpLastSentAt = now;
    void postHeadsUp(sessionCode, phase, opts);
    return;
  }

  // Trailing edge: schedule the latest value to fire after the throttle window.
  headsUpPending = { phase, opts };
  if (headsUpTrailingTimer == null) {
    const delay = HEADS_UP_THROTTLE_MS - (now - headsUpLastSentAt);
    headsUpTrailingTimer = setTimeout(() => {
      headsUpTrailingTimer = null;
      if (headsUpPending) {
        const { phase: p, opts: o } = headsUpPending;
        headsUpPending = null;
        headsUpLastSentAt = Date.now();
        void postHeadsUp(sessionCode, p, o);
      }
    }, delay);
  }
}
```

- [ ] **Step 4: Run tests to verify PASS for helper-existence checks (instrumentation tests still fail)**

```bash
npm run test -w packages/plugin -- heads-up-throttle
```

Expected: 2 of 6 PASS (`HEADS_UP_THROTTLE_MS`, `function sendHeadsUp`); 4 still fail (instrumentation expected in Task 12).

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background.ts packages/plugin/tests/extension/heads-up-throttle.test.ts
git commit -m "feat(extension): add throttled sendHeadsUp helper for /push?kind=heads-up"
```

---

### Task 12: Instrument `handleIconClick` with heads-up calls

**Files:**

- Modify: `packages/extension/src/background.ts`

- [ ] **Step 1: Add `parsing` heads-up at handler start**

In `handleIconClick`, find the line right after the `setBadge('...', '#5865F2');` (loading state, ~line 449). Insert:

```ts
// Fire-and-forget: tell plugin "we're starting" before any heavy work.
void sendHeadsUp('parsing');
```

- [ ] **Step 2: Add `uploading_json` heads-up before main fetch**

Find the existing `try { const res = await fetch(buildCloudUrl('/push', sessionCode), {` block (~line 600). Just BEFORE this `try`:

```ts
// Heads-up: about to upload the structured payload.
void sendHeadsUp('uploading_json');
```

- [ ] **Step 3: Update screenshot capture to emit progress per segment**

Currently `captureFullPage` returns the full set of screenshots after capturing them. Heads-up needs to fire per-segment.

The cleanest way: change `captureFullPage` to accept an `onProgress` callback. Find the function signature (~line 287):

```ts
async function captureFullPage(
  tabId: number,
  platform: string,
  maxContentHeight?: number,
): Promise<ScreenshotResult> {
```

Replace with:

```ts
async function captureFullPage(
  tabId: number,
  platform: string,
  maxContentHeight: number | undefined,
  onSegmentCaptured: (current: number, total: number) => void,
): Promise<ScreenshotResult> {
```

Inside the function, after the segment-0 capture (the line `screenshots.push(await chrome.tabs.captureVisibleTab(...))` near line 354), call:

```ts
// Compute final total for narrative: 1 (segment-0) + remainingCount (capped later)
const projectedTotal =
  1 + Math.min(Math.ceil(Math.max(0, scrollHeight - innerHeight) / innerHeight), MAX_CAPTURES - 1);
onSegmentCaptured(1, projectedTotal);
```

In the `for (let i = 0; i < remainingCount; i++)` loop, after `screenshots.push(...)`:

```ts
onSegmentCaptured(i + 2, 1 + remainingCount);
```

(Recompute the total each call — `remainingCount` is finalized before the loop.)

- [ ] **Step 4: Wire `sendHeadsUp` into the captureFullPage caller**

Find the `try { const result = await captureFullPage(tab.id!, platform, maxContentHeight); … }` block (~line 543). Replace the call:

```ts
const result = await captureFullPage(tab.id!, platform, maxContentHeight, (current, total) => {
  void sendHeadsUp('uploading_screenshots', { current, total });
});
```

- [ ] **Step 5: Add `finalizing` after screenshots, before main fetch**

Just BEFORE the `void sendHeadsUp('uploading_json');` call from Step 2 — wait, that's wrong order. Let me re-think.

Actually order should be: parse → uploading_json (no screenshots phase if no screenshots) → screenshots? No — `uploading_json` happens BEFORE `uploading_screenshots`? In the current flow, JSON + screenshots are bundled in one POST `/push`. Let me re-read…

Looking at the existing flow (line 562 onwards): `payload` is built FIRST including screenshots, then a single POST fires. So:

- `parsing` — at start
- `uploading_screenshots K/M` — during `captureFullPage`
- `uploading_json` — actually the JSON is built and uploaded together with screenshots in one fetch. So `uploading_json` semantically means "now uploading the combined body".
- `finalizing` — after the fetch returns success.

So narrative order: parsing → uploading_screenshots K/M → uploading_json → finalizing.

Adjust Steps 2 and 5: keep `uploading_json` BEFORE the fetch (Step 2), add `finalizing` AFTER `relaySuccess` is determined.

Find (~line 615):

```ts
} catch (relayErr: unknown) {
  console.log('[Relay] Request failed:', (relayErr as Error).message);
}

const pcLabel = !isFeed && productCard ? '+PC' : '';
setBadge(`${itemCount}${pcLabel}`, '#3FB950');
clearBadgeAfter(3000);
```

Just BEFORE the `setBadge`:

```ts
if (relaySuccess) {
  void sendHeadsUp('finalizing');
}
```

- [ ] **Step 6: Add `error` heads-up in the outer catch**

Find the outer `} catch (err: unknown) { console.error('Parse/copy error:', err); …` (~line 644). Add at the start of the catch block:

```ts
void sendHeadsUp('error', { message: (err as Error).message?.slice(0, 200) ?? 'Parse failed' });
```

- [ ] **Step 7: Run source-contract tests**

```bash
npm run test -w packages/plugin -- heads-up-throttle
```

Expected: PASS — all 6 patterns matched.

- [ ] **Step 8: Build extension to confirm no TypeScript errors**

```bash
npm run build -w packages/extension
```

Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add packages/extension/src/background.ts
git commit -m "feat(extension): instrument handleIconClick with heads-up at parse/upload/finalize/error boundaries"
```

---

## Phase 4 — Verification (Task 13)

### Task 13: End-to-end manual test + verify

- [ ] **Step 1: Run full verify pass**

```bash
npm run verify
```

Expected: PASS (typecheck + lint + test + build for all packages).

- [ ] **Step 2: Deploy `session_heads_up` DDL to YDB** (one-time)

```bash
yc ydb yql -e <YDB_ENDPOINT> -d <YDB_DATABASE> -f packages/cloud-relay/schema/heads-up.yql
```

(User has YC creds; this is a manual step. Skip if testing locally with mocks only.)

- [ ] **Step 3: Deploy cloud-relay**

```bash
cd packages/cloud-relay && bash scripts/deploy.sh
```

(Or manual: package zip + `yc serverless function version create`. Pre-existing release process.)

- [ ] **Step 4: Reload extension in Chrome**

`chrome://extensions` → Contentify → Reload. Open Figma plugin → reload (close and reopen).

- [ ] **Step 5: Run a real SERP import**

Open `https://yandex.ru/search/?text=диван%20купить` (~76 snippets). In Figma, with plugin open, click extension toolbar icon.

Verify in plugin:

1. Within ~1.5s of click: CompactStrip shows spinner + "Расширение собирает данные…".
2. Within ~3s: text changes to "Грузим скриншоты K/M…" (incrementing).
3. After all screenshots: text changes to "Загружаем структуру…" then "Завершаем загрузку…".
4. ImportConfirmDialog appears as before; click Confirm.
5. Sandbox apply runs with existing narrative ("Размещаем 23/76…").
6. Success state shows.

- [ ] **Step 6: Verify watchdog fallback**

Open extension's Service Worker DevTools (`chrome://extensions` → Contentify → service worker link). After clicking the toolbar icon to start an import, immediately click "Stop" on the SW. Plugin should fall back to `ready` within 10s with a toast/error.

- [ ] **Step 7: Verify Cancel**

Click extension icon, watch for `incoming` state, click "Отменить" link in CompactStrip. Plugin returns to `ready`. Click extension icon again — fresh import works (queue was cleared).

- [ ] **Step 8: Verify backwards compat**

Temporarily revert just the extension changes (`git stash` extension files only), keep relay+plugin updated. Click toolbar — payload still arrives, plugin shows confirming-dialog as before (no `incoming` narrative). Restore extension changes (`git stash pop`).

- [ ] **Step 9: Move spec to done**

```bash
git mv .claude/specs/in-progress/extension-plugin-progress-indication.md .claude/specs/done/extension-plugin-progress-indication.md
git commit -m "docs: mark extension-plugin-progress-indication spec as done"
```

- [ ] **Step 10: Final summary commit (optional, only if any cleanup needed)**

If any small fixups surfaced during manual testing, address them in a final cleanup commit:

```bash
git add -p   # Review changes interactively
git commit -m "fix: address manual-test findings in heads-up flow"
```

---

## Risks & Open Questions

**Open at plan-write time** (will be resolved as you implement):

1. **YDB auth in tests** — `vi.mock('../src/ydb', ...)` covers everything; no real driver hit. Verified by reading existing handler.test.ts.
2. **`captureFullPage` interface change** — adding the `onSegmentCaptured` callback is a breaking signature change. Only one caller exists in `handleIconClick`; updated in Task 12 Step 4. No other consumers.
3. **`AppState` narrowing in `useImportFlow`** — the hook receives `appState` and may have switch-cases. If `useImportFlow.ts` has exhaustive narrowing, Task 6 may surface compile errors there too. Mitigation: read `useImportFlow.ts` in Task 6 Step 2 before commit; if errors appear, add a no-op case for `'incoming'` (`break;`).
4. **CompactStrip auto-dismiss timer** — currently fires for `success` and `error`. Verify it does NOT fire for `incoming` (no entry for `incoming` in the auto-dismiss `useEffect`). Should be the case since the existing condition is mode-explicit.
5. **Banner heights** — `compactBaseHeight` calculation in `ui.tsx` doesn't include `incoming` adjustments. `incoming` reuses the 56px strip exactly like `ready`, so no change needed.

**Risks already mitigated in design:**

- Cost concerns of long-poll → addressed by short-poll + heads-up architecture (see spec Solution rationale).
- Race between heads-up and payload → addressed by "payload wins" in `useRelayConnection.checkRelay` (Task 8).
- Heads-up visible during processing → blocked by hook's `enabled: appState !== 'processing' && appState !== 'confirming'` flag.
