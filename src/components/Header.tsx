import React from 'react';

interface HeaderProps {
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ isLoading }) => {
  return (
    <div className="flex-between">
      <h2>Contentify</h2>
      {isLoading && <div className="status-bar text-small">Working...</div>}
    </div>
  );
};

