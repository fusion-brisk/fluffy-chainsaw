import React, { memo } from 'react';
import { InfoIcon, ClearIcon } from './Icons';
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
