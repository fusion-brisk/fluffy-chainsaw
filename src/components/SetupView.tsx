/**
 * SetupView — Simplified Onboarding
 * 
 * Shows when relay is not connected.
 * Copy-paste installation script + CRX download.
 */

import React, { memo, useState, useCallback } from 'react';

interface SetupViewProps {
  onRetry: () => void;
  isChecking?: boolean;
}

const CRX_URL = 'https://github.com/fusion-brisk/fluffy-chainsaw/releases/latest/download/extension.crx';

// Скрипт установки Relay (минимальный, всё в одну команду)
const INSTALL_SCRIPT = `curl -fsSL https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/scripts/install-relay.sh | bash`;

export const SetupView: React.FC<SetupViewProps> = memo(({ 
  onRetry,
  isChecking = false
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyScript = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const handleOpenTerminal = useCallback(() => {
    // На macOS можно открыть Terminal через AppleScript
    // В контексте Figma UI это не сработает, но покажем инструкцию
    window.open('x-apple.terminal://');
  }, []);

  const handleDownloadCrx = useCallback(() => {
    window.open(CRX_URL, '_blank');
  }, []);

  return (
    <div className="setup-view">
      {/* Header */}
      <div className="setup-header">
        <span className="setup-header-icon">⚙️</span>
        <h1 className="setup-header-title">Первоначальная настройка</h1>
      </div>
      
      {/* Status indicator */}
      <div className="setup-status">
        <div className="setup-status-item setup-status-error">
          <span className="setup-status-icon">○</span>
          <span className="setup-status-text">Relay не подключён</span>
        </div>
      </div>
      
      {/* Step 1: Install Relay */}
      <div className="setup-step">
        <div className="setup-step-header">
          <span className="setup-step-number">1</span>
          <span className="setup-step-title">Установите Relay-сервер</span>
        </div>
        <p className="setup-step-desc">
          Скопируйте команду и вставьте в Terminal:
        </p>
        <div className="setup-script-container">
          <code className="setup-script">{INSTALL_SCRIPT}</code>
          <button 
            type="button"
            className={`setup-copy-button ${copied ? 'copied' : ''}`}
            onClick={handleCopyScript}
            title="Скопировать команду"
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
        <div className="setup-step-actions">
          <button 
            type="button"
            className="setup-button-small"
            onClick={handleOpenTerminal}
          >
            Открыть Terminal
          </button>
        </div>
      </div>
      
      {/* Step 2: Install Extension */}
      <div className="setup-step">
        <div className="setup-step-header">
          <span className="setup-step-number">2</span>
          <span className="setup-step-title">Установите расширение Chrome</span>
        </div>
        <p className="setup-step-desc">
          Скачайте .crx файл и перетащите в chrome://extensions
        </p>
        <div className="setup-step-actions">
          <button 
            type="button"
            className="setup-download-button"
            onClick={handleDownloadCrx}
          >
            Скачать extension.crx
          </button>
        </div>
        <p className="setup-step-hint">
          Включите Developer mode в Chrome перед установкой
        </p>
      </div>
      
      {/* Actions */}
      <div className="setup-actions">
        <button 
          type="button"
          className="setup-button"
          onClick={onRetry}
          disabled={isChecking}
        >
          {isChecking ? (
            <>
              <span className="setup-button-spinner" />
              Проверка...
            </>
          ) : (
            'Проверить подключение'
          )}
        </button>
      </div>
    </div>
  );
});

SetupView.displayName = 'SetupView';
