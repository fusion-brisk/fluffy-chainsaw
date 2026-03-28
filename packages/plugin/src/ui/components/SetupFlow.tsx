/**
 * SetupFlow -- 3-step onboarding wizard
 *
 * Step 1: Relay server (download installer, auto-detects connection)
 * Step 2: Browser extension (download CRX, auto-detects installation)
 * Step 3: Ready (instructions + "Start" button)
 *
 * Auto-skips completed steps with a brief "already connected" confirmation.
 */

import React, { memo, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { EXTENSION_URLS } from '../../config';
import { StepIndicator } from './StepIndicator';

interface SetupFlowProps {
  relayConnected: boolean;
  extensionInstalled: boolean;
  onComplete: () => void;
  onBack: () => void;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
}

const STEPS: readonly WizardStep[] = [
  {
    id: 'relay',
    title: 'Relay-сервер',
    description: 'Relay передаёт данные из браузера в Figma',
  },
  {
    id: 'extension',
    title: 'Расширение браузера',
    description: 'Расширение собирает данные с поисковой выдачи',
  },
  {
    id: 'ready',
    title: 'Всё готово!',
    description: 'Откройте поиск Яндекса — данные придут автоматически',
  },
];

export const SetupFlow: React.FC<SetupFlowProps> = memo(
  ({ relayConnected, extensionInstalled, onComplete, onBack }) => {
    const [currentStep, setCurrentStep] = useState(() => {
      if (!relayConnected) return 0;
      if (!extensionInstalled) return 1;
      return 2;
    });
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(() => {
      const initial = new Set<number>();
      if (relayConnected) initial.add(0);
      if (extensionInstalled) initial.add(1);
      return initial;
    });
    const [autoSkipMessage, setAutoSkipMessage] = useState<string | null>(null);
    const autoAdvanceTimerRef = useRef<number | null>(null);

    const step = STEPS[currentStep];
    const isLastStep = currentStep === STEPS.length - 1;

    // Memoize steps array for StepIndicator (stable reference)
    const indicatorSteps = useMemo(() => STEPS.map((s) => ({ id: s.id, title: s.title })), []);

    // Cleanup timer on unmount
    useEffect(() => {
      return () => {
        if (autoAdvanceTimerRef.current) {
          clearTimeout(autoAdvanceTimerRef.current);
        }
      };
    }, []);

    const markComplete = useCallback((stepIndex: number) => {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add(stepIndex);
        return next;
      });
    }, []);

    const goToStep = useCallback((stepIndex: number) => {
      setAutoSkipMessage(null);
      setCurrentStep(stepIndex);
    }, []);

    // Auto-detect: Step 0 (relay)
    useEffect(() => {
      if (currentStep !== 0 || !relayConnected) return;

      markComplete(0);
      setAutoSkipMessage('Уже подключено');

      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        goToStep(1);
      }, 1000);
    }, [currentStep, relayConnected, markComplete, goToStep]);

    // Auto-detect: Step 1 (extension)
    useEffect(() => {
      if (currentStep !== 1 || !extensionInstalled) return;

      markComplete(1);
      setAutoSkipMessage('Уже подключено');

      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        goToStep(2);
      }, 1000);
    }, [currentStep, extensionInstalled, markComplete, goToStep]);

    // Live detection: mark steps as completed when signals arrive
    useEffect(() => {
      if (relayConnected) markComplete(0);
    }, [relayConnected, markComplete]);

    useEffect(() => {
      if (extensionInstalled) markComplete(1);
    }, [extensionInstalled, markComplete]);

    const handleNext = useCallback(() => {
      if (isLastStep) {
        onComplete();
      } else {
        markComplete(currentStep);
        goToStep(currentStep + 1);
      }
    }, [currentStep, isLastStep, onComplete, markComplete, goToStep]);

    const handlePrev = useCallback(() => {
      if (currentStep > 0) {
        goToStep(currentStep - 1);
      } else {
        onBack();
      }
    }, [currentStep, goToStep, onBack]);

    const handleSkip = useCallback(() => {
      if (isLastStep) {
        onComplete();
      } else {
        goToStep(currentStep + 1);
      }
    }, [currentStep, isLastStep, onComplete, goToStep]);

    const handleDownloadRelay = useCallback(() => {
      window.open(EXTENSION_URLS.RELAY_INSTALL_SCRIPT, '_blank');
    }, []);

    const handleDownloadExtension = useCallback(() => {
      window.open(EXTENSION_URLS.EXTENSION_DOWNLOAD, '_blank');
    }, []);

    /** Render step-specific content */
    const renderStepContent = (stepIndex: number) => {
      // Show auto-skip confirmation
      if (autoSkipMessage) {
        return (
          <div className="setup-flow__auto-skip">
            <span className="setup-flow__checkmark">&#10003;</span>
            <span>{autoSkipMessage}</span>
          </div>
        );
      }

      switch (stepIndex) {
        case 0:
          return relayConnected ? (
            <div className="setup-flow__auto-skip">
              <span className="setup-flow__checkmark">&#10003;</span>
              <span>Relay подключён</span>
            </div>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={handleDownloadRelay}>
                Скачать установщик
              </button>
              <p className="setup-flow__hint">Проверяем подключение...</p>
            </>
          );

        case 1:
          return extensionInstalled ? (
            <div className="setup-flow__auto-skip">
              <span className="setup-flow__checkmark">&#10003;</span>
              <span>Расширение установлено</span>
            </div>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={handleDownloadExtension}>
                Скачать расширение
              </button>
              <p className="setup-flow__hint">
                Откройте chrome://extensions, включите режим разработчика, перетащите скачанный .crx
                файл на страницу
              </p>
            </>
          );

        case 2:
          return (
            <p className="setup-flow__hint">
              Введите запрос &#8594; дождитесь SERP &#8594; данные появятся здесь
            </p>
          );

        default:
          return null;
      }
    };

    if (!step) return null;

    return (
      <div className="setup-flow view-animate-in">
        <div className="setup-flow__progress">
          <StepIndicator
            steps={indicatorSteps}
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
        </div>

        <div className="setup-flow__content">
          <h2 className="setup-flow__title">{step.title}</h2>
          <p className="setup-flow__description">{step.description}</p>
          {renderStepContent(currentStep)}
        </div>

        <div className="setup-flow__footer">
          {currentStep > 0 && (
            <button type="button" className="btn-text" onClick={handlePrev}>
              &#8592; Назад
            </button>
          )}
          <div className="setup-flow__footer-right">
            {!isLastStep && (
              <button type="button" className="btn-text" onClick={handleSkip}>
                Пропустить
              </button>
            )}
            <button type="button" className="btn-primary setup-flow__btn-next" onClick={handleNext}>
              {isLastStep ? 'Начать' : 'Далее \u2192'}
            </button>
          </div>
        </div>
      </div>
    );
  },
);

SetupFlow.displayName = 'SetupFlow';
