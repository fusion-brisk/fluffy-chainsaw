/**
 * FileDropOverlay — Hidden fallback for file import
 * 
 * Activated by:
 * - Cmd+O hotkey
 * - Triple-click in empty area
 * 
 * Features:
 * - Fullscreen drop zone
 * - Escape to close
 * - Drag & drop HTML/MHTML files
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react';

interface FileDropOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (files: FileList) => void;
}

export const FileDropOverlay: React.FC<FileDropOverlayProps> = memo(({ 
  isOpen,
  onClose,
  onFileSelect
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files);
    }
  }, [onFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files);
    }
    // Reset input for re-selection
    e.target.value = '';
  }, [onFileSelect]);

  const handleContentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <div 
      className="file-drop-overlay"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Close button */}
      <button 
        type="button"
        className="file-drop-overlay-close"
        onClick={onClose}
        title="Закрыть (Esc)"
      >
        ✕
      </button>
      
      {/* Drop zone content */}
      <div 
        className={`file-drop-overlay-content ${isDragOver ? 'drag-over' : ''}`}
        onClick={handleContentClick}
      >
        <div className="file-drop-overlay-icon">
          📄
        </div>
        <div className="file-drop-overlay-title">
          {isDragOver ? 'Отпустите файл' : 'Импорт из файла'}
        </div>
        <div className="file-drop-overlay-hint">
          Перетащите HTML или MHTML файл
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="file-drop-input"
        accept=".html,.htm,.mhtml,.mht"
        onChange={handleFileInputChange}
      />
    </div>
  );
});

FileDropOverlay.displayName = 'FileDropOverlay';
