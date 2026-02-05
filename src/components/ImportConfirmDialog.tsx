/**
 * ImportConfirmDialog — Figma-style confirmation dialog
 * 
 * Shows when data is received from browser extension or file.
 * User can choose to create new artboard or fill selected elements.
 */

import React, { memo, useEffect } from 'react';
import { SearchIcon, InboxIcon } from './Icons';
import { formatItemWord } from '../utils/format';

export type ImportMode = 'artboard' | 'selection';

interface Props {
  query: string;
  itemCount: number;
  source?: string;
  hasSelection: boolean;
  onConfirm: (mode: ImportMode) => void;
  onCancel: () => void;
}

export const ImportConfirmDialog: React.FC<Props> = memo(({
  query,
  itemCount,
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
    <div className="confirm-view--figma view-animate-in">
      {/* Icon */}
      <div className="confirm-view-icon">
        <InboxIcon size={24} />
      </div>
      
      {/* Title */}
      <h2 className="confirm-view-title">Данные получены</h2>
      
      {/* Query card */}
      <div className="confirm-view-query-card figma-card">
        <span className="confirm-view-query-text" title={query}>
          {query || 'Импорт данных'}
        </span>
        <SearchIcon className="confirm-view-query-icon" />
      </div>
      
      {/* Item count */}
      <div className="confirm-view-meta">
        {itemCount} {formatItemWord(itemCount)}
      </div>
      
      {/* Action buttons */}
      <div className="confirm-view-actions">
        <button 
          type="button"
          className="btn-primary"
          onClick={() => onConfirm('artboard')}
          autoFocus
        >
          Создать артборд
        </button>
        
        {hasSelection ? (
          <button 
            type="button"
            className="btn-secondary"
            onClick={() => onConfirm('selection')}
          >
            Заполнить выделение
          </button>
        ) : (
          <div className="confirm-view-selection-hint">
            Выделите контейнеры для заполнения
          </div>
        )}
        
        <button 
          type="button"
          className="btn-text"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
      
      {/* Keyboard shortcut hint */}
      <div className="confirm-view-hint">
        <kbd>Enter</kbd>
        <span>— создать артборд</span>
      </div>
    </div>
  );
});

ImportConfirmDialog.displayName = 'ImportConfirmDialog';

export default ImportConfirmDialog;
