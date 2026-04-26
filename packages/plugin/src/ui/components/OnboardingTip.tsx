/**
 * OnboardingTip — one-time first-run hint shown above CompactStrip after the
 * user completes initial SetupFlow successfully.
 *
 * Purpose: the compact strip is visually minimal — just a dot + status text.
 * A brand-new user who just finished pairing has no idea the next move is
 * "open Yandex and click the extension icon". This tip bridges that gap with
 * a single sentence + dismiss button + a clickable "Яндекс" anchor that opens
 * a sample search in a new tab so the user gets a concrete next step instead
 * of having to navigate by hand.
 *
 * Shown once per plugin install (tracked via `contentify_onboarding_seen` in
 * `figma.clientStorage`). Dismissed on explicit close OR when the first real
 * import arrives — whichever comes first.
 */

import React, { memo, useCallback } from 'react';

interface OnboardingTipProps {
  visible: boolean;
  onDismiss: () => void;
}

const SAMPLE_QUERY_URL =
  'https://ya.ru/search/?text=%D0%B4%D0%B8%D0%B2%D0%B0%D0%BD+%D0%BA%D1%83%D0%BF%D0%B8%D1%82%D1%8C';

export const OnboardingTip: React.FC<OnboardingTipProps> = memo(({ visible, onDismiss }) => {
  const handleOpenYandex = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    // Figma plugin iframe blocks anchor navigation; window.open is the canonical
    // way to launch external URLs from the plugin UI.
    window.open(SAMPLE_QUERY_URL, '_blank', 'noopener,noreferrer');
  }, []);

  if (!visible) return null;

  return (
    <div className="onboarding-tip" role="status" aria-live="polite">
      <span className="onboarding-tip__icon" aria-hidden>
        💡
      </span>
      <p className="onboarding-tip__text">
        Откройте{' '}
        <a
          href={SAMPLE_QUERY_URL}
          className="onboarding-tip__link"
          onClick={handleOpenYandex}
          target="_blank"
          rel="noopener noreferrer"
        >
          Яндекс
        </a>{' '}
        и нажмите иконку Contentify в панели браузера — данные появятся здесь.
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
