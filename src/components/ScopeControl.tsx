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
    <div className="flex-col">
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
        <div className="warning-banner">
          <svg className="icon-svg" viewBox="0 0 16 16">
            <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16zm0-1.6A6.4 6.4 0 1 0 8 1.6a6.4 6.4 0 0 0 0 12.8zM7.2 4a.8.8 0 1 1 1.6 0v4.8a.8.8 0 1 1-1.6 0V4zm.8 8.8a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
          </svg>
          Select layers to populate
        </div>
      )}
    </div>
  );
};

