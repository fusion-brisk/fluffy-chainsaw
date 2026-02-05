/**
 * ReadyView — Minimalist Waiting State (Figma-style)
 * 
 * Shows when plugin is ready to receive data.
 * Clean empty state with simple icon.
 * 
 * CLIPBOARD-FIRST: Works with or without relay connection.
 */

import React, { memo } from 'react';
import { InboxIcon } from './Icons';
import { getPasteShortcut } from '../utils/format';

interface ReadyViewProps {
  lastQuery?: string;
  relayConnected?: boolean;
  onShowExtensionGuide?: () => void;
}

export const ReadyView: React.FC<ReadyViewProps> = memo(({ 
  lastQuery,
  relayConnected = false,
  onShowExtensionGuide
}) => {
  return (
    <div className="ready-view--figma view-animate-in">
      {/* Icon */}
      <div className="ready-view-icon">
        <InboxIcon size={32} />
      </div>
      
      {/* Title */}
      <h2 className="ready-view-title">
        Готов к работе
      </h2>
      
      {/* Last query if available */}
      {lastQuery && (
        <div className="ready-view-last">
          Последний: «{lastQuery}»
        </div>
      )}
      
      {/* Main instruction */}
      <p className="ready-view-instruction">
        Откройте поиск Яндекса и нажмите на иконку{' '}
        <button 
          type="button" 
          className="ready-view-link"
          onClick={onShowExtensionGuide}
        >
          расширения
        </button>
      </p>
      
      {/* Hints */}
      <div className="ready-view-hints">
        {!relayConnected && (
          <span className="ready-view-hint">
            <kbd>{getPasteShortcut()}</kbd> вставить данные
          </span>
        )}
        <span className="ready-view-hint">
          или перетащите HTML-файл
        </span>
      </div>
    </div>
  );
});

ReadyView.displayName = 'ReadyView';
