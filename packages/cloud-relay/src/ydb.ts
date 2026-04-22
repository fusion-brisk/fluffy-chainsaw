/**
 * YDB data layer for the cloud relay.
 *
 * One table (`queue_entries`) stores every pushed payload; every row is keyed
 * by `(session_id, entry_id)` and disappears 24h after `expires_at` via the
 * DDL-level TTL defined in `schema/queue.yql`.
 *
 * The module exports a small set of high-level helpers (insert/find/peek/
 * ack/reject/clear/status) that route handlers call directly. Callers deal
 * in plain objects; all YQL/TypedValue plumbing is kept inside this file.
 *
 * Authentication: `getCredentialsFromEnv()` picks up
 * `YDB_METADATA_CREDENTIALS=1` in the YC Function runtime, so the deployed
 * function inherits the service account token automatically. Locally, set
 * `YDB_SERVICE_ACCOUNT_KEY_FILE_CREDENTIALS=/path/to/sa.json` instead.
 */

import { Driver, getCredentialsFromEnv, TypedData, TypedValues, Types, Ydb } from 'ydb-sdk';

import type { QueueEntry, QueueEntryMeta, QueueEntryPayload, QueueStatus } from './types';

export type { QueueEntry, QueueEntryMeta, QueueEntryPayload, QueueStatus };

// ─── Config ─────────────────────────────────────────────────────────────────

const TABLE_NAME = 'queue_entries';
const SESSION_TIMEOUT_MS = 10_000;
const DRIVER_READY_TIMEOUT_MS = 10_000;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// ─── Singleton driver ───────────────────────────────────────────────────────
//
// YC Functions reuse the Node.js process across invocations, so the driver
// stays warm between calls. Creating it lazily keeps cold-start cheap when
// the function is invoked for something that doesn't touch YDB (e.g. /health).

let driverPromise: Promise<Driver> | null = null;

async function createDriver(): Promise<Driver> {
  const endpoint = getRequiredEnv('YDB_ENDPOINT');
  const database = getRequiredEnv('YDB_DATABASE');
  const authService = getCredentialsFromEnv();

  const driver = new Driver({ endpoint, database, authService });

  const ready = await driver.ready(DRIVER_READY_TIMEOUT_MS);
  if (!ready) {
    await driver.destroy().catch(() => undefined);
    throw new Error(`YDB driver not ready after ${DRIVER_READY_TIMEOUT_MS}ms`);
  }

  return driver;
}

export function getDriver(): Promise<Driver> {
  if (!driverPromise) {
    driverPromise = createDriver().catch((err) => {
      // Reset so the next invocation retries from scratch instead of
      // replaying a rejected promise forever.
      driverPromise = null;
      console.error('[ydb] driver init failed:', err);
      throw err;
    });
  }
  return driverPromise;
}

/**
 * Reset the cached driver. Exposed for tests and emergency recovery; normal
 * runtime code does not call this.
 */
export async function destroyDriver(): Promise<void> {
  const current = driverPromise;
  driverPromise = null;
  if (current) {
    try {
      const driver = await current;
      await driver.destroy();
    } catch (err) {
      console.error('[ydb] driver destroy failed:', err);
    }
  }
}

// ─── Row helpers ────────────────────────────────────────────────────────────
//
// Rather than hand-roll value decoding, we defer to `TypedData.createNativeObjects`
// from the SDK. It correctly unwraps Optional columns, returns `Date` for
// Timestamp, and handles nullability — all the things we'd otherwise get
// wrong around `last_peeked_at`.

type YdbRow = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  // ydb-sdk returns Long for 64-bit integers.
  const asLong = value as {
    toNumber?: () => number;
    low?: number;
    high?: number;
  };
  if (typeof asLong.toNumber === 'function') return asLong.toNumber();
  if (typeof asLong.low === 'number' && typeof asLong.high === 'number') {
    return asLong.high * 2 ** 32 + asLong.low;
  }
  return Number(value);
}

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  // Fallback for defensive coding — SDK should already have converted.
  return new Date(toNumber(value));
}

function asOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return asDate(value);
}

