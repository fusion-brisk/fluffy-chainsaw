import React from 'react';

interface DropZoneProps {
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileSelect
}) => {
  return (
    <div 
      className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <svg className="drop-icon" viewBox="0 0 24 24">
        <path d="M19.4 11l-6-6a2 2 0 0 0-2.8 0l-6 6A2 2 0 0 0 4 12.4V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.6a2 2 0 0 0-.6-1.4zM14 13v5h-4v-5H6l6-6 6 6h-4z"/>
      </svg>
      <div className="text-small">
        Click or drag HTML file
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

