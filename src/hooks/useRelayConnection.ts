/**
 * useRelayConnection — WebSocket + HTTP polling relay connection hook
 *
 * Manages the full relay lifecycle:
 * - WebSocket connection with exponential backoff reconnect
 * - HTTP polling fallback when WebSocket is unavailable
 * - Adaptive polling (active vs idle intervals)
 * - Visibility-change handling (ping on WS, HTTP check fallback)
 * - peek (non-destructive read) and ack (confirm after import) operations
 * - Duplicate entry prevention
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedRelayData } from '../utils/relay-payload';
import { extractRowsFromPayload } from '../utils/relay-payload';

// WebSocket configuration
const WS_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

// HTTP Polling fallback intervals
const RELAY_CHECK_INTERVAL_ACTIVE = 1000;
const RELAY_CHECK_INTERVAL_IDLE = 5000;
const ACTIVE_THRESHOLD_MS = 10000;

export interface RelayDataEvent extends ParsedRelayData {
  entryId: string;
  payload: unknown;
  wizardCount: number;
}

export interface UseRelayConnectionOptions {
  relayUrl: string;
  /** Set false during processing/confirming/fileDrop to pause WS and polling */
  enabled: boolean;
  /** Called when new data is available from relay */
  onDataReceived: (data: RelayDataEvent) => void;
  /** Called when connection status changes */
  onConnectionChange: (connected: boolean) => void;
}

