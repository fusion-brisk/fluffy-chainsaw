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
import { useImportFlow } from './hooks/useImportFlow';
import type { RelayDataEvent } from './hooks/useRelayConnection';

// Components
import { ReadyView } from './components/ReadyView';
import { ProcessingView } from './components/ProcessingView';

import { Confetti } from './components/Confetti';
import { ImportConfirmDialog } from './components/ImportConfirmDialog';
import { SuccessView } from './components/SuccessView';
import { SetupFlow } from './components/SetupFlow';
import { StatusBar } from './components/StatusBar';
import { UpdateBanner } from './components/UpdateBanner';
import { LogViewer } from './components/logs/LogViewer';
import type { LogMessage } from './components/logs/LogViewer';
import { ComponentInspector } from './components/ComponentInspector';
import { LogLevel } from '../logger';
import { PORTS } from '../config';

// Default relay URL
const DEFAULT_RELAY_URL = `http://localhost:${PORTS.RELAY}`;

// Main App Component
const App: React.FC = () => {
  // === CORE STATE ===
  const [appState, setAppState] = useState<AppState>('checking');
  const [relayUrl] = useState(() => {
    try {
      return localStorage.getItem('contentify-relay-url') || DEFAULT_RELAY_URL;
    } catch {
      return DEFAULT_RELAY_URL;
    }
  });
  const [hasSelection, setHasSelection] = useState(false);
  const [logMessages, setLogMessages] = useState<LogMessage[]>([]);
  const [inspectorData, setInspectorData] = useState<import('../types').ComponentInspectorData[]>([]);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [relayConnected, setRelayConnected] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(true);

  // === HOOKS ===
  const resizeUI = useResizeUI();
  const panels = usePanelManager(appState, resizeUI);

  // Ref for import flow actions — breaks circular dependency with relay hook
  const importFlowRef = useRef<import('./hooks/useImportFlow').ImportFlow>(null!);

  const markExtensionInstalled = useCallback(() => {
    setExtensionInstalled(true);
    setIsFirstRun(false);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  const relay = useRelayConnection({
    relayUrl,
    enabled: appState !== 'processing' && appState !== 'confirming',
    onDataReceived: useCallback((data: RelayDataEvent) => {
      if (!extensionInstalled) {
        markExtensionInstalled();
      }
      const flow = importFlowRef.current;
      flow.setRelayPayload(data.payload as RelayPayload | null);

      const totalCount = data.rows.length + data.wizardCount;
      const summary = buildImportSummary({
        rows: data.rows,
        wizardCount: data.wizardCount,
        payload: data.payload as { productCard?: { offers?: unknown[]; defaultOffer?: unknown } | null; rawRows?: CSVRow[] } | null,
      });
      flow.showConfirmation({
        rows: data.rows,
        query: data.query,
        source: 'Яндекс',
        entryId: data.entryId,
      });
      flow.updateInfo({ itemCount: totalCount, summary });
    }, [extensionInstalled, markExtensionInstalled]),
    onConnectionChange: useCallback((connected: boolean) => {
      setRelayConnected(connected);
    }, []),
  });

  const importFlow = useImportFlow(appState, setAppState, resizeUI, relay);
  importFlowRef.current = importFlow;

  const versionCheck = useVersionCheck(relay.relayVersion, relay.extensionVersion);
  const mcpStatus = useMcpStatus();

  const handleDismissOnboarding = useCallback(() => {
    setIsFirstRun(false);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  // === PLUGIN MESSAGES ===
  usePluginMessages({
    handlers: {
      onSetupSkippedLoaded: (skipped) => {
        if (skipped) {
          setExtensionInstalled(true);
          setIsFirstRun(false);
        }
      },
      onLog: (message) => {
        let level = LogLevel.SUMMARY;
        if (message.startsWith('[') && message.includes(']')) {
          level = LogLevel.DEBUG;
        }
        const entry: LogMessage = { level, message, timestamp: Date.now() };
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
          importFlow.updateStage(progress.operationType);
        }
      },
      onStats: (stats) => {
        importFlow.setStats(stats);
      },
      onDone: () => {
        importFlow.ackPendingEntry();
        importFlow.finishProcessing('success');
      },
      onRelayPayloadApplied: () => {
        importFlow.ackPendingEntry();
        importFlow.finishProcessing('success');
      },
      onError: () => {
        importFlow.clearPendingEntry();
        importFlow.finishProcessing('error');
      },
      onImportCancelled: () => {
        importFlow.clearPendingEntry();
        importFlow.finishProcessing('cancel');
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
    processingStartTime: null, // processingStartTimeRef is now internal to useImportFlow
  });

  // === INITIALIZATION ===
  useEffect(() => {
    applyFigmaTheme();
    sendMessageToPlugin({ type: 'get-settings' });
    sendMessageToPlugin({ type: 'get-setup-skipped' });
    sendMessageToPlugin({ type: 'check-whats-new' });
  }, []);

  // Transition from checking to ready
  useEffect(() => {
    if (appState === 'checking') {
      const timer = setTimeout(() => {
        if (appState === 'checking') {
          setAppState('ready');
          resizeUI('ready');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [appState, resizeUI]);

  useEffect(() => {
    if (appState === 'checking' && relay.connected) {
      setRelayConnected(true);
      if (appState === 'checking') {
        setAppState('ready');
        resizeUI('ready');
      }
    }
  }, [appState, relay.connected, resizeUI]);

  // === PANEL HANDLERS ===
  const handleShowSetup = useCallback(() => panels.openPanel('setup'), [panels]);
  const handleCloseSetup = useCallback(() => panels.closePanel(), [panels]);
  const handleShowLogViewer = useCallback(() => panels.openPanel('logs'), [panels]);
  const handleCloseLogViewer = useCallback(() => panels.closePanel(), [panels]);
  const handleShowInspector = useCallback(() => panels.openPanel('inspector'), [panels]);
  const handleCloseInspector = useCallback(() => panels.closePanel(), [panels]);

  const handleClearLogs = useCallback(() => {
    setLogMessages([]);
  }, []);

  // === KEYBOARD SHORTCUTS ===
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // === RENDER ===
  const needsSetup = !extensionInstalled;
  const showMainContent = !panels.isPanelOpen;

  return (
    <div className="glass-app">
      {/* StatusBar + banners — visible when main content is shown */}
      {appState !== 'checking' && showMainContent && (
        <>
          <StatusBar
            relayConnected={relayConnected}
            extensionInstalled={extensionInstalled}
            mcpConnected={mcpStatus.connected}
            hasPendingData={importFlow.pending !== null}
            onRelayClick={handleShowSetup}
            onExtensionClick={handleShowSetup}
            onInspectorClick={handleShowInspector}
            onClearQueue={importFlow.clearQueue}
          />
          <UpdateBanner
            relayUpdate={versionCheck.relayUpdate}
            extensionUpdate={versionCheck.extensionUpdate}
            onDismissRelay={versionCheck.dismissRelay}
            onDismissExtension={versionCheck.dismissExtension}
          />
        </>
      )}

      {/* Main content — mutually exclusive via appState */}
      {appState === 'checking' && (
        <div className="checking-view">
          <div className="checking-view-spinner" />
          <span className="checking-view-text">Подключение...</span>
        </div>
      )}

      {showMainContent && (
        <>
          {appState === 'ready' && (
            needsSetup ? (
              <SetupFlow
                relayConnected={relayConnected}
                extensionInstalled={extensionInstalled}
                onComplete={markExtensionInstalled}
                onBack={markExtensionInstalled}
              />
            ) : (
              <ReadyView
                lastQuery={importFlow.lastQuery}
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

          {appState === 'confirming' && importFlow.pending && (
            <ImportConfirmDialog
              query={importFlow.info.query}
              itemCount={importFlow.info.itemCount}
              source={importFlow.info.source}
              summary={importFlow.info.summary}
              hasSelection={hasSelection}
              onConfirm={importFlow.confirm}
              onCancel={importFlow.cancel}
            />
          )}

          {appState === 'processing' && (
            <ProcessingView
              importInfo={importFlow.info}
              onCancel={importFlow.handleCancel}
            />
          )}

          {appState === 'success' && (
            <SuccessView
              query={importFlow.info.query}
              stats={importFlow.lastStats}
              onComplete={importFlow.completeSuccess}
              onShowLogs={handleShowLogViewer}
            />
          )}
        </>
      )}

      {/* Confetti — hidden during panel overlays */}
      {showMainContent && (
        <Confetti
          isActive={importFlow.confettiActive}
          onComplete={importFlow.handleConfettiComplete}
        />
      )}

      {/* Panel overlays — only one at a time */}
      {panels.activePanel === 'setup' && (
        <SetupFlow
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onComplete={handleCloseSetup}
          onBack={handleCloseSetup}
        />
      )}
      {panels.activePanel === 'inspector' && (
        <ComponentInspector
          components={inspectorData}
          onClose={handleCloseInspector}
        />
      )}
      {panels.activePanel === 'logs' && (
        <LogViewer
          messages={logMessages}
          onClose={handleCloseLogViewer}
          onClear={handleClearLogs}
        />
      )}
    </div>
  );
};

// Mount React app
const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
