/**
 * MCP Bridge — Event forwarders for the sandbox side
 * 
 * Registers Figma event listeners (documentchange, selectionchange, currentpagechange)
 * and forwards them to the UI iframe so the WebSocket bridge can relay to MCP servers.
 * 
 * Also includes console capture that intercepts console.* calls in the sandbox
 * and forwards them to the UI for MCP console monitoring.
 */

import { Logger } from '../../logger';

// ---------------------------------------------------------------------------
// Console capture — intercept sandbox console.* and forward to UI
// ---------------------------------------------------------------------------

export function installConsoleCapture(): void {
  var levels: string[] = ['log', 'info', 'warn', 'error', 'debug'];
  var originals: Record<string, (...args: unknown[]) => void> = {};

  for (var i = 0; i < levels.length; i++) {
    originals[levels[i]] = (console as unknown as Record<string, (...args: unknown[]) => void>)[levels[i]];
  }

  function safeSerialize(val: unknown): unknown {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (_e) {
      return String(val);
    }
  }

  for (var j = 0; j < levels.length; j++) {
    (function(level: string) {
      (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = function() {
        // Call original so output still appears in Figma DevTools
        originals[level].apply(console, arguments as unknown as unknown[]);

        var args: unknown[] = [];
        var messageParts: string[] = [];
        for (var k = 0; k < arguments.length; k++) {
          args.push(safeSerialize(arguments[k]));
          messageParts.push(typeof arguments[k] === 'string' ? arguments[k] : String(arguments[k]));
        }

        try {
          figma.ui.postMessage({
            type: 'CONSOLE_CAPTURE',
            level: level,
            message: messageParts.join(' '),
            args: args,
            timestamp: Date.now()
          });
        } catch (_e) {
          // UI not ready yet — safe to ignore
        }
      };
    })(levels[j]);
  }
}

// ---------------------------------------------------------------------------
// Document change listener — forward to UI for WebSocket relay
// ---------------------------------------------------------------------------

export function registerDocumentChangeListener(): void {
  figma.loadAllPagesAsync().then(function() {
    figma.on('documentchange', function(event) {
      var hasStyleChanges = false;
      var hasNodeChanges = false;
      var changedNodeIds: string[] = [];

      for (var i = 0; i < event.documentChanges.length; i++) {
        var change = event.documentChanges[i];
        if (change.type === 'STYLE_CREATE' || change.type === 'STYLE_DELETE' || change.type === 'STYLE_PROPERTY_CHANGE') {
          hasStyleChanges = true;
        } else if (change.type === 'CREATE' || change.type === 'DELETE' || change.type === 'PROPERTY_CHANGE') {
          hasNodeChanges = true;
          if (change.id && changedNodeIds.length < 50) {
            changedNodeIds.push(change.id);
          }
        }
      }

      if (hasStyleChanges || hasNodeChanges) {
        figma.ui.postMessage({
          type: 'DOCUMENT_CHANGE',
          data: {
            hasStyleChanges: hasStyleChanges,
            hasNodeChanges: hasNodeChanges,
            changedNodeIds: changedNodeIds,
            changeCount: event.documentChanges.length,
            timestamp: Date.now()
          }
        });
      }
    });

    figma.on('currentpagechange', function() {
      figma.ui.postMessage({
        type: 'PAGE_CHANGE',
        data: {
          pageId: figma.currentPage.id,
          pageName: figma.currentPage.name,
          timestamp: Date.now()
        }
      });
    });

    Logger.debug('[MCP Bridge] Document change and page change listeners registered');
  }).catch(function(err) {
    Logger.debug('[MCP Bridge] Could not register event listeners: ' + err);
  });
}

// ---------------------------------------------------------------------------
// Selection change forwarder — sends SELECTION_CHANGE to UI for MCP
// Call this from the existing selectionchange handler in code.ts
// ---------------------------------------------------------------------------

export function forwardSelectionChange(): void {
  var selection = figma.currentPage.selection;
  var selectedNodes: Record<string, unknown>[] = [];
  var maxNodes = Math.min(selection.length, 50);

  for (var i = 0; i < maxNodes; i++) {
    var node = selection[i];
    selectedNodes.push({
      id: node.id,
      name: node.name,
      type: node.type,
      width: node.width,
      height: node.height
    });
  }

  figma.ui.postMessage({
    type: 'SELECTION_CHANGE',
    data: {
      nodes: selectedNodes,
      count: selection.length,
      page: figma.currentPage.name,
      timestamp: Date.now()
    }
  });
}
