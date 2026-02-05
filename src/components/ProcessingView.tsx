/**
 * ProcessingView — Figma-style processing animation
 * 
 * Shows during data processing with simple spinner.
 */

import React, { memo } from 'react';
import { ImportInfo } from '../types';
import { formatItemWord } from '../utils/format';

interface ProcessingViewProps {
  importInfo: ImportInfo;
  onCancel?: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = memo(({ 
  importInfo
}) => {
  const { query, itemCount, source } = importInfo;

  return (
    <div className="processing-view--figma view-animate-in">
      {/* Simple spinner */}
      <div className="processing-view-spinner" />
      
      {/* Status text */}
      <h2 className="processing-view-title">Обработка...</h2>
      
      {/* Query info */}
      <div className="processing-view-card figma-card">
        <span className="processing-view-query">{query || 'Импорт данных'}</span>
        <span className="processing-view-meta">
          {itemCount} {formatItemWord(itemCount)}
          {source && ` • ${source}`}
        </span>
      </div>
    </div>
  );
});

ProcessingView.displayName = 'ProcessingView';
