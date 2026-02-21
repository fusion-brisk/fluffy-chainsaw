/**
 * useClipboardPaste — Clipboard paste handler hook
 *
 * Listens for paste events with contentify-paste data format.
 * Extracts rows from clipboard payload using shared parser.
 */

import { useEffect, useRef } from 'react';
import type { CSVRow } from '../types/csv-fields';
import { extractRowsFromPayload } from '../utils/relay-payload';

export interface ClipboardPasteEvent {
  rows: CSVRow[];
  query: string;
  payload: unknown;
}

export interface UseClipboardPasteOptions {
  /** Only process paste in these states (e.g. 'ready', 'confirming') */
  enabled: boolean;
  /** Called when valid contentify data is pasted */
  onPaste: (data: ClipboardPasteEvent) => void;
}

export function useClipboardPaste({ enabled, onPaste }: UseClipboardPasteOptions): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!enabledRef.current) return;

      const text = e.clipboardData?.getData('text');
      if (!text) return;

      try {
        const data = JSON.parse(text);

        if (data.type !== 'contentify-paste' || !data.payload) return;

        e.preventDefault();

        const payload = data.payload;
        const parsed = extractRowsFromPayload(payload);

        if (parsed.rows.length === 0) return;

        onPasteRef.current({
          rows: parsed.rows,
          query: parsed.query,
          payload,
        });
      } catch {
        // Not JSON or not our format — ignore
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);
}
