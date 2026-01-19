/**
 * ImportConfirmDialog — Confirmation dialog with card style
 * 
 * Shows when data is received from browser extension or file.
 * User can choose to create new artboard or fill selected elements.
 */

import React, { memo, useEffect } from 'react';
import { SearchIcon } from './Icons';

export type ImportMode = 'artboard' | 'selection';

interface Props {
  query: string;
  itemCount: number;
  source?: string;
  hasSelection: boolean;
  onConfirm: (mode: ImportMode) => void;
  onCancel: () => void;
}

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

export const ImportConfirmDialog: React.FC<Props> = memo(({
  query,
  itemCount,
  source,
  hasSelection,
  onConfirm,
  onCancel
}) => {
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onConfirm('artboard');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onConfirm]);

  return (
    <div className="confirm-view">
      {/* Title */}
      <h2 className="confirm-view-title">Данные успешно получены!</h2>
      
      {/* Query card */}
      <div className="confirm-view-card">
        <div className="confirm-view-card-content">
          <div className="confirm-view-query" title={query}>
            {query || 'Импорт данных'}
          </div>
          <div className="confirm-view-meta">
            {itemCount} {formatItemWord(itemCount)}
            {source && ` • ${source}`}
          </div>
        </div>
        <div className="confirm-view-card-icon">
          <SearchIcon className="search-icon-svg" />
        </div>
      </div>
      
      {/* Actions */}
      <div className="confirm-view-actions">
        <button 
          type="button"
          className="confirm-view-btn confirm-view-btn-primary"
          onClick={() => onConfirm('artboard')}
          autoFocus
        >
          Создать артборд
        </button>
        
        {hasSelection && (
          <button 
            type="button"
            className="confirm-view-btn confirm-view-btn-secondary"
            onClick={() => onConfirm('selection')}
          >
            Заполнить выделение
          </button>
        )}
        
        <button 
          type="button"
          className="confirm-view-btn confirm-view-btn-cancel"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </div>
  );
});

ImportConfirmDialog.displayName = 'ImportConfirmDialog';

export default ImportConfirmDialog;
