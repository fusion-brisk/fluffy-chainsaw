/**
 * useRelayConnection — HTTP polling relay connection hook (cloud-only)
 *
 * Cloud Relay (YC Functions) does not support WebSockets, so this hook is
 * polling-only. All requests are scoped to a session via `?session=<code>`.
 *
 * Responsibilities:
 * - Adaptive polling of /status + /peek (active vs idle intervals)
 * - Visibility-change handling (immediate re-check when tab becomes visible)
 * - Non-destructive read (peek) + ack after import
 * - Duplicate entry prevention
 *
 * When `sessionCode` is null the hook reports `connected: false` and issues no
 * requests. All action callbacks remain callable but no-op in that state so
 * callers don't need defensive guards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSVRow } from '../../types/csv-fields';
import type { ParsedRelayData } from '../../utils/relay-payload';
import { extractRowsFromPayload } from '../../utils/relay-payload';

// HTTP Polling intervals
const RELAY_CHECK_INTERVAL_ACTIVE = 1000;
const RELAY_CHECK_INTERVAL_IDLE = 5000;
const ACTIVE_THRESHOLD_MS = 10000;

export interface RelayDataEvent extends ParsedRelayData {
  entryId: string;
  payload: unknown;
  wizardCount: number;
  sourceType?: 'serp' | 'feed';
  feedCards?: Array<Record<string, string>>;
}

export interface UseRelayConnectionOptions {
  /** Base cloud relay URL (no query string). Example: https://<id>.apigw.yandexcloud.net */
  relayUrl: string;
  /** Session code identifying this plugin<->extension pair. Null = not configured yet. */
  sessionCode: string | null;
  /** Set false during processing/confirming/setup to pause polling */
  enabled: boolean;
  /** Called when new data is available from relay */
  onDataReceived: (data: RelayDataEvent) => void;
  /** Called when connection status changes */
  onConnectionChange: (connected: boolean) => void;
}

export interface UseRelayConnectionReturn {
  connected: boolean;
  relayVersion: string | null;
  extensionVersion: string | null;
  ackData: (entryId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  checkNow: () => Promise<void>;
  /** Re-queue last import payload to trigger confirmation dialog again */
  reimport: () => Promise<boolean>;
  /** Temporarily block an entryId from being shown (e.g. after cancel) */
  blockEntry: (entryId: string, durationMs?: number) => void;
}

export function useRelayConnection({
  relayUrl,
  sessionCode,
  enabled,
  onDataReceived,
  onConnectionChange,
}: UseRelayConnectionOptions): UseRelayConnectionReturn {
  const [connected, setConnected] = useState(false);
  const [relayVersion, setRelayVersion] = useState<string | null>(null);
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);

