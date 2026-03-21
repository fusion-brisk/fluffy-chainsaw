/**
 * Shared utility for parsing relay/clipboard payloads into CSVRow arrays.
 * Used by useRelayConnection and useClipboardPaste hooks.
 */

import type { CSVRow } from '../types/csv-fields';

export interface ParsedRelayData {
  rows: CSVRow[];
  query: string;
}

/**
 * Extract rows and query from a relay/clipboard payload.
 * Supports schemaVersion 2 (rawRows) and v1 fallback (items._rawCSVRow).
 */
export function extractRowsFromPayload(payload: {
  rawRows?: CSVRow[];
  schemaVersion?: number;
  items?: Array<{ _rawCSVRow?: CSVRow }>;
  source?: { url?: string };
  wizards?: unknown[];
}): ParsedRelayData {
  let rows: CSVRow[] = [];

  if (payload.rawRows && payload.rawRows.length > 0) {
    rows = payload.rawRows;
  } else if (
    payload.schemaVersion !== undefined &&
    payload.schemaVersion < 2 &&
    payload.items &&
    payload.items.length > 0
  ) {
    rows = payload.items
      .map((item) => item._rawCSVRow)
      .filter((row): row is CSVRow => row !== undefined);
  }

  // Extract query from first row or source URL
  let query = rows[0]?.['#query'] || '';
  if (!query && payload.source?.url) {
    try {
      const urlParams = new URL(payload.source.url).searchParams;
      query = urlParams.get('text') || urlParams.get('q') || '';
    } catch {
      // Use empty query
    }
  }

  return { rows, query };
}
