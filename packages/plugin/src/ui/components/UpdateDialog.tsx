import React from 'react';

interface UpdateDialogProps {
  currentVersion: number;
  newVersion: number;
  hash: string;
  onApply: (hash: string) => void;
  onDismiss: () => void;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  currentVersion,
  newVersion,
  hash,
  onApply,
  onDismiss
}) => {
  return (
    <div className="update-dialog-overlay">
      <div className="update-dialog">
        <div className="update-dialog-header">
          🌐 Parsing Rules Update Available
        </div>
        
        <div className="update-dialog-content">
          A new version of parsing rules is available. Would you like to update?
        </div>
        
        <div className="update-dialog-version">
          <span>Current: v{currentVersion}</span>
          <span>→</span>
          <span style={{ fontWeight: 600 }}>New: v{newVersion}</span>
        </div>
        
        <div className="update-dialog-actions">
          <button
            className="update-dialog-btn update-dialog-btn-secondary"
            onClick={onDismiss}
          >
            Not Now
          </button>
          <button
            className="update-dialog-btn update-dialog-btn-primary"
            onClick={() => onApply(hash)}
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
};

