/**
 * Shared types for the cloud relay.
 *
 * Queue-entry types mirror the ones from `packages/relay/src/types.ts` but
 * live here because `packages/relay/` will be deleted in Task 11. After this
 * task we no longer reference the legacy relay package.
 *
 * HTTP event/response types follow the Yandex Cloud Function Node.js runtime
 * contract: handlers receive an event object with `httpMethod`, `path`,
 * `queryStringParameters`, `headers`, `body`, `isBase64Encoded`, and must
 * return an object with `statusCode`, `headers?`, `body?`, `isBase64Encoded?`.
 */

// ─── Queue entry ────────────────────────────────────────────────────────────

export interface QueueEntryPayload {
  rawRows?: Array<Record<string, string>>;
  wizards?: unknown[];
  productCard?: unknown;
  screenshots?: string[];
  capturedAt?: string;
  schemaVersion?: number;
  source?: { url?: string };
  /** 'serp' (default) or 'feed' — determines plugin handler routing. */
  sourceType?: 'serp' | 'feed';
  /** Feed card rows (when sourceType='feed'). Parallel to rawRows for SERP. */
  feedCards?: Array<Record<string, string>>;
  [key: string]: unknown;
}

export interface QueueEntryMeta {
  extensionVersion?: string;
  [key: string]: unknown;
}

export interface QueueEntry {
  sessionId: string;
  entryId: string;
  payload: QueueEntryPayload;
  meta: QueueEntryMeta;
  pushedAt: Date;
  acknowledged: boolean;
  lastPeekedAt: Date | null;
  expiresAt: Date;
}

export interface QueueStatus {
  queueSize: number;
  pendingCount: number;
  firstEntry: QueueEntry | null;
}

// ─── HTTP event / response (YC Function contract) ───────────────────────────

export interface YcHttpEvent {
  httpMethod: string;
  /**
   * When invoked via YC API Gateway with a `{proxy+}` route, `path` is the
   * route template (e.g. `"/{proxy+}"`) and the actual captured segment lives
   * in `params.proxy` or `pathParams.proxy`. For path-based dispatch use
   * `extractRequestPath(event)` from `session.ts` (or inline the same logic).
   */
  path?: string;
  /** Direct-invoke path (plus query). Set by API Gateway. */
  url?: string;
  /** Captured path variables from OpenAPI spec, e.g. `{ proxy: "peek" }`. */
  params?: Record<string, string>;
  /** Same as `params` — some YC SDK snapshots use this name. */
  pathParams?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

export interface YcHttpResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

/**
 * Routes return a looser response than `YcHttpResponse` — `body` can be any
 * plain value (object, string, undefined). The `cors()` wrapper in
 * `handler.ts` normalises it into the string-only YC contract before sending.
 */
export interface RouteResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  isBase64Encoded?: boolean;
}

export type Route = (event: YcHttpEvent, sessionId: string) => Promise<RouteResult>;
