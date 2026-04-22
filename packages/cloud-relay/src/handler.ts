/**
 * Yandex Cloud Function HTTP entry point.
 *
 * YC invokes `handler(event)` for every HTTP request. This module owns:
 *   - CORS preflight (OPTIONS → 204)
 *   - `/health` (always available, no sessionId)
 *   - session extraction (400 if missing/invalid)
 *   - route dispatch via the ROUTES map (filled in by Task 4)
 *   - 404 for unknown paths, 500 for uncaught errors
 *   - consistent CORS headers on every response
 *
 * The ROUTES map is intentionally empty at this stage — Task 4 adds the
 * push/peek/ack/reject/status/clear route modules and registers them here.
 */

import { extractSessionId } from './session';
import type { Route, YcHttpEvent, YcHttpResponse } from './types';
import { CLOUD_RELAY_VERSION } from './version';

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

async function healthRoute(_event: YcHttpEvent): Promise<YcHttpResponse> {
  return cors({
    statusCode: 200,
    body: {
      ok: true,
      version: CLOUD_RELAY_VERSION,
      timestamp: Date.now(),
    },
  });
}

/**
 * Route table — keys are `${METHOD} ${path}`. Populated by Task 4.
 */
const ROUTES: Record<string, Route> = {};

export async function handler(event: YcHttpEvent): Promise<YcHttpResponse> {
  if (event.httpMethod === 'OPTIONS') {
    return cors({ statusCode: 204 });
  }

  const path = event.path || '/';

  if (path === '/health') {
    return healthRoute(event);
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
    // Routes already return `YcHttpResponse` — wrap it through `cors` so the
    // CORS headers are merged on top regardless of what the route set.
    return cors({
      statusCode: result.statusCode,
      headers: result.headers,
      body: result.body,
      isBase64Encoded: result.isBase64Encoded,
    });
  } catch (err) {
    console.error('[handler]', err);
    return cors({ statusCode: 500, body: { error: 'Internal error' } });
  }
}
