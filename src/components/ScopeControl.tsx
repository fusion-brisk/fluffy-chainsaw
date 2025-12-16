import React, { memo } from 'react';
import { InfoIcon } from './Icons';

interface ScopeControlProps {
  scope: 'selection' | 'page';
  hasSelection: boolean;
  onScopeChange: (newScope: 'selection' | 'page') => void;
  // Reset options
  resetBeforeImport: boolean;
  onResetBeforeImportChange: (value: boolean) => void;
  onResetNow: () => void;
  isLoading?: boolean;
  isResetting?: boolean;
}

export const ScopeControl: React.FC<ScopeControlProps> = memo(({ 
  scope, 
  hasSelection, 
  onScopeChange,
  resetBeforeImport,
  onResetBeforeImportChange,
  onResetNow,
  isLoading = false,
  isResetting = false
}) => {
  const isDisabled = isLoading || isResetting;
  const canReset = !isDisabled && (scope === 'page' || hasSelection);

  return (
    <div className="scope-panel">
      {/* Переключатель области */}
      <div className="segmented-control">
        <button
          type="button"
          className={`segmented-option ${scope === 'selection' ? 'active' : ''}`}
          onClick={() => onScopeChange('selection')}
          aria-pressed={scope === 'selection'}
        >
          Выделение
        </button>
        <button
          type="button"
          className={`segmented-option ${scope === 'page' ? 'active' : ''}`}
          onClick={() => onScopeChange('page')}
          aria-pressed={scope === 'page'}
        >
          Вся страница
        </button>
      </div>

      {/* Опции сброса */}
      <div className="scope-options">
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={resetBeforeImport}
            onChange={(e) => onResetBeforeImportChange(e.target.checked)}
            disabled={isDisabled}
          />
          <span>Сбросить перед импортом</span>
        </label>
        <button
          type="button"
          className="btn-text-sm"
          onClick={onResetNow}
          disabled={!canReset}
          title="Сбросить все сниппеты к исходному состоянию"
        >
          {isResetting ? 'Сброс...' : 'Сбросить сейчас'}
        </button>
      </div>
      
      {/* Подсказка при отсутствии выделения */}
      {!hasSelection && scope === 'selection' && (
        <div className="scope-hint">
          <InfoIcon />
          <span>Выберите слои для заполнения</span>
        </div>
      )}
    </div>
  );
});

ScopeControl.displayName = 'ScopeControl';
