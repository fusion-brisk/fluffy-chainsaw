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
import { sendMessageToPlugin, generateSessionCode } from '../utils/index';
import { buildImportSummary, buildImportSummaryData } from '../utils/format';

// Hooks
import { useRelayConnection } from './hooks/useRelayConnection';
import { usePluginMessages } from './hooks/usePluginMessages';
import { useVersionCheck } from './hooks/useVersionCheck';

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
import { SetupSplash } from './components/SetupSplash';
import { OnboardingTip } from './components/OnboardingTip';
import { UpdateBanner } from './components/UpdateBanner';
import { CloudUnreachableBanner } from './components/CloudUnreachableBanner';
import { PairedBanner } from './components/PairedBanner';
import { LogViewer } from './components/logs/LogViewer';
import type { LogMessage } from './components/logs/LogViewer';
import { ComponentInspector } from './components/ComponentInspector';
import { PanelLayout } from './components/PanelLayout';
import { WhatsNewContent } from './components/WhatsNewContent';
import { LogLevel, Logger } from '../logger';
import { CLOUD_RELAY_URL, PLUGIN_VERSION } from '../config';

// Main App Component
const App: React.FC = () => {
  // === CORE STATE ===
  const [appState, setAppState] = useState<AppState>('setup');
  // Session code — loaded once from figma.clientStorage on mount.
  // Null means "not configured yet" → setup flow blocks until generated.
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [sessionCodeResolved, setSessionCodeResolved] = useState(false);
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
  // Cloud-unreachable banner: dismissed-this-session flag. Resets whenever relay reconnects,
  // so a second disconnect shows the banner again.
  const [cloudBannerDismissed, setCloudBannerDismissed] = useState(false);
  // "Paired ✓" transient flash after the auto-pair URL handshake completes.
  // Auto-hides after 3 seconds — parent of CompactStrip renders it as a thin banner.
  const [pairedFlashVisible, setPairedFlashVisible] = useState(false);
  const pairedFlashTimerRef = useRef<number | null>(null);

  // First-run onboarding tip — shown above CompactStrip in ready state until
  // either the user dismisses it or the first real import arrives. Persistence
  // is handled by sandbox clientStorage (`check-onboarding-seen` at startup,
  // `mark-onboarding-seen` on dismiss).
  //
  // `onboardingSeenPersisted`: lifetime flag from clientStorage (true = never
  // show again). Set once from the first `onboarding-seen-status` reply.
  // `onboardingTipVisible`: current render state. Controlled by an effect that
  // reveals the tip on first ready+paired transition and hides it on dismiss
  // or on the first real import.
  const [onboardingSeenPersisted, setOnboardingSeenPersisted] = useState<boolean | null>(null);
  const [onboardingTipVisible, setOnboardingTipVisible] = useState(false);

  // Timing instrumentation: wall-clock refs captured at each pipeline transition
  // so durations can be computed and surfaced as [Timing] log entries. Not in
  // state because they don't drive UI — just diagnostics.
  const confirmShownAtRef = useRef<number | null>(null);
  const applyStartedAtRef = useRef<number | null>(null);

  // === HOOKS ===
  const platform = usePlatform();
  const { resize: resizeUI, setSize } = useResizeUI();
  const panels = usePanelManager(appState, resizeUI);

  const importFlowRef = useRef<import('./hooks/useImportFlow').ImportFlow>(null!);

  const markExtensionInstalled = useCallback(() => {
    setExtensionInstalled(true);
    sendMessageToPlugin({ type: 'save-setup-skipped' });
  }, []);

  // Append a `[Timing] ...` line to the Logs panel and mirror to console so the
  // developer sees it in both Figma's plugin console and the in-plugin panel.
  // DEBUG level matches the sandbox-side Logger.debug output pipeline.
  const logTiming = useCallback((message: string) => {
    const entry: LogMessage = { level: LogLevel.DEBUG, message, timestamp: Date.now() };
    setLogMessages((prev) => {
      const next = [...prev, entry];
      return next.length > 500 ? next.slice(-500) : next;
    });
    // eslint-disable-next-line no-console
    console.log(message);
  }, []);

  // Fires once the extension confirms the auto-pair URL handshake via relay pair-ack.
  // Same as real data arrival for "extension installed" purposes, plus a 3s confirmation
  // flash so the user sees explicit feedback.
  const handlePaired = useCallback(() => {
    markExtensionInstalled();
    setPairedFlashVisible(true);
    if (pairedFlashTimerRef.current) clearTimeout(pairedFlashTimerRef.current);
    pairedFlashTimerRef.current = window.setTimeout(() => {
      setPairedFlashVisible(false);
      pairedFlashTimerRef.current = null;
    }, 3000);
  }, [markExtensionInstalled]);

  useEffect(() => {
    return () => {
      if (pairedFlashTimerRef.current) clearTimeout(pairedFlashTimerRef.current);
    };
  }, []);

  const handleSetupComplete = useCallback(() => {
    markExtensionInstalled();
    // NOTE: do NOT set isFirstRun=false here — confetti lifecycle rule
    // requires it only after first successful import (onDone/onRelayPayloadApplied)
    setAppState('checking');
    resizeUI('checking');
  }, [markExtensionInstalled, resizeUI]);

  // Wrapper for ImportConfirmDialog onConfirm — seeds an instant "Подготовка импорта…"
  // message BEFORE posting to sandbox so the user sees feedback within one render
  // tick instead of waiting ~400 ms for the sandbox's first progress reply. The
  // sandbox then overwrites this message as work starts (payload-received, render,
  // images, etc), giving a continuous narrative.
  //
  // Routed through importFlowRef because `importFlow` is defined after this closure
  // and its identity changes each render; the ref gives us a stable late-binding hook.
  const handleDialogConfirm = useCallback(
    (options: Parameters<import('./hooks/useImportFlow').ImportFlow['confirm']>[0]) => {
      setProgressData({ current: 5, total: 100, message: 'Подготовка импорта…' });
      importFlowRef.current?.confirm(options);
    },
    [],
  );

  const relay = useRelayConnection({
    relayUrl: CLOUD_RELAY_URL,
    sessionCode,
    // Polling is active during setup so the auto-pair handshake can land.
    // Regular import entries are guarded by pending/processed entry refs inside
    // the hook, so there's no duplicate-delivery risk.
    enabled: !!sessionCode && appState !== 'processing' && appState !== 'confirming',
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
    onPaired: handlePaired,
    onTiming: logTiming,
  });

  const importFlow = useImportFlow(appState, setAppState, resizeUI, relay);
  importFlowRef.current = importFlow;

  const relayConnected = relay.connected;

  const versionCheck = useVersionCheck(relay.extensionVersion);

  // === PLUGIN MESSAGES ===
  usePluginMessages({
    handlers: {
      onSetupSkippedLoaded: (skipped) => {
        setSetupResolved(true);
        if (skipped) {
          setExtensionInstalled(true);
          // Returning user — stay compact. The transition effect routes appState to
          // 'checking' as soon as sessionCodeResolved is also true; growing to extended
          // size here only to shrink back ~100 ms later was the startup flicker.
          return;
        }
        // First-run user who'll actually see SetupFlow — grow the window.
        if (appState === 'setup') {
          resizeUI('setup');
        }
      },
      onSessionCodeLoaded: (code) => {
        if (code) {
          setSessionCode(code);
        } else {
          // First run: auto-generate a code so the user never has to see/type it.
          // The Pair-extension button uses this code as URL param; extension picks it up.
          const generated = generateSessionCode();
          setSessionCode(generated);
          sendMessageToPlugin({ type: 'set-session-code', code: generated });
        }
        setSessionCodeResolved(true);
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
      onOnboardingSeenStatus: (seen) => {
        // Lifetime flag from clientStorage. If already seen, the reveal effect
        // below will never fire.
        setOnboardingSeenPersisted(seen);
      },
      onDebugReport: (report) => {
        // Cloud relay does not expose /debug yet (planned). Fire-and-forget — 404s are swallowed.
        try {
          fetch(`${CLOUD_RELAY_URL}/debug`, {
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
    },
    processingStartTime: null,
  });

  // === INITIALIZATION ===
  useEffect(() => {
    sendMessageToPlugin({ type: 'get-settings' });
    sendMessageToPlugin({ type: 'get-setup-skipped' });
    sendMessageToPlugin({ type: 'get-session-code' });
    sendMessageToPlugin({ type: 'check-whats-new' });
    sendMessageToPlugin({ type: 'check-onboarding-seen' });
  }, []);

  // Gate setup completion on BOTH: setup skipped AND session code present.
  // Without a session code the cloud relay has no session to scope requests to,
  // so we keep the user in setup until one is generated.
  useEffect(() => {
    if (
      appState === 'setup' &&
      setupResolved &&
      sessionCodeResolved &&
      extensionInstalled &&
      sessionCode
    ) {
      setAppState('checking');
      resizeUI('checking');
    }
  }, [appState, setupResolved, sessionCodeResolved, extensionInstalled, sessionCode, resizeUI]);

  // Cloud reachability check: stay in 'checking' silently while the relay hook
  // attempts its first poll. If it succeeds, the effect below flips us to 'ready'.
  // If no connection inside CHECKING_TIMEOUT_MS, surface an explicit error so the
  // user isn't staring at a fake "ready" state with a blinking offline dot.
  //
  // 15 s budget: Yandex Cloud API Gateway cold starts take 3-5 s on first hit
  // after idle, and the relay hook uses 1 s active polling with an 8 s fetch
  // abort. 15 s comfortably fits 2-3 real probe attempts so transient cold-
  // start misses don't surface an error to the user.
  useEffect(() => {
    if (appState !== 'checking') return;
    const timer = window.setTimeout(() => {
      setErrorMessage('Не удалось подключиться к облаку. Проверьте интернет и повторите.');
      setAppState('error');
      resizeUI('error');
    }, 15000);
    return () => clearTimeout(timer);
  }, [appState, resizeUI]);

  // Timing instrumentation on appState transitions.
  //   confirming: user sees the ImportConfirmDialog — we stamp this as t0 of the
  //               "dialog visible → user acts" segment.
  //   processing: user clicked Confirm, sandbox work starts — stamp t0 of apply.
  //   success/error/ready-from-processing: compute and log apply duration.
  useEffect(() => {
    if (appState === 'confirming') {
      confirmShownAtRef.current = Date.now();
    } else if (appState === 'processing') {
      const now = Date.now();
      if (confirmShownAtRef.current !== null) {
        logTiming(`[Timing] Dialog visible → confirm: ${now - confirmShownAtRef.current}ms`);
        confirmShownAtRef.current = null;
      }
      applyStartedAtRef.current = now;
    } else if (appState === 'success' || appState === 'error' || appState === 'ready') {
      if (applyStartedAtRef.current !== null) {
        logTiming(
          `[Timing] Apply total (UI-observed): ${Date.now() - applyStartedAtRef.current}ms`,
        );
        applyStartedAtRef.current = null;
      }
    }
  }, [appState, logTiming]);

  // First-run onboarding tip reveal: show exactly once, when the user first
  // reaches ready state after pairing, and only if lifetime flag says
  // "never seen". Side-effects on dismiss are handled via `handleDismissOnboardingTip`.
  useEffect(() => {
    if (
      onboardingSeenPersisted === false &&
      appState === 'ready' &&
      extensionInstalled &&
      !panels.isPanelOpen &&
      !onboardingTipVisible
    ) {
      setOnboardingTipVisible(true);
    }
  }, [
    onboardingSeenPersisted,
    appState,
    extensionInstalled,
    panels.isPanelOpen,
    onboardingTipVisible,
  ]);

  // Hide the tip automatically once the first real import arrives — that's
  // proof the user figured it out, no need to keep nagging.
  useEffect(() => {
    if (
      onboardingTipVisible &&
      (appState === 'confirming' || appState === 'processing' || appState === 'success')
    ) {
      setOnboardingTipVisible(false);
      setOnboardingSeenPersisted(true);
      sendMessageToPlugin({ type: 'mark-onboarding-seen' });
    }
  }, [onboardingTipVisible, appState]);

  const handleDismissOnboardingTip = useCallback(() => {
    setOnboardingTipVisible(false);
    setOnboardingSeenPersisted(true);
    sendMessageToPlugin({ type: 'mark-onboarding-seen' });
  }, []);

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
  // Deps include cloudBannerDismissed only to satisfy exhaustive-deps; the guard is
  // idempotent (setState only when transition relayConnected=true + dismissed=true happens).
  useEffect(() => {
    if (relayConnected && cloudBannerDismissed) {
      setCloudBannerDismissed(false);
    }
  }, [relayConnected, cloudBannerDismissed]);

  // Cloud-unreachable banner visibility: shown in compact states when relay is down AND user
  // hasn't dismissed it this session AND we're past setup.
  //   extensionInstalled as "past setup" proxy: setup flow (appState='setup') is the only
  //   flow that can transition to extensionInstalled=true, and once set it stays true for
  //   the session. If extensionInstalled detection breaks, banner stops showing — an
  //   acceptable tradeoff vs. showing a noisy banner DURING the setup wizard.
  //   'checking' is intentionally excluded: that's the silent 5s startup probe — the
  //   CompactStrip shows a spinner instead, and the checking-timeout effect surfaces a
  //   full error if it fails. Showing a half-offline banner during a transient 5s check
  //   is exactly the flicker we want to avoid.
  const showCloudUnreachableBanner =
    !relayConnected &&
    !cloudBannerDismissed &&
    extensionInstalled &&
    (appState === 'ready' || appState === 'error');

  // === COMPACT STRIP RESIZE (for menu) ===
  const bannerCount = versionCheck.extensionUpdate ? 1 : 0;
  // Each update banner: 26px (6+12+6 padding + 2 border) + container 8px top padding + 4px gap
  const updateBannerHeight = bannerCount > 0 ? bannerCount * 26 + (bannerCount > 1 ? 4 : 0) + 8 : 0;
  // Cloud-unreachable banner measured height: ~110px (header 18 + desc 40 + actions 28
  //   + 2×8 gap + 20 padding + 8 margin-top + 2 border). No command block in the cloud
  //   variant — "check internet" copy fits in ~two lines.
  const cloudUnreachableBannerHeight = showCloudUnreachableBanner ? 110 : 0;
  // Paired banner: single line (~12 font + 16 padding + 2 border + 8 margin-top) ≈ 38px.
  const pairedBannerHeight = pairedFlashVisible ? 38 : 0;
  // Onboarding tip: 2-line hint (~14 × 2 + 16 padding + 2 border + 8 margin-top) ≈ 62px.
  const onboardingTipHeight = onboardingTipVisible && appState === 'ready' ? 62 : 0;
  const compactBaseHeight =
    56 +
    updateBannerHeight +
    cloudUnreachableBannerHeight +
    pairedBannerHeight +
    onboardingTipHeight;

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
          // Route by current reachability to avoid a one-frame flash of
          // "Подключение…" when the error was a transient import failure and
          // the relay is already up. Startup timeouts (relay down) enter the
          // checking state so the 5s timeout effect can retry the probe.
          setErrorMessage(undefined);
          if (relayConnected) {
            setAppState('ready');
            resizeUI('ready');
          } else {
            setAppState('checking');
            resizeUI('checking');
          }
          break;
      }
    },
    [panels, importFlow, setAppState, resizeUI, relayConnected],
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
      {/* Setup flow — only for first-run users who don't yet have the extension.
          `!extensionInstalled` guard prevents a single-frame flash of the wizard
          inside the compact 320×56 window on reopen, between `setup-skipped-loaded`
          (sets extensionInstalled) and the transition effect (flips appState). */}
      {appState === 'setup' && setupResolved && sessionCodeResolved && !extensionInstalled && (
        <SetupFlow
          sessionCode={sessionCode}
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onComplete={handleSetupComplete}
          onBack={handleSetupComplete}
        />
      )}
      {/* Splash placeholder — shown during:
          1) clientStorage async reads still resolving (setupResolved or
             sessionCodeResolved still false), OR
          2) returning user (extensionInstalled=true) waiting for the transition
             effect to flip appState to 'checking'.
          Designed to fit the compact 320×56 window so the returning-user path
          never needs to grow/shrink the window during startup. */}
      {appState === 'setup' && (!setupResolved || !sessionCodeResolved || extensionInstalled) && (
        <SetupSplash />
      )}

      {/* Update banners — only in compact ready state, BEFORE strip to stay in flow */}
      {appState === 'ready' && !panels.isPanelOpen && (
        <UpdateBanner
          extensionUpdate={versionCheck.extensionUpdate}
          onDismissExtension={versionCheck.dismissExtension}
        />
      )}

      {/* Cloud-unreachable banner — surfaces "check your internet" when the cloud relay is down */}
      {!panels.isPanelOpen && (
        <CloudUnreachableBanner
          visible={showCloudUnreachableBanner}
          sessionCode={sessionCode}
          onRetry={relay.checkNow}
          onDismiss={() => setCloudBannerDismissed(true)}
        />
      )}

      {/* Pair confirmation flash — shown briefly after the auto-pair handshake */}
      {!panels.isPanelOpen && <PairedBanner visible={pairedFlashVisible} />}

      {/* First-run tip — one-time hint shown above CompactStrip after initial setup,
          gated on clientStorage flag and ready state. */}
      {appState === 'ready' && !panels.isPanelOpen && (
        <OnboardingTip visible={onboardingTipVisible} onDismiss={handleDismissOnboardingTip} />
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
          processingMessage={progressData.message}
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
          onConfirm={handleDialogConfirm}
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
          sessionCode={sessionCode}
          relayConnected={relayConnected}
          extensionInstalled={extensionInstalled}
          onComplete={handleCloseSetup}
          onBack={handleCloseSetup}
          allowRepair
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