  // Stable refs for callbacks (avoid effect re-runs on every render)
  const onDataReceivedRef = useRef(onDataReceived);
  onDataReceivedRef.current = onDataReceived;
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  // Connection refs
  const isMountedRef = useRef(true);
  const relayCheckIntervalRef = useRef<number | null>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());

  // Entry tracking refs
  const lastProcessedEntryIdRef = useRef<string | null>(null);
  const isAckInProgressRef = useRef(false);
  const pendingEntryIdRef = useRef<string | null>(null);

  // --- Helpers ---

  const updateConnected = useCallback((value: boolean) => {
    setConnected(value);
    onConnectionChangeRef.current(value);
  }, []);

  // Build a session-scoped URL. Assumes `relayUrl` has no existing query string
  // and `sessionCode` is non-null (callers must guard via `sessionCode` check first).
  const buildUrl = useCallback(
    (path: string): string => {
      return `${relayUrl}${path}?session=${encodeURIComponent(sessionCode || '')}`;
    },
    [relayUrl, sessionCode],
  );

  // peekRelayData — non-destructive read from relay queue
  const peekRelayData = useCallback(async () => {
    if (!sessionCode) return;
    if (isAckInProgressRef.current) return;

    try {
      const response = await fetch(buildUrl('/peek'));
      if (!response.ok) return;

      const data = await response.json();
      if (!data.hasData || !data.payload) return;

      const payload = data.payload;
      const entryId: string = data.entryId;

      // Skip already processed or currently pending entries
      if (entryId === lastProcessedEntryIdRef.current) return;
      if (entryId === pendingEntryIdRef.current) return;

      const sourceType = payload.sourceType || 'serp';
      const isFeed = sourceType === 'feed';

      if (isFeed) {
        // Feed pipeline — feedCards instead of rawRows
        const feedCards = payload.feedCards || [];
        if (feedCards.length === 0) return;

        const meta = data.meta as { extensionVersion?: string } | undefined;
        if (meta?.extensionVersion) {
          setExtensionVersion(meta.extensionVersion);
        }

        pendingEntryIdRef.current = entryId;

        onDataReceivedRef.current({
          rows: [] as CSVRow[],
          query: '',
          entryId,
          payload,
          wizardCount: 0,
          sourceType: 'feed',
          feedCards,
        });
        return;
      }

      // SERP pipeline (existing path)
      const parsed = extractRowsFromPayload(payload);
      if (parsed.rows.length === 0) return;

      const wizardCount = payload.wizards?.length || 0;

      const meta = data.meta as { extensionVersion?: string } | undefined;
      if (meta?.extensionVersion) {
        setExtensionVersion(meta.extensionVersion);
      }

      pendingEntryIdRef.current = entryId;

      onDataReceivedRef.current({
        ...parsed,
        entryId,
        payload,
        wizardCount,
      });
    } catch (error) {
      console.error('[Relay:peek] Error:', error);
    }
  }, [buildUrl, sessionCode]);

  // checkRelay — check relay status and peek if data available
  const checkRelay = useCallback(async (): Promise<
    'connected' | 'connected-with-data' | 'disconnected'
  > => {
    if (!sessionCode) return 'disconnected';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(buildUrl('/status'), {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return 'disconnected';

      const data = await response.json();

      if (data.version) {
        setRelayVersion(data.version);
      }

      const hasPendingData = data.hasData || data.pendingCount > 0 || data.queueSize > 0;

      if (hasPendingData) {
        await peekRelayData();
        return 'connected-with-data';
      }

      return 'connected';
    } catch {
      return 'disconnected';
    }
  }, [buildUrl, peekRelayData, sessionCode]);

  // ackData — acknowledge relay data after successful load (with retry)
  const ackData = useCallback(
    async (entryId: string) => {
      if (!sessionCode) return;
      lastProcessedEntryIdRef.current = entryId;
      isAckInProgressRef.current = true;

      const MAX_RETRIES = 3;
      const RETRY_DELAYS = [1000, 2000, 4000];

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(buildUrl('/ack'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryId }),
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            lastProcessedEntryIdRef.current = null;
            isAckInProgressRef.current = false;
            return;
          }
        } catch {
          // retry
        }

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      isAckInProgressRef.current = false;
    },
    [buildUrl, sessionCode],
  );

  // clearQueue — delete all pending entries
  const clearQueue = useCallback(async () => {
    if (!sessionCode) return;
    try {
      await fetch(buildUrl('/clear'), { method: 'DELETE' });
    } catch {
      // ignore
    }
    pendingEntryIdRef.current = null;
    lastProcessedEntryIdRef.current = null;
  }, [buildUrl, sessionCode]);

  // reimport — re-queue last relay payload
  const reimport = useCallback(async (): Promise<boolean> => {
    if (!sessionCode) return false;
    try {
      const res = await fetch(buildUrl('/reimport'), { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }, [buildUrl, sessionCode]);

  // blockEntry — temporarily prevent an entryId from being shown
  const blockEntry = useCallback((entryId: string, durationMs = 10000) => {
    lastProcessedEntryIdRef.current = entryId;
    pendingEntryIdRef.current = null;
    setTimeout(() => {
      if (lastProcessedEntryIdRef.current === entryId) {
        lastProcessedEntryIdRef.current = null;
      }
    }, durationMs);
  }, []);

  // checkNow — manual trigger for retry button
  const checkNow = useCallback(async () => {
    if (!sessionCode) {
      if (isMountedRef.current) updateConnected(false);
      return;
    }
    const result = await checkRelay();
    if (!isMountedRef.current) return;
    updateConnected(result !== 'disconnected');
  }, [checkRelay, sessionCode, updateConnected]);

  // --- Initialization effect ---
  useEffect(() => {
    isMountedRef.current = true;

    if (!sessionCode) {
      // No session → surface disconnected state once so callers render banner/setup.
      updateConnected(false);
      return () => {
        isMountedRef.current = false;
      };
    }

    const doInitialCheck = async () => {
      const result = await checkRelay();
      if (!isMountedRef.current) return;
      updateConnected(result !== 'disconnected');
    };

    doInitialCheck();

    return () => {
      isMountedRef.current = false;
    };
  }, [checkRelay, sessionCode, updateConnected]);

  // --- Polling effect ---
  useEffect(() => {
    if (!enabled) return;
    if (!sessionCode) return;

    const scheduleNextPoll = () => {
      if (!isMountedRef.current) return;

      const timeSinceActivity = Date.now() - lastActivityTimeRef.current;
      const interval =
        timeSinceActivity < ACTIVE_THRESHOLD_MS
          ? RELAY_CHECK_INTERVAL_ACTIVE
          : RELAY_CHECK_INTERVAL_IDLE;

      relayCheckIntervalRef.current = window.setTimeout(async () => {
        relayCheckIntervalRef.current = null;
        if (!isMountedRef.current) return;

        if (document.visibilityState === 'hidden') {
          scheduleNextPoll();
          return;
        }

        const result = await checkRelay();
        if (!isMountedRef.current) return;
        updateConnected(result !== 'disconnected');
        scheduleNextPoll();
      }, interval);
    };

    scheduleNextPoll();

    return () => {
      if (relayCheckIntervalRef.current) {
        clearTimeout(relayCheckIntervalRef.current);
        relayCheckIntervalRef.current = null;
      }
    };
  }, [enabled, sessionCode, checkRelay, updateConnected]);

  // --- Visibility change effect ---
  useEffect(() => {
    if (!enabled) return;
    if (!sessionCode) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !isMountedRef.current) return;

      lastActivityTimeRef.current = Date.now();

      const result = await checkRelay();
      if (!isMountedRef.current) return;
      updateConnected(result !== 'disconnected');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, sessionCode, checkRelay, updateConnected]);

  return {
    connected,
    relayVersion,
    extensionVersion,
    ackData,
    clearQueue,
    checkNow,
    reimport,
    blockEntry,
  };
}
