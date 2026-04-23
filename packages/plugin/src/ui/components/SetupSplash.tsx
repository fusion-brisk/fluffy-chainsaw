/**
 * SetupSplash — tiny loading placeholder shown while clientStorage reads
 * resolve on plugin restart. Fills the ~100–400 ms gap between mount and
 * first useful render; without this the user would see a blank white area
 * and wonder if the plugin is stuck.
 *
 * Visibility owned by the parent (ui.tsx), which renders this whenever
 * `appState === 'setup'` but either `setupResolved` or `sessionCodeResolved`
 * is still false.
 */

import React, { memo } from 'react';

export const SetupSplash: React.FC = memo(() => (
  <div className="setup-flow__splash" role="status" aria-live="polite">
    {/* Reuse the CompactStrip spinner class so the visual handoff
        splash → strip('checking') is seamless — same size, speed, color. */}
    <div className="compact-strip__spinner" aria-hidden />
    <p className="setup-flow__splash-label">Запуск Contentify…</p>
  </div>
));

SetupSplash.displayName = 'SetupSplash';
