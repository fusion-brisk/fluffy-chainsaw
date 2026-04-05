import { useState, useCallback, useRef } from 'react';
import type { CSVRow, AppState, ImportInfo, ProcessingStats, RelayPayload } from '../../types';
import { sendMessageToPlugin } from '../../utils/index';
import type { ImportOptions } from '../components/ImportConfirmDialog';
import type { UseRelayConnectionReturn } from './useRelayConnection';

/** Minimum processing display time (ms) for smooth UX */
const MIN_PROCESSING_TIME = 800;

/** Pending import data awaiting user confirmation */
export interface PendingImport {
  rows: CSVRow[];
  query: string;
  source: string;
  entryId?: string;
  /** 'feed' when importing ya.ru rhythm feed cards */
  sourceType?: 'serp' | 'feed';
  /** Feed card rows (when sourceType='feed') */
  feedCards?: Array<Record<string, string>>;
}

export interface ImportFlowState {
  pending: PendingImport | null;
  info: ImportInfo;
  lastQuery: string | undefined;
  lastStats: ProcessingStats | null;
  confettiActive: boolean;
}

export interface ImportFlowActions {
  /** Show confirmation dialog with incoming data */
  showConfirmation: (data: {
    rows: CSVRow[];
    query: string;
    source: string;
    entryId?: string;
    sourceType?: 'serp' | 'feed';
    feedCards?: Array<Record<string, string>>;
  }) => void;
  /** User confirmed import — start processing */
  confirm: (options: ImportOptions) => void;
  /** User cancelled import */
  cancel: () => void;
  /** Clear entire relay queue */
  clearQueue: () => void;
  /** Success view completed — return to ready */
  completeSuccess: () => void;
  /** Finish processing with min-delay (called by plugin messages) */
  finishProcessing: (type: 'success' | 'error' | 'cancel') => void;
  /** Update import info stage during processing */
  updateStage: (stage: string) => void;
  /** Set stats from plugin message */
  setStats: (stats: ProcessingStats) => void;
  /** Store relay payload for later use */
  setRelayPayload: (payload: RelayPayload | null) => void;
  /** Acknowledge pending entry after done/applied */
  ackPendingEntry: () => void;
  /** Clear pending entry on error */
  clearPendingEntry: () => void;
  /** Cancel handler (no-op for relay imports) */
  handleCancel: () => void;
  /** Confetti completion callback */
  handleConfettiComplete: () => void;
  /** Update importInfo with additional fields */
  updateInfo: (update: Partial<ImportInfo>) => void;
}

export type ImportFlow = ImportFlowState & ImportFlowActions;

