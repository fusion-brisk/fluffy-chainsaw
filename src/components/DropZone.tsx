import React from 'react';

interface DropZoneProps {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  compact?: boolean; // [REFACTOR-CHECKPOINT-3] New prop for compact mode
}

export const DropZone: React.FC<DropZoneProps> = ({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect,
  compact = false
}) => {
  return (
    <div 
      className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <svg className="drop-icon" viewBox="0 0 24 24">
        <path d="M19.4 11l-6-6a2 2 0 0 0-2.8 0l-6 6A2 2 0 0 0 4 12.4V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.6a2 2 0 0 0-.6-1.4zM14 13v5h-4v-5H6l6-6 6 6h-4z"/>
      </svg>
      <div className="drop-zone-text">
        {compact ? 'Drop file or click' : 'Click or drag HTML file'}
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

