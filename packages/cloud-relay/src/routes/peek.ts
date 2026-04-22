/**
 * GET /peek — non-destructive read of the next pending entry.
 *
 * Contract with the plugin: peek returns the same entry on repeated calls
 * until the client either `/ack`s (delete) or `/reject`s (release) it. We
 * only stamp `last_peeked_at` here as a hint for future observability —
 * the lease logic is on the caller for now.
 */

import type { Route } from '../types';
import { findFirstPending, getStatus, markPeeked } from '../ydb';

export const peek: Route = async (_event, sessionId) => {
  const entry = await findFirstPending(sessionId);

  if (!entry) {
    return {
      statusCode: 200,
      body: { hasData: false, queueSize: 0 },
    };
  }

  await markPeeked(sessionId, entry.entryId);
  const status = await getStatus(sessionId);

  return {
    statusCode: 200,
    body: {
      hasData: true,
      entryId: entry.entryId,
      payload: entry.payload,
      meta: entry.meta,
      pushedAt: entry.pushedAt.toISOString(),
      pendingCount: status.pendingCount,
    },
  };
};
