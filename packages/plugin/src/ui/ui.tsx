/**
 * Contentify Plugin — UI Entry Point (Relay-Only)
 *
 * Compact-first architecture:
 * - compact (320×56): checking, ready, processing, success, error — via CompactStrip
 * - standard (320×220): confirming only — ImportConfirmDialog
 * - extended (420×520): setup, logs, inspector, whatsNew
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import {
  CSVRow,
  AppState,
} from '../types';
import type { RelayPayload, ProgressData } from '../types';
import {
  sendMessageToPlugin,
} from '../utils/index';
import { buildImportSummary, buildImportSummaryData } from '../utils/format';

// Hooks
import { useRelayConnection } from './hooks/useRelayConnection';
import { usePluginMessages } from './hooks/usePluginMessages';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useMcpStatus } from './hooks/useMcpStatus';
import { usePanelManager } from './hooks/usePanelManager';
import { useResizeUI } from './hooks/useResizeUI';
import { useImportFlow } from './hooks/useImportFlow';
import { usePlatform } from './hooks/usePlatform';
import type { RelayDataEvent } from './hooks/useRelayConnection';

// Components
import { CompactStrip } from './components/CompactStrip';
import { Confetti } from './components/Confetti';
import { ImportConfirmDialog } from './components/ImportConfirmDialog';
import { SetupFlow } from './components/SetupFlow';
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
  const [appState, setAppState] = useState<AppState>('setup');
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
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(true);
  const [lastImportCount, setLastImportCount] = useState<number | undefined>();
  const [lastImportTime, setLastImportTime] = useState<number | undefined>();
  const [setupResolved, setSetupResolved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [progressData, setProgressData] = useState<ProgressData>({ current: 0, total: 0 });

  // === HOOKS ===
  const platform = usePlatform();
  const resizeUI = useResizeUI();
  const panels = usePanelManager(appState, resizeUI);

  const importFlowRef = useRef<import('./hooks/useImportFlow').ImportFlow>(null!);

  const markExtensionInstalled = useCallback(() => {
    setExtensionInstalled(true);
    setIsFirstRun(false);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  const handleSetupComplete = useCallback(() => {
    markExtensionInstalled();
    setAppState('checking');
    resizeUI('checking');
  }, [markExtensionInstalled, resizeUI]);

  const relay = useRelayConnection({
    relayUrl,
    enabled: appState !== 'setup' && appState !== 'processing' && appState !== 'confirming',
    onDataReceived: useCallback((data: RelayDataEvent) => {
      if (!extensionInstalled) {
        markExtensionInstalled();
      }
      const flow = importFlowRef.current;

      const isFeed = data.sourceType === 'feed';

      if (isFeed) {
        // Feed pipeline — no relay payload storage needed
        const feedCardCount = data.feedCards?.length || 0;
        flow.showConfirmation({
          rows: [],
          query: 'ya.ru фид',
          source: 'ya.ru',
          entryId: data.entryId,
          sourceType: 'feed',
          feedCards: data.feedCards,
        });
        flow.updateInfo({
          itemCount: feedCardCount,
          summary: `${feedCardCount} ${feedCardCount < 5 ? 'карточки' : 'карточек'} фида`,
        });
      } else {
        // SERP pipeline (existing path)
        flow.setRelayPayload(data.payload as RelayPayload | null);

        const totalCount = data.rows.length + data.wizardCount;
        const payloadTyped = data.payload as { productCard?: { offers?: unknown[]; defaultOffer?: unknown } | null; rawRows?: CSVRow[] } | null;
        const summary = buildImportSummary({
          rows: data.rows,
          wizardCount: data.wizardCount,
          payload: payloadTyped,
        });
        const summaryData = buildImportSummaryData({
          rows: data.rows,
          wizardCount: data.wizardCount,
          payload: payloadTyped,
        });
        flow.showConfirmation({
          rows: data.rows,
          query: data.query,
          source: 'Яндекс',
          entryId: data.entryId,
        });
        flow.updateInfo({ itemCount: totalCount, summary, summaryData });
      }
    }, [extensionInstalled, markExtensionInstalled]),
    onConnectionChange: useCallback(() => {}, []),
  });

  const importFlow = useImportFlow(appState, setAppState, resizeUI, relay);
  importFlowRef.current = importFlow;

  const relayConnected = relay.connected;

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
        setSetupResolved(true);
        if (skipped) {
          setExtensionInstalled(true);
          setIsFirstRun(false);
          if (appState === 'setup') {
            setAppState('checking');
            resizeUI('checking');
          }
        } else {
          if (appState === 'setup') {
            resizeUI('setup');
          }
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
        setProgressData(progress);
        if (appState === 'processing' && progress.operationType) {
          importFlow.updateStage(progress.operationType);
        }
      },
      onStats: (stats) => {
        importFlow.setStats(stats);
      },
      onDone: () => {
        setLastImportCount(importFlow.info.itemCount || undefined);
        setLastImportTime(Date.now());
        importFlow.ackPendingEntry();
        importFlow.finishProcessing('success');
      },
      onRelayPayloadApplied: () => {
        setLastImportCount(importFlow.info.itemCount || undefined);
        setLastImportTime(Date.now());
        importFlow.ackPendingEntry();
        importFlow.finishProcessing('success');
      },
      onError: (message) => {
        setErrorMessage(message || 'Ошибка импорта');
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
    processingStartTime: null,
  });

  // === INITIALIZATION ===
  useEffect(() => {
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
      setAppState('ready');
      resizeUI('ready');
    }
  }, [appState, relay.connected, resizeUI]);

  // === COMPACT STRIP RESIZE (for menu) ===
  const handleRequestResize = useCallback((height: number) => {
    sendMessageToPlugin({ type: 'resize-ui', width: 320, height });
  }, []);

  // Send platform info to sandbox (for future use)
  useEffect(() => {
    sendMessageToPlugin({ type: 'set-platform', platform });
  }, [platform]);

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

  // === MENU ACTION HANDLER ===
  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'logs':
        panels.openPanel('logs');
        break;
      case 'inspector':
        panels.openPanel('inspector');
        break;
      case 'setup':
        panels.openPanel('setup');
        break;
      case 'whatsNew':
        setShowWhatsNew(true);
        // TODO: could open whatsNew panel
        break;
      case 'clearQueue':
        importFlow.clearQueue();
        break;
      case 'dismiss-success':
        importFlow.completeSuccess();
        break;
      case 'dismiss-error':
        setErrorMessage(undefined);
        setAppState('ready');
        resizeUI('ready');
        break;
    }
  }, [panels, importFlow, setAppState, resizeUI]);

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

  // === COMPACT STRIP MODE ===
  const compactStripMode = appState === 'error' ? 'error'
    : appState === 'checking' ? 'checking'
    : appState === 'processing' ? 'processing'
    : appState === 'success' ? 'success'
    : 'ready';

  const isCompactState = ['checking', 'ready', 'processing', 'success', 'error'].includes(appState);

  // === RENDER ===
  return (
    <div className="glass-app">
      {/* Setup flow — initial or as panel */}
      {appState === 'setup' && setupResolved && (
        <SetupFlow
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onComplete={handleSetupComplete}
          onBack={handleSetupComplete}
        />
      )}

      {/* Compact strip — checking, ready, processing, success, error */}
      {isCompactState && !panels.isPanelOpen && (
        <CompactStrip
          mode={compactStripMode}
          connected={relayConnected && extensionInstalled}
          current={progressData.current}
          total={progressData.total}
          count={importFlow.lastStats?.processedInstances || importFlow.lastStats?.totalInstances}
          duration={importFlow.lastStats ? undefined : undefined}
          errorMessage={errorMessage}
          lastQuery={importFlow.lastQuery}
          lastImportCount={lastImportCount}
          lastImportTime={lastImportTime}
          hasPendingData={importFlow.pending !== null}
          platform={platform}
          onRequestResize={handleRequestResize}
          onMenuAction={handleMenuAction}
        />
      )}

      {/* Confirming — standard size dialog */}
      {appState === 'confirming' && !panels.isPanelOpen && importFlow.pending && (
        <ImportConfirmDialog
          query={importFlow.info.query}
          itemCount={importFlow.info.itemCount}
          source={importFlow.info.source}
          summaryData={importFlow.info.summaryData}
          hasSelection={hasSelection}
          sourceType={importFlow.pending?.sourceType}
          onConfirm={importFlow.confirm}
          onCancel={importFlow.cancel}
          onClearQueue={importFlow.clearQueue}
        />
      )}

      {/* Update banners — only in compact ready state */}
      {appState === 'ready' && !panels.isPanelOpen && (
        <UpdateBanner
          relayUpdate={versionCheck.relayUpdate}
          extensionUpdate={versionCheck.extensionUpdate}
          onDismissRelay={versionCheck.dismissRelay}
          onDismissExtension={versionCheck.dismissExtension}
        />
      )}

      {/* Confetti — for first-run success */}
      {!panels.isPanelOpen && (
        <Confetti
          isActive={importFlow.confettiActive}
          isFirstRun={isFirstRun}
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
