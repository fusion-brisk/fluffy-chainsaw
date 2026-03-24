/**
 * Contentify Plugin — UI Entry Point (Relay-Only)
 *
 * Unified UI with minimal states:
 * - checking: Initial relay connection check
 * - ready: Ready to work (relay status shown as indicator)
 * - processing: Importing/processing data
 * - confirming: Data received, awaiting user confirmation
 * - success: Import completed successfully
 *
 * RELAY-ONLY ARCHITECTURE:
 * - Data flows: Extension → Relay Server → WebSocket/HTTP → Plugin UI → Sandbox
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import {
  CSVRow,
  AppState,
  ImportInfo,
  ProcessingStats,
  UI_SIZES,
  STATE_TO_TIER,
} from '../types';
import type { RelayPayload } from '../types';
import {
  applyFigmaTheme,
  sendMessageToPlugin,
} from '../utils/index';
import { buildImportSummary } from '../utils/format';

// Hooks
import { useRelayConnection } from './hooks/useRelayConnection';
import { usePluginMessages } from './hooks/usePluginMessages';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useMcpStatus } from './hooks/useMcpStatus';
import type { RelayDataEvent } from './hooks/useRelayConnection';

// Components
import { ReadyView } from './components/ReadyView';
import { ProcessingView } from './components/ProcessingView';

import { Confetti } from './components/Confetti';
import { ImportConfirmDialog, ImportOptions } from './components/ImportConfirmDialog';
import { SuccessView } from './components/SuccessView';
import { SetupFlow } from './components/SetupFlow';
import { StatusBar } from './components/StatusBar';
import { UpdateBanner } from './components/UpdateBanner';
// SetupWizard removed — replaced by SetupFlow
// WhatsNewDialog removed — replaced by inline WhatsNewBanner in ReadyView
import { LogViewer } from './components/logs/LogViewer';
import type { LogMessage } from './components/logs/LogViewer';
import { ComponentInspector } from './components/ComponentInspector';
import { LogLevel } from '../logger';
import { PORTS } from '../config';

// Default relay URL
const DEFAULT_RELAY_URL = `http://localhost:${PORTS.RELAY}`;

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
  const [confettiActive, setConfettiActive] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logMessages, setLogMessages] = useState<LogMessage[]>([]);
  const [showInspector, setShowInspector] = useState(false);
  const [inspectorData, setInspectorData] = useState<import('../types').ComponentInspectorData[]>([]);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [lastStats, setLastStats] = useState<ProcessingStats | null>(null);
  const [relayConnected, setRelayConnected] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(true);
  const previousStateRef = useRef<AppState | null>(null);

  // Processing refs
  const processingStartTimeRef = useRef<number | null>(null);
  const currentSizeRef = useRef<{ width: number; height: number }>({ width: UI_SIZES.compact.width, height: UI_SIZES.compact.height });
  const resizeAnimationRef = useRef<number | null>(null);
  const isFirstResizeRef = useRef(true);
  const isMountedRef = useRef(true);

  // Relay payload ref for import
  const relayPayloadRef = useRef<RelayPayload | null>(null);
  const pendingEntryIdRef = useRef<string | null>(null);

  // === ANIMATED RESIZE HELPER ===
  const resizeUI = useCallback((state: string) => {
    const tier = STATE_TO_TIER[state] || 'standard';
    const targetSize = UI_SIZES[tier];
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
        setConfettiActive(true);
        setAppState('success');
        resizeUI('success');
      } else if (type === 'error') {
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
    setIsFirstRun(false);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  // === DISMISS ONBOARDING ===
  const handleDismissOnboarding = useCallback(() => {
    setIsFirstRun(false);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  // === SET CONFIRMING STATE (shared by relay) ===
  const showConfirmation = useCallback((data: {
    rows: CSVRow[];
    query: string;
    source: string;
    entryId?: string;
  }) => {
    const totalCount = data.rows.length;
    setPendingImport({
      rows: data.rows,
      query: data.query || 'Импорт данных',
      source: data.source,
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
    enabled: appState !== 'processing' && appState !== 'confirming',
    onDataReceived: useCallback((data: RelayDataEvent) => {
      if (!extensionInstalled) {
        markExtensionInstalled();
      }
      relayPayloadRef.current = data.payload as RelayPayload | null;

      const totalCount = data.rows.length + data.wizardCount;
      const summary = buildImportSummary({
        rows: data.rows,
        wizardCount: data.wizardCount,
        payload: data.payload as { productCard?: { offers?: unknown[]; defaultOffer?: unknown } | null; rawRows?: CSVRow[] } | null,
      });
      showConfirmation({
        rows: data.rows,
        query: data.query,
        source: 'Яндекс',
        entryId: data.entryId,
      });
      setImportInfo(prev => ({ ...prev, itemCount: totalCount, summary }));
    }, [extensionInstalled, markExtensionInstalled, showConfirmation]),
    onConnectionChange: useCallback((connected: boolean) => {
      setRelayConnected(connected);
    }, []),
  });

  // === VERSION CHECK HOOK ===
  const versionCheck = useVersionCheck(relay.relayVersion, relay.extensionVersion);

  // === MCP STATUS HOOK ===
  const mcpStatus = useMcpStatus();

  // === PLUGIN MESSAGES HOOK ===
  usePluginMessages({
    handlers: {
      onSetupSkippedLoaded: (skipped) => {
        if (skipped) {
          setExtensionInstalled(true);
          setIsFirstRun(false);
        }
      },
      onLog: (message) => {
        // Determine level from message content heuristic
        let level = LogLevel.SUMMARY;
        if (message.startsWith('[') && message.includes(']')) {
          // Source-tagged messages are typically debug
          level = LogLevel.DEBUG;
        }
        const entry: LogMessage = {
          level,
          message,
          timestamp: Date.now(),
        };
        setLogMessages(prev => {
          const next = [...prev, entry];
          return next.length > 500 ? next.slice(-500) : next;
        });
      },
      onSelectionStatus: (sel) => {
        setHasSelection(sel);
      },
      onProgress: (progress) => {
        if (appState === 'processing' && progress.operationType) {
          setImportInfo(prev => ({ ...prev, stage: progress.operationType }));
        }
      },
      onStats: (stats) => {
        setLastStats(stats);
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
      onWhatsNewStatus: (data) => {
        if (data.shouldShow) {
          setCurrentVersion(data.currentVersion);
          setShowWhatsNew(true);
        }
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
      onComponentInfo: (components) => {
        setInspectorData(components);
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
    sendMessageToPlugin({ type: 'check-whats-new' });

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
  const handleConfirmImport = useCallback((options: ImportOptions) => {
    if (!pendingImport) return;

    const { mode, includeScreenshots } = options;
    const { rows, query, entryId } = pendingImport;
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

    if (relayPayloadRef.current && mode === 'artboard') {
      sendMessageToPlugin({
        type: 'apply-relay-payload',
        payload: relayPayloadRef.current,
        scope,
        includeScreenshots
      });
      relayPayloadRef.current = null;
    } else {
      sendMessageToPlugin({
        type: 'import-csv',
        rows,
        scope,
        resetBeforeImport: false,
        includeScreenshots
      });
      relayPayloadRef.current = null;
    }

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

  const handleClearQueue = useCallback(() => {
    relay.clearQueue();
    setPendingImport(null);
    relayPayloadRef.current = null;
    pendingEntryIdRef.current = null;
    setAppState('ready');
    resizeUI('ready');
  }, [resizeUI, relay]);

  // === SETUP FLOW HANDLERS ===
  const handleShowSetup = useCallback(() => {
    previousStateRef.current = appState;
    setShowSetup(true);
    resizeUI('extensionGuide');
  }, [appState, resizeUI]);

  const handleCloseSetup = useCallback(() => {
    setShowSetup(false);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);

  // === LOG VIEWER HANDLERS ===
  const handleShowLogViewer = useCallback(() => {
    previousStateRef.current = appState;
    setShowLogViewer(true);
    resizeUI('logsViewer');
  }, [appState, resizeUI]);

  const handleCloseLogViewer = useCallback(() => {
    setShowLogViewer(false);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);

  const handleClearLogs = useCallback(() => {
    setLogMessages([]);
  }, []);

  // === KEYBOARD SHORTCUTS ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+L → toggle log viewer
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        if (showLogViewer) {
          handleCloseLogViewer();
        } else {
          handleShowLogViewer();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLogViewer, handleCloseLogViewer, handleShowLogViewer]);

  // === INSPECTOR HANDLERS ===
  const handleShowInspector = useCallback(() => {
    previousStateRef.current = appState;
    setShowInspector(true);
    resizeUI('inspector');
  }, [appState, resizeUI]);

  const handleCloseInspector = useCallback(() => {
    setShowInspector(false);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);

  const handleCancel = useCallback(() => {
    sendMessageToPlugin({ type: 'cancel-import' });
  }, []);

  const handleConfettiComplete = useCallback(() => {
    setConfettiActive(false);
  }, []);

  // === RENDER ===
  const needsSetup = !extensionInstalled;

  return (
    <div
      className="glass-app"
    >
      {/* StatusBar — always visible except during checking, guides, log viewer, or inspector */}
      {appState !== 'checking' && !showSetup && !showLogViewer && !showInspector && (
        <StatusBar
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          mcpConnected={mcpStatus.connected}
          hasPendingData={pendingImport !== null}
          onRelayClick={handleShowSetup}
          onExtensionClick={handleShowSetup}
          onInspectorClick={handleShowInspector}
          onClearQueue={handleClearQueue}
        />
      )}

      {/* Update notification banners */}
      {appState !== 'checking' && !showSetup && !showLogViewer && !showInspector && (
        <UpdateBanner
          relayUpdate={versionCheck.relayUpdate}
          extensionUpdate={versionCheck.extensionUpdate}
          onDismissRelay={versionCheck.dismissRelay}
          onDismissExtension={versionCheck.dismissExtension}
        />
      )}

      {/* Checking state */}
      {appState === 'checking' && (
        <div className="checking-view">
          <div className="checking-view-spinner" />
          <span className="checking-view-text">Подключение...</span>
        </div>
      )}

      {/* Ready state */}
      {appState === 'ready' && !showSetup && !showLogViewer && !showInspector && (
        needsSetup ? (
          <SetupFlow
            relayConnected={relayConnected}
            extensionInstalled={extensionInstalled}
            onComplete={markExtensionInstalled}
            onBack={markExtensionInstalled}
          />
        ) : (
          <ReadyView
            lastQuery={lastQuery}
            relayConnected={relayConnected}
            isFirstTime={isFirstRun}
            showWhatsNew={showWhatsNew}
            currentVersion={currentVersion}
            onShowExtensionGuide={handleShowSetup}
            onReimport={relayConnected ? () => relay.reimport() : undefined}
            onDismissOnboarding={handleDismissOnboarding}
            onDismissWhatsNew={() => {
              setShowWhatsNew(false);
              sendMessageToPlugin({ type: 'mark-whats-new-seen', version: currentVersion });
            }}
          />
        )
      )}

      {/* Confirming state */}
      {appState === 'confirming' && pendingImport && !showSetup && !showLogViewer && !showInspector && (
        <ImportConfirmDialog
          query={importInfo.query}
          itemCount={importInfo.itemCount}
          source={importInfo.source}
          summary={importInfo.summary}
          hasSelection={hasSelection}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
        />
      )}

      {/* Processing state */}
      {appState === 'processing' && !showSetup && !showLogViewer && !showInspector && (
        <ProcessingView
          importInfo={importInfo}
          onCancel={handleCancel}
        />
      )}

      {/* Success state */}
      {appState === 'success' && !showSetup && !showLogViewer && !showInspector && (
        <SuccessView
          query={importInfo.query}
          stats={lastStats}
          onComplete={handleSuccessComplete}
          onShowLogs={handleShowLogViewer}
        />
      )}

      {/* Confetti celebration (success only) */}
      {!showLogViewer && !showInspector && (
        <Confetti
          isActive={confettiActive}
          onComplete={handleConfettiComplete}
        />
      )}

      {/* Unified setup flow (relay + extension) */}
      {showSetup && (
        <SetupFlow
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onComplete={handleCloseSetup}
          onBack={handleCloseSetup}
        />
      )}

      {/* Component Inspector */}
      {showInspector && (
        <ComponentInspector
          components={inspectorData}
          onClose={handleCloseInspector}
        />
      )}

      {/* Log viewer */}
      {showLogViewer && (
        <LogViewer
          messages={logMessages}
          onClose={handleCloseLogViewer}
          onClear={handleClearLogs}
        />
      )}

      {/* WhatsNew is now an inline banner inside ReadyView */}
    </div>
  );
};

// Mount React app
const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
