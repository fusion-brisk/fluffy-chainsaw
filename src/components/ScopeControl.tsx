import React, { memo } from 'react';
import { InfoIcon, ClearIcon } from './Icons';
import { Toggle } from './Toggle';
import { PluginMode } from '../types';

interface ScopeControlProps {
  mode: PluginMode;
  hasSelection: boolean;
  onModeChange: (newMode: PluginMode) => void;
  // Reset options
  resetBeforeImport: boolean;
  onResetBeforeImportChange: (value: boolean) => void;
  onResetNow: () => void;
  isLoading?: boolean;
  isResetting?: boolean;
}

export const ScopeControl: React.FC<ScopeControlProps> = memo(({ 
  mode,
  hasSelection, 
  onModeChange,
  resetBeforeImport,
  onResetBeforeImportChange,
  onResetNow,
  isLoading = false,
  isResetting = false
}) => {
  const isDisabled = isLoading || isResetting;
  const isBuildMode = mode === 'build';
  const canReset = !isDisabled && !isBuildMode && (mode === 'page' || hasSelection);

  return (
    <div className="scope-panel">
      {/* Единый дропдаун режима работы */}
      <div className="scope-row">
        <div className="scope-field scope-field--full">
          <label className="scope-label" htmlFor="mode-select">Режим</label>
          <select
            id="mode-select"
            className="scope-select"
            value={mode}
            onChange={(e) => onModeChange(e.target.value as PluginMode)}
            disabled={isDisabled}
          >
            <option value="selection">Заполнить выделение</option>
            <option value="page">Заполнить страницу</option>
            <option value="build">Создать новый артборд</option>
          </select>
        </div>
        
        {/* Кнопка сброса (только для режимов заполнения) */}
        {!isBuildMode && (
          <button
            type="button"
            className="btn-icon-sm"
            onClick={onResetNow}
            disabled={!canReset}
            title="Сбросить все сниппеты к исходному состоянию"
            aria-label="Сбросить сейчас"
          >
            <ClearIcon />
          </button>
        )}
      </div>

      {/* Toggle сброса (только для режимов заполнения) */}
      {!isBuildMode && (
        <div className="scope-row">
          <Toggle
            checked={resetBeforeImport}
            onChange={onResetBeforeImportChange}
            disabled={isDisabled}
            label="Сбросить перед импортом"
          />
          
          {/* Подсказка при отсутствии выделения */}
          {!hasSelection && mode === 'selection' && (
            <div className="scope-hint-inline">
              <InfoIcon />
              <span>Выберите слои</span>
            </div>
          )}
        </div>
      )}

      {/* Подсказка для режима build */}
      {isBuildMode && (
        <div className="scope-row">
          <div className="scope-hint-inline scope-hint-inline--info">
            <InfoIcon />
            <span>Будет создан новый фрейм с Auto Layout</span>
          </div>
        </div>
      )}
    </div>
  );
});

ScopeControl.displayName = 'ScopeControl';
