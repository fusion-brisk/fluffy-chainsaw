/**
 * MCP Bridge — UI-side WebSocket client
 * 
 * Runs in the plugin UI iframe. Connects to figma-console-mcp servers
 * via WebSocket on ports 9223-9232. Routes MCP commands to sandbox handlers
 * via postMessage and relays results back over WebSocket.
 * 
 * This script is loaded BEFORE the React app and does not conflict with it.
 * MCP bridge messages use UPPERCASE types; Contentify uses kebab-case.
 */

(function() {
  'use strict';

  // ============================================================================
  // GLOBAL STATE
  // ============================================================================
  window.__figmaVariablesData = null;
  window.__figmaVariablesReady = false;
  window.__figmaComponentData = null;
  window.__figmaComponentRequests = new Map();
  window.__figmaPendingRequests = new Map();
  window.__mcpBridgeConnected = false;

  var requestIdCounter = 0;
  var DEBUG_RELAY = 'http://localhost:3847'; // Must match PORTS.RELAY in config.ts

  function uiDebugLog(level, message, data) {
    try {
      fetch(DEBUG_RELAY + '/debug-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: Date.now(),
          level: level,
          source: 'ui',
          message: message,
          data: data
        })
      }).catch(function() {});
    } catch(e) {}
  }

  // ============================================================================
  // COMMAND INFRASTRUCTURE
  // ============================================================================

  window.sendPluginCommand = function(type, params, timeoutMs) {
    timeoutMs = timeoutMs || 15000;
    return new Promise(function(resolve, reject) {
      var requestId = type.toLowerCase() + '_' + (++requestIdCounter) + '_' + Date.now();

      var timeoutId = setTimeout(function() {
        if (window.__figmaPendingRequests.has(requestId)) {
          window.__figmaPendingRequests.delete(requestId);
          uiDebugLog('warn', 'Request timeout: ' + type, { requestId: requestId, timeoutMs: timeoutMs });
          reject(new Error(type + ' request timed out after ' + timeoutMs + 'ms'));
        }
      }, timeoutMs);

      window.__figmaPendingRequests.set(requestId, {
        resolve: resolve,
        reject: reject,
        type: type,
        timeoutId: timeoutId
      });

      var message = { type: type, requestId: requestId };
      for (var key in params) {
        if (params.hasOwnProperty(key)) {
          message[key] = params[key];
        }
      }

      parent.postMessage({ pluginMessage: message }, '*');
    });
  };

  // ============================================================================
  // VARIABLE OPERATIONS
  // ============================================================================

  window.executeCode = function(code, timeout) {
    return window.sendPluginCommand('EXECUTE_CODE', { code: code, timeout: timeout || 5000 }, (timeout || 5000) + 2000)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.updateVariable = function(variableId, modeId, value) {
    return window.sendPluginCommand('UPDATE_VARIABLE', { variableId: variableId, modeId: modeId, value: value })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.createVariable = function(name, collectionId, resolvedType, options) {
    var params = { name: name, collectionId: collectionId, resolvedType: resolvedType };
    if (options) {
      if (options.valuesByMode) params.valuesByMode = options.valuesByMode;
      if (options.description) params.description = options.description;
      if (options.scopes) params.scopes = options.scopes;
    }
    return window.sendPluginCommand('CREATE_VARIABLE', params)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.createVariableCollection = function(name, options) {
    var params = { name: name };
    if (options) {
      if (options.initialModeName) params.initialModeName = options.initialModeName;
      if (options.additionalModes) params.additionalModes = options.additionalModes;
    }
    return window.sendPluginCommand('CREATE_VARIABLE_COLLECTION', params)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.deleteVariable = function(variableId) {
    return window.sendPluginCommand('DELETE_VARIABLE', { variableId: variableId })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.deleteVariableCollection = function(collectionId) {
    return window.sendPluginCommand('DELETE_VARIABLE_COLLECTION', { collectionId: collectionId })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.renameVariable = function(variableId, newName) {
    return window.sendPluginCommand('RENAME_VARIABLE', { variableId: variableId, newName: newName })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.setVariableDescription = function(variableId, description) {
    return window.sendPluginCommand('SET_VARIABLE_DESCRIPTION', { variableId: variableId, description: description })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.addMode = function(collectionId, modeName) {
    return window.sendPluginCommand('ADD_MODE', { collectionId: collectionId, modeName: modeName })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.renameMode = function(collectionId, modeId, newName) {
    return window.sendPluginCommand('RENAME_MODE', { collectionId: collectionId, modeId: modeId, newName: newName })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.refreshVariables = function() {
    return window.sendPluginCommand('REFRESH_VARIABLES', {}, 300000)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  // ============================================================================
  // COMPONENT OPERATIONS
  // ============================================================================

  window.getLocalComponents = function() {
    return window.sendPluginCommand('GET_LOCAL_COMPONENTS', {}, 300000)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.instantiateComponent = function(componentKey, options) {
    var params = { componentKey: componentKey };
    if (options) {
      if (options.nodeId) params.nodeId = options.nodeId;
      if (options.position) params.position = options.position;
      if (options.size) params.size = options.size;
      if (options.overrides) params.overrides = options.overrides;
      if (options.variant) params.variant = options.variant;
      if (options.parentId) params.parentId = options.parentId;
    }
    return window.sendPluginCommand('INSTANTIATE_COMPONENT', params)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.requestComponentData = function(nodeId) {
    return new Promise(function(resolve, reject) {
      var requestId = 'component_' + (++requestIdCounter) + '_' + Date.now();
      window.__figmaComponentRequests.set(requestId, { resolve: resolve, reject: reject });
      parent.postMessage({ pluginMessage: { type: 'GET_COMPONENT', requestId: requestId, nodeId: nodeId } }, '*');
      setTimeout(function() {
        if (window.__figmaComponentRequests.has(requestId)) {
          window.__figmaComponentRequests.delete(requestId);
          reject(new Error('Component request timed out'));
        }
      }, 10000);
    });
  };

  // ============================================================================
  // COMPONENT PROPERTY MANAGEMENT
  // ============================================================================

  window.setNodeDescription = function(nodeId, description, descriptionMarkdown) {
    return window.sendPluginCommand('SET_NODE_DESCRIPTION', {
      nodeId: nodeId, description: description, descriptionMarkdown: descriptionMarkdown
    }).catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.addComponentProperty = function(nodeId, propertyName, type, defaultValue, options) {
    var params = { nodeId: nodeId, propertyName: propertyName, propertyType: type, defaultValue: defaultValue };
    if (options && options.preferredValues) params.preferredValues = options.preferredValues;
    return window.sendPluginCommand('ADD_COMPONENT_PROPERTY', params)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.editComponentProperty = function(nodeId, propertyName, newValue) {
    return window.sendPluginCommand('EDIT_COMPONENT_PROPERTY', {
      nodeId: nodeId, propertyName: propertyName, newValue: newValue
    }).catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.deleteComponentProperty = function(nodeId, propertyName) {
    return window.sendPluginCommand('DELETE_COMPONENT_PROPERTY', {
      nodeId: nodeId, propertyName: propertyName
    }).catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  // ============================================================================
  // NODE MANIPULATION
  // ============================================================================

  window.resizeNode = function(nodeId, width, height, withConstraints) {
    return window.sendPluginCommand('RESIZE_NODE', {
      nodeId: nodeId, width: width, height: height, withConstraints: withConstraints !== false
    }).catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.moveNode = function(nodeId, x, y) {
    return window.sendPluginCommand('MOVE_NODE', { nodeId: nodeId, x: x, y: y })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.setNodeFills = function(nodeId, fills) {
    return window.sendPluginCommand('SET_NODE_FILLS', { nodeId: nodeId, fills: fills })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.setNodeStrokes = function(nodeId, strokes, strokeWeight) {
    var params = { nodeId: nodeId, strokes: strokes };
    if (strokeWeight !== undefined) params.strokeWeight = strokeWeight;
    return window.sendPluginCommand('SET_NODE_STROKES', params)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.setNodeOpacity = function(nodeId, opacity) {
    return window.sendPluginCommand('SET_NODE_OPACITY', { nodeId: nodeId, opacity: opacity })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.setNodeCornerRadius = function(nodeId, radius) {
    return window.sendPluginCommand('SET_NODE_CORNER_RADIUS', { nodeId: nodeId, radius: radius })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.cloneNode = function(nodeId) {
    return window.sendPluginCommand('CLONE_NODE', { nodeId: nodeId })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.deleteNode = function(nodeId) {
    return window.sendPluginCommand('DELETE_NODE', { nodeId: nodeId })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.renameNode = function(nodeId, newName) {
    return window.sendPluginCommand('RENAME_NODE', { nodeId: nodeId, newName: newName })
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.setTextContent = function(nodeId, text, options) {
    var params = { nodeId: nodeId, text: text };
    if (options) {
      if (options.fontSize) params.fontSize = options.fontSize;
      if (options.fontWeight) params.fontWeight = options.fontWeight;
      if (options.fontFamily) params.fontFamily = options.fontFamily;
    }
    return window.sendPluginCommand('SET_TEXT_CONTENT', params)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.createChildNode = function(parentId, nodeType, properties) {
    return window.sendPluginCommand('CREATE_CHILD_NODE', {
      parentId: parentId, nodeType: nodeType, properties: properties || {}
    }).catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  // ============================================================================
  // SCREENSHOT & INSTANCE PROPERTIES
  // ============================================================================

  window.captureScreenshot = function(nodeId, options) {
    var params = { nodeId: nodeId };
    if (options) {
      if (options.format) params.format = options.format;
      if (options.scale) params.scale = options.scale;
    }
    return window.sendPluginCommand('CAPTURE_SCREENSHOT', params, 30000)
      .catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  window.setInstanceProperties = function(nodeId, properties) {
    return window.sendPluginCommand('SET_INSTANCE_PROPERTIES', {
      nodeId: nodeId, properties: properties
    }).catch(function(err) { return { success: false, error: err.message || String(err) }; });
  };

  // ============================================================================
  // WEBSOCKET BRIDGE CLIENT
  // ============================================================================
  (function() {
    var WS_PORT_RANGE_START = 9223; // Must match PORTS.MCP_BRIDGE_WS_START in config.ts
    var WS_PORT_RANGE_END = 9232;   // Must match PORTS.MCP_BRIDGE_WS_END in config.ts

    var activeConnections = [];
    var wsReconnectDelay = 500;
    var wsMaxReconnectDelay = 5000;
    var wsReconnectAttempts = 0;
    var wsMaxReconnectAttempts = 50;
    var isScanning = false;

    var wsConnected = false;

    var methodMap = {
      'EXECUTE_CODE': function(params) { return window.executeCode(params.code, params.timeout); },
      'UPDATE_VARIABLE': function(params) { return window.updateVariable(params.variableId, params.modeId, params.value); },
      'CREATE_VARIABLE': function(params) { return window.createVariable(params.name, params.collectionId, params.resolvedType, params); },
      'DELETE_VARIABLE': function(params) { return window.deleteVariable(params.variableId); },
      'DELETE_VARIABLE_COLLECTION': function(params) { return window.deleteVariableCollection(params.collectionId); },
      'RENAME_VARIABLE': function(params) { return window.renameVariable(params.variableId, params.newName); },
      'SET_VARIABLE_DESCRIPTION': function(params) { return window.setVariableDescription(params.variableId, params.description); },
      'ADD_MODE': function(params) { return window.addMode(params.collectionId, params.modeName); },
      'RENAME_MODE': function(params) { return window.renameMode(params.collectionId, params.modeId, params.newName); },
      'REFRESH_VARIABLES': function() { return window.refreshVariables(); },
      'CREATE_VARIABLE_COLLECTION': function(params) { return window.createVariableCollection(params.name, params); },
      'GET_LOCAL_COMPONENTS': function() { return window.getLocalComponents(); },
      'INSTANTIATE_COMPONENT': function(params) { return window.instantiateComponent(params.componentKey, params); },
      'GET_COMPONENT': function(params) { return window.requestComponentData(params.nodeId); },
      'SET_NODE_DESCRIPTION': function(params) { return window.setNodeDescription(params.nodeId, params.description, params.descriptionMarkdown); },
      'ADD_COMPONENT_PROPERTY': function(params) { return window.addComponentProperty(params.nodeId, params.propertyName, params.propertyType, params.defaultValue, params); },
      'EDIT_COMPONENT_PROPERTY': function(params) { return window.editComponentProperty(params.nodeId, params.propertyName, params.newValue); },
      'DELETE_COMPONENT_PROPERTY': function(params) { return window.deleteComponentProperty(params.nodeId, params.propertyName); },
      'RESIZE_NODE': function(params) { return window.resizeNode(params.nodeId, params.width, params.height, params.withConstraints); },
      'MOVE_NODE': function(params) { return window.moveNode(params.nodeId, params.x, params.y); },
      'SET_NODE_FILLS': function(params) { return window.setNodeFills(params.nodeId, params.fills); },
      'SET_NODE_STROKES': function(params) { return window.setNodeStrokes(params.nodeId, params.strokes, params.strokeWeight); },
      'SET_NODE_OPACITY': function(params) { return window.setNodeOpacity(params.nodeId, params.opacity); },
      'SET_NODE_CORNER_RADIUS': function(params) { return window.setNodeCornerRadius(params.nodeId, params.radius); },
      'CLONE_NODE': function(params) { return window.cloneNode(params.nodeId); },
      'DELETE_NODE': function(params) { return window.deleteNode(params.nodeId); },
      'RENAME_NODE': function(params) { return window.renameNode(params.nodeId, params.newName); },
      'SET_TEXT_CONTENT': function(params) { return window.setTextContent(params.nodeId, params.text, params); },
      'CREATE_CHILD_NODE': function(params) { return window.createChildNode(params.parentId, params.nodeType, params.properties); },
      'CAPTURE_SCREENSHOT': function(params) { return window.captureScreenshot(params.nodeId, params); },
      'SET_INSTANCE_PROPERTIES': function(params) { return window.setInstanceProperties(params.nodeId, params.properties); },
      'GET_VARIABLES_DATA': function() {
        if (window.__figmaVariablesReady && window.__figmaVariablesData) {
          return Promise.resolve(window.__figmaVariablesData);
        }
        return Promise.reject(new Error('Variables data not ready.'));
      },
      'GET_FILE_INFO': function() {
        return window.sendPluginCommand('GET_FILE_INFO', {});
      },
      'CLEAR_CONSOLE': function() {
        return Promise.resolve({ cleared: true });
      },
      'RELOAD_UI': function() {
        return window.sendPluginCommand('RELOAD_UI', {});
      }
    };

    function isPortConnected(port) {
      for (var i = 0; i < activeConnections.length; i++) {
        if (activeConnections[i].port === port && activeConnections[i].ws.readyState === 1) {
          return true;
        }
      }
      return false;
    }

    function removeConnection(port) {
      activeConnections = activeConnections.filter(function(c) { return c.port !== port; });
      updateCompatState();
    }

    function updateCompatState() {
      var live = activeConnections.filter(function(c) { return c.ws.readyState === 1; });
      var wasConnected = wsConnected;
      wsConnected = live.length > 0;
      window.__mcpBridgeConnected = wsConnected;

      // Notify React UI about MCP connection state change
      if (wsConnected !== wasConnected) {
        window.dispatchEvent(new CustomEvent('mcpStatusChange', {
          detail: { connected: wsConnected, serverCount: live.length }
        }));
      }
    }

    function initializeConnection(connWs) {
      if (window.__figmaVariablesReady && window.__figmaVariablesData) {
        connWs.send(JSON.stringify({ type: 'VARIABLES_DATA', data: window.__figmaVariablesData }));
      }

      window.sendPluginCommand('GET_FILE_INFO', {})
        .then(function(info) {
          if (connWs.readyState === 1 && info && info.success !== false) {
            connWs.send(JSON.stringify({ type: 'FILE_INFO', data: info.fileInfo || info }));
          }
        })
        .catch(function() { /* non-critical */ });
    }

    function broadcastToAll(message) {
      var json = JSON.stringify(message);
      activeConnections.forEach(function(conn) {
        if (conn.ws.readyState === 1) {
          try { conn.ws.send(json); } catch(e) { /* ignore */ }
        }
      });
    }

    function attachWsHandlers(activeWs, port) {
      activeWs.onmessage = function(event) {
        try {
          var message = JSON.parse(event.data);
          if (!message.id || !message.method) return;

          var handler = methodMap[message.method];
          if (!handler) {
            activeWs.send(JSON.stringify({ id: message.id, error: 'Unknown method: ' + message.method }));
            return;
          }

          Promise.resolve(handler(message.params || {}))
            .then(function(result) {
              if (activeWs.readyState === 1) {
                activeWs.send(JSON.stringify({ id: message.id, result: result }));
              }
            })
            .catch(function(err) {
              if (activeWs.readyState === 1) {
                activeWs.send(JSON.stringify({ id: message.id, error: err.message || String(err) }));
              }
            });
        } catch (e) {
          console.error('[MCP Bridge] Failed to process WS message:', e);
          uiDebugLog('error', 'WS message processing failed', { error: e.message || String(e) });
        }
      };

      activeWs.onclose = function(event) {
        removeConnection(port);
        console.log('[MCP Bridge] WebSocket disconnected from port ' + port + ' (' + activeConnections.length + ' remaining)');
        uiDebugLog('warn', 'WS disconnected port ' + port, { code: event.code, reason: event.reason, remaining: activeConnections.length });

        var wasReplaced = (event.code === 1000 && (
          event.reason === 'Replaced by new connection' ||
          event.reason === 'Replaced by same file reconnection'
        ));
        if (wasReplaced) return;

        wsReconnectAttempts++;
        if (wsReconnectAttempts <= wsMaxReconnectAttempts) {
          setTimeout(function() { wsReconnectPort(port); }, wsReconnectDelay);
          wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, wsMaxReconnectDelay);
        }
      };

      activeWs.onerror = function() { /* onclose handles reconnect */ };
    }

    function wsReconnectPort(port) {
      try {
        var testWs = new WebSocket('ws://localhost:' + port);
        var timeout = setTimeout(function() {
          if (testWs.readyState !== 1) {
            testWs.close();
            console.log('[MCP Bridge] Port ' + port + ' unavailable, rescanning...');
            wsScanAndConnect();
          }
        }, 2000);

        testWs.onopen = function() {
          clearTimeout(timeout);
          activeConnections.push({ port: port, ws: testWs });
          updateCompatState();
          console.log('[MCP Bridge] Reconnected to port ' + port);
          attachWsHandlers(testWs, port);
          initializeConnection(testWs);
        };

        testWs.onerror = function() {
          clearTimeout(timeout);
          wsScanAndConnect();
        };
      } catch (e) {
        wsScanAndConnect();
      }
    }

    function wsScanAndConnect() {
      if (isScanning) return;
      isScanning = true;

      var portsToTry = [];
      for (var p = WS_PORT_RANGE_START; p <= WS_PORT_RANGE_END; p++) {
        if (!isPortConnected(p)) portsToTry.push(p);
      }

      if (portsToTry.length === 0) {
        isScanning = false;
        return;
      }

      console.log('[MCP Bridge] Scanning ports ' + WS_PORT_RANGE_START + '-' + WS_PORT_RANGE_END + '...');

      var foundAny = false;
      var pending = portsToTry.length;

      portsToTry.forEach(function(port) {
        try {
          var testWs = new WebSocket('ws://localhost:' + port);

          var timeout = setTimeout(function() {
            if (testWs.readyState !== 1) testWs.close();
          }, 3000);

          testWs.onopen = function() {
            clearTimeout(timeout);
            foundAny = true;
            activeConnections.push({ port: port, ws: testWs });
            updateCompatState();
            console.log('[MCP Bridge] Connected to port ' + port + ' (' + activeConnections.length + ' server(s))');
            uiDebugLog('info', 'WS connected port ' + port, { serverCount: activeConnections.length });
            attachWsHandlers(testWs, port);
            initializeConnection(testWs);

            pending--;
            if (pending <= 0) {
              isScanning = false;
              if (foundAny) {
                wsReconnectDelay = 500;
                wsReconnectAttempts = 0;
              }
            }
          };

          testWs.onerror = function() {
            clearTimeout(timeout);
            pending--;
            if (pending <= 0) {
              isScanning = false;
              if (!foundAny && activeConnections.length === 0) {
                wsReconnectAttempts++;
                if (wsReconnectAttempts <= wsMaxReconnectAttempts) {
                  setTimeout(wsScanAndConnect, wsReconnectDelay);
                  wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, wsMaxReconnectDelay);
                }
              }
            }
          };

          testWs.onclose = function() {
            clearTimeout(timeout);
            pending--;
            if (pending <= 0 && !foundAny && activeConnections.length === 0) {
              isScanning = false;
              wsReconnectAttempts++;
              if (wsReconnectAttempts <= wsMaxReconnectAttempts) {
                setTimeout(wsScanAndConnect, wsReconnectDelay);
                wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, wsMaxReconnectDelay);
              }
            }
          };
        } catch (e) {
          pending--;
        }
      });
    }

    // Expose broadcast functions for event forwarding
    window.__wsForwardVariables = function(data) {
      if (wsConnected) broadcastToAll({ type: 'VARIABLES_DATA', data: data });
    };
    window.__wsForwardDocumentChange = function(data) {
      if (wsConnected) broadcastToAll({ type: 'DOCUMENT_CHANGE', data: data });
    };
    window.__wsForwardConsoleCapture = function(data) {
      if (wsConnected) broadcastToAll({ type: 'CONSOLE_CAPTURE', data: data });
    };
    window.__wsForwardSelectionChange = function(data) {
      if (wsConnected) broadcastToAll({ type: 'SELECTION_CHANGE', data: data });
    };
    window.__wsForwardPageChange = function(data) {
      if (wsConnected) broadcastToAll({ type: 'PAGE_CHANGE', data: data });
    };

    // Start scanning for MCP servers
    wsScanAndConnect();

    // Periodic rescan to discover new servers started after plugin loaded
    setInterval(function() {
      if (!isScanning) wsScanAndConnect();
    }, 10000);
  })();

  // ============================================================================
  // MCP BRIDGE MESSAGE HANDLER — process responses from sandbox
  // Adds a listener that handles MCP-specific UPPERCASE messages.
  // The existing React `window.onmessage` (set later by ui.tsx) handles
  // lowercase/kebab-case Contentify messages. Both coexist via addEventListener.
  // ============================================================================

  window.addEventListener('message', function(event) {
    var msg = event.data && event.data.pluginMessage;
    if (!msg || !msg.type) return;

    var type = msg.type;

    // Only handle UPPERCASE MCP bridge result messages
    if (type !== type.toUpperCase() && type.indexOf('_') === -1) return;

    var handleResult = function(dataKey) {
      var request = window.__figmaPendingRequests.get(msg.requestId);
      if (request) {
        if (request.timeoutId) clearTimeout(request.timeoutId);
        if (msg.success) {
          var result = { success: true };
          if (dataKey && msg[dataKey] !== undefined) result[dataKey] = msg[dataKey];
          if (msg.data !== undefined) result.data = msg.data;
          if (msg.oldName !== undefined) result.oldName = msg.oldName;
          if (msg.instance !== undefined) result.instance = msg.instance;
          request.resolve(result);
        } else {
          request.resolve({ success: false, error: msg.error || 'Unknown error' });
        }
        window.__figmaPendingRequests.delete(msg.requestId);
      }
    };

    switch (type) {
      case 'VARIABLES_DATA':
        window.__figmaVariablesData = msg.data;
        window.__figmaVariablesReady = true;
        if (window.__wsForwardVariables) window.__wsForwardVariables(msg.data);
        break;

      case 'COMPONENT_DATA':
        window.__figmaComponentData = msg.data;
        var req = window.__figmaComponentRequests.get(msg.requestId);
        if (req) { req.resolve(msg.data); window.__figmaComponentRequests.delete(msg.requestId); }
        break;

      case 'COMPONENT_ERROR':
        var req2 = window.__figmaComponentRequests.get(msg.requestId);
        if (req2) { req2.reject(new Error(msg.error)); window.__figmaComponentRequests.delete(msg.requestId); }
        break;

      case 'ERROR':
        window.__figmaVariablesReady = false;
        break;

      // Variable results
      case 'EXECUTE_CODE_RESULT': handleResult('result'); break;
      case 'UPDATE_VARIABLE_RESULT': handleResult('variable'); break;
      case 'CREATE_VARIABLE_RESULT': handleResult('variable'); break;
      case 'CREATE_VARIABLE_COLLECTION_RESULT': handleResult('collection'); break;
      case 'DELETE_VARIABLE_RESULT': handleResult('deleted'); break;
      case 'DELETE_VARIABLE_COLLECTION_RESULT': handleResult('deleted'); break;
      case 'REFRESH_VARIABLES_RESULT': handleResult(null); break;
      case 'RENAME_VARIABLE_RESULT': handleResult('variable'); break;
      case 'SET_VARIABLE_DESCRIPTION_RESULT': handleResult('variable'); break;
      case 'ADD_MODE_RESULT': handleResult('collection'); break;
      case 'RENAME_MODE_RESULT': handleResult('collection'); break;

      // Component results
      case 'GET_LOCAL_COMPONENTS_RESULT': handleResult(null); break;
      case 'INSTANTIATE_COMPONENT_RESULT': handleResult('instance'); break;
      case 'SET_NODE_DESCRIPTION_RESULT': handleResult('node'); break;
      case 'ADD_COMPONENT_PROPERTY_RESULT': handleResult('propertyName'); break;
      case 'EDIT_COMPONENT_PROPERTY_RESULT': handleResult('propertyName'); break;
      case 'DELETE_COMPONENT_PROPERTY_RESULT': handleResult(null); break;
      case 'ARRANGE_COMPONENT_SET_RESULT': handleResult(null); break;

      // Node manipulation results
      case 'RESIZE_NODE_RESULT': handleResult('node'); break;
      case 'MOVE_NODE_RESULT': handleResult('node'); break;
      case 'SET_NODE_FILLS_RESULT': handleResult('node'); break;
      case 'SET_NODE_STROKES_RESULT': handleResult('node'); break;
      case 'SET_NODE_OPACITY_RESULT': handleResult('node'); break;
      case 'SET_NODE_CORNER_RADIUS_RESULT': handleResult('node'); break;
      case 'CLONE_NODE_RESULT': handleResult('node'); break;
      case 'DELETE_NODE_RESULT': handleResult('deleted'); break;
      case 'RENAME_NODE_RESULT': handleResult('node'); break;
      case 'SET_TEXT_CONTENT_RESULT': handleResult('node'); break;
      case 'CREATE_CHILD_NODE_RESULT': handleResult('node'); break;
      case 'CAPTURE_SCREENSHOT_RESULT': handleResult('image'); break;
      case 'SET_INSTANCE_PROPERTIES_RESULT': handleResult('instance'); break;
      case 'GET_FILE_INFO_RESULT': handleResult('fileInfo'); break;
      case 'RELOAD_UI_RESULT': handleResult(null); break;

      // Event forwarding to WebSocket
      case 'DOCUMENT_CHANGE':
        if (window.__wsForwardDocumentChange) window.__wsForwardDocumentChange(msg.data);
        break;
      case 'CONSOLE_CAPTURE':
        if (window.__wsForwardConsoleCapture) window.__wsForwardConsoleCapture(msg);
        break;
      case 'SELECTION_CHANGE':
        if (window.__wsForwardSelectionChange) window.__wsForwardSelectionChange(msg.data);
        break;
      case 'PAGE_CHANGE':
        if (window.__wsForwardPageChange) window.__wsForwardPageChange(msg.data);
        break;
    }
  });
})();
