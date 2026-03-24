/**
 * WhatsNewBanner — Inline dismissable banner for changelog
 *
 * Replaces the full-screen WhatsNewDialog modal.
 * Shows latest version highlight in ReadyView.
 */

import React, { memo } from 'react';
import { CHANGELOG } from '../../config';

interface WhatsNewBannerProps {
  currentVersion: string;
  onDismiss: () => void;
}

export const WhatsNewBanner: React.FC<WhatsNewBannerProps> = memo(({ currentVersion, onDismiss }) => {
  const latest = CHANGELOG[0];
  if (!latest) return null;

  return (
    <div className="whats-new-banner figma-card">
      <div className="whats-new-banner-content">
        <span className="whats-new-banner-text">
          v{currentVersion}: {latest.title}
        </span>
      </div>
      <button
        type="button"
        className="whats-new-banner-close"
        onClick={onDismiss}
        aria-label="Закрыть"
        title="Закрыть"
      >
        ✕
      </button>
    </div>
  );
});

WhatsNewBanner.displayName = 'WhatsNewBanner';
