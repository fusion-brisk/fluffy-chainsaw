/**
 * GET /status — lightweight snapshot of the session queue.
 *
 * The plugin polls this on a timer to decide whether to fetch data. We
 * include a compact preview of the first entry (id, itemCount, query) so
 * the UI can surface "Snippets for «query» ready to import" without having
 * to `/peek` and pull the whole payload.
 */

import type { QueueEntry, Route } from '../types';
import { CLOUD_RELAY_VERSION } from '../version';
import { getStatus } from '../ydb';

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

export const status: Route = async (_event, sessionId) => {
  const snapshot = await getStatus(sessionId);

  return {
    statusCode: 200,
    body: {
      version: CLOUD_RELAY_VERSION,
      queueSize: snapshot.queueSize,
      pendingCount: snapshot.pendingCount,
      hasData: snapshot.pendingCount > 0,
      firstEntry: snapshot.firstEntry ? previewEntry(snapshot.firstEntry) : null,
    },
  };
};
