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
import type { HeadsUpStatePayload } from '../utils/heads-up-messages';

// HTTP Polling intervals
const RELAY_CHECK_INTERVAL_ACTIVE = 1000;
const RELAY_CHECK_INTERVAL_IDLE = 5000;
const ACTIVE_THRESHOLD_MS = 10000;

// /status fetch abort — must outlast Yandex Cloud API Gateway cold starts, which
// take 3-5s on first hit after idle. Previously 2000ms, which reliably aborted the
// very first poll and made the plugin look offline during the warmup window.
const STATUS_FETCH_TIMEOUT_MS = 8000;

// Number of consecutive poll failures required before flipping `connected`
// from true → false. Single network blips (Figma iframe losing focus, transient
// gateway 5xx, slow route) shouldn't produce a visible "Relay офлайн" flash
// right after a confirmed successful connection.
const DISCONNECT_CONFIRM_THRESHOLD = 2;

// If headsUp.ts is older than this, the signal is stale and the plugin should
// return to ready state.
const HEADS_UP_STALE_MS = 10_000;

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
  /**
   * Called when the extension confirms the auto-pair URL handshake via a
   * `sourceType: 'pair-ack'` payload. The hook ack-s the entry internally
   * (no import dialog shown).
   */
  onPaired?: () => void;
  /**
   * Timing instrumentation sink. Hook emits one-liner strings prefixed with
   * `[Timing]` describing pipeline latency (relay RTT, etc). Caller can
   * forward them to the Logs panel or console. Optional — no-op if omitted.
   */
  onTiming?: (message: string) => void;
  /** Heads-up arrived (extension is mid-flight). Plugin transitions to incoming. */
  onIncoming?: (state: HeadsUpStatePayload) => void;
  /** Heads-up phase=='error' — extension reported a hard failure. */
  onIncomingError?: (message: string) => void;
  /** Watchdog: heads-up.ts older than 10s while we're in incoming. Plugin returns to ready. */
  onIncomingExpired?: () => void;
}

export interface UseRelayConnectionReturn {
  connected: boolean;
  relayVersion: string | null;
  extensionVersion: string | null;
  ackData: (entryId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  checkNow: () => Promise<void>;
  /** Temporarily block an entryId from being shown (e.g. after cancel) */
  blockEntry: (entryId: string, durationMs?: number) => void;
}

export function useRelayConnection({
  relayUrl,
  sessionCode,
  enabled,
  onDataReceived,
  onConnectionChange,
  onPaired,
  onTiming,
  onIncoming,
  onIncomingError,
  onIncomingExpired,
}: UseRelayConnectionOptions): UseRelayConnectionReturn {
  const [connected, setConnected] = useState(false);
  const [relayVersion, setRelayVersion] = useState<string | null>(null);
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);

  // Stable refs for callbacks (avoid effect re-runs on every render)
  const onDataReceivedRef = useRef(onDataReceived);
  onDataReceivedRef.current = onDataReceived;
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;
  const onPairedRef = useRef(onPaired);
  onPairedRef.current = onPaired;
  const onTimingRef = useRef(onTiming);
  onTimingRef.current = onTiming;
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;
  const onIncomingErrorRef = useRef(onIncomingError);
  onIncomingErrorRef.current = onIncomingError;
  const onIncomingExpiredRef = useRef(onIncomingExpired);
  onIncomingExpiredRef.current = onIncomingExpired;
  const lastHeadsUpTsRef = useRef<number>(0);

  // Connection refs
  const isMountedRef = useRef(true);
  const relayCheckIntervalRef = useRef<number | null>(null);
  const lastActivityTimeRef = useRef<number>(Date.now());
  // Consecutive-failure counter for the connected→disconnected debounce. A
  // single slow poll after a confirmed connection shouldn't flip us to
  // "Relay офлайн". Reset on every successful status probe.
  const consecutiveFailuresRef = useRef(0);

  // Entry tracking refs
  const lastProcessedEntryIdRef = useRef<string | null>(null);
  const isAckInProgressRef = useRef(false);
  const pendingEntryIdRef = useRef<string | null>(null);

  // --- Helpers ---

  // Low-level setter: writes the state as-is. Use `reportProbeResult` for the
  // debounced path so intermittent poll failures don't flash "Relay офлайн".
  const updateConnected = useCallback((value: boolean) => {
    setConnected(value);
    onConnectionChangeRef.current(value);
  }, []);

