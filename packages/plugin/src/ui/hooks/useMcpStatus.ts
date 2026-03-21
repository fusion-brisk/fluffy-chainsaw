/**
 * useMcpStatus — tracks MCP bridge WebSocket connection state
 *
 * Listens for 'mcpStatusChange' custom events dispatched by bridge-ui.js
 * when figma-console-mcp WebSocket connection state changes.
 */

import { useState, useEffect } from 'react';

declare global {
  interface Window {
    __mcpBridgeConnected?: boolean;
  }
}

interface McpStatus {
  connected: boolean;
  serverCount: number;
}

export function useMcpStatus(): McpStatus {
  const [status, setStatus] = useState<McpStatus>(() => ({
    connected: !!window.__mcpBridgeConnected,
    serverCount: 0,
  }));

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setStatus({
        connected: detail.connected,
        serverCount: detail.serverCount || 0,
      });
    };

    window.addEventListener('mcpStatusChange', handler);
    return () => window.removeEventListener('mcpStatusChange', handler);
  }, []);

  return status;
}
