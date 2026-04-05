import { useState, useCallback } from 'react';
import type { AppState } from '../../types';

export type PanelName = 'setup' | 'logs' | 'inspector' | 'whatsNew';

/** Size tier keys used when opening panels */
const PANEL_SIZE_TIER: Record<PanelName, string> = {
  setup: 'extensionGuide',
  logs: 'logsViewer',
  inspector: 'inspector',
  whatsNew: 'whatsNew',
};

export interface PanelManager {
  /** Currently open panel, or null if main content is visible */
  activePanel: PanelName | null;
  /** True when any panel overlay is open */
  isPanelOpen: boolean;
  /** Open a panel overlay */
  openPanel: (name: PanelName) => void;
  /** Close the active panel, resizing to current appState (not stale saved state) */
  closePanel: () => void;
}

export function usePanelManager(
  appState: AppState,
  resizeUI: (state: string) => void,
): PanelManager {
  const [activePanel, setActivePanel] = useState<PanelName | null>(null);

  const openPanel = useCallback(
    (name: PanelName) => {
      setActivePanel(name);
      resizeUI(PANEL_SIZE_TIER[name]);
    },
    [resizeUI],
  );

  const closePanel = useCallback(() => {
    setActivePanel(null);
    resizeUI(appState);
  }, [appState, resizeUI]);

  return {
    activePanel,
    isPanelOpen: activePanel !== null,
    openPanel,
    closePanel,
  };
}
