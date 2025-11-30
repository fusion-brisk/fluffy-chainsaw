import React from 'react';

interface ScopeControlProps {
  scope: 'selection' | 'page';
  hasSelection: boolean;
  onScopeChange: (newScope: 'selection' | 'page') => void;
}

export const ScopeControl: React.FC<ScopeControlProps> = ({ 
  scope, 
  hasSelection, 
  onScopeChange 
}) => {
  return (
    <div className="scope-control">
      <div className="segmented-control">
        <div 
          className={`segmented-option ${scope === 'selection' ? 'active' : ''}`}
          onClick={() => onScopeChange('selection')}
        >
          Selection
        </div>
        <div 
          className={`segmented-option ${scope === 'page' ? 'active' : ''}`}
          onClick={() => onScopeChange('page')}
        >
          Current Page
        </div>
      </div>
      
      {!hasSelection && scope === 'selection' && (
        <div className="scope-hint">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path 
              d="M6 11C8.76142 11 11 8.76142 11 6C11 3.23858 8.76142 1 6 1C3.23858 1 1 3.23858 1 6C1 8.76142 3.23858 11 6 11Z" 
              stroke="currentColor" 
              strokeWidth="1.5"
            />
            <path 
              d="M6 3.5V6.5" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
            <circle cx="6" cy="8.5" r="0.75" fill="currentColor"/>
          </svg>
          <span>Select layers to populate</span>
        </div>
      )}
    </div>
  );
};
