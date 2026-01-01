import React, { memo, useState, useEffect, useRef, useMemo } from 'react';
import { UploadIcon, CloseIcon } from './Icons';
import { ProgressData } from '../types';
import { STAGE_LABELS, CHANGELOG } from '../config';

interface DropZoneProps {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel?: () => void;
  disabled?: boolean;
  fullscreen?: boolean;
  isLoading?: boolean;
  progress?: ProgressData | null;
  fileSize?: number;
  dragFileName?: string | null;
}

export const DropZone: React.FC<DropZoneProps> = memo(({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  onCancel,
  disabled = false,
  fullscreen = false,
  isLoading = false,
<<<<<<< HEAD
  progress,
  fileSize,
  dragFileName
}) => {
  const isDisabled = disabled || isLoading;
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const tipIntervalRef = useRef<number | null>(null);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get stage label
  const getStageLabel = (operationType?: string): string => {
    if (!operationType) return STAGE_LABELS.default;
    return STAGE_LABELS[operationType] || STAGE_LABELS.default;
  };

  // What's New tips
  const whatsNewTips = useMemo(() => {
    const tips: string[] = [];
    CHANGELOG.slice(0, 3).forEach(entry => {
      entry.highlights.forEach(highlight => {
        tips.push(highlight);
      });
    });
    return tips.length > 0 ? tips : ['Плагин обрабатывает данные...'];
  }, []);

  // Rotate tips
  useEffect(() => {
    if (!isLoading || whatsNewTips.length <= 1) {
      if (tipIntervalRef.current) {
        clearInterval(tipIntervalRef.current);
        tipIntervalRef.current = null;
      }
      return;
    }

    tipIntervalRef.current = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentTipIndex((prev) => (prev + 1) % whatsNewTips.length);
        setIsAnimating(false);
      }, 200);
    }, 5000);

    return () => {
      if (tipIntervalRef.current) {
        clearInterval(tipIntervalRef.current);
      }
    };
  }, [isLoading, whatsNewTips.length]);

  // Reset tip index when loading starts
  useEffect(() => {
    if (isLoading) {
      setCurrentTipIndex(0);
    }
  }, [isLoading]);

  const percentage = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
=======
  progress: _progress, // unused now — progress shown in LiveProgressView
  dragFileName
}) => {
  const isDisabled = disabled || isLoading;
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e

  const stageLabel = progress?.operationType 
    ? getStageLabel(progress.operationType) 
    : 'Обработка...';

  const openFilePicker = () => {
    const input = document.getElementById('file-input') as HTMLInputElement | null;
    if (input) input.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  };

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel?.();
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
<<<<<<< HEAD
      {/* Loading state with progress */}
      {isLoading ? (
        <div className="drop-zone-progress">
          {/* Progress ring */}
          <div className="drop-zone-progress-ring">
            <svg viewBox="0 0 56 56" className="drop-zone-progress-svg">
              <circle 
                className="drop-zone-progress-bg" 
                cx="28" cy="28" r="24" 
                fill="none" 
                strokeWidth="3"
              />
              <circle 
                className={`drop-zone-progress-fill ${progress?.operationType ? `stage-${progress.operationType}` : ''}`}
                cx="28" cy="28" r="24" 
                fill="none" 
                strokeWidth="3"
                strokeDasharray={`${percentage * 1.51} 151`}
                transform="rotate(-90 28 28)"
              />
            </svg>
            <span className="drop-zone-progress-percent">{percentage}%</span>
          </div>

          {/* Stage info */}
          <div className="drop-zone-progress-info">
            <div className="drop-zone-progress-stage">{stageLabel}</div>
            {fileSize && (
              <div className="drop-zone-progress-meta">{formatFileSize(fileSize)}</div>
            )}
          </div>

          {/* What's New tip */}
          <div className={`drop-zone-progress-tip ${isAnimating ? 'fade-out' : 'fade-in'}`}>
            ✨ {whatsNewTips[currentTipIndex]}
          </div>

          {/* Cancel button */}
          <button 
            type="button"
            className="drop-zone-cancel-btn"
            onClick={handleCancelClick}
            title="Остановить"
          >
            <CloseIcon />
            <span>Остановить</span>
          </button>
=======
      {/* Modern upload icon */}
      <UploadIcon className={`drop-icon ${isLoading ? 'loading' : ''}`} />
      
      <div className="drop-zone-text">
        {isLoading
          ? 'Обработка...'
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
>>>>>>> 56c12903a41f3c9fea54ea6fd902d9de8f66514e
        </div>
      ) : (
        <>
          {/* Idle state */}
          <UploadIcon className="drop-icon" />
          
          <div className="drop-zone-text">
            {disabled
              ? 'Сначала выберите слои'
              : fullscreen
                ? 'Отпустите файл'
                : 'Нажмите или перетащите HTML/MHTML'
            }
          </div>
          
          {fullscreen && dragFileName && (
            <div className="drop-zone-file-preview">
              📄 {dragFileName}
            </div>
          )}
          
          {!disabled && !fullscreen && (
            <div className="drop-zone-hint">⌘O для открытия</div>
          )}
        </>
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