export function useImportFlow(
  appState: AppState,
  setAppState: (state: AppState) => void,
  resizeUI: (state: string) => void,
  relay: Pick<UseRelayConnectionReturn, 'ackData' | 'blockEntry' | 'clearQueue'>,
): ImportFlow {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [info, setInfo] = useState<ImportInfo>({ query: '', itemCount: 0 });
  const [lastQuery, setLastQuery] = useState<string | undefined>();
  const [lastStats, setLastStats] = useState<ProcessingStats | null>(null);
  const [confettiActive, setConfettiActive] = useState(false);

  const processingStartTimeRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const relayPayloadRef = useRef<RelayPayload | null>(null);
  const pendingEntryIdRef = useRef<string | null>(null);

  // Track mount state
  // (useEffect for mount/unmount is handled in the component that calls this hook,
  //  but we keep isMountedRef here since finishProcessing depends on it)
  // The parent component sets isMountedRef via the returned ref — but actually,
  // let's just manage it internally with a simple pattern:
  // We rely on the setTimeout guard; if component unmounts mid-timeout,
  // React state setters become no-ops anyway. So isMountedRef is a safety net.

  const finishProcessing = useCallback(
    (type: 'success' | 'error' | 'cancel') => {
      const elapsed = processingStartTimeRef.current
        ? Date.now() - processingStartTimeRef.current
        : MIN_PROCESSING_TIME;
      const remainingDelay = Math.max(0, MIN_PROCESSING_TIME - elapsed);

      setTimeout(() => {
        if (!isMountedRef.current) return;

        processingStartTimeRef.current = null;

        if (type === 'success') {
          setConfettiActive(true);
          setAppState('success');
          resizeUI('success');
        } else {
          setAppState('ready');
          resizeUI('ready');
        }
      }, remainingDelay);
    },
    [setAppState, resizeUI],
  );

  const showConfirmation = useCallback(
    (data: {
      rows: CSVRow[];
      query: string;
      source: string;
      entryId?: string;
      sourceType?: 'serp' | 'feed';
      feedCards?: Array<Record<string, string>>;
    }) => {
      const isFeed = data.sourceType === 'feed';
      const totalCount = isFeed ? data.feedCards?.length || 0 : data.rows.length;
      setPending({
        rows: data.rows,
        query: data.query || (isFeed ? 'ya.ru фид' : 'Импорт данных'),
        source: data.source,
        entryId: data.entryId,
        sourceType: data.sourceType,
        feedCards: data.feedCards,
      });
      setInfo({
        query: data.query || (isFeed ? 'ya.ru фид' : 'Импорт данных'),
        itemCount: totalCount,
        source: data.source,
      });
      setAppState('confirming');
      resizeUI('confirming');
    },
    [setAppState, resizeUI],
  );

  const confirm = useCallback(
    (options: ImportOptions) => {
      if (!pending) return;

      const { mode } = options;
      const { rows, query, entryId, sourceType, feedCards } = pending;
      const scope = mode === 'selection' ? 'selection' : 'page';
      const isFeed = sourceType === 'feed';
      const itemCount = isFeed ? feedCards?.length || 0 : rows.length;

      // Store entryId for acknowledgment after successful load
      if (entryId) {
        pendingEntryIdRef.current = entryId;

        // Safety timeout: if code.ts never sends 'done' within 30s, ack
        const safetyEntryId = entryId;
        setTimeout(() => {
          if (pendingEntryIdRef.current === safetyEntryId) {
            pendingEntryIdRef.current = null;
            relay.ackData(safetyEntryId);
          }
        }, 30000);
      }

      setLastQuery(query);
      setInfo({
        query,
        itemCount,
        source: pending.source,
        stage: 'components',
      });
      setAppState('processing');
      resizeUI('processing');
      processingStartTimeRef.current = Date.now();

      if (isFeed && feedCards) {
        // Feed pipeline — send to apply-feed-payload handler
        sendMessageToPlugin({
          type: 'apply-feed-payload',
          payload: {
            cards: feedCards,
            platform: 'desktop',
          },
        });
      } else if (relayPayloadRef.current) {
        // SERP pipeline (existing path)
        sendMessageToPlugin({
          type: 'apply-relay-payload',
          payload: relayPayloadRef.current,
          scope,
        });
        relayPayloadRef.current = null;
      }

      setPending(null);
    },
    [pending, setAppState, resizeUI, relay],
  );

  const cancel = useCallback(() => {
    const cancelledEntryId = pending?.entryId;
    if (cancelledEntryId) {
      // Ack the entry on the server so it's removed from the queue,
      // allowing newer entries to be served via /peek
      relay.ackData(cancelledEntryId);
    }

    setPending(null);
    relayPayloadRef.current = null;
    pendingEntryIdRef.current = null;
    setAppState('ready');
    resizeUI('ready');
  }, [setAppState, resizeUI, relay, pending]);

  const clearQueue = useCallback(() => {
    relay.clearQueue();
    setPending(null);
    relayPayloadRef.current = null;
    pendingEntryIdRef.current = null;
    setAppState('ready');
    resizeUI('ready');
  }, [setAppState, resizeUI, relay]);

  const completeSuccess = useCallback(() => {
    setAppState('ready');
    resizeUI('ready');
  }, [setAppState, resizeUI]);

  const updateStage = useCallback((stage: string) => {
    setInfo((prev) => ({ ...prev, stage }));
  }, []);

  const setStats = useCallback((stats: ProcessingStats) => {
    setLastStats(stats);
  }, []);

  const setRelayPayload = useCallback((payload: RelayPayload | null) => {
    relayPayloadRef.current = payload;
  }, []);

  const ackPendingEntry = useCallback(() => {
    if (pendingEntryIdRef.current) {
      const entryIdToAck = pendingEntryIdRef.current;
      pendingEntryIdRef.current = null;
      relay.ackData(entryIdToAck);
    }
  }, [relay]);

  const clearPendingEntry = useCallback(() => {
    pendingEntryIdRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    // Cancel is a no-op for relay imports (they complete atomically)
  }, []);

  const handleConfettiComplete = useCallback(() => {
    setConfettiActive(false);
  }, []);

  const updateInfo = useCallback((update: Partial<ImportInfo>) => {
    setInfo((prev) => ({ ...prev, ...update }));
  }, []);

  return {
    // State
    pending,
    info,
    lastQuery,
    lastStats,
    confettiActive,
    // Actions
    showConfirmation,
    confirm,
    cancel,
    clearQueue,
    completeSuccess,
    finishProcessing,
    updateStage,
    setStats,
    setRelayPayload,
    ackPendingEntry,
    clearPendingEntry,
    handleCancel,
    handleConfettiComplete,
    updateInfo,
  };
}
