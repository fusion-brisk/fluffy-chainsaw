/**
 * RelayOfflineBanner — shown when relay is unreachable on localhost:3847.
 *
 * Surfaces an actionable recovery path: one-click copy of the `launchctl kickstart`
 * command the user can paste into Terminal. Optional fallback: reinstall via the
 * installer download URL.
 *
 * Visibility is controlled by the parent — the banner itself is pure presentation.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { RELAY_RESTART_SHELL_COMMAND } from './relay-offline-banner-constants';

interface RelayOfflineBannerProps {
  /** Whether to render the banner. Parent computes from appState + relay.connected. */
  visible: boolean;
  /** Retry connection check (delegates to useRelayConnection.checkNow). */
  onRetry: () => void;
  /** Dismiss for the rest of this session. */
  onDismiss: () => void;
}

export const RelayOfflineBanner: React.FC<RelayOfflineBannerProps> = memo(
  ({ visible, onRetry, onDismiss }) => {
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);

    // Clear copy-feedback timer on unmount to avoid setState on unmounted component
    useEffect(() => {
      return () => {
        if (copyTimerRef.current) {
          clearTimeout(copyTimerRef.current);
        }
      };
    }, []);

    const handleCopy = useCallback(() => {
      const setFeedback = () => {
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copyTimerRef.current = null;
        }, 2000);
      };

      // Fallback path: deprecated textarea+execCommand — still needed because Figma iframe
      // may block clipboard-write permission in some environments.
      const fallbackCopy = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = RELAY_RESTART_SHELL_COMMAND;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setFeedback();
        } catch {
          /* silently ignore */
        }
      };

      // Modern clipboard API first; fall back if permission denied.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(RELAY_RESTART_SHELL_COMMAND)
          .then(setFeedback)
          .catch(fallbackCopy);
        return;
      }
      fallbackCopy();
    }, []);

    if (!visible) return null;

    return (
      <div
        className="relay-offline-banner"
        role="alert"
        aria-live="polite"
        aria-label="Relay сервер не отвечает"
      >
        <div className="relay-offline-banner__header">
          <span className="relay-offline-banner__icon" aria-hidden>
            ⚠
          </span>
          <span className="relay-offline-banner__title">Relay не отвечает</span>
          <button
            type="button"
            className="relay-offline-banner__close"
            onClick={onDismiss}
            aria-label="Скрыть предупреждение"
          >
            ×
          </button>
        </div>

        <p className="relay-offline-banner__desc">
          Скопируй команду и выполни в Terminal, чтобы запустить сервер:
        </p>

        <div className="relay-offline-banner__cmd">
          <code className="relay-offline-banner__cmd-text">{RELAY_RESTART_SHELL_COMMAND}</code>
          <button
            type="button"
            className="relay-offline-banner__cmd-copy"
            onClick={handleCopy}
            aria-label={copied ? 'Команда скопирована' : 'Скопировать команду'}
          >
            {copied ? '✓' : 'Copy'}
          </button>
        </div>

        <div className="relay-offline-banner__actions">
          <button
            type="button"
            className="btn-text relay-offline-banner__retry"
            onClick={onRetry}
            aria-label="Проверить подключение к Relay"
          >
            Проверить заново
          </button>
        </div>
      </div>
    );
  },
);

RelayOfflineBanner.displayName = 'RelayOfflineBanner';
