/**
 * CloudUnreachableBanner — shown when the Cloud Relay is unreachable.
 *
 * Cloud Relay (YC Functions) runs on the internet, so the recovery path is
 * "check your connection" rather than "restart a local daemon". The session
 * code is displayed so the user can verify it matches what they entered in
 * the browser extension.
 *
 * Visibility is controlled by the parent — the banner itself is pure presentation.
 */

import React, { memo } from 'react';

interface CloudUnreachableBannerProps {
  /** Whether to render the banner. Parent computes from appState + relay.connected. */
  visible: boolean;
  /** Current session code (for user verification against their extension setup). */
  sessionCode: string | null;
  /** Retry connection check (delegates to useRelayConnection.checkNow). */
  onRetry: () => void;
  /** Dismiss for the rest of this session. */
  onDismiss: () => void;
}

export const CloudUnreachableBanner: React.FC<CloudUnreachableBannerProps> = memo(
  ({ visible, sessionCode, onRetry, onDismiss }) => {
    if (!visible) return null;

    return (
      <div
        className="cloud-unreachable-banner"
        role="alert"
        aria-live="polite"
        aria-label="Нет связи с Cloud Relay"
      >
        <div className="cloud-unreachable-banner__header">
          <span className="cloud-unreachable-banner__icon" aria-hidden>
            ⚠
          </span>
          <span className="cloud-unreachable-banner__title">Нет связи с Cloud Relay</span>
          <button
            type="button"
            className="cloud-unreachable-banner__close"
            onClick={onDismiss}
            aria-label="Скрыть предупреждение"
          >
            ×
          </button>
        </div>

        <p className="cloud-unreachable-banner__desc">
          Проверьте интернет-соединение.
          {sessionCode ? (
            <>
              {' '}
              Session code: <code className="cloud-unreachable-banner__code">{sessionCode}</code>
            </>
          ) : null}
        </p>

        <div className="cloud-unreachable-banner__actions">
          <button
            type="button"
            className="btn-text cloud-unreachable-banner__retry"
            onClick={onRetry}
            aria-label="Проверить подключение к Cloud Relay"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  },
);

CloudUnreachableBanner.displayName = 'CloudUnreachableBanner';
