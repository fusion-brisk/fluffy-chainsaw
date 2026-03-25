import { useState, useCallback, useRef } from 'react';
import type { AppState } from '../../types';

export type PanelName = 'setup' | 'logs' | 'inspector';

/** Size tier keys used when opening panels */
const PANEL_SIZE_TIER: Record<PanelName, string> = {
  setup: 'extensionGuide',
  logs: 'logsViewer',
  inspector: 'inspector',
};

export interface PanelManager {
  /** Currently open panel, or null if main content is visible */
  activePanel: PanelName | null;
  /** True when any panel overlay is open */
  isPanelOpen: boolean;
  /** Open a panel overlay, saving current appState for restore */
  openPanel: (name: PanelName) => void;
  /** Close the active panel, restoring previous appState size */
  closePanel: () => void;
}

export function usePanelManager(
  appState: AppState,
  resizeUI: (state: string) => void
): PanelManager {
  const [activePanel, setActivePanel] = useState<PanelName | null>(null);
  const previousStateRef = useRef<AppState | null>(null);

  const openPanel = useCallback((name: PanelName) => {
    previousStateRef.current = appState;
    setActivePanel(name);
    resizeUI(PANEL_SIZE_TIER[name]);
  }, [appState, resizeUI]);

  const closePanel = useCallback(() => {
    setActivePanel(null);
    const prevState = previousStateRef.current || appState;
    resizeUI(prevState);
    previousStateRef.current = null;
  }, [appState, resizeUI]);

  return {
    activePanel,
    isPanelOpen: activePanel !== null,
    openPanel,
    closePanel,
  };
}
