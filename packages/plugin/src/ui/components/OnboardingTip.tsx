/**
 * OnboardingTip — one-time first-run hint shown above CompactStrip after the
 * user completes initial SetupFlow successfully.
 *
 * Purpose: the compact strip is visually minimal — just a dot + status text.
 * A brand-new user who just finished pairing has no idea the next move is
 * "open Yandex and click the extension icon". This tip bridges that gap with
 * a single sentence + dismiss button.
 *
 * Shown once per plugin install (tracked via `contentify_onboarding_seen` in
 * `figma.clientStorage`). Dismissed on explicit close OR when the first real
 * import arrives — whichever comes first.
 */

import React, { memo } from 'react';

interface OnboardingTipProps {
  visible: boolean;
  onDismiss: () => void;
}

export const OnboardingTip: React.FC<OnboardingTipProps> = memo(({ visible, onDismiss }) => {
  if (!visible) return null;

  return (
    <div className="onboarding-tip" role="status" aria-live="polite">
      <span className="onboarding-tip__icon" aria-hidden>
        💡
      </span>
      <p className="onboarding-tip__text">
        Откройте Яндекс и нажмите иконку Contentify в панели браузера — данные появятся здесь.
      </p>
      <button
        type="button"
        className="onboarding-tip__close"
        onClick={onDismiss}
        aria-label="Скрыть подсказку"
      >
        ×
      </button>
    </div>
  );
});

OnboardingTip.displayName = 'OnboardingTip';
