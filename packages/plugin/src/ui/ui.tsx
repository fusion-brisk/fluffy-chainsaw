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
import { CSVRow, AppState } from '../types';
import type { RelayPayload, ProgressData } from '../types';
import { sendMessageToPlugin } from '../utils/index';
import { buildImportSummary, buildImportSummaryData } from '../utils/format';

// Hooks
import { useRelayConnection } from './hooks/useRelayConnection';
import { usePluginMessages } from './hooks/usePluginMessages';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useBuildCheck } from './hooks/useBuildCheck';

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
import { RelayOfflineBanner } from './components/RelayOfflineBanner';
import { LogViewer } from './components/logs/LogViewer';
import type { LogMessage } from './components/logs/LogViewer';
import { ComponentInspector } from './components/ComponentInspector';
import { PanelLayout } from './components/PanelLayout';
import { WhatsNewContent } from './components/WhatsNewContent';
import { LogLevel, Logger } from '../logger';
import { PORTS, PLUGIN_VERSION } from '../config';

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
  const [inspectorData, setInspectorData] = useState<import('../types').ComponentInspectorData[]>(
    [],
  );
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(true);
  const [lastImportCount, setLastImportCount] = useState<number | undefined>();
  const [lastImportTime, setLastImportTime] = useState<number | undefined>();
  const [setupResolved, setSetupResolved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [progressData, setProgressData] = useState<ProgressData>({ current: 0, total: 0 });
  const [pendingWhatsNew, setPendingWhatsNew] = useState(false);
  // Relay offline banner: dismissed-this-session flag. Resets whenever relay reconnects,
  // so a second disconnect shows the banner again.
  const [relayBannerDismissed, setRelayBannerDismissed] = useState(false);

  // === HOOKS ===
  const platform = usePlatform();
  const { resize: resizeUI, setSize } = useResizeUI();
  const panels = usePanelManager(appState, resizeUI);

  const importFlowRef = useRef<import('./hooks/useImportFlow').ImportFlow>(null!);

  const markExtensionInstalled = useCallback(() => {
    setExtensionInstalled(true);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  const handleSetupComplete = useCallback(() => {
    markExtensionInstalled();
    // NOTE: do NOT set isFirstRun=false here — confetti lifecycle rule
    // requires it only after first successful import (onDone/onRelayPayloadApplied)
    setAppState('checking');
    resizeUI('checking');
  }, [markExtensionInstalled, resizeUI]);

  const relay = useRelayConnection({
    relayUrl,
    enabled: appState !== 'setup' && appState !== 'processing' && appState !== 'confirming',
    onDataReceived: useCallback(
      (data: RelayDataEvent) => {
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
          const payloadTyped = data.payload as {
            productCard?: { offers?: unknown[]; defaultOffer?: unknown } | null;
            rawRows?: CSVRow[];
          } | null;
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
      },
      [extensionInstalled, markExtensionInstalled],
    ),
    onConnectionChange: useCallback(() => {}, []),
  });

  const importFlow = useImportFlow(appState, setAppState, resizeUI, relay);
  importFlowRef.current = importFlow;

  const relayConnected = relay.connected;

  const versionCheck = useVersionCheck(relay.relayVersion, relay.extensionVersion);
  const { buildStale } = useBuildCheck(relayUrl, appState !== 'setup');

  // === PLUGIN MESSAGES ===
  usePluginMessages({
    handlers: {
      onSetupSkippedLoaded: (skipped) => {
        setSetupResolved(true);
        if (skipped) {
          setExtensionInstalled(true);
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
        setLogMessages((prev) => {
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
        // NOTE: isFirstRun is reset in Confetti onComplete, not here.
        // finishProcessing schedules setConfettiActive(true) via setTimeout —
        // setting isFirstRun=false here would race and kill the animation.
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
          setPendingWhatsNew(true);
        }
      },
      onDebugReport: (report) => {
        try {
          const debugRelayUrl = localStorage.getItem('contentify-relay-url') || DEFAULT_RELAY_URL;
          fetch(`${debugRelayUrl}/debug`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report || {}),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        } catch {
          /* ignore */
        }
      },
      onComponentInfo: (components) => {
        setInspectorData(components);
      },
      onExportHtmlResult: (data: { html: string; fileName: string }) => {
        try {
          // Figma plugin iframe is sandboxed — a.click() with download attribute
          // doesn't work. Use data URI + window.open as fallback.
          const blob = new Blob([data.html], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.fileName;
          a.target = '_blank';
          a.rel = 'noopener';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();

          // Fallback: if click didn't trigger download (sandboxed iframe),
          // open in new tab
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 1000);
        } catch (e) {
          // Last resort: copy HTML to clipboard
          navigator.clipboard.writeText(data.html).then(() => {
            Logger.debug('HTML copied to clipboard (download blocked by iframe sandbox)');
          });
        }
      },
      onExportHtmlError: (data: { message: string }) => {
        Logger.error('Export HTML error: ' + data.message);
        // The sandbox already calls figma.notify for user-visible errors
      },
      onAllOperationsComplete: () => {
        if (buildStale) {
          setTimeout(() => {
            sendMessageToPlugin({
              type: 'close-plugin',
              message: 'Плагин обновлён — откройте заново',
            });
          }, 1500);
        }
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

  // Show What's New panel after reaching ready state (deferred from init)
  useEffect(() => {
    if (pendingWhatsNew && appState === 'ready' && !panels.isPanelOpen) {
      setPendingWhatsNew(false);
      panels.openPanel('whatsNew');
    }
  }, [pendingWhatsNew, appState, panels]);

  // Clear dismissal when relay reconnects — next disconnect should show banner again.
  // Deps include relayBannerDismissed only to satisfy exhaustive-deps; the guard is
  // idempotent (setState only when transition relayConnected=true + dismissed=true happens).
  useEffect(() => {
    if (relayConnected && relayBannerDismissed) {
      setRelayBannerDismissed(false);
    }
  }, [relayConnected, relayBannerDismissed]);

  // Relay offline banner visibility: shown in compact states when relay is down AND user
  // hasn't dismissed it this session AND we're past setup.
  //   extensionInstalled as "past setup" proxy: setup flow (appState='setup') is the only
  //   flow that can transition to extensionInstalled=true, and once set it stays true for
  //   the session. If extensionInstalled detection breaks, banner stops showing — an
  //   acceptable tradeoff vs. showing a noisy banner DURING the setup wizard.
  const showRelayOfflineBanner =
    !relayConnected &&
    !relayBannerDismissed &&
    extensionInstalled &&
    (appState === 'ready' || appState === 'checking' || appState === 'error');

  // === COMPACT STRIP RESIZE (for menu) ===
  const bannerCount = (versionCheck.relayUpdate ? 1 : 0) + (versionCheck.extensionUpdate ? 1 : 0);
  // Each update banner: 26px (6+12+6 padding + 2 border) + container 8px top padding + 4px gap
  const updateBannerHeight = bannerCount > 0 ? bannerCount * 26 + (bannerCount > 1 ? 4 : 0) + 8 : 0;
  // Relay offline banner measured height: ~148px (header 18 + desc 20 + cmd 30 + actions 28
  //   + 3×8 gap + 20 padding + 8 margin-top + 2 border)
  const relayOfflineBannerHeight = showRelayOfflineBanner ? 148 : 0;
  const compactBaseHeight = 56 + updateBannerHeight + relayOfflineBannerHeight;

  const handleRequestResize = useCallback(
    (height: number) => {
      setSize(320, height);
    },
    [setSize],
  );

  // Resize window when update banners appear or are dismissed.
  // Uses setSize to cancel any running animation and jump to the correct height.
  useEffect(() => {
    if (appState === 'ready' && !panels.isPanelOpen) {
      setSize(320, compactBaseHeight);
    }
  }, [appState, panels.isPanelOpen, compactBaseHeight, setSize]);

  // Send platform info to sandbox (for future use)
  useEffect(() => {
    sendMessageToPlugin({ type: 'set-platform', platform });
  }, [platform]);

  // === PANEL HANDLERS ===
  const handleCloseSetup = useCallback(() => panels.closePanel(), [panels]);
  const handleCloseLogViewer = useCallback(() => panels.closePanel(), [panels]);
  const handleCloseInspector = useCallback(() => panels.closePanel(), [panels]);
  const handleCloseWhatsNew = useCallback(() => {
    sendMessageToPlugin({ type: 'mark-whats-new-seen', version: PLUGIN_VERSION });
    panels.closePanel();
  }, [panels]);

  const handleClearLogs = useCallback(() => {
    setLogMessages([]);
  }, []);

  // === MENU ACTION HANDLER ===
  const handleMenuAction = useCallback(
    (action: string) => {
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
          panels.openPanel('whatsNew');
          break;
        case 'reimport':
          relay.reimport();
          break;
        case 'clearQueue':
          importFlow.clearQueue();
          break;
        case 'resetSnippets':
          sendMessageToPlugin({ type: 'reset-snippets', scope: 'page' });
          break;
        case 'exportHtml':
          sendMessageToPlugin({ type: 'export-html' });
          break;
        case 'breakpointSkeletons':
          sendMessageToPlugin({ type: 'build-breakpoint-skeletons' });
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
    },
    [panels, importFlow, setAppState, resizeUI, relay],
  );

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
  const compactStripMode =
    appState === 'error'
      ? 'error'
      : appState === 'checking'
        ? 'checking'
        : appState === 'processing'
          ? 'processing'
          : appState === 'success'
            ? 'success'
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

      {/* Update banners — only in compact ready state, BEFORE strip to stay in flow */}
      {appState === 'ready' && !panels.isPanelOpen && (
        <UpdateBanner
          relayUpdate={versionCheck.relayUpdate}
          extensionUpdate={versionCheck.extensionUpdate}
          onDismissRelay={versionCheck.dismissRelay}
          onDismissExtension={versionCheck.dismissExtension}
        />
      )}

      {/* Relay offline banner — actionable recovery path when localhost:3847 is unreachable */}
      {!panels.isPanelOpen && (
        <RelayOfflineBanner
          visible={showRelayOfflineBanner}
          onRetry={relay.checkNow}
          onDismiss={() => setRelayBannerDismissed(true)}
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
          duration={undefined}
          errorMessage={errorMessage}
          lastQuery={importFlow.lastQuery}
          lastImportCount={lastImportCount}
          lastImportTime={lastImportTime}
          hasPendingData={importFlow.pending !== null}
          hasSelection={hasSelection}
          platform={platform}
          baseHeight={compactBaseHeight}
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

      {/* Confetti — for first-run success */}
      {!panels.isPanelOpen && (
        <Confetti
          isActive={importFlow.confettiActive}
          isFirstRun={isFirstRun}
          onComplete={() => {
            importFlow.handleConfettiComplete();
            if (isFirstRun) setIsFirstRun(false);
          }}
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
        <ComponentInspector components={inspectorData} onClose={handleCloseInspector} />
      )}
      {panels.activePanel === 'logs' && (
        <LogViewer
          messages={logMessages}
          onClose={handleCloseLogViewer}
          onClear={handleClearLogs}
        />
      )}
      {panels.activePanel === 'whatsNew' && (
        <PanelLayout title="Что нового" onBack={handleCloseWhatsNew}>
          <WhatsNewContent />
        </PanelLayout>
      )}
    </div>
  );
};

// Mount React app
const root = ReactDOM.createRoot(document.getElementById('react-page') as HTMLElement);
root.render(<App />);
