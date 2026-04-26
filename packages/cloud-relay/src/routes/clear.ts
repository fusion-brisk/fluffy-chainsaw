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
