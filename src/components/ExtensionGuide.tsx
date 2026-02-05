/**
 * ExtensionGuide — Figma-style installation guide
 * 
 * Step-by-step installation instructions with simple styling.
 */

import React, { memo, useCallback, useState } from 'react';
import { EXTENSION_URLS } from '../config';

interface ExtensionGuideProps {
  onBack: () => void;
}

export const ExtensionGuide: React.FC<ExtensionGuideProps> = memo(({ onBack }) => {
  const [copied, setCopied] = useState(false);
  
  const handleDownload = useCallback(() => {
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
      <h1 className="extension-guide-title">Установка расширения</h1>

      {/* Steps */}
      <div className="extension-guide-steps">
        {/* Step 1: Download */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">1</span>
            <span className="extension-guide-step-title">Скачайте расширение</span>
          </div>
          <button 
            type="button"
            className="btn-primary extension-guide-action"
            onClick={handleDownload}
          >
            Скачать .zip
          </button>
        </div>

        {/* Step 2: Open extensions page */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">2</span>
            <span className="extension-guide-step-title">Откройте страницу расширений</span>
          </div>
          <button 
            type="button"
            className="extension-guide-link"
            onClick={handleCopyExtensionsUrl}
          >
            {copied ? '✓ Скопировано' : 'Скопировать chrome://extensions'}
          </button>
          <p className="extension-guide-hint">Вставьте адрес в адресную строку браузера</p>
        </div>

        {/* Step 3: Enable developer mode */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">3</span>
            <span className="extension-guide-step-title">Включите режим разработчика</span>
          </div>
          <p className="extension-guide-hint">Переключатель в правом верхнем углу страницы</p>
        </div>

        {/* Step 4: Load extension */}
        <div className="figma-card extension-guide-step">
          <div className="extension-guide-step-header">
            <span className="step-number">4</span>
            <span className="extension-guide-step-title">Загрузите расширение</span>
          </div>
          <p className="extension-guide-hint">Нажмите «Загрузить распакованное» и выберите папку extension</p>
        </div>
      </div>
    </div>
  );
});

ExtensionGuide.displayName = 'ExtensionGuide';
