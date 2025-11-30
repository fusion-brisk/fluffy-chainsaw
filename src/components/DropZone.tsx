import React from 'react';

interface DropZoneProps {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  fullscreen?: boolean;
  // Progress overlay props
  isLoading?: boolean;
  progress?: { current: number; total: number };
}

export const DropZone: React.FC<DropZoneProps> = ({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  disabled = false,
  fullscreen = false,
  isLoading = false,
  progress
}) => {
  const isDisabled = disabled || isLoading;
  const percentage = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isDisabled ? 'disabled' : ''} ${fullscreen ? 'fullscreen' : ''} ${isLoading ? 'loading' : ''}`}
      onDragOver={isDisabled ? undefined : onDragOver}
      onDragLeave={isDisabled ? undefined : onDragLeave}
      onDrop={isDisabled ? undefined : onDrop}
      onClick={isDisabled ? undefined : () => document.getElementById('file-input')?.click()}
    >
      {/* Progress bar overlay when loading */}
      {isLoading && (
        <div className="drop-zone-progress-overlay">
          <div 
            className="drop-zone-progress-bar" 
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {/* Modern upload icon */}
      <svg className="drop-icon" viewBox="0 0 48 48" fill="none">
        <path 
          d="M24 4L24 32M24 4L14 14M24 4L34 14" 
          stroke="currentColor" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        <path 
          d="M8 28V38C8 40.2091 9.79086 42 12 42H36C38.2091 42 40 40.2091 40 38V28" 
          stroke="currentColor" 
          strokeWidth="3" 
          strokeLinecap="round"
        />
      </svg>
      
      <div className="drop-zone-text">
        {isLoading
          ? `${percentage}%`
          : disabled
            ? 'Select elements first'
            : fullscreen
              ? 'Drop file anywhere'
              : 'Click or drag HTML file'
        }
      </div>
      
      <input 
        type="file" 
        id="file-input" 
        accept=".html,.htm,.mhtml,.mht" 
        onChange={onFileSelect} 
        style={{ display: 'none' }}
      />
    </div>
  );
};
