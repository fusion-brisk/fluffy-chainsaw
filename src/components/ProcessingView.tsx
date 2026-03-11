/**
 * ProcessingView — Figma-style processing animation
 * 
 * Shows during data processing with spinner and marquee summary.
 */

import React, { memo } from 'react';
import { ImportInfo } from '../types';

interface ProcessingViewProps {
  importInfo: ImportInfo;
  onCancel?: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = memo(({ 
  importInfo
}) => {
  const { query, summary } = importInfo;

  return (
    <div className="processing-view--figma view-animate-in">
      {/* Simple spinner */}
      <div className="processing-view-spinner" />
      
      {/* Status text */}
      <h2 className="processing-view-title">Обработка...</h2>
      
      {/* Query info */}
      <div className="processing-view-card figma-card">
        <span className="processing-view-query">{query || 'Импорт данных'}</span>
        {summary && (
          <div className="processing-view-marquee">
            <span className="processing-view-marquee-text">
              {summary}&nbsp;&nbsp;·&nbsp;&nbsp;{summary}&nbsp;&nbsp;·&nbsp;&nbsp;
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

ProcessingView.displayName = 'ProcessingView';
