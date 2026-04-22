/**
 * Yandex Cloud Function HTTP entry point.
 *
 * YC invokes `handler(event)` for every HTTP request. This module owns:
 *   - CORS preflight (OPTIONS → 204)
 *   - `/health` (always available, no sessionId)
 *   - session extraction (400 if missing/invalid)
 *   - route dispatch via the ROUTES map
 *   - 404 for unknown paths, 500 for uncaught errors
 *   - consistent CORS headers on every response
 *
 * Each route lives in `src/routes/*.ts` and returns a looser `RouteResult`
 * ({ statusCode, body?: unknown, headers? }). The `cors()` wrapper below
 * serialises `body` into the string-only YC contract.
 */

import { ack } from './routes/ack';
import { clear } from './routes/clear';
import { health } from './routes/health';
import { peek } from './routes/peek';
import { push } from './routes/push';
import { reject } from './routes/reject';
import { status } from './routes/status';
import { extractSessionId } from './session';
import type { Route, YcHttpEvent, YcHttpResponse } from './types';

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface CorsInput {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  isBase64Encoded?: boolean;
}

function cors(res: CorsInput): YcHttpResponse {
  const body = res.body;
  let serializedBody: string | undefined;
  if (body === undefined) {
    // 204 No Content — leave body undefined rather than sending "{}".
    serializedBody = undefined;
  } else if (typeof body === 'string') {
    serializedBody = body;
  } else {
    serializedBody = JSON.stringify(body);
  }

  return {
    statusCode: res.statusCode,
    headers: { ...JSON_HEADERS, ...(res.headers ?? {}) },
    body: serializedBody,
    isBase64Encoded: res.isBase64Encoded,
  };
}

/**
 * Route table — keys are `${METHOD} ${path}`. `/health` is dispatched before
 * session extraction (it has no sessionId) so it is NOT listed here.
 */
const ROUTES: Record<string, Route> = {
  'POST /push': push,
  'GET /peek': peek,
  'POST /ack': ack,
  'POST /reject': reject,
  'GET /status': status,
  'DELETE /clear': clear,
};

export async function handler(event: YcHttpEvent): Promise<YcHttpResponse> {
  if (event.httpMethod === 'OPTIONS') {
    return cors({ statusCode: 204 });
  }

  const path = event.path || '/';

  if (path === '/health') {
    const result = await health(event, '');
    return cors(result);
  }

  const sessionId = extractSessionId(event);
  if (!sessionId) {
    return cors({ statusCode: 400, body: { error: 'Missing or invalid session' } });
  }

  const key = `${event.httpMethod} ${path}`;
  const route = ROUTES[key];
  if (!route) {
    return cors({ statusCode: 404, body: { error: 'Not found' } });
  }

  try {
    const result = await route(event, sessionId);
    return cors(result);
  } catch (err) {
    console.error('[handler]', err);
    return cors({ statusCode: 500, body: { error: 'Internal error' } });
  }
}
