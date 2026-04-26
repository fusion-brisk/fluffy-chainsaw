/**
 * usePluginMessages - Custom hook for handling plugin messages
 *
 * Centralizes all window.onmessage handling logic from ui.tsx
 * Provides type-safe message processing with callbacks
 */

import { useEffect, useRef } from 'react';
import {
  PluginMessage,
  ProcessingStats,
  ProgressData,
  ParsingRulesMetadata,
  UserSettings,
  ComponentInspectorData,
} from '../../types';

export interface PluginMessageHandlers {
  // Settings
  onSettingsLoaded?: (settings: UserSettings) => void;
  onRemoteUrlLoaded?: (url: string) => void;

  // Setup wizard
  onSetupSkippedLoaded?: (skipped: boolean) => void;

  // Cloud relay session code
  onSessionCodeLoaded?: (sessionCode: string | null) => void;

  // Parsing Rules
  onParsingRulesLoaded?: (metadata: ParsingRulesMetadata) => void;
  onRulesUpdateAvailable?: (data: {
    currentVersion: number;
    newVersion: number;
    hash: string;
  }) => void;

  // Selection
  onSelectionStatus?: (hasSelection: boolean) => void;

  // Processing
  onLog?: (message: string) => void;
  onProgress?: (progress: ProgressData) => void;
  onStats?: (stats: ProcessingStats) => void;
  onDone?: (count: number, elapsedTime: number | null) => void;
  onError?: (message: string) => void;

  // Reset
  onResetDone?: (count: number) => void;

  // Cancel
  onImportCancelled?: () => void;

  // What's New
  onWhatsNewStatus?: (data: { shouldShow: boolean; currentVersion: string }) => void;
  onOnboardingSeenStatus?: (seen: boolean) => void;

  // Logging
  onLogLevelLoaded?: (level: number) => void;

  // Relay payload
  onRelayPayloadApplied?: (data: {
    success: boolean;
    itemCount?: number;
    frameName?: string;
    frameId?: string;
    error?: string;
  }) => void;

  // Debug
  onDebugReport?: (report: unknown) => void;

  // Component Inspector
  onComponentInfo?: (components: ComponentInspectorData[]) => void;

  // Export HTML
  onExportHtmlResult?: (data: { html: string; fileName: string }) => void;
  onExportHtmlError?: (data: { message: string }) => void;
}

interface UsePluginMessagesOptions {
  handlers: PluginMessageHandlers;
  processingStartTime: number | null;
}

/**
 * Hook to handle incoming plugin messages
 *
 * @param options - Configuration with handlers and state refs
 */
export function usePluginMessages({
  handlers,
  processingStartTime,
}: UsePluginMessagesOptions): void {
  // Use ref to avoid recreating the effect on every handler change
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const startTimeRef = useRef(processingStartTime);
  startTimeRef.current = processingStartTime;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage;
      if (!msg || !msg.type) return;

      // Slot post-process echo — untyped roundtrip message
      if ((msg as { type: string }).type === 'slot-postprocess-echo') {
        parent.postMessage({ pluginMessage: { type: 'slot-postprocess-execute' } }, '*');
        return;
      }

      const h = handlersRef.current;

      switch (msg.type) {
        // === SETTINGS ===
        case 'settings-loaded':
          if (h.onSettingsLoaded && msg.settings) {
            h.onSettingsLoaded(msg.settings);
          }
          break;

        case 'remote-url-loaded':
          if (h.onRemoteUrlLoaded) {
            h.onRemoteUrlLoaded(msg.url);
          }
          break;

        // === SETUP WIZARD ===
        case 'setup-skipped-loaded':
          if (h.onSetupSkippedLoaded) {
            h.onSetupSkippedLoaded(msg.skipped);
          }
          break;

        // === CLOUD RELAY SESSION CODE ===
        case 'session-code-loaded':
          if (h.onSessionCodeLoaded) {
            h.onSessionCodeLoaded(msg.sessionCode);
          }
          break;

        // === PARSING RULES ===
        case 'parsing-rules-loaded':
          if (h.onParsingRulesLoaded) {
            h.onParsingRulesLoaded(msg.metadata);
          }
          break;

        case 'rules-update-available':
          if (h.onRulesUpdateAvailable) {
            h.onRulesUpdateAvailable({
              currentVersion: msg.currentVersion,
              newVersion: msg.newVersion,
              hash: msg.hash,
            });
          }
          break;

        // === SELECTION ===
        case 'selection-status':
          if (h.onSelectionStatus) {
            h.onSelectionStatus(msg.hasSelection);
          }
          break;

        // === PROCESSING ===
        case 'log':
          if (h.onLog) {
            h.onLog(msg.message);
          }
          break;

        case 'progress':
          if (h.onProgress) {
            h.onProgress({
              current: msg.current,
              total: msg.total,
              message: msg.message,
              operationType: msg.operationType,
            });
          }
          break;

        case 'stats':
          if (h.onStats) {
            h.onStats(msg.stats);
          }
          break;

        case 'done':
          if (h.onDone) {
            let elapsedTime: number | null = null;
            if (startTimeRef.current) {
              elapsedTime = Date.now() - startTimeRef.current;
            }
            h.onDone(msg.count, elapsedTime);
          }
          break;

        case 'error':
          if (h.onError) {
            h.onError(msg.message);
          }
          break;

        // === RESET ===
        case 'reset-done':
          if (h.onResetDone) {
            h.onResetDone(msg.count);
          }
          break;

        // === CANCEL ===
        case 'import-cancelled':
          if (h.onImportCancelled) {
            h.onImportCancelled();
          }
          break;

        // === WHAT'S NEW ===
        case 'whats-new-status':
          if (h.onWhatsNewStatus) {
            h.onWhatsNewStatus({
              shouldShow: msg.shouldShow,
              currentVersion: msg.currentVersion,
            });
          }
          break;

        // === ONBOARDING TIP ===
        case 'onboarding-seen-status':
          if (h.onOnboardingSeenStatus) {
            h.onOnboardingSeenStatus(msg.seen);
          }
          break;

        // === LOGGING ===
        case 'log-level-loaded':
          if (h.onLogLevelLoaded) {
            h.onLogLevelLoaded(msg.level);
          }
          break;

        // === RELAY PAYLOAD ===
        case 'relay-payload-applied':
          if (h.onRelayPayloadApplied) {
            h.onRelayPayloadApplied({
              success: msg.success,
              itemCount: msg.itemCount,
              frameName: msg.frameName,
              frameId: msg.frameId,
              error: msg.error,
            });
          }
          break;

        // === DEBUG ===
        case 'debug-report':
          if (h.onDebugReport) {
            h.onDebugReport(msg.report);
          }
          break;

        // === COMPONENT INSPECTOR ===
        case 'component-info':
          if (h.onComponentInfo) {
            h.onComponentInfo(msg.components);
          }
          break;

        // === EXPORT HTML ===
        case 'export-html-result':
          if (h.onExportHtmlResult)
            h.onExportHtmlResult(
              msg as { type: 'export-html-result'; html: string; fileName: string },
            );
          break;
        case 'export-html-error':
          if (h.onExportHtmlError)
            h.onExportHtmlError(msg as { type: 'export-html-error'; message: string });
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []); // Empty deps - refs handle updates
}
