import React from 'react';
import { ProgressData } from '../types';

interface ProgressBarProps {
  progress: ProgressData | null;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  if (!progress) return null;

  return (
    <div className="flex-col">
      <div className="progress-bar-container">
        <div 
          className="progress-bar" 
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        ></div>
      </div>
      <div className="progress-text">
        {progress.message || ''} ({progress.current}/{progress.total})
      </div>
    </div>
  );
};

