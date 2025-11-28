import React from 'react';

interface HeaderProps {
  isLoading: boolean;
  onToggleRules?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isLoading, onToggleRules }) => {
  return (
    <div className="flex-between">
      <h2>Contentify</h2>
      <div className="flex-row" style={{ gap: '8px' }}>
        {onToggleRules && (
          <button 
            className="header-btn" 
            onClick={onToggleRules}
            title="View Parsing Rules"
          >
            ⚙️ Rules
          </button>
        )}
        {isLoading && <div className="status-bar text-small">Working...</div>}
      </div>
    </div>
  );
};

