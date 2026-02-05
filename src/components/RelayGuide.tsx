/**
 * RelayGuide — Figma-style Relay installation guide
 * 
 * Step-by-step installation instructions for Contentify Relay.
 */

import React, { memo, useCallback } from 'react';
import { EXTENSION_URLS } from '../config';

interface RelayGuideProps {
  onBack: () => void;
}

export const RelayGuide: React.FC<RelayGuideProps> = memo(({ onBack }) => {
  const handleDownloadInstaller = useCallback(() => {
    window.open(EXTENSION_URLS.INSTALLER_DOWNLOAD, '_blank');
  }, []);

  return (
    <div className="extension-guide--figma view-animate-in">
      {/* Back button */}
      <button 
        type="button" 
        className="btn-back"
        onClick={onBack}
        aria-label="Назад"
      >
        ← Назад
      </button>

      {/* Title */}
      <h1 className="extension-guide-title">Установка Relay</h1>

      {/* Steps */}
      <div className="extension-guide-steps">
        {/* Step 1: Download installer */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">1</span>
            <span className="extension-guide-step-title">Скачайте установщик</span>
          </div>
          <button 
            type="button"
            className="btn-primary extension-guide-action"
            onClick={handleDownloadInstaller}
          >
            Скачать установщик
          </button>
        </div>

        {/* Step 2: Unzip */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">2</span>
            <span className="extension-guide-step-title">Распакуйте архив</span>
          </div>
          <p className="extension-guide-hint">Дважды кликните на скачанный .zip файл</p>
        </div>

        {/* Step 3: Run installer */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">3</span>
            <span className="extension-guide-step-title">Запустите установщик</span>
          </div>
          <p className="extension-guide-hint">Откройте Contentify Installer и следуйте инструкциям</p>
        </div>

        {/* Step 4: Verify */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">4</span>
            <span className="extension-guide-step-title">Проверьте подключение</span>
          </div>
          <p className="extension-guide-hint">Статус Relay изменится на «Подключён»</p>
        </div>
      </div>
    </div>
  );
});

RelayGuide.displayName = 'RelayGuide';
