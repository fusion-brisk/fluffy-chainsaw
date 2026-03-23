/**
 * ReadyView — Minimalist Waiting State (Figma-style)
 *
 * Shows when plugin is ready to receive data from relay.
 * Clean empty state with simple icon and pulse animation.
 */

import React, { memo } from 'react';
import { InboxIcon } from './Icons';

interface ReadyViewProps {
  lastQuery?: string;
  relayConnected?: boolean;
  onShowExtensionGuide?: () => void;
  onReimport?: () => void;
}

export const ReadyView: React.FC<ReadyViewProps> = memo(({
  lastQuery,
  relayConnected = false,
  onShowExtensionGuide,
  onReimport
}) => {
  return (
    <div className="ready-view--figma view-animate-in">
      {/* Icon */}
      <div className="ready-view-icon ready-view-icon--pulse">
        <InboxIcon size={32} />
      </div>

      {/* Title */}
      <h2 className="ready-view-title">
        Ожидание данных
      </h2>

      {/* Last query + reimport button */}
      {lastQuery && (
        <div className="ready-view-last">
          Последний: «{lastQuery}»
          {onReimport && (
            <button
              type="button"
              className="btn-text-sm ready-view-reimport"
              onClick={onReimport}
            >
              Повторить
            </button>
          )}
        </div>
      )}

      {/* Main instruction */}
      <p className="ready-view-instruction">
        Откройте Яндекс в Chrome с{' '}
        <button
          type="button"
          className="ready-view-link"
          onClick={onShowExtensionGuide}
        >
          расширением Contentify
        </button>
      </p>
    </div>
  );
});

ReadyView.displayName = 'ReadyView';
