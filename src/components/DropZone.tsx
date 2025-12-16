import React, { memo } from 'react';
import { UploadIcon } from './Icons';

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
  // Drag preview
  dragFileName?: string | null;
}

export const DropZone: React.FC<DropZoneProps> = memo(({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  disabled = false,
  fullscreen = false,
  isLoading = false,
  progress,
  dragFileName
}) => {
  const isDisabled = disabled || isLoading;
  const percentage = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const openFilePicker = () => {
    const input = document.getElementById('file-input') as HTMLInputElement | null;
    if (input) input.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    // Enter / Space to open file picker
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  };

  return (
    <div
      className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${isDisabled ? 'disabled' : ''} ${fullscreen ? 'fullscreen' : ''} ${isLoading ? 'loading' : ''}`}
      onDragOver={isDisabled ? undefined : onDragOver}
      onDragLeave={isDisabled ? undefined : onDragLeave}
      onDrop={isDisabled ? undefined : onDrop}
      onClick={isDisabled ? undefined : openFilePicker}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      aria-label="Импортировать HTML или MHTML файл"
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
      <UploadIcon className="drop-icon" />
      
      <div className="drop-zone-text">
        {isLoading
          ? `${percentage}%`
          : disabled
            ? 'Сначала выберите слои'
            : fullscreen
              ? 'Отпустите файл'
              : 'Нажмите или перетащите HTML/MHTML'
        }
      </div>
      
      {/* Превью имени файла при перетаскивании */}
      {fullscreen && dragFileName && (
        <div className="drop-zone-file-preview">
          📄 {dragFileName}
        </div>
      )}
      
      {/* Подсказка с горячей клавишей */}
      {!isLoading && !disabled && !fullscreen && (
        <div className="drop-zone-hint">⌘O для открытия</div>
      )}
      
      <input 
        type="file" 
        id="file-input" 
        accept=".html,.htm,.mhtml,.mht" 
        onChange={onFileSelect} 
        style={{ display: 'none' }}
      />
    </div>
  );
});

DropZone.displayName = 'DropZone';
