/**
 * SetupFlow — Unified setup stepper
 *
 * Replaces SetupWizard, ExtensionGuide, and RelayGuide with a single
 * multi-step flow. Auto-skips completed steps based on connection status.
 */

import React, { memo, useCallback, useState, useEffect } from 'react';
import { EXTENSION_URLS } from '../../config';
import { BackButton } from './BackButton';

interface SetupFlowProps {
  relayConnected: boolean;
  extensionInstalled: boolean;
  onComplete: () => void;
  onBack: () => void;
}

/** All setup steps in order */
interface SetupStep {
  id: string;
  title: string;
  group: 'relay' | 'extension';
  autoSkip?: 'relay' | 'extension';
}

const STEPS: readonly SetupStep[] = [
  { id: 'relay-download', title: 'Скачайте Relay', group: 'relay' },
  { id: 'relay-install', title: 'Распакуйте и запустите установщик', group: 'relay' },
  { id: 'relay-verify', title: 'Проверка подключения Relay', group: 'relay', autoSkip: 'relay' },
  { id: 'ext-download', title: 'Скачайте расширение', group: 'extension' },
  { id: 'ext-install', title: 'Загрузите в Chrome', group: 'extension' },
  { id: 'ext-verify', title: 'Проверка расширения', group: 'extension', autoSkip: 'extension' },
];

function getInitialStep(relayConnected: boolean, extensionInstalled: boolean): number {
  if (!relayConnected) return 0;
  if (!extensionInstalled) return 3; // skip to extension steps
  return STEPS.length - 1;
}

export const SetupFlow: React.FC<SetupFlowProps> = memo(({
  relayConnected,
  extensionInstalled,
  onComplete,
  onBack,
}) => {
  const [currentStep, setCurrentStep] = useState(() =>
    getInitialStep(relayConnected, extensionInstalled)
  );
  const [copied, setCopied] = useState(false);

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  // Auto-skip verification steps when connection detected
  useEffect(() => {
    if (!step) return;
    if (step.autoSkip === 'relay' && relayConnected) {
      if (currentStep < totalSteps - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        onComplete();
      }
    }
    if (step.autoSkip === 'extension' && extensionInstalled) {
      onComplete();
    }
  }, [step, relayConnected, extensionInstalled, currentStep, totalSteps, onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  }, [currentStep, totalSteps, onComplete]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else {
      onBack();
    }
  }, [currentStep, onBack]);

  const handleDownloadRelay = useCallback(() => {
    window.open(EXTENSION_URLS.INSTALLER_DOWNLOAD, '_blank');
  }, []);

  const handleDownloadExtension = useCallback(() => {
    window.open(EXTENSION_URLS.EXTENSION_DOWNLOAD, '_blank');
  }, []);

  const handleCopyExtensionsUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EXTENSION_URLS.EXTENSIONS_PAGE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail — user can manually navigate
    }
  }, []);

  // Can skip if relay is already connected (extension steps can be done later)
  const canSkip = relayConnected && !extensionInstalled;

  /** Render step-specific content */
  const renderStepContent = (stepId: string) => {
    switch (stepId) {
      case 'relay-download':
        return (
          <button type="button" className="btn-primary extension-guide-action" onClick={handleDownloadRelay}>
            Скачать установщик
          </button>
        );

      case 'relay-install':
        return (
          <p className="extension-guide-hint">
            Дважды кликните на скачанный .zip файл, откройте Contentify Installer и следуйте инструкциям
          </p>
        );

      case 'relay-verify':
        return relayConnected ? (
          <p className="extension-guide-hint" style={{ color: 'var(--status-connected)' }}>
            ✓ Relay подключён
          </p>
        ) : (
          <p className="extension-guide-hint">
            Ожидание подключения Relay...
          </p>
        );

      case 'ext-download':
        return (
          <button type="button" className="btn-primary extension-guide-action" onClick={handleDownloadExtension}>
            Скачать .zip
          </button>
        );

      case 'ext-install':
        return (
          <>
            <button type="button" className="extension-guide-link" onClick={handleCopyExtensionsUrl}>
              {copied ? '✓ Скопировано' : 'Скопировать chrome://extensions'}
            </button>
            <p className="extension-guide-hint">
              Включите режим разработчика → «Загрузить распакованное» → выберите папку extension
            </p>
          </>
        );

      case 'ext-verify':
        return extensionInstalled ? (
          <p className="extension-guide-hint" style={{ color: 'var(--status-connected)' }}>
            ✓ Расширение установлено
          </p>
        ) : (
          <p className="extension-guide-hint">
            Ожидание подключения расширения...
          </p>
        );

      default:
        return null;
    }
  };

  if (!step) return null;

  return (
    <div className="extension-guide--figma view-animate-in">
      <BackButton onClick={handlePrev} />

      {/* Progress indicator */}
      <div className="setup-flow-progress">
        <span className="setup-flow-progress-text">
          Шаг {currentStep + 1} из {totalSteps}
        </span>
        <div className="setup-flow-progress-bar">
          <div
            className="setup-flow-progress-fill"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Current step */}
      <div className="extension-guide-steps">
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">{currentStep + 1}</span>
            <span className="extension-guide-step-title">{step.title}</span>
          </div>
          {renderStepContent(step.id)}
        </div>
      </div>

      {/* Navigation */}
      <div className="setup-flow-nav">
        {canSkip && (
          <button type="button" className="btn-text" onClick={onComplete}>
            Пропустить
          </button>
        )}
        {!step.autoSkip && (
          <button type="button" className="btn-secondary" onClick={handleNext}>
            {currentStep < totalSteps - 1 ? 'Далее' : 'Готово'}
          </button>
        )}
      </div>
    </div>
  );
});

SetupFlow.displayName = 'SetupFlow';
