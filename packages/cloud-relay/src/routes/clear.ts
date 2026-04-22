/**
 * DELETE /clear — wipe every queue entry for the current session.
 *
 * Used when the user explicitly resets their session (plugin "Clear Queue"
 * button) or when the extension detects corrupt state. Returns the count
 * of rows that were removed so the UI can show "Cleared N entries".
 */

import type { Route } from '../types';
import { clearSession } from '../ydb';

export const clear: Route = async (_event, sessionId) => {
  const { cleared } = await clearSession(sessionId);

  return {
    statusCode: 200,
    body: {
      success: true,
      cleared,
    },
  };
};
