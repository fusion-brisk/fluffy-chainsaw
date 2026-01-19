/**
 * ReadyView — Ready state with illustration
 * 
 * Shows when relay is connected and plugin is ready to receive data.
 * Features animated icon and clear instructions with emoji.
 */

import React, { memo } from 'react';
import { ReadyIcon, BrowserIllustration, LogoIcon } from './Icons';

interface ReadyViewProps {
  lastQuery?: string;
}

export const ReadyView: React.FC<ReadyViewProps> = memo(({ lastQuery }) => {
  return (
    <div className="ready-view">
      {/* Left content */}
      <div className="ready-view-content">
        <div className="ready-view-icon">
          <ReadyIcon className="ready-icon-svg" />
        </div>
        
        <h2 className="ready-view-title">Готов к импорту</h2>
        
        {lastQuery && (
          <div className="ready-view-last">
            Последний: «{lastQuery}»
          </div>
        )}
        
        <div className="ready-view-steps">
          <div className="ready-view-step">
            <span className="ready-view-step-icon">🔍</span>
            <span>1. Откройте поиск в браузере.</span>
          </div>
          <div className="ready-view-step">
            <span className="ready-view-step-icon"><LogoIcon size={14} /></span>
            <span>2. Нажмите на расширение.</span>
          </div>
          <div className="ready-view-step">
            <span className="ready-view-step-icon">📄</span>
            <span>Или перетащите HTML-файл.</span>
          </div>
        </div>
      </div>
      
      {/* Right illustration */}
      <div className="ready-view-illustration">
        <BrowserIllustration className="browser-illustration-svg" />
      </div>
    </div>
  );
});

ReadyView.displayName = 'ReadyView';
