/**
 * Contentify Plugin — UI Entry Point (Clipboard-First)
 *
 * Unified UI with minimal states:
 * - checking: Initial relay connection check
 * - ready: Ready to work (relay status shown as indicator)
 * - processing: Importing/processing data
 * - confirming: Data received, awaiting user confirmation
 * - success: Import completed successfully
 * - fileDrop: Hidden fallback for file import
 *
 * CLIPBOARD-FIRST ARCHITECTURE:
 * - Plugin works with or without relay connection
 * - Users can always paste data from Chrome extension (Cmd+V)
 * - Relay is optional for automatic data transfer (no paste needed)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import {
  CSVRow,
  AppState,
  ImportInfo,
  UI_SIZES,
} from './types';
import {
  applyFigmaTheme,
  sendMessageToPlugin,
} from './utils/index';

// Hooks
import { useRelayConnection } from './hooks/useRelayConnection';
import { useClipboardPaste } from './hooks/useClipboardPaste';
import { useFileImport } from './hooks/useFileImport';
import { usePluginMessages } from './hooks/usePluginMessages';
import type { RelayDataEvent } from './hooks/useRelayConnection';
import type { ClipboardPasteEvent } from './hooks/useClipboardPaste';
import type { FileImportResult } from './hooks/useFileImport';

// Components
import { ReadyView } from './components/ReadyView';
import { ProcessingView } from './components/ProcessingView';
import { FileDropOverlay } from './components/FileDropOverlay';
import { Confetti } from './components/Confetti';
import { ImportConfirmDialog, ImportMode } from './components/ImportConfirmDialog';
import { SuccessView } from './components/SuccessView';
import { ExtensionGuide } from './components/ExtensionGuide';
import { RelayGuide } from './components/RelayGuide';
import { StatusBar } from './components/StatusBar';
import { SetupWizard } from './components/SetupWizard';

// Default relay URL
const DEFAULT_RELAY_URL = 'http://localhost:3847';

// Minimum processing display time (ms) for smooth UX
const MIN_PROCESSING_TIME = 800;

// Resize animation duration (ms)
const RESIZE_ANIMATION_DURATION = 400;

// Delay before resize starts (ms) - allows content to prepare
const RESIZE_DELAY = 50;

// Pending import data structure
interface PendingImport {
  rows: CSVRow[];
  query: string;
  source: string;
  htmlForBuild?: string;
  entryId?: string;
}

// Main App Component
const App: React.FC = () => {
  // === STATE ===
  const [appState, setAppState] = useState<AppState>('checking');
  const [relayUrl] = useState(() => {
    try {
      return localStorage.getItem('contentify-relay-url') || DEFAULT_RELAY_URL;
    } catch {
      return DEFAULT_RELAY_URL;
    }
  });
  const [lastQuery, setLastQuery] = useState<string | undefined>();
  const [importInfo, setImportInfo] = useState<ImportInfo>({
    query: '',
    itemCount: 0
  });
  const [confetti, setConfetti] = useState<{ active: boolean; type: 'success' | 'error' }>({
    active: false,
    type: 'success'
  });
  const [hasSelection, setHasSelection] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [showRelayGuide, setShowRelayGuide] = useState(false);
  const [relayConnected, setRelayConnected] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const previousStateRef = useRef<AppState | null>(null);

  // Processing refs
  const processingStartTimeRef = useRef<number | null>(null);
  const currentSizeRef = useRef({ width: UI_SIZES.checking.width, height: UI_SIZES.checking.height });
  const resizeAnimationRef = useRef<number | null>(null);
  const isFirstResizeRef = useRef(true);
  const isMountedRef = useRef(true);

  // Relay payload/file refs for import
  const relayPayloadRef = useRef<unknown>(null);
  const pendingEntryIdRef = useRef<string | null>(null);
  const fileHtmlRef = useRef<string>('');
  const fileWizardsRef = useRef<unknown[]>([]);

  // === ANIMATED RESIZE HELPER ===
  const resizeUI = useCallback((state: AppState | keyof typeof UI_SIZES) => {
    const targetSize = UI_SIZES[state as keyof typeof UI_SIZES] || UI_SIZES.ready;
    const currentSize = currentSizeRef.current;

    if (resizeAnimationRef.current) {
      cancelAnimationFrame(resizeAnimationRef.current);
      resizeAnimationRef.current = null;
    }

    if (currentSize.width === targetSize.width && currentSize.height === targetSize.height) {
      return;
    }

    if (isFirstResizeRef.current) {
      isFirstResizeRef.current = false;
      currentSizeRef.current = { width: targetSize.width, height: targetSize.height };
      sendMessageToPlugin({ type: 'resize-ui', width: targetSize.width, height: targetSize.height });
      return;
    }

    setTimeout(() => {
      const startWidth = currentSizeRef.current.width;
      const startHeight = currentSizeRef.current.height;
      const deltaWidth = targetSize.width - startWidth;
      const deltaHeight = targetSize.height - startHeight;
      const startTime = performance.now();

      const easeInOutQuad = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / RESIZE_ANIMATION_DURATION, 1);
        const easedProgress = easeInOutQuad(progress);

        const newWidth = Math.round(startWidth + deltaWidth * easedProgress);
        const newHeight = Math.round(startHeight + deltaHeight * easedProgress);

        currentSizeRef.current = { width: newWidth, height: newHeight };
        sendMessageToPlugin({ type: 'resize-ui', width: newWidth, height: newHeight });

        if (progress < 1) {
          resizeAnimationRef.current = requestAnimationFrame(animate);
        } else {
          resizeAnimationRef.current = null;
        }
      };

      resizeAnimationRef.current = requestAnimationFrame(animate);
    }, RESIZE_DELAY);
  }, []);

  // === FINISH PROCESSING WITH MIN DELAY ===
  const finishProcessing = useCallback((type: 'success' | 'error' | 'cancel') => {
    const elapsed = processingStartTimeRef.current
      ? Date.now() - processingStartTimeRef.current
      : MIN_PROCESSING_TIME;
    const remainingDelay = Math.max(0, MIN_PROCESSING_TIME - elapsed);

    setTimeout(() => {
      if (!isMountedRef.current) return;

      processingStartTimeRef.current = null;

      if (type === 'success') {
        setConfetti({ active: true, type: 'success' });
        setAppState('success');
        resizeUI('success');
      } else if (type === 'error') {
        setConfetti({ active: true, type: 'error' });
        setAppState('ready');
        resizeUI('ready');
      } else {
        setAppState('ready');
        resizeUI('ready');
      }
    }, remainingDelay);
  }, [resizeUI]);

  // === MARK EXTENSION AS INSTALLED ===
  const markExtensionInstalled = useCallback(() => {
    setExtensionInstalled(true);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  // === SET CONFIRMING STATE (shared by relay, clipboard, file) ===
  const showConfirmation = useCallback((data: {
    rows: CSVRow[];
    query: string;
    source: string;
    htmlForBuild?: string;
    entryId?: string;
  }) => {
    const totalCount = data.rows.length;
    setPendingImport({
      rows: data.rows,
      query: data.query || 'Импорт данных',
      source: data.source,
      htmlForBuild: data.htmlForBuild,
      entryId: data.entryId,
    });
    setImportInfo({
      query: data.query || 'Импорт данных',
      itemCount: totalCount,
      source: data.source,
    });
    setAppState('confirming');
    resizeUI('confirming');
  }, [resizeUI]);

  // === RELAY CONNECTION HOOK ===
  const relay = useRelayConnection({
    relayUrl,
    enabled: appState !== 'processing' && appState !== 'confirming' && appState !== 'fileDrop',
    onDataReceived: useCallback((data: RelayDataEvent) => {
      if (!extensionInstalled) {
        markExtensionInstalled();
      }
      relayPayloadRef.current = data.payload;

      const totalCount = data.rows.length + data.wizardCount;
      showConfirmation({
        rows: data.rows,
        query: data.query,
        source: 'Яндекс',
        entryId: data.entryId,
      });
      setImportInfo(prev => ({ ...prev, itemCount: totalCount }));
    }, [extensionInstalled, markExtensionInstalled, showConfirmation]),
    onConnectionChange: useCallback((connected: boolean) => {
      setRelayConnected(connected);
    }, []),
  });

  // === CLIPBOARD PASTE HOOK ===
  useClipboardPaste({
    enabled: appState === 'ready' || appState === 'confirming',
    onPaste: useCallback((data: ClipboardPasteEvent) => {
      if (!extensionInstalled) {
        markExtensionInstalled();
      }
      relayPayloadRef.current = data.payload;
      showConfirmation({
        rows: data.rows,
        query: data.query || 'Импорт из буфера',
        source: 'Буфер обмена',
      });
    }, [extensionInstalled, markExtensionInstalled, showConfirmation]),
  });

  // === FILE IMPORT HOOK ===
  const fileImport = useFileImport({
    enabled: appState !== 'processing',
    onFileProcessed: useCallback((data: FileImportResult) => {
      fileHtmlRef.current = data.htmlForBuild;
      fileWizardsRef.current = data.wizards;
      showConfirmation({
        rows: data.rows,
        query: data.query,
        source: 'Файл',
        htmlForBuild: data.htmlForBuild,
      });
    }, [showConfirmation]),
    onError: useCallback(() => {
      setConfetti({ active: true, type: 'error' });
      setAppState('ready');
      resizeUI('ready');
    }, [resizeUI]),
  });

  // === PLUGIN MESSAGES HOOK ===
  usePluginMessages({
    handlers: {
      onSetupSkippedLoaded: (skipped) => {
        if (skipped) setExtensionInstalled(true);
      },
      onSelectionStatus: (sel) => {
        setHasSelection(sel);
      },
      onProgress: (progress) => {
        if (appState === 'processing' && progress.operationType) {
          setImportInfo(prev => ({ ...prev, stage: progress.operationType }));
        }
      },
      onDone: () => {
        // Acknowledge relay data after successful import
        if (pendingEntryIdRef.current) {
          const entryIdToAck = pendingEntryIdRef.current;
          pendingEntryIdRef.current = null;
          relay.ackData(entryIdToAck);
        }
        finishProcessing('success');
      },
      onBuildPageDone: () => {
        if (pendingEntryIdRef.current) {
          const entryIdToAck = pendingEntryIdRef.current;
          pendingEntryIdRef.current = null;
          relay.ackData(entryIdToAck);
        }
        finishProcessing('success');
      },
      onRelayPayloadApplied: () => {
        if (pendingEntryIdRef.current) {
          const entryIdToAck = pendingEntryIdRef.current;
          pendingEntryIdRef.current = null;
          relay.ackData(entryIdToAck);
        }
        finishProcessing('success');
      },
      onError: () => {
        pendingEntryIdRef.current = null;
        finishProcessing('error');
      },
      onImportCancelled: () => {
        pendingEntryIdRef.current = null;
        finishProcessing('cancel');
      },
      onDebugReport: (report) => {
        try {
          const debugRelayUrl = localStorage.getItem('contentify-relay-url') || DEFAULT_RELAY_URL;
          fetch(`${debugRelayUrl}/debug`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report || {}),
            signal: AbortSignal.timeout(3000)
          }).catch(() => {});
        } catch { /* ignore */ }
      },
    },
    processingStartTime: processingStartTimeRef.current,
  });

  // === INITIALIZATION ===
  useEffect(() => {
    isMountedRef.current = true;
    applyFigmaTheme();
    sendMessageToPlugin({ type: 'get-settings' });
    sendMessageToPlugin({ type: 'get-setup-skipped' });

    return () => { isMountedRef.current = false; };
  }, []);

  // Transition from checking to ready once relay connection is resolved
  useEffect(() => {
    if (appState === 'checking') {
      // Give relay hook time to do initial check, then move to ready
      const timer = setTimeout(() => {
        if (appState === 'checking') {
          setAppState('ready');
          resizeUI('ready');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [appState, resizeUI]);

  // Move to ready or confirming once relay initial check completes
  useEffect(() => {
    if (appState === 'checking' && relay.connected) {
      setRelayConnected(true);
      // If data was received, state is already 'confirming' via onDataReceived
      if (appState === 'checking') {
        setAppState('ready');
        resizeUI('ready');
      }
    }
  }, [appState, relay.connected, resizeUI]);

  // === HANDLE SUCCESS VIEW COMPLETE ===
  const handleSuccessComplete = useCallback(() => {
    setAppState('ready');
    resizeUI('ready');
  }, [resizeUI]);

  // === CONFIRM IMPORT HANDLER ===
  const handleConfirmImport = useCallback((mode: ImportMode) => {
    if (!pendingImport) return;

    const { rows, query, htmlForBuild, entryId } = pendingImport;
    const scope = mode === 'selection' ? 'selection' : 'page';

    // Store entryId for acknowledgment after successful import
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
    setImportInfo({
      query,
      itemCount: rows.length,
      source: pendingImport.source,
      stage: 'components'
    });
    setAppState('processing');
    resizeUI('processing');
    processingStartTimeRef.current = Date.now();

    if (relayPayloadRef.current) {
      sendMessageToPlugin({
        type: 'apply-relay-payload',
        payload: relayPayloadRef.current,
        scope
      });
      relayPayloadRef.current = null;
    } else if (htmlForBuild && mode === 'artboard') {
      sendMessageToPlugin({
        type: 'build-page',
        rows,
        html: htmlForBuild,
        wizards: fileWizardsRef.current || []
      });
      fileWizardsRef.current = [];
    } else {
      sendMessageToPlugin({
        type: 'import-csv',
        rows,
        scope,
        resetBeforeImport: false
      });
    }

    fileHtmlRef.current = '';
    fileWizardsRef.current = [];
    setPendingImport(null);
  }, [pendingImport, resizeUI, relay]);

  const handleCancelImport = useCallback(() => {
    // Block this entry temporarily to prevent re-showing
    const cancelledEntryId = pendingImport?.entryId;
    if (cancelledEntryId) {
      relay.blockEntry(cancelledEntryId);
    }

    setPendingImport(null);
    relayPayloadRef.current = null;
    pendingEntryIdRef.current = null;
    setAppState('ready');
    resizeUI('ready');
  }, [resizeUI, relay, pendingImport]);

  // === GUIDE HANDLERS ===
  const handleShowExtensionGuide = useCallback(() => {
    previousStateRef.current = appState;
    setShowExtensionGuide(true);
    resizeUI('extensionGuide');
  }, [appState, resizeUI]);

  const handleCloseExtensionGuide = useCallback(() => {
    setShowExtensionGuide(false);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);

  const handleShowRelayGuide = useCallback(() => {
    previousStateRef.current = appState;
    setShowRelayGuide(true);
    resizeUI('extensionGuide');
  }, [appState, resizeUI]);

  const handleCloseRelayGuide = useCallback(() => {
    setShowRelayGuide(false);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);

  const handleCancel = useCallback(() => {
    sendMessageToPlugin({ type: 'cancel-import' });
  }, []);

  const handleCloseFileDrop = useCallback(() => {
    fileImport.setShowFileDrop(false);
    if (appState === 'fileDrop') {
      setAppState('ready');
      resizeUI('ready');
    }
  }, [appState, resizeUI, fileImport]);

  const handleConfettiComplete = useCallback(() => {
    setConfetti({ active: false, type: 'success' });
  }, []);

  // === RENDER ===
  const needsSetup = !extensionInstalled;

  return (
    <div
      className="glass-app"
      {...fileImport.dragHandlers}
    >
      {/* StatusBar — always visible except during checking or guides */}
      {appState !== 'checking' && !showExtensionGuide && !showRelayGuide && (
        <StatusBar
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onRelayClick={handleShowRelayGuide}
          onExtensionClick={handleShowExtensionGuide}
        />
      )}

      {/* Checking state */}
      {appState === 'checking' && (
        <div className="checking-view">
          <div className="checking-view-spinner" />
          <span className="checking-view-text">Подключение...</span>
        </div>
      )}

      {/* Ready state with SetupWizard or WaitingState */}
      {appState === 'ready' && !showExtensionGuide && !showRelayGuide && (
        needsSetup ? (
          <SetupWizard
            relayConnected={relayConnected}
            extensionInstalled={extensionInstalled}
            onSkip={markExtensionInstalled}
          />
        ) : (
          <ReadyView
            lastQuery={lastQuery}
            relayConnected={relayConnected}
            onShowExtensionGuide={handleShowExtensionGuide}
          />
        )
      )}

      {/* Confirming state */}
      {appState === 'confirming' && pendingImport && !showExtensionGuide && !showRelayGuide && (
        <ImportConfirmDialog
          query={importInfo.query}
          itemCount={importInfo.itemCount}
          source={importInfo.source}
          hasSelection={hasSelection}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
        />
      )}

      {/* Processing state */}
      {appState === 'processing' && !showExtensionGuide && !showRelayGuide && (
        <ProcessingView
          importInfo={importInfo}
          onCancel={handleCancel}
        />
      )}

      {/* Success state */}
      {appState === 'success' && !showExtensionGuide && !showRelayGuide && (
        <SuccessView
          query={importInfo.query}
          onComplete={handleSuccessComplete}
          autoCloseDelay={3500}
        />
      )}

      {/* File drop overlay */}
      <FileDropOverlay
        isOpen={fileImport.showFileDrop}
        onClose={handleCloseFileDrop}
        onFileSelect={fileImport.handleFileSelect}
      />

      {/* Drag overlay */}
      {fileImport.isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <span className="drag-overlay-icon">📄</span>
            <span className="drag-overlay-text">Отпустите для импорта</span>
          </div>
        </div>
      )}

      {/* Confetti celebration */}
      <Confetti
        isActive={confetti.active}
        type={confetti.type}
        onComplete={handleConfettiComplete}
      />

      {/* Extension installation guide */}
      {showExtensionGuide && (
        <ExtensionGuide onBack={handleCloseExtensionGuide} />
      )}

      {/* Relay installation guide */}
      {showRelayGuide && (
        <RelayGuide onBack={handleCloseRelayGuide} />
      )}
    </div>
  );
};

// Mount React app
const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
