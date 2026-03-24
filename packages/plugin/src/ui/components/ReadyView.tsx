/**
 * ReadyView — Minimalist Waiting State (Figma-style)
 *
 * Shows when plugin is ready to receive data from relay.
 * Clean empty state with simple icon and pulse animation.
 */

import React, { memo } from 'react';
import { InboxIcon } from './Icons';
import { OnboardingHint } from './OnboardingHint';
import { WhatsNewBanner } from './WhatsNewBanner';

interface ReadyViewProps {
  lastQuery?: string;
  relayConnected?: boolean;
  isFirstTime?: boolean;
  showWhatsNew?: boolean;
  currentVersion?: string;
  onShowExtensionGuide?: () => void;
  onReimport?: () => void;
  onDismissOnboarding?: () => void;
  onDismissWhatsNew?: () => void;
}

export const ReadyView: React.FC<ReadyViewProps> = memo(({
  lastQuery,
  isFirstTime,
  showWhatsNew,
  currentVersion,
  onShowExtensionGuide,
  onReimport,
  onDismissOnboarding,
  onDismissWhatsNew,
}) => {
  return (
    <div className="ready-view--figma view-animate-in">
      {/* Icon */}
      <div className="ready-view-icon ready-view-icon--pulse">
        <InboxIcon size={32} />
      </div>

      {/* Title */}
      <h2 className="ready-view-title">
        Ожидание данных
      </h2>

      {/* What's new inline banner */}
      {!isFirstTime && showWhatsNew && currentVersion && onDismissWhatsNew && (
        <WhatsNewBanner currentVersion={currentVersion} onDismiss={onDismissWhatsNew} />
      )}

      {/* First-time onboarding hint */}
      {isFirstTime && onDismissOnboarding && (
        <OnboardingHint onDismiss={onDismissOnboarding} />
      )}

      {/* Last query + reimport button */}
      {!isFirstTime && lastQuery && (
        <div className="ready-view-last">
          Последний: «{lastQuery}»
          {onReimport && (
            <button
              type="button"
              className="btn-text-sm ready-view-reimport"
              onClick={onReimport}
            >
              Повторить
            </button>
          )}
        </div>
      )}

      {/* Main instruction */}
      {!isFirstTime && (
        <p className="ready-view-instruction">
          Откройте Яндекс в Chrome с{' '}
          <button
            type="button"
            className="ready-view-link"
            onClick={onShowExtensionGuide}
          >
            расширением Contentify
          </button>
        </p>
      )}
    </div>
  );
});

ReadyView.displayName = 'ReadyView';
