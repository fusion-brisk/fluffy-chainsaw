import React, { memo, useEffect } from 'react';

interface NoSelectionDialogProps {
  onApplyToPage: () => void;
  onCreateArtboard: () => void;
  onCancel: () => void;
}

export const NoSelectionDialog: React.FC<NoSelectionDialogProps> = memo(({
  onApplyToPage,
  onCreateArtboard,
  onCancel
}) => {
  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-icon">⚠️</div>
        <div className="confirm-dialog-header">Ничего не выделено</div>
        <div className="confirm-dialog-content">
          Вы выбрали режим «Выделение», но на странице ничего не выделено.
          Что сделать с данными?
        </div>
        <div className="confirm-dialog-actions confirm-dialog-actions-vertical">
          <button
            type="button"
            className="confirm-dialog-btn confirm-dialog-btn-primary"
            onClick={onApplyToPage}
          >
            Применить ко всей странице
          </button>
          <button
            type="button"
            className="confirm-dialog-btn confirm-dialog-btn-primary"
            onClick={onCreateArtboard}
          >
            Создать артборд
          </button>
          <button
            type="button"
            className="confirm-dialog-btn confirm-dialog-btn-secondary"
            onClick={onCancel}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
});

NoSelectionDialog.displayName = 'NoSelectionDialog';

