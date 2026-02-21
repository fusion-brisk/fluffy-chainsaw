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
  UserSettings
} from '../types';

export interface PluginMessageHandlers {
  // Settings
  onSettingsLoaded?: (settings: UserSettings) => void;
  onRemoteUrlLoaded?: (url: string) => void;

  // Setup wizard
  onSetupSkippedLoaded?: (skipped: boolean) => void;

  // Parsing Rules
  onParsingRulesLoaded?: (metadata: ParsingRulesMetadata) => void;
  onRulesUpdateAvailable?: (data: { currentVersion: number; newVersion: number; hash: string }) => void;

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

  // Build Page
  onBuildPageDone?: (count: number, frameName: string) => void;

  // Cancel
  onImportCancelled?: () => void;

  // What's New
  onWhatsNewStatus?: (data: { shouldShow: boolean; currentVersion: string }) => void;

  // Logging
  onLogLevelLoaded?: (level: number) => void;

  // Relay payload
  onRelayPayloadApplied?: (data: { success: boolean; itemCount?: number; frameName?: string; error?: string }) => void;

  // Debug
  onDebugReport?: (report: unknown) => void;
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
export function usePluginMessages({ handlers, processingStartTime }: UsePluginMessagesOptions): void {
  // Use ref to avoid recreating the effect on every handler change
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const startTimeRef = useRef(processingStartTime);
  startTimeRef.current = processingStartTime;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginMessage;
      if (!msg || !msg.type) return;

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
              hash: msg.hash
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
              operationType: msg.operationType
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

        // === BUILD PAGE ===
        case 'build-page-done':
          if (h.onBuildPageDone) {
            h.onBuildPageDone(msg.count, msg.frameName);
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
              currentVersion: msg.currentVersion
            });
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
              error: msg.error
            });
          }
          break;

        // === DEBUG ===
        case 'debug-report':
          if (h.onDebugReport) {
            h.onDebugReport(msg.report);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []); // Empty deps - refs handle updates
}
