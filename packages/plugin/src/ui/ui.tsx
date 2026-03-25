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
import { usePanelManager } from './hooks/usePanelManager';
import { useResizeUI } from './hooks/useResizeUI';
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
  const [logMessages, setLogMessages] = useState<LogMessage[]>([]);
  const [inspectorData, setInspectorData] = useState<import('../types').ComponentInspectorData[]>([]);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [lastStats, setLastStats] = useState<ProcessingStats | null>(null);
  const [relayConnected, setRelayConnected] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(true);
  // Panel manager replaces showSetup/showLogViewer/showInspector + previousStateRef

  // Processing refs
  const processingStartTimeRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Relay payload ref for loading
  const relayPayloadRef = useRef<RelayPayload | null>(null);
  const pendingEntryIdRef = useRef<string | null>(null);

  // === ANIMATED RESIZE ===
  const resizeUI = useResizeUI();

  // === PANEL MANAGER ===
  const panels = usePanelManager(appState, resizeUI);

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
        // Acknowledge relay data after successful load
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
        scope,
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

  // Panel open/close handlers derived from usePanelManager
  const handleShowSetup = useCallback(() => panels.openPanel('setup'), [panels]);
  const handleCloseSetup = useCallback(() => panels.closePanel(), [panels]);
  const handleShowLogViewer = useCallback(() => panels.openPanel('logs'), [panels]);
  const handleCloseLogViewer = useCallback(() => panels.closePanel(), [panels]);

  const handleClearLogs = useCallback(() => {
    setLogMessages([]);
  }, []);

  // === KEYBOARD SHORTCUTS ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+L → toggle log viewer
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        if (panels.activePanel === 'logs') {
          panels.closePanel();
        } else {
          panels.openPanel('logs');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panels]);

  const handleShowInspector = useCallback(() => panels.openPanel('inspector'), [panels]);
  const handleCloseInspector = useCallback(() => panels.closePanel(), [panels]);

  const handleCancel = useCallback(() => {
    // Cancel is a no-op for relay imports (they complete atomically)
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
      {/* StatusBar — always visible except during checking or when a panel overlay is open */}
      {appState !== 'checking' && !panels.isPanelOpen && (
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
      {appState !== 'checking' && !panels.isPanelOpen && (
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
      {appState === 'ready' && !panels.isPanelOpen && (
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
      {appState === 'confirming' && pendingImport && !panels.isPanelOpen && (
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
      {appState === 'processing' && !panels.isPanelOpen && (
        <ProcessingView
          importInfo={importInfo}
          onCancel={handleCancel}
        />
      )}

      {/* Success state */}
      {appState === 'success' && !panels.isPanelOpen && (
        <SuccessView
          query={importInfo.query}
          stats={lastStats}
          onComplete={handleSuccessComplete}
          onShowLogs={handleShowLogViewer}
        />
      )}

      {/* Confetti celebration (success only) */}
      {panels.activePanel !== 'logs' && panels.activePanel !== 'inspector' && (
        <Confetti
          isActive={confettiActive}
          onComplete={handleConfettiComplete}
        />
      )}

      {/* Unified setup flow (relay + extension) */}
      {panels.activePanel === 'setup' && (
        <SetupFlow
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onComplete={handleCloseSetup}
          onBack={handleCloseSetup}
        />
      )}

      {/* Component Inspector */}
      {panels.activePanel === 'inspector' && (
        <ComponentInspector
          components={inspectorData}
          onClose={handleCloseInspector}
        />
      )}

      {/* Log viewer */}
      {panels.activePanel === 'logs' && (
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
