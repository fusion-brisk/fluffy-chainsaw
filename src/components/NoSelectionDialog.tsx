import React, { memo, useEffect } from 'react';

interface NoSelectionDialogProps {
  onApplyToPage: () => void;
  onCancel: () => void;
}

export const NoSelectionDialog: React.FC<NoSelectionDialogProps> = memo(({
  onApplyToPage,
  onCancel
}) => {
  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter') {
        onApplyToPage();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onApplyToPage]);

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-icon">⚠️</div>
        <div className="confirm-dialog-header">Ничего не выделено</div>
        <div className="confirm-dialog-content">
          Вы выбрали режим «Выделение», но на странице ничего не выделено.
          Применить данные ко всей странице?
        </div>
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-dialog-btn confirm-dialog-btn-secondary"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            type="button"
            className="confirm-dialog-btn confirm-dialog-btn-primary"
            onClick={onApplyToPage}
          >
            Применить ко всей странице
          </button>
        </div>
      </div>
    </div>
  );
});

NoSelectionDialog.displayName = 'NoSelectionDialog';

