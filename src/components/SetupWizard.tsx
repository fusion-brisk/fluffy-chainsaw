/**
 * SetupWizard — Figma-style setup wizard
 * 
 * Shows when relay or extension is not configured.
 * Uses simple cards with step numbers.
 */

import React, { memo, useCallback, useState } from 'react';
import { EXTENSION_URLS } from '../config';

interface SetupWizardProps {
  relayConnected: boolean;
  extensionInstalled: boolean;
  onSkip?: () => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = memo(({
  relayConnected,
  extensionInstalled,
  onSkip
}) => {
  const [copied, setCopied] = useState(false);
  
  const handleDownloadInstaller = useCallback(() => {
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
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  // If both are configured, don't show the wizard
  if (relayConnected && extensionInstalled) {
    return null;
  }

  return (
    <div className="setup-wizard--figma view-animate-in">
      {/* Header */}
      <div className="setup-wizard-header">
        <h2 className="setup-wizard-title">Настройка</h2>
        {onSkip && relayConnected && (
          <button type="button" className="btn-text" onClick={onSkip}>
            Пропустить
          </button>
        )}
      </div>

      {/* Steps */}
      <div className="setup-wizard-steps">
        {/* Step 1: Relay Host */}
        <div className={`figma-card setup-wizard-step ${relayConnected ? 'setup-wizard-step--completed' : ''}`}>
          <div className="setup-wizard-step-header">
            <span className="step-number">
              {relayConnected ? '✓' : '1'}
            </span>
            <span className="setup-wizard-step-title">Установить Relay Host</span>
          </div>
          {!relayConnected && (
            <button
              type="button"
              className="btn-primary setup-wizard-action"
              onClick={handleDownloadInstaller}
            >
              Скачать установщик
            </button>
          )}
        </div>

        {/* Step 2: Extension */}
        <div className={`figma-card setup-wizard-step ${extensionInstalled ? 'setup-wizard-step--completed' : ''}`}>
          <div className="setup-wizard-step-header">
            <span className="step-number">
              {extensionInstalled ? '✓' : '2'}
            </span>
            <span className="setup-wizard-step-title">Установить расширение</span>
          </div>
          {!extensionInstalled && (
            <>
              <button
                type="button"
                className="btn-primary setup-wizard-action"
                onClick={handleDownloadExtension}
              >
                Скачать .zip
              </button>
              
              <button
                type="button"
                className="setup-wizard-link"
                onClick={handleCopyExtensionsUrl}
              >
                {copied ? '✓ Скопировано' : 'Скопировать chrome://extensions'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

SetupWizard.displayName = 'SetupWizard';
