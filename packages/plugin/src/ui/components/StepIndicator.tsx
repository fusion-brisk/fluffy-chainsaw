/**
 * StepIndicator -- horizontal dot-line progress indicator
 *
 * Shows completed (filled), current (pulsing ring), and future (grey) steps
 * connected by solid (completed) or dashed (future) lines.
 */

import React, { memo } from 'react';

export interface StepIndicatorProps {
  steps: Array<{ id: string; title: string }>;
  currentStep: number;
  completedSteps: Set<number>;
}

export const StepIndicator: React.FC<StepIndicatorProps> = memo(({
  steps,
  currentStep,
  completedSteps,
}) => {
  return (
    <div className="step-indicator" role="navigation" aria-label="Прогресс настройки">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.has(index);
        const isCurrent = index === currentStep;

        const dotClass = isCompleted
          ? 'step-indicator__dot step-indicator__dot--completed'
          : isCurrent
            ? 'step-indicator__dot step-indicator__dot--current'
            : 'step-indicator__dot step-indicator__dot--future';

        return (
          <React.Fragment key={step.id}>
            {index > 0 && (
              <div
                className={
                  completedSteps.has(index - 1) && (isCompleted || isCurrent)
                    ? 'step-indicator__line step-indicator__line--completed'
                    : 'step-indicator__line step-indicator__line--future'
                }
              />
            )}
            <div
              className={dotClass}
              title={step.title}
              aria-label={`${step.title}: ${isCompleted ? 'завершено' : isCurrent ? 'текущий' : 'впереди'}`}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
});

StepIndicator.displayName = 'StepIndicator';
