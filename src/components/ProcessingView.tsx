/**
 * ProcessingView — Import animation with spiral spinner
 * 
 * Shows during data processing with animated spiral icon.
 */

import React, { memo } from 'react';
import { ImportInfo } from '../types';
import { ProcessingSpinner } from './Icons';

interface ProcessingViewProps {
  importInfo: ImportInfo;
  onCancel?: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = memo(({ 
  importInfo
}) => {
  const { query, itemCount, source } = importInfo;

  return (
    <div className="processing-view">
      {/* Animated spiral spinner */}
      <div className="processing-view-spinner">
        <ProcessingSpinner className="processing-spinner-svg" />
      </div>
      
      {/* Status text */}
      <h2 className="processing-view-title">Анализируем страницу...</h2>
      
      {/* Query info */}
      <div className="processing-view-info">
        <span className="processing-view-query">{query || 'Импорт данных'}</span>
        <span className="processing-view-meta">
          {itemCount} {formatItemWord(itemCount)}
          {source && ` • ${source}`}
        </span>
      </div>
      
      {/* Animated dots */}
      <div className="processing-view-wave">
        <span className="wave-dot" />
        <span className="wave-dot" />
        <span className="wave-dot" />
        <span className="wave-dot" />
        <span className="wave-dot" />
      </div>
    </div>
  );
});

ProcessingView.displayName = 'ProcessingView';

/**
 * Format item count with proper Russian word form
 */
function formatItemWord(count: number): string {
  const lastTwo = count % 100;
  const lastOne = count % 10;
  
  if (lastTwo >= 11 && lastTwo <= 19) {
    return 'товаров';
  }
  
  if (lastOne === 1) {
    return 'товар';
  }
  
  if (lastOne >= 2 && lastOne <= 4) {
    return 'товара';
  }
  
  return 'товаров';
}
