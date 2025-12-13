import React, { memo } from 'react';
import { InfoIcon } from './Icons';

interface ScopeControlProps {
  scope: 'selection' | 'page';
  hasSelection: boolean;
  onScopeChange: (newScope: 'selection' | 'page') => void;
}

export const ScopeControl: React.FC<ScopeControlProps> = memo(({ 
  scope, 
  hasSelection, 
  onScopeChange 
}) => {
  return (
    <div className="scope-control">
      <div className="segmented-control">
        <button
          type="button"
          className={`segmented-option ${scope === 'selection' ? 'active' : ''}`}
          onClick={() => onScopeChange('selection')}
          aria-pressed={scope === 'selection'}
        >
          Selection
        </button>
        <button
          type="button"
          className={`segmented-option ${scope === 'page' ? 'active' : ''}`}
          onClick={() => onScopeChange('page')}
          aria-pressed={scope === 'page'}
        >
          Current Page
        </button>
      </div>
      
      {!hasSelection && scope === 'selection' && (
        <div className="scope-hint">
          <InfoIcon />
          <span>Select layers to populate</span>
        </div>
      )}
    </div>
  );
});

ScopeControl.displayName = 'ScopeControl';