  // Debounced setter for polling results. Success flips connected=true
  // immediately (user wants the "up" signal fast). Failures need
  // DISCONNECT_CONFIRM_THRESHOLD consecutive hits before flipping to false,
  // which smooths out single cold-start / jitter misses without masking real
  // outages (the next poll is only 1s away in active mode).
  const reportProbeResult = useCallback(
    (isConnected: boolean) => {
      if (isConnected) {
        consecutiveFailuresRef.current = 0;
        updateConnected(true);
        return;
      }
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= DISCONNECT_CONFIRM_THRESHOLD) {
        updateConnected(false);
      }
    },
    [updateConnected],
  );

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

      // Pair handshake: extension confirms the auto-pair URL was caught.
      // Ack silently (no import dialog), surface event to caller so it can
      // mark extension as installed and transition out of setup.
      //
      // Inline single-shot ack (no retry): if it fails, the entry stays in the
      // queue, next peek sees it again, we ack again. The worst case is the
      // `onPaired` callback fires a few times, which is idempotent on the UI.
      if (sourceType === 'pair-ack') {
        lastProcessedEntryIdRef.current = entryId;
        try {
          await fetch(buildUrl('/ack'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryId }),
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          /* best effort */
        }
        onPairedRef.current?.();
        return;
      }

      const isFeed = sourceType === 'feed';

      // Relay RTT instrumentation: extension stamps `meta.pushedAt` (wall-clock ms)
      // right before POST /push; we subtract here to measure extension-push →
      // plugin-peek latency including polling interval. Logged once per payload.
      const timingMeta = data.meta as { pushedAt?: number } | undefined;
      if (typeof timingMeta?.pushedAt === 'number') {
        const rtt = Date.now() - timingMeta.pushedAt;
        onTimingRef.current?.(`[Timing] Relay RTT (push→peek): ${rtt}ms`);
      }

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
      const timeoutId = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);

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
        // Payload wins over heads-up — let the existing peek path drive confirming.
        await peekRelayData();
        return 'connected-with-data';
      }

      // No payload — surface heads-up if the extension reported one.
      const headsUp = data.headsUp as HeadsUpStatePayload | null | undefined;
      if (headsUp) {
        if (Date.now() - headsUp.ts > HEADS_UP_STALE_MS) {
          // Stale signal — only reset to ready if we previously surfaced something.
          if (lastHeadsUpTsRef.current !== 0) {
            lastHeadsUpTsRef.current = 0;
            onIncomingExpiredRef.current?.();
          }
        } else if (headsUp.phase === 'error') {
          lastHeadsUpTsRef.current = 0;
          onIncomingErrorRef.current?.(headsUp.message ?? 'Ошибка расширения');
        } else {
          lastHeadsUpTsRef.current = headsUp.ts;
          onIncomingRef.current?.(headsUp);
        }
      } else if (lastHeadsUpTsRef.current !== 0) {
        // /status no longer reports heads-up (TTL'd) — snap out of incoming.
        lastHeadsUpTsRef.current = 0;
        onIncomingExpiredRef.current?.();
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

  // checkNow — manual trigger for retry button. Bypasses the debounce: an
  // explicit retry should reflect the true current state immediately.
  const checkNow = useCallback(async () => {
    if (!sessionCode) {
      if (isMountedRef.current) updateConnected(false);
      return;
    }
    const result = await checkRelay();
    if (!isMountedRef.current) return;
    const isConnected = result !== 'disconnected';
    consecutiveFailuresRef.current = isConnected ? 0 : DISCONNECT_CONFIRM_THRESHOLD;
    updateConnected(isConnected);
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
      // Wall-clock stamp around the very first probe so we can see real
      // cold-start latency in [Timing] logs. Without this, "relay feels slow"
      // is impossible to diagnose objectively.
      const startedAt = Date.now();
      const result = await checkRelay();
      if (!isMountedRef.current) return;
      const duration = Date.now() - startedAt;
      onTimingRef.current?.(
        `[Timing] Initial relay probe: ${duration}ms (${result === 'disconnected' ? 'fail' : 'ok'})`,
      );
      // Route through the debounced reporter: a slow first probe (cold-start
      // on YC API Gateway is typical) shouldn't immediately paint "disconnected"
      // — we'd rather wait for the active-interval poll one second later.
      reportProbeResult(result !== 'disconnected');
    };

    doInitialCheck();

    return () => {
      isMountedRef.current = false;
    };
  }, [checkRelay, sessionCode, updateConnected, reportProbeResult]);

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
        // Debounced reporting — N consecutive failures required to flip from
        // connected → disconnected. One slow / cold-start poll won't flash
        // "Relay офлайн" at the user.
        reportProbeResult(result !== 'disconnected');
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
  }, [enabled, sessionCode, checkRelay, reportProbeResult]);

  // --- Visibility change effect ---
  useEffect(() => {
    if (!enabled) return;
    if (!sessionCode) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !isMountedRef.current) return;

      lastActivityTimeRef.current = Date.now();

      const result = await checkRelay();
      if (!isMountedRef.current) return;
      reportProbeResult(result !== 'disconnected');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, sessionCode, checkRelay, reportProbeResult]);

  return {
    connected,
    relayVersion,
    extensionVersion,
    ackData,
    clearQueue,
    checkNow,
    blockEntry,
  };
}
