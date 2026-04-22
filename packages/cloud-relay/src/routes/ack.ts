/**
 * POST /ack — client confirms an entry was consumed; delete it from YDB.
 *
 * Idempotent: if the entry is already gone (double-ack, expired, wrong
 * session) we still return 200 with `alreadyRemoved: true` rather than 404,
 * so the client can retry safely.
 */

import type { Route } from '../types';
import { deleteEntry, getStatus } from '../ydb';
import { parseBody } from './_util';

interface AckBody {
  entryId?: string;
}

export const ack: Route = async (event, sessionId) => {
  const body = parseBody<AckBody>(event);
  if (!body || !body.entryId) {
    return { statusCode: 400, body: { error: 'Missing entryId' } };
  }

  const { removed } = await deleteEntry(sessionId, body.entryId);
  const status = await getStatus(sessionId);

  if (!removed) {
    return {
      statusCode: 200,
      body: {
        success: true,
        alreadyRemoved: true,
        queueSize: status.queueSize,
      },
    };
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      queueSize: status.queueSize,
    },
  };
};
