import React from 'react';
import { ProcessingStats } from '../types';

interface StatsPanelProps {
  stats: ProcessingStats | null;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="stats-grid">
      <div className="stat-item">
        <div className="stat-value">{stats.processedInstances}</div>
        <div className="stat-label text-secondary text-small">Items</div>
      </div>
      <div className="stat-item">
        <div className="stat-value success">{stats.successfulImages}</div>
        <div className="stat-label text-secondary text-small">Images</div>
      </div>
      <div className="stat-item">
        <div className="stat-value error">{stats.failedImages}</div>
        <div className="stat-label text-secondary text-small">Errors</div>
      </div>
    </div>
  );
};

