/**
 * GET /health — unauthenticated liveness probe.
 *
 * Does NOT require a sessionId and MUST NOT touch YDB. This is what YC's
 * monitoring and our own uptime checks hit; any failure here would cascade
 * to false alarms. Keep it synchronous and cheap.
 */

import type { Route } from '../types';
import { CLOUD_RELAY_VERSION } from '../version';

export const health: Route = async () => ({
  statusCode: 200,
  body: {
    ok: true,
    version: CLOUD_RELAY_VERSION,
    timestamp: Date.now(),
  },
});
