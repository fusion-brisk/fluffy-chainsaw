/**
 * UpdateBanner — notification banner for outdated extension version
 *
 * Two severity levels:
 * - critical (red): current version below minimum required
 * - optional (yellow): newer version available but current still compatible
 *
 * Cloud-relay is always latest (re-deployed on every push), and the plugin
 * updates via Figma Community, so only the extension needs a version gate.
 */

import React, { memo } from 'react';
import type { UpdateInfo } from '../hooks/useVersionCheck';

interface UpdateBannerProps {
  extensionUpdate: UpdateInfo | null;
  onDismissExtension: () => void;
}

interface BannerItemProps {
  label: string;
  update: UpdateInfo;
  onDismiss?: () => void;
}

const BannerItem: React.FC<BannerItemProps> = memo(({ label, update, onDismiss }) => {
  const isCritical = update.critical;

  return (
    <div
      className={`update-banner ${isCritical ? 'update-banner--critical' : 'update-banner--warning'}`}
    >
      <div className="update-banner-content">
        <span className="update-banner-icon">{isCritical ? '⚠' : '↑'}</span>
        <span className="update-banner-text">
          {isCritical ? 'Требуется обновление' : 'Доступно обновление'} {label}: {update.current} →{' '}
          {update.latest}
        </span>
        <a
          className="update-banner-link"
          href={update.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            window.open(update.downloadUrl, '_blank');
          }}
        >
          Обновить
        </a>
      </div>
      {!isCritical && onDismiss && (
        <button
          type="button"
          className="update-banner-close"
          onClick={onDismiss}
          aria-label="Закрыть"
        >
          ×
        </button>
      )}
    </div>
  );
});

BannerItem.displayName = 'BannerItem';

export const UpdateBanner: React.FC<UpdateBannerProps> = memo(
  ({ extensionUpdate, onDismissExtension }) => {
    if (!extensionUpdate) return null;

    return (
      <div className="update-banner-container">
        <BannerItem label="Расширение" update={extensionUpdate} onDismiss={onDismissExtension} />
      </div>
    );
  },
);

UpdateBanner.displayName = 'UpdateBanner';
