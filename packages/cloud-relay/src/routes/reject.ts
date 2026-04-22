/**
 * POST /reject — client refused the peeked entry; put it back in rotation.
 *
 * Clears `last_peeked_at` so the next `/peek` will return the same entry
 * (or surface it ordered correctly by `pushed_at` with its siblings). The
 * row is never deleted by this route — that's `/ack`'s job.
 */

import type { Route } from '../types';
import { getStatus, rejectEntry } from '../ydb';
import { parseBody } from './_util';

interface RejectBody {
  entryId?: string;
}

export const reject: Route = async (event, sessionId) => {
  const body = parseBody<RejectBody>(event);
  if (!body || !body.entryId) {
    return { statusCode: 400, body: { error: 'Missing entryId' } };
  }

  await rejectEntry(sessionId, body.entryId);
  const status = await getStatus(sessionId);

  return {
    statusCode: 200,
    body: {
      success: true,
      queueSize: status.queueSize,
    },
  };
};
