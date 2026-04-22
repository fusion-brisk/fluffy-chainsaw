/**
 * SetupFlow -- 3-step onboarding wizard
 *
 * Step 1: Session code (6-char A-Z0-9, generated once, copied into Chrome extension)
 * Step 2: Browser extension (download CRX, paste session code, auto-detects installation)
 * Step 3: Ready (instructions + "Start" button)
 *
 * Auto-skips completed steps with a brief "already connected" confirmation.
 */

import React, { memo, useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { EXTENSION_URLS } from '../../config';
import { sendMessageToPlugin } from '../../utils/index';
import { StepIndicator } from './StepIndicator';

interface SetupFlowProps {
  sessionCode: string | null;
  onSessionCodeChange: (code: string) => void;
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
    id: 'session',
    title: 'Session code',
    description: 'Код связывает Figma-плагин с расширением браузера через Cloud Relay.',
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

const SESSION_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += SESSION_CODE_CHARS.charAt(Math.floor(Math.random() * SESSION_CODE_CHARS.length));
  }
  return code;
}

export const SetupFlow: React.FC<SetupFlowProps> = memo(
  ({
    sessionCode,
    onSessionCodeChange,
    relayConnected,
    extensionInstalled,
    onComplete,
    onBack,
  }) => {
    const [currentStep, setCurrentStep] = useState(() => {
      if (!sessionCode) return 0;
      if (!extensionInstalled) return 1;
      return 2;
    });
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(() => {
      const initial = new Set<number>();
      if (sessionCode) initial.add(0);
      if (extensionInstalled) initial.add(1);
      return initial;
    });
    const [autoSkipMessage, setAutoSkipMessage] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const autoAdvanceTimerRef = useRef<number | null>(null);
    const copyTimerRef = useRef<number | null>(null);

    const step = STEPS[currentStep];
    const isLastStep = currentStep === STEPS.length - 1;
    const isSessionStep = currentStep === 0;
    const canAdvance = !isSessionStep || !!sessionCode;

    // Memoize steps array for StepIndicator (stable reference)
    const indicatorSteps = useMemo(() => STEPS.map((s) => ({ id: s.id, title: s.title })), []);

    // Cleanup timers on unmount
    useEffect(() => {
      return () => {
        if (autoAdvanceTimerRef.current) {
          clearTimeout(autoAdvanceTimerRef.current);
        }
        if (copyTimerRef.current) {
          clearTimeout(copyTimerRef.current);
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
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
      setAutoSkipMessage(null);
      setCurrentStep(stepIndex);
    }, []);

    // Auto-detect: Step 0 (session code already generated)
    useEffect(() => {
      if (currentStep !== 0 || !sessionCode) return;

      markComplete(0);
      setAutoSkipMessage('Session code уже настроен');

      autoAdvanceTimerRef.current = window.setTimeout(() => {
        autoAdvanceTimerRef.current = null;
        goToStep(1);
      }, 1000);
    }, [currentStep, sessionCode, markComplete, goToStep]);

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
      if (sessionCode) markComplete(0);
    }, [sessionCode, markComplete]);

    useEffect(() => {
      if (extensionInstalled) markComplete(1);
    }, [extensionInstalled, markComplete]);

    const handleGenerate = useCallback(() => {
      const code = generateSessionCode();
      onSessionCodeChange(code);
      sendMessageToPlugin({ type: 'set-session-code', code });
    }, [onSessionCodeChange]);

    const handleCopy = useCallback(() => {
      if (!sessionCode) return;

      const setFeedback = () => {
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copyTimerRef.current = null;
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(sessionCode)
          .then(setFeedback)
          .catch(() => {
            // Fallback to legacy execCommand path (Figma iframe may block modern API)
            try {
              const ta = document.createElement('textarea');
              ta.value = sessionCode;
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
          });
      }
    }, [sessionCode]);

    const handleNext = useCallback(() => {
      if (!canAdvance) return;
      if (isLastStep) {
        onComplete();
      } else {
        markComplete(currentStep);
        goToStep(currentStep + 1);
      }
    }, [canAdvance, currentStep, isLastStep, onComplete, markComplete, goToStep]);

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
        // Never skip the session-code step — it's required for cloud relay.
        if (isSessionStep) return;
        goToStep(currentStep + 1);
      }
    }, [currentStep, isLastStep, isSessionStep, onComplete, goToStep]);

    const handleDownloadExtension = useCallback(() => {
      window.open(EXTENSION_URLS.EXTENSION_DOWNLOAD, '_blank');
    }, []);

    /** Render step-specific content */
    const renderStepContent = (stepIndex: number) => {
      // Show auto-skip confirmation (only for non-current steps that are already satisfied)
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
          return (
            <>
              <p className="setup-flow__hint">
                Нажмите «Сгенерировать», затем скопируйте код в настройки расширения Chrome (Options
                &#8594; Session code).
              </p>
              {sessionCode ? (
                <div
                  className="setup-flow__session-code"
                  role="group"
                  aria-label="Session code и копирование"
                >
                  <code
                    className="setup-flow__session-code-value"
                    aria-label={`Код: ${sessionCode}`}
                  >
                    {sessionCode}
                  </code>
                  <button
                    type="button"
                    className="setup-flow__session-code-copy"
                    onClick={handleCopy}
                    aria-label={copied ? 'Код скопирован' : 'Скопировать session code'}
                  >
                    {copied ? '✓' : 'Copy'}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                onClick={handleGenerate}
                aria-label={
                  sessionCode ? 'Перегенерировать session code' : 'Сгенерировать session code'
                }
              >
                {sessionCode ? 'Перегенерировать' : 'Сгенерировать'}
              </button>
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
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownloadExtension}
                aria-label="Скачать расширение браузера"
              >
                Скачать расширение
              </button>
              <p className="setup-flow__hint">
                Откройте chrome://extensions, включите режим разработчика, перетащите скачанный .crx
                файл на страницу. Не забудьте вставить session code в настройки расширения.
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

    // relayConnected is kept in the prop signature for future use (cloud reachability check)
    // but is not currently gating any UI in the new flow.
    void relayConnected;

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
            <button
              type="button"
              className="btn-text"
              onClick={handlePrev}
              aria-label="Предыдущий шаг"
            >
              &#8592; Назад
            </button>
          )}
          <div className="setup-flow__footer-right">
            {!isLastStep && !isSessionStep && (
              <button
                type="button"
                className="btn-text"
                onClick={handleSkip}
                aria-label="Пропустить шаг"
              >
                Пропустить
              </button>
            )}
            <button
              type="button"
              className="btn-primary setup-flow__btn-next"
              onClick={handleNext}
              disabled={!canAdvance}
              aria-label={isLastStep ? 'Начать работу' : 'Следующий шаг'}
            >
              {isLastStep ? 'Начать' : 'Далее \u2192'}
            </button>
          </div>
        </div>
      </div>
    );
  },
);

SetupFlow.displayName = 'SetupFlow';
