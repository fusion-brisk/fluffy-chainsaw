import React, { useState, useEffect } from 'react';

interface SettingsPanelProps {
  remoteUrl: string;
  onUpdateUrl: (url: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  remoteUrl,
  onUpdateUrl
}) => {
  const [localUrl, setLocalUrl] = useState(remoteUrl);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setLocalUrl(remoteUrl);
  }, [remoteUrl]);

  const handleSave = () => {
    onUpdateUrl(localUrl.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalUrl(remoteUrl);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span className="settings-title">⚙️ Settings</span>
      </div>
      
      <div className="settings-content">
        <div className="settings-group">
          <label className="settings-label">
            Remote Config URL:
          </label>
          
          {isEditing ? (
            <div className="settings-input-group">
              <input
                type="text"
                className="settings-input"
                value={localUrl}
                onChange={(e) => setLocalUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://raw.githubusercontent.com/..."
                autoFocus
              />
              <div className="settings-input-actions">
                <button
                  className="settings-btn settings-btn-small settings-btn-primary"
                  onClick={handleSave}
                >
                  ✓
                </button>
                <button
                  className="settings-btn settings-btn-small"
                  onClick={handleCancel}
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-display-group">
              <div className="settings-display-value" title={remoteUrl}>
                {remoteUrl || <span className="settings-empty">Not configured</span>}
              </div>
              <button
                className="settings-btn settings-btn-small"
                onClick={() => setIsEditing(true)}
              >
                ✏️ Edit
              </button>
            </div>
          )}
          
          <div className="settings-hint">
            GitHub Raw URL to parsing-rules.json
          </div>
        </div>
      </div>
    </div>
  );
};

