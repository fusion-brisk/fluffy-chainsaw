import React, { memo } from 'react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export const BackButton: React.FC<BackButtonProps> = memo(({ onClick, label = 'Назад' }) => (
  <button
    type="button"
    className="btn-back"
    onClick={onClick}
    aria-label={label}
  >
    &larr; {label}
  </button>
));

BackButton.displayName = 'BackButton';
