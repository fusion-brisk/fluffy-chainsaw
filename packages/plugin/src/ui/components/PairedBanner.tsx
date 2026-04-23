/**
 * PairedBanner — transient 3-second confirmation flash after the auto-pair
 * URL handshake completes.
 *
 * Parent controls visibility via a state flag + timer; the banner itself is
 * pure presentation. Keeps CompactStrip clean of one-off success states.
 */

import React, { memo } from 'react';

interface PairedBannerProps {
  visible: boolean;
}

export const PairedBanner: React.FC<PairedBannerProps> = memo(({ visible }) => {
  if (!visible) return null;

  return (
    <div
      className="paired-banner"
      role="status"
      aria-live="polite"
      aria-label="Расширение успешно подключено"
    >
      <span className="paired-banner__icon" aria-hidden>
        &#10003;
      </span>
      <span className="paired-banner__text">Расширение подключено</span>
    </div>
  );
});

PairedBanner.displayName = 'PairedBanner';
