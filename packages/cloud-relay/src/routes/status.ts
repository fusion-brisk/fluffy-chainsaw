/**
 * GET /status — lightweight snapshot of the session queue + heads-up state.
 *
 * Embeds:
 *   - `firstEntry` preview when there's a pending payload (existing).
 *   - `headsUp` when the extension has signalled a recent in-flight phase
 *     via POST /push?kind=heads-up. Plugin uses this to render the
 *     `incoming` AppState narrative without a separate poll.
 */

import type { HeadsUpState, HeadsUpStatePayload, QueueEntry, Route } from '../types';
import { CLOUD_RELAY_VERSION } from '../version';
import { getHeadsUp, getStatus } from '../ydb';

interface FirstEntryPreview {
  id: string;
  itemCount: number;
  pushedAt: string;
  query: string;
}

function previewEntry(entry: QueueEntry): FirstEntryPreview {
  const { payload } = entry;
  const isFeed = payload.sourceType === 'feed';
  const itemCount = isFeed ? (payload.feedCards?.length ?? 0) : (payload.rawRows?.length ?? 0);
  const query = isFeed ? '' : (payload.rawRows?.[0]?.['#query'] ?? '');
  return {
    id: entry.entryId,
    itemCount,
    pushedAt: entry.pushedAt.toISOString(),
    query,
  };
}

function previewHeadsUp(state: HeadsUpState | null): HeadsUpStatePayload | null {
  if (!state) return null;
  const result: HeadsUpStatePayload = { phase: state.phase, ts: state.ts.getTime() };
  if (state.current != null) result.current = state.current;
  if (state.total != null) result.total = state.total;
  if (state.message != null) result.message = state.message;
  return result;
}

export const status: Route = async (_event, sessionId) => {
  const [snapshot, headsUp] = await Promise.all([getStatus(sessionId), getHeadsUp(sessionId)]);

  return {
    statusCode: 200,
    body: {
      version: CLOUD_RELAY_VERSION,
      queueSize: snapshot.queueSize,
      pendingCount: snapshot.pendingCount,
      hasData: snapshot.pendingCount > 0,
      firstEntry: snapshot.firstEntry ? previewEntry(snapshot.firstEntry) : null,
      headsUp: previewHeadsUp(headsUp),
    },
  };
};
