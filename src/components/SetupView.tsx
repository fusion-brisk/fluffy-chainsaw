/**
 * SetupView — Simplified Onboarding
 * 
 * Shows when relay is not connected.
 * Single installer download with status indicators.
 */

import React, { memo } from 'react';

interface SetupViewProps {
  onRetry: () => void;
  isChecking?: boolean;
}

// TODO: Заменить на реальный URL после создания GitHub Release
const INSTALLER_URL = 'https://github.com/user/fluffy-chainsaw/releases/latest/download/EProductSnippet-Installer.command';

export const SetupView: React.FC<SetupViewProps> = memo(({ 
  onRetry,
  isChecking = false
}) => {
  const handleDownload = () => {
    window.open(INSTALLER_URL, '_blank');
  };

  const handleTryDeeplink = () => {
    // Пробуем запустить Relay через deeplink (если .app установлен)
    window.open('eproductsnippet://start');
  };

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
      
      {/* Main card: Download Installer */}
      <div className="setup-main-card">
        <div className="setup-main-card-icon">📥</div>
        <h2 className="setup-main-card-title">Скачайте установщик</h2>
        <p className="setup-main-card-desc">
          Один файл установит всё необходимое для работы плагина с браузером Chrome
        </p>
        <button 
          type="button"
          className="setup-download-button"
          onClick={handleDownload}
        >
          Скачать установщик
        </button>
        <p className="setup-main-card-hint">
          macOS • Apple Silicon / Intel
        </p>
      </div>
      
      {/* Instructions */}
      <div className="setup-instructions">
        <div className="setup-instruction-step">
          <span className="setup-instruction-number">1</span>
          <span className="setup-instruction-text">Скачайте и запустите файл .command</span>
        </div>
        <div className="setup-instruction-step">
          <span className="setup-instruction-number">2</span>
          <span className="setup-instruction-text">Установите расширение в Chrome</span>
        </div>
        <div className="setup-instruction-step">
          <span className="setup-instruction-number">3</span>
          <span className="setup-instruction-text">Перезапустите Chrome</span>
        </div>
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
        
        <button 
          type="button"
          className="setup-button-secondary"
          onClick={handleTryDeeplink}
          title="Попробовать запустить Relay, если уже установлен"
        >
          Запустить Relay
        </button>
      </div>
    </div>
  );
});

SetupView.displayName = 'SetupView';
