/**
 * OnboardingHint — First-time user guide
 *
 * Shows 3-step quick-start instructions for new users.
 * Dismissable — once dismissed, never shown again.
 */

import React, { memo } from 'react';

interface OnboardingHintProps {
  onDismiss: () => void;
}

const STEPS = [
  'Откройте ya.ru и введите поисковый запрос',
  'Нажмите иконку Contentify в панели расширений Chrome',
  'Данные автоматически появятся здесь',
];

export const OnboardingHint: React.FC<OnboardingHintProps> = memo(({ onDismiss }) => {
  return (
    <div className="onboarding-hint">
      <div className="onboarding-hint-steps">
        {STEPS.map((text, i) => (
          <div key={i} className="onboarding-hint-step">
            <span className="step-number">{i + 1}</span>
            <span className="onboarding-hint-text">{text}</span>
          </div>
        ))}
      </div>
      <button type="button" className="btn-secondary onboarding-hint-dismiss" onClick={onDismiss}>
        Понятно
      </button>
    </div>
  );
});

OnboardingHint.displayName = 'OnboardingHint';