export interface UseRelayConnectionReturn {
  connected: boolean;
  ackData: (entryId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  checkNow: () => Promise<void>;
  /** Temporarily block an entryId from being shown (e.g. after cancel) */
  blockEntry: (entryId: string, durationMs?: number) => void;
}

export function useRelayConnection({
  relayUrl,
  enabled,
  onDataReceived,
  onConnectionChange,
}: UseRelayConnectionOptions): UseRelayConnectionReturn {
  const [connected, setConnected] = useState(false);

  // Stable refs for callbacks (avoid effect re-runs on every render)
  const onDataReceivedRef = useRef(onDataReceived);
  onDataReceivedRef.current = onDataReceived;
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  // Connection refs
  const isMountedRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectAttemptRef = useRef(0);
  const wsReconnectTimeoutRef = useRef<number | null>(null);
  const wsConnectedRef = useRef(false);
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

  // peekRelayData — non-destructive read from relay queue
  const peekRelayData = useCallback(async () => {
    if (isAckInProgressRef.current) return;

    try {
      const response = await fetch(`${relayUrl}/peek`);
      if (!response.ok) return;

      const data = await response.json();
      if (!data.hasData || !data.payload) return;

      const payload = data.payload;
      const entryId: string = data.entryId;

      // Skip already processed or currently pending entries
      if (entryId === lastProcessedEntryIdRef.current) return;
      if (entryId === pendingEntryIdRef.current) return;

      const parsed = extractRowsFromPayload(payload);
      if (parsed.rows.length === 0) return;

      const wizardCount = payload.wizards?.length || 0;

      pendingEntryIdRef.current = entryId;

      onDataReceivedRef.current({
        ...parsed,
        entryId,
        payload,
        wizardCount,
      });
    } catch (error) {
      console.error('Error peeking relay data:', error);
    }
  }, [relayUrl]);

  // checkRelay — check relay status and peek if data available
  const checkRelay = useCallback(async (): Promise<'connected' | 'connected-with-data' | 'disconnected'> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${relayUrl}/status`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) return 'disconnected';

      const data = await response.json();
      const hasPendingData = data.hasData || (data.pendingCount > 0) || (data.queueSize > 0);

      if (hasPendingData) {
        await peekRelayData();
        return 'connected-with-data';
      }

      return 'connected';
    } catch {
      return 'disconnected';
    }
  }, [relayUrl, peekRelayData]);

  // ackData — acknowledge relay data after successful import (with retry)
  const ackData = useCallback(async (entryId: string) => {
    lastProcessedEntryIdRef.current = entryId;
    isAckInProgressRef.current = true;

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [1000, 2000, 4000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${relayUrl}/ack`, {
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
  }, [relayUrl]);

  // clearQueue — delete all pending entries
  const clearQueue = useCallback(async () => {
    try {
      await fetch(`${relayUrl}/clear`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    pendingEntryIdRef.current = null;
    lastProcessedEntryIdRef.current = null;
  }, [relayUrl]);

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
    const result = await checkRelay();
    if (!isMountedRef.current) return;
    updateConnected(result !== 'disconnected');
  }, [checkRelay, updateConnected]);

  // --- Initialization effect ---
  useEffect(() => {
    isMountedRef.current = true;

    const doInitialCheck = async () => {
      const result = await checkRelay();
      if (!isMountedRef.current) return;
      updateConnected(result !== 'disconnected');
    };

    doInitialCheck();

    return () => {
      isMountedRef.current = false;
    };
  }, [checkRelay, updateConnected]);

  // --- WebSocket + polling effect ---
  useEffect(() => {
    if (!enabled) return;

    const wsUrl = relayUrl.replace(/^http/, 'ws');

    const connectWebSocket = () => {
      if (!isMountedRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current) return;
          wsConnectedRef.current = true;
          wsReconnectAttemptRef.current = 0;

          // Stop HTTP polling
          if (relayCheckIntervalRef.current) {
            clearTimeout(relayCheckIntervalRef.current);
            relayCheckIntervalRef.current = null;
          }

          updateConnected(true);
        };

        ws.onmessage = async (event) => {
          if (!isMountedRef.current) return;

          try {
            const data = JSON.parse(event.data);

            if (data.type === 'new-data') {
              await peekRelayData();
            } else if (data.type === 'connected' && data.pendingCount > 0) {
              await peekRelayData();
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!isMountedRef.current) return;
          wsConnectedRef.current = false;
          wsRef.current = null;
          updateConnected(false);
          startPollingFallback();
          scheduleReconnect();
        };

        ws.onerror = () => {
          // onclose fires after onerror
        };
      } catch {
        wsConnectedRef.current = false;
        startPollingFallback();
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (!isMountedRef.current) return;
      if (wsReconnectTimeoutRef.current) return;

      const attempt = wsReconnectAttemptRef.current;
      const delay = WS_RECONNECT_DELAYS[Math.min(attempt, WS_RECONNECT_DELAYS.length - 1)];

      wsReconnectTimeoutRef.current = window.setTimeout(() => {
        wsReconnectTimeoutRef.current = null;
        wsReconnectAttemptRef.current++;
        connectWebSocket();
      }, delay);
    };

    const startPollingFallback = () => {
      if (relayCheckIntervalRef.current) return;
      if (wsConnectedRef.current) return;

      const scheduleNextPoll = () => {
        if (!isMountedRef.current) return;
        if (wsConnectedRef.current) return;

        const timeSinceActivity = Date.now() - lastActivityTimeRef.current;
        const interval =
          timeSinceActivity < ACTIVE_THRESHOLD_MS
            ? RELAY_CHECK_INTERVAL_ACTIVE
            : RELAY_CHECK_INTERVAL_IDLE;

        relayCheckIntervalRef.current = window.setTimeout(async () => {
          relayCheckIntervalRef.current = null;
          if (!isMountedRef.current) return;
          if (wsConnectedRef.current) return;

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
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      if (relayCheckIntervalRef.current) {
        clearTimeout(relayCheckIntervalRef.current);
        relayCheckIntervalRef.current = null;
      }
    };
  }, [enabled, relayUrl, checkRelay, peekRelayData, updateConnected]);

  // --- Visibility change effect ---
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !isMountedRef.current) return;

      lastActivityTimeRef.current = Date.now();

      // If WS is connected, just ping
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        return;
      }

      // WS not connected — do HTTP check
      const result = await checkRelay();
      if (!isMountedRef.current) return;
      updateConnected(result !== 'disconnected');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, checkRelay, updateConnected]);

  return {
    connected,
    ackData,
    clearQueue,
    checkNow,
    blockEntry,
  };
}
