import React, { memo } from 'react';
<<<<<<< HEAD
import { InfoIcon, ClearIcon } from './Icons';
=======
import { InfoIcon } from './Icons';
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
import { Toggle } from './Toggle';

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
<<<<<<< HEAD
      {/* Первая строка: Область применения + Сброс сейчас */}
      <div className="scope-row">
        <div className="scope-field">
          <label className="scope-label" htmlFor="scope-select">Применить к</label>
          <select
            id="scope-select"
            className="scope-select"
            value={scope}
            onChange={(e) => onScopeChange(e.target.value as 'selection' | 'page')}
            disabled={isDisabled}
          >
            <option value="selection">Выделению</option>
            <option value="page">Всей странице</option>
          </select>
        </div>
        
=======
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
        <Toggle
          checked={resetBeforeImport}
          onChange={onResetBeforeImportChange}
          disabled={isDisabled}
          label="Сбросить перед импортом"
        />
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
        <button
          type="button"
          className="btn-icon-sm"
          onClick={onResetNow}
          disabled={!canReset}
          title="Сбросить все сниппеты к исходному состоянию"
          aria-label="Сбросить сейчас"
        >
          <ClearIcon size={14} />
        </button>
      </div>

      {/* Вторая строка: Toggle сброса */}
      <div className="scope-row">
        <Toggle
          checked={resetBeforeImport}
          onChange={onResetBeforeImportChange}
          disabled={isDisabled}
          label="Сбросить перед импортом"
        />
        
        {/* Подсказка при отсутствии выделения */}
        {!hasSelection && scope === 'selection' && (
          <div className="scope-hint-inline">
            <InfoIcon />
            <span>Выберите слои</span>
          </div>
        )}
      </div>
    </div>
  );
});

ScopeControl.displayName = 'ScopeControl';