function parseJsonColumn(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (err) {
      console.warn('[ydb] failed to parse JSON column:', err);
      return {};
    }
  }
  if (typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

function rowToEntry(row: YdbRow): QueueEntry {
  return {
    sessionId: String(row.session_id ?? ''),
    entryId: String(row.entry_id ?? ''),
    payload: parseJsonColumn(row.payload) as QueueEntryPayload,
    meta: parseJsonColumn(row.meta) as QueueEntryMeta,
    pushedAt: asDate(row.pushed_at),
    acknowledged: Boolean(row.acknowledged),
    lastPeekedAt: asOptionalDate(row.last_peeked_at),
    expiresAt: asDate(row.expires_at),
  };
}

function firstResultRows(result: Ydb.Table.ExecuteQueryResult): YdbRow[] {
  const resultSets = result.resultSets ?? [];
  if (resultSets.length === 0) return [];
  // createNativeObjects returns TypedData instances, which are just objects
  // with string-indexed values. Cast to our plain row type.
  return TypedData.createNativeObjects(resultSets[0]) as unknown as YdbRow[];
}

// ─── Query execution wrapper ────────────────────────────────────────────────

async function execute(
  query: string,
  params: Record<string, Ydb.ITypedValue> = {},
): Promise<Ydb.Table.ExecuteQueryResult> {
  const driver = await getDriver();
  return driver.tableClient.withSession(async (session) => {
    return session.executeQuery(query, params, {
      beginTx: { serializableReadWrite: {} },
      commitTx: true,
    });
  }, SESSION_TIMEOUT_MS);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export async function insertEntry(entry: QueueEntry): Promise<void> {
  const query = `
DECLARE $session_id AS Utf8;
DECLARE $entry_id AS Utf8;
DECLARE $payload AS Json;
DECLARE $meta AS Json;
DECLARE $pushed_at AS Timestamp;
DECLARE $acknowledged AS Bool;
DECLARE $last_peeked_at AS Timestamp?;
DECLARE $expires_at AS Timestamp;

UPSERT INTO ${TABLE_NAME} (
  session_id, entry_id, payload, meta,
  pushed_at, acknowledged, last_peeked_at, expires_at
) VALUES (
  $session_id, $entry_id, $payload, $meta,
  $pushed_at, $acknowledged, $last_peeked_at, $expires_at
);`;

  await execute(query, {
    $session_id: TypedValues.utf8(entry.sessionId),
    $entry_id: TypedValues.utf8(entry.entryId),
    $payload: TypedValues.json(JSON.stringify(entry.payload)),
    $meta: TypedValues.json(JSON.stringify(entry.meta)),
    $pushed_at: TypedValues.timestamp(entry.pushedAt),
    $acknowledged: TypedValues.bool(entry.acknowledged),
    $last_peeked_at:
      entry.lastPeekedAt === null
        ? TypedValues.optionalNull(Types.TIMESTAMP)
        : TypedValues.optional(TypedValues.timestamp(entry.lastPeekedAt)),
    $expires_at: TypedValues.timestamp(entry.expiresAt),
  });
}

/**
 * Return the first `acknowledged = false` entry for the session, ordered by
 * `pushed_at`. Does NOT mutate `last_peeked_at` — call `markPeeked` after.
 */
export async function findFirstPending(sessionId: string): Promise<QueueEntry | null> {
  const query = `
DECLARE $session_id AS Utf8;

SELECT session_id, entry_id, payload, meta,
       pushed_at, acknowledged, last_peeked_at, expires_at
FROM ${TABLE_NAME}
WHERE session_id = $session_id AND acknowledged = false
ORDER BY pushed_at
LIMIT 1;`;

  const result = await execute(query, {
    $session_id: TypedValues.utf8(sessionId),
  });
  const rows = firstResultRows(result);
  if (rows.length === 0) return null;
  return rowToEntry(rows[0]);
}

export async function markPeeked(sessionId: string, entryId: string): Promise<void> {
  const query = `
DECLARE $session_id AS Utf8;
DECLARE $entry_id AS Utf8;
DECLARE $now AS Timestamp;

UPDATE ${TABLE_NAME}
SET last_peeked_at = $now
WHERE session_id = $session_id AND entry_id = $entry_id;`;

  await execute(query, {
    $session_id: TypedValues.utf8(sessionId),
    $entry_id: TypedValues.utf8(entryId),
    $now: TypedValues.timestamp(new Date()),
  });
}

/**
 * Undo a peek — the client rejected the entry and wants it to stay in queue
 * for the next reader. Clears `last_peeked_at`.
 */
export async function rejectEntry(sessionId: string, entryId: string): Promise<void> {
  const query = `
DECLARE $session_id AS Utf8;
DECLARE $entry_id AS Utf8;

UPDATE ${TABLE_NAME}
SET last_peeked_at = NULL
WHERE session_id = $session_id AND entry_id = $entry_id;`;

  await execute(query, {
    $session_id: TypedValues.utf8(sessionId),
    $entry_id: TypedValues.utf8(entryId),
  });
}

/**
 * Idempotent delete — returns `{ removed: false }` when the row doesn't
 * exist (already consumed / expired / wrong session).
 */
export async function deleteEntry(
  sessionId: string,
  entryId: string,
): Promise<{ removed: boolean }> {
  const existsQuery = `
DECLARE $session_id AS Utf8;
DECLARE $entry_id AS Utf8;

SELECT entry_id FROM ${TABLE_NAME}
WHERE session_id = $session_id AND entry_id = $entry_id
LIMIT 1;`;

  const existing = await execute(existsQuery, {
    $session_id: TypedValues.utf8(sessionId),
    $entry_id: TypedValues.utf8(entryId),
  });
  if (firstResultRows(existing).length === 0) {
    return { removed: false };
  }

  const deleteQuery = `
DECLARE $session_id AS Utf8;
DECLARE $entry_id AS Utf8;

DELETE FROM ${TABLE_NAME}
WHERE session_id = $session_id AND entry_id = $entry_id;`;

  await execute(deleteQuery, {
    $session_id: TypedValues.utf8(sessionId),
    $entry_id: TypedValues.utf8(entryId),
  });
  return { removed: true };
}

/**
 * Delete every row for the session. Returns count before deletion so the
 * caller can tell the client how much was cleared.
 */
export async function clearSession(sessionId: string): Promise<{ cleared: number }> {
  const countQuery = `
DECLARE $session_id AS Utf8;

SELECT COUNT(*) AS cnt FROM ${TABLE_NAME}
WHERE session_id = $session_id;`;

  const countResult = await execute(countQuery, {
    $session_id: TypedValues.utf8(sessionId),
  });
  const countRows = firstResultRows(countResult);
  const cleared = countRows.length > 0 ? toNumber(countRows[0].cnt) : 0;

  if (cleared === 0) {
    return { cleared: 0 };
  }

  const deleteQuery = `
DECLARE $session_id AS Utf8;

DELETE FROM ${TABLE_NAME}
WHERE session_id = $session_id;`;

  await execute(deleteQuery, {
    $session_id: TypedValues.utf8(sessionId),
  });
  return { cleared };
}

/**
 * Snapshot the session: total rows, how many are still pending, and the
 * first pending entry (if any). Used by `/status`.
 */
export async function getStatus(sessionId: string): Promise<QueueStatus> {
  const countsQuery = `
DECLARE $session_id AS Utf8;

SELECT
  COUNT(*) AS total,
  COUNT_IF(acknowledged = false) AS pending
FROM ${TABLE_NAME}
WHERE session_id = $session_id;`;

  const countsResult = await execute(countsQuery, {
    $session_id: TypedValues.utf8(sessionId),
  });
  const countsRows = firstResultRows(countsResult);
  const queueSize = countsRows.length > 0 ? toNumber(countsRows[0].total) : 0;
  const pendingCount = countsRows.length > 0 ? toNumber(countsRows[0].pending) : 0;

  const firstEntry = pendingCount > 0 ? await findFirstPending(sessionId) : null;

  return { queueSize, pendingCount, firstEntry };
}
