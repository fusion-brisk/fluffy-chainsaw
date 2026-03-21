/**
 * MCP Bridge — Sandbox-side message handlers
 * 
 * Handles all MCP bridge commands from the UI iframe (WebSocket relay).
 * Each handler receives a message via figma.ui.onmessage, calls Figma API,
 * and sends the result back via figma.ui.postMessage.
 * 
 * All message types use UPPERCASE convention (e.g. EXECUTE_CODE, UPDATE_VARIABLE)
 * to avoid collision with existing Contentify kebab-case messages.
 */

import { Logger } from '../../logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToFigmaRGB(hex: string): { r: number; g: number; b: number; a: number } {
  hex = hex.replace(/^#/, '');

  if (!/^[0-9A-Fa-f]+$/.test(hex)) {
    throw new Error('Invalid hex color: "' + hex + '" contains non-hex characters.');
  }

  var r: number, g: number, b: number, a = 1;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  } else if (hex.length === 4) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
    a = parseInt(hex[3] + hex[3], 16) / 255;
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  } else if (hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else {
    throw new Error('Invalid hex color format: "' + hex + '". Expected 3, 4, 6, or 8 hex characters.');
  }

  return { r: r, g: g, b: b, a: a };
}

function serializeVariable(v: Variable): Record<string, unknown> {
  return {
    id: v.id,
    name: v.name,
    key: v.key,
    resolvedType: v.resolvedType,
    valuesByMode: v.valuesByMode,
    variableCollectionId: v.variableCollectionId,
    scopes: v.scopes,
    description: v.description,
    hiddenFromPublishing: v.hiddenFromPublishing
  };
}

function serializeCollection(c: VariableCollection): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    key: c.key,
    modes: c.modes,
    defaultModeId: c.defaultModeId,
    variableIds: c.variableIds
  };
}

function reply(type: string, requestId: string, data: Record<string, unknown>): void {
  figma.ui.postMessage(Object.assign({ type: type, requestId: requestId }, data));
}

function replySuccess(type: string, requestId: string, extra?: Record<string, unknown>): void {
  reply(type, requestId, Object.assign({ success: true }, extra || {}));
}

function replyError(type: string, requestId: string, error: unknown): void {
  var msg = (error && typeof error === 'object' && 'message' in error)
    ? (error as Error).message
    : String(error);
  reply(type, requestId, { success: false, error: msg });
}

// ---------------------------------------------------------------------------
// Known MCP bridge message types (all UPPERCASE)
// ---------------------------------------------------------------------------

var BRIDGE_TYPES: Record<string, boolean> = {
  'EXECUTE_CODE': true,
  'UPDATE_VARIABLE': true,
  'CREATE_VARIABLE': true,
  'CREATE_VARIABLE_COLLECTION': true,
  'DELETE_VARIABLE': true,
  'DELETE_VARIABLE_COLLECTION': true,
  'RENAME_VARIABLE': true,
  'SET_VARIABLE_DESCRIPTION': true,
  'ADD_MODE': true,
  'RENAME_MODE': true,
  'REFRESH_VARIABLES': true,
  'GET_COMPONENT': true,
  'GET_LOCAL_COMPONENTS': true,
  'INSTANTIATE_COMPONENT': true,
  'SET_NODE_DESCRIPTION': true,
  'ADD_COMPONENT_PROPERTY': true,
  'EDIT_COMPONENT_PROPERTY': true,
  'DELETE_COMPONENT_PROPERTY': true,
  'RESIZE_NODE': true,
  'MOVE_NODE': true,
  'SET_NODE_FILLS': true,
  'SET_NODE_STROKES': true,
  'SET_NODE_OPACITY': true,
  'SET_NODE_CORNER_RADIUS': true,
  'CLONE_NODE': true,
  'DELETE_NODE': true,
  'RENAME_NODE': true,
  'SET_TEXT_CONTENT': true,
  'CREATE_CHILD_NODE': true,
  'CAPTURE_SCREENSHOT': true,
  'SET_INSTANCE_PROPERTIES': true,
  'GET_FILE_INFO': true,
  'RELOAD_UI': true,
  'ARRANGE_COMPONENT_SET': true,
};

// ---------------------------------------------------------------------------
// Main dispatcher — returns true if message was handled
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleBridgeMessage(msg: any): Promise<boolean> {
  if (!msg || !msg.type || !BRIDGE_TYPES[msg.type]) {
    return false;
  }

  var type = msg.type as string;
  var requestId = (msg.requestId || '') as string;

  try {
    switch (type) {
      case 'EXECUTE_CODE':
        await handleExecuteCode(msg, requestId);
        break;
      case 'UPDATE_VARIABLE':
        await handleUpdateVariable(msg, requestId);
        break;
      case 'CREATE_VARIABLE':
        await handleCreateVariable(msg, requestId);
        break;
      case 'CREATE_VARIABLE_COLLECTION':
        await handleCreateVariableCollection(msg, requestId);
        break;
      case 'DELETE_VARIABLE':
        await handleDeleteVariable(msg, requestId);
        break;
      case 'DELETE_VARIABLE_COLLECTION':
        await handleDeleteVariableCollection(msg, requestId);
        break;
      case 'RENAME_VARIABLE':
        await handleRenameVariable(msg, requestId);
        break;
      case 'SET_VARIABLE_DESCRIPTION':
        await handleSetVariableDescription(msg, requestId);
        break;
      case 'ADD_MODE':
        await handleAddMode(msg, requestId);
        break;
      case 'RENAME_MODE':
        await handleRenameMode(msg, requestId);
        break;
      case 'REFRESH_VARIABLES':
        await handleRefreshVariables(requestId);
        break;
      case 'GET_COMPONENT':
        await handleGetComponent(msg, requestId);
        break;
      case 'GET_LOCAL_COMPONENTS':
        await handleGetLocalComponents(requestId);
        break;
      case 'INSTANTIATE_COMPONENT':
        await handleInstantiateComponent(msg, requestId);
        break;
      case 'SET_NODE_DESCRIPTION':
        await handleSetNodeDescription(msg, requestId);
        break;
      case 'ADD_COMPONENT_PROPERTY':
        await handleAddComponentProperty(msg, requestId);
        break;
      case 'EDIT_COMPONENT_PROPERTY':
        await handleEditComponentProperty(msg, requestId);
        break;
      case 'DELETE_COMPONENT_PROPERTY':
        await handleDeleteComponentProperty(msg, requestId);
        break;
      case 'RESIZE_NODE':
        await handleResizeNode(msg, requestId);
        break;
      case 'MOVE_NODE':
        await handleMoveNode(msg, requestId);
        break;
      case 'SET_NODE_FILLS':
        await handleSetNodeFills(msg, requestId);
        break;
      case 'SET_NODE_STROKES':
        await handleSetNodeStrokes(msg, requestId);
        break;
      case 'SET_NODE_OPACITY':
        await handleSetNodeOpacity(msg, requestId);
        break;
      case 'SET_NODE_CORNER_RADIUS':
        await handleSetNodeCornerRadius(msg, requestId);
        break;
      case 'CLONE_NODE':
        await handleCloneNode(msg, requestId);
        break;
      case 'DELETE_NODE':
        await handleDeleteNode(msg, requestId);
        break;
      case 'RENAME_NODE':
        await handleRenameNode(msg, requestId);
        break;
      case 'SET_TEXT_CONTENT':
        await handleSetTextContent(msg, requestId);
        break;
      case 'CREATE_CHILD_NODE':
        await handleCreateChildNode(msg, requestId);
        break;
      case 'CAPTURE_SCREENSHOT':
        await handleCaptureScreenshot(msg, requestId);
        break;
      case 'SET_INSTANCE_PROPERTIES':
        await handleSetInstanceProperties(msg, requestId);
        break;
      case 'GET_FILE_INFO':
        handleGetFileInfo(requestId);
        break;
      case 'RELOAD_UI':
        handleReloadUI(requestId);
        break;
      case 'ARRANGE_COMPONENT_SET':
        await handleArrangeComponentSet(msg, requestId);
        break;
      default:
        return false;
    }
  } catch (err) {
    Logger.error('[MCP Bridge] Handler error for ' + type + ':', err);
    replyError(type + '_RESULT', requestId, err);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleExecuteCode(msg: any, requestId: string): Promise<void> {
  Logger.debug('[MCP Bridge] Executing code, length: ' + msg.code.length);

  var wrappedCode = '(async function() {\n' + msg.code + '\n})()';
  var timeoutMs = msg.timeout || 5000;

  var timeoutPromise = new Promise(function(_: unknown, reject: (reason: Error) => void) {
    setTimeout(function() {
      reject(new Error('Execution timed out after ' + timeoutMs + 'ms'));
    }, timeoutMs);
  });

  var codePromise: unknown;
  try {
    // eslint-disable-next-line no-eval
    codePromise = eval(wrappedCode);
  } catch (syntaxError) {
    var syntaxMsg = (syntaxError && typeof syntaxError === 'object' && 'message' in syntaxError)
      ? (syntaxError as Error).message : String(syntaxError);
    replyError('EXECUTE_CODE_RESULT', requestId, new Error('Syntax error: ' + syntaxMsg));
    return;
  }

  var result = await Promise.race([codePromise as Promise<unknown>, timeoutPromise]);

  var resultAnalysis: Record<string, unknown> = {
    type: typeof result,
    isNull: result === null,
    isUndefined: result === undefined,
    isEmpty: false,
    warning: null
  };

  if (Array.isArray(result)) {
    resultAnalysis.isEmpty = result.length === 0;
    if (result.length === 0) {
      resultAnalysis.warning = 'Code returned an empty array.';
    }
  } else if (result !== null && typeof result === 'object') {
    var keys = Object.keys(result as Record<string, unknown>);
    resultAnalysis.isEmpty = keys.length === 0;
    if (keys.length === 0) {
      resultAnalysis.warning = 'Code returned an empty object.';
    }
  } else if (result === null) {
    resultAnalysis.warning = 'Code returned null.';
  } else if (result === undefined) {
    resultAnalysis.warning = 'Code returned undefined. Make sure your code has a return statement.';
  }

  replySuccess('EXECUTE_CODE_RESULT', requestId, {
    result: result,
    resultAnalysis: resultAnalysis,
    fileContext: {
      fileName: figma.root.name,
      fileKey: figma.fileKey || null
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleUpdateVariable(msg: any, requestId: string): Promise<void> {
  var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
  if (!variable) throw new Error('Variable not found: ' + msg.variableId);

  var value = msg.value;

  if (typeof value === 'string' && value.indexOf('VariableID:') === 0) {
    value = { type: 'VARIABLE_ALIAS', id: value };
  } else if (variable.resolvedType === 'COLOR' && typeof value === 'string') {
    value = hexToFigmaRGB(value);
  }

  variable.setValueForMode(msg.modeId, value);

  replySuccess('UPDATE_VARIABLE_RESULT', requestId, {
    variable: serializeVariable(variable)
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateVariable(msg: any, requestId: string): Promise<void> {
  var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
  if (!collection) throw new Error('Collection not found: ' + msg.collectionId);

  var variable = figma.variables.createVariable(msg.name, collection, msg.resolvedType);

  if (msg.valuesByMode) {
    for (var modeId in msg.valuesByMode) {
      var val = msg.valuesByMode[modeId];
      if (msg.resolvedType === 'COLOR' && typeof val === 'string') {
        val = hexToFigmaRGB(val);
      }
      variable.setValueForMode(modeId, val);
    }
  }

  if (msg.description) variable.description = msg.description;
  if (msg.scopes) variable.scopes = msg.scopes;

  replySuccess('CREATE_VARIABLE_RESULT', requestId, {
    variable: serializeVariable(variable)
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateVariableCollection(msg: any, requestId: string): Promise<void> {
  var collection = figma.variables.createVariableCollection(msg.name);

  if (msg.initialModeName && collection.modes.length > 0) {
    collection.renameMode(collection.modes[0].modeId, msg.initialModeName);
  }

  if (msg.additionalModes && msg.additionalModes.length > 0) {
    for (var i = 0; i < msg.additionalModes.length; i++) {
      collection.addMode(msg.additionalModes[i]);
    }
  }

  replySuccess('CREATE_VARIABLE_COLLECTION_RESULT', requestId, {
    collection: serializeCollection(collection)
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeleteVariable(msg: any, requestId: string): Promise<void> {
  var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
  if (!variable) throw new Error('Variable not found: ' + msg.variableId);

  var deletedInfo = { id: variable.id, name: variable.name };
  variable.remove();

  replySuccess('DELETE_VARIABLE_RESULT', requestId, { deleted: deletedInfo });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeleteVariableCollection(msg: any, requestId: string): Promise<void> {
  var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
  if (!collection) throw new Error('Collection not found: ' + msg.collectionId);

  var deletedInfo = { id: collection.id, name: collection.name, variableCount: collection.variableIds.length };
  collection.remove();

  replySuccess('DELETE_VARIABLE_COLLECTION_RESULT', requestId, { deleted: deletedInfo });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRenameVariable(msg: any, requestId: string): Promise<void> {
  var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
  if (!variable) throw new Error('Variable not found: ' + msg.variableId);

  var oldName = variable.name;
  variable.name = msg.newName;

  var serialized = serializeVariable(variable);
  serialized.oldName = oldName;
  replySuccess('RENAME_VARIABLE_RESULT', requestId, { variable: serialized, oldName: oldName });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetVariableDescription(msg: any, requestId: string): Promise<void> {
  var variable = await figma.variables.getVariableByIdAsync(msg.variableId);
  if (!variable) throw new Error('Variable not found: ' + msg.variableId);

  variable.description = msg.description || '';

  replySuccess('SET_VARIABLE_DESCRIPTION_RESULT', requestId, {
    variable: serializeVariable(variable)
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddMode(msg: any, requestId: string): Promise<void> {
  var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
  if (!collection) throw new Error('Collection not found: ' + msg.collectionId);

  var newModeId = collection.addMode(msg.modeName);

  replySuccess('ADD_MODE_RESULT', requestId, {
    collection: serializeCollection(collection),
    newMode: { modeId: newModeId, name: msg.modeName }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRenameMode(msg: any, requestId: string): Promise<void> {
  var collection = await figma.variables.getVariableCollectionByIdAsync(msg.collectionId);
  if (!collection) throw new Error('Collection not found: ' + msg.collectionId);

  var currentMode = null;
  for (var i = 0; i < collection.modes.length; i++) {
    if (collection.modes[i].modeId === msg.modeId) {
      currentMode = collection.modes[i];
      break;
    }
  }
  if (!currentMode) throw new Error('Mode not found: ' + msg.modeId);

  var oldName = currentMode.name;
  collection.renameMode(msg.modeId, msg.newName);

  var serialized = serializeCollection(collection);
  serialized.oldName = oldName;
  replySuccess('RENAME_MODE_RESULT', requestId, { collection: serialized, oldName: oldName });
}

async function handleRefreshVariables(requestId: string): Promise<void> {
  var variables = await figma.variables.getLocalVariablesAsync();
  var collections = await figma.variables.getLocalVariableCollectionsAsync();

  var variablesData = {
    success: true,
    timestamp: Date.now(),
    fileKey: figma.fileKey || null,
    variables: variables.map(serializeVariable),
    variableCollections: collections.map(serializeCollection)
  };

  figma.ui.postMessage({ type: 'VARIABLES_DATA', data: variablesData });
  replySuccess('REFRESH_VARIABLES_RESULT', requestId, { data: variablesData });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetComponent(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET' && node.type !== 'INSTANCE') {
    throw new Error('Node is not a component. Type: ' + node.type);
  }

  var isVariant = node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET';

  var componentData: Record<string, unknown> = {
    success: true,
    timestamp: Date.now(),
    nodeId: msg.nodeId,
    component: {
      id: node.id,
      name: node.name,
      type: node.type,
      description: (node as ComponentNode).description || null,
      visible: node.visible,
      locked: node.locked,
      annotations: (node as ComponentNode).annotations || [],
      isVariant: isVariant,
      componentPropertyDefinitions: (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && !isVariant))
        ? (node as ComponentNode | ComponentSetNode).componentPropertyDefinitions
        : undefined,
      children: ('children' in node && node.children)
        ? (node.children as ReadonlyArray<SceneNode>).map(function(child) {
            return { id: child.id, name: child.name, type: child.type };
          })
        : undefined
    }
  };

  reply('COMPONENT_DATA', requestId, { data: componentData });
}

async function handleGetLocalComponents(requestId: string): Promise<void> {
  var components: Record<string, unknown>[] = [];
  var componentSets: Record<string, unknown>[] = [];

  function extractComponentData(node: ComponentNode): Record<string, unknown> {
    var data: Record<string, unknown> = {
      key: node.key,
      nodeId: node.id,
      name: node.name,
      type: node.type,
      description: node.description || null,
      width: node.width,
      height: node.height
    };

    var isPartOfSet = node.parent && node.parent.type === 'COMPONENT_SET';
    if (!isPartOfSet && node.componentPropertyDefinitions) {
      var props: Record<string, unknown>[] = [];
      var propDefs = node.componentPropertyDefinitions;
      for (var propName in propDefs) {
        if (Object.prototype.hasOwnProperty.call(propDefs, propName)) {
          props.push({
            name: propName,
            type: propDefs[propName].type,
            defaultValue: propDefs[propName].defaultValue
          });
        }
      }
      data.properties = props;
    }

    return data;
  }

  function extractComponentSetData(node: ComponentSetNode): Record<string, unknown> {
    var variantAxes: Record<string, string[]> = {};
    var variants: Record<string, unknown>[] = [];

    if (node.children) {
      for (var ci = 0; ci < node.children.length; ci++) {
        var child = node.children[ci];
        if (child.type === 'COMPONENT') {
          var variantProps: Record<string, string> = {};
          var parts = child.name.split(',');
          for (var pi = 0; pi < parts.length; pi++) {
            var kv = parts[pi].trim().split('=');
            if (kv.length === 2) {
              var key = kv[0].trim();
              var value = kv[1].trim();
              variantProps[key] = value;
              if (!variantAxes[key]) variantAxes[key] = [];
              if (variantAxes[key].indexOf(value) === -1) variantAxes[key].push(value);
            }
          }
          variants.push({
            key: child.key,
            nodeId: child.id,
            name: child.name,
            description: child.description || null,
            variantProperties: variantProps,
            width: child.width,
            height: child.height
          });
        }
      }
    }

    var axes: Record<string, unknown>[] = [];
    for (var axisName in variantAxes) {
      if (Object.prototype.hasOwnProperty.call(variantAxes, axisName)) {
        axes.push({ name: axisName, values: variantAxes[axisName] });
      }
    }

    var setProps: Record<string, unknown>[] = [];
    if (node.componentPropertyDefinitions) {
      for (var pn in node.componentPropertyDefinitions) {
        if (Object.prototype.hasOwnProperty.call(node.componentPropertyDefinitions, pn)) {
          setProps.push({
            name: pn,
            type: node.componentPropertyDefinitions[pn].type,
            defaultValue: node.componentPropertyDefinitions[pn].defaultValue
          });
        }
      }
    }

    return {
      key: node.key,
      nodeId: node.id,
      name: node.name,
      type: 'COMPONENT_SET',
      description: node.description || null,
      variantAxes: axes,
      variants: variants,
      defaultVariant: variants.length > 0 ? variants[0] : null,
      properties: setProps
    };
  }

  function findComponents(node: BaseNode): void {
    if (!node) return;

    if (node.type === 'COMPONENT_SET') {
      componentSets.push(extractComponentSetData(node as ComponentSetNode));
    } else if (node.type === 'COMPONENT') {
      if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
        components.push(extractComponentData(node as ComponentNode));
      }
    }

    if ('children' in node && (node as ChildrenMixin).children) {
      var children = (node as ChildrenMixin).children;
      for (var i = 0; i < children.length; i++) {
        findComponents(children[i]);
      }
    }
  }

  await figma.loadAllPagesAsync();

  var pages = figma.root.children;
  var PAGE_BATCH_SIZE = 3;

  for (var pageIndex = 0; pageIndex < pages.length; pageIndex += PAGE_BATCH_SIZE) {
    var batchEnd = Math.min(pageIndex + PAGE_BATCH_SIZE, pages.length);
    for (var j = pageIndex; j < batchEnd; j++) {
      findComponents(pages[j]);
    }
    if (batchEnd < pages.length) {
      await new Promise(function(resolve: (value: unknown) => void) { setTimeout(resolve, 0); });
    }
  }

  replySuccess('GET_LOCAL_COMPONENTS_RESULT', requestId, {
    data: {
      components: components,
      componentSets: componentSets,
      totalComponents: components.length,
      totalComponentSets: componentSets.length,
      fileName: figma.root.name,
      fileKey: figma.fileKey || null,
      timestamp: Date.now()
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInstantiateComponent(msg: any, requestId: string): Promise<void> {
  var component: ComponentNode | null = null;

  if (msg.componentKey) {
    try {
      component = await figma.importComponentByKeyAsync(msg.componentKey);
    } catch (_e) {
      Logger.debug('[MCP Bridge] Not a published component, trying local...');
    }
  }

  if (!component && msg.nodeId) {
    var node = await figma.getNodeByIdAsync(msg.nodeId);
    if (node) {
      if (node.type === 'COMPONENT') {
        component = node as ComponentNode;
      } else if (node.type === 'COMPONENT_SET') {
        var setNode = node as ComponentSetNode;
        if (msg.variant && setNode.children && setNode.children.length > 0) {
          var variantParts: string[] = [];
          for (var prop in msg.variant) {
            if (Object.prototype.hasOwnProperty.call(msg.variant, prop)) {
              variantParts.push(prop + '=' + msg.variant[prop]);
            }
          }
          var targetVariantName = variantParts.join(', ');

          for (var vi = 0; vi < setNode.children.length; vi++) {
            if (setNode.children[vi].type === 'COMPONENT' && setNode.children[vi].name === targetVariantName) {
              component = setNode.children[vi] as ComponentNode;
              break;
            }
          }

          if (!component) {
            for (var vi2 = 0; vi2 < setNode.children.length; vi2++) {
              var vChild = setNode.children[vi2];
              if (vChild.type === 'COMPONENT') {
                var matches = true;
                for (var mp in msg.variant) {
                  if (Object.prototype.hasOwnProperty.call(msg.variant, mp)) {
                    if (vChild.name.indexOf(mp + '=' + msg.variant[mp]) === -1) {
                      matches = false;
                      break;
                    }
                  }
                }
                if (matches) {
                  component = vChild as ComponentNode;
                  break;
                }
              }
            }
          }
        }

        if (!component && setNode.children && setNode.children.length > 0) {
          component = setNode.children[0] as ComponentNode;
        }
      }
    }
  }

  if (!component) {
    var errorParts = ['Component not found.'];
    if (msg.componentKey && !msg.nodeId) {
      errorParts.push('componentKey "' + msg.componentKey + '" not found in published libraries. For local components, provide nodeId.');
    } else if (msg.nodeId) {
      errorParts.push('nodeId "' + msg.nodeId + '" does not exist. NodeIds are session-specific.');
    }
    errorParts.push('SOLUTION: Call figma_search_components for fresh identifiers.');
    throw new Error(errorParts.join(' '));
  }

  var instance = component.createInstance();

  if (msg.position) {
    instance.x = msg.position.x || 0;
    instance.y = msg.position.y || 0;
  }

  if (msg.size) {
    instance.resize(msg.size.width, msg.size.height);
  }

  if (msg.overrides) {
    for (var oProp in msg.overrides) {
      if (Object.prototype.hasOwnProperty.call(msg.overrides, oProp)) {
        try {
          var overrideObj: Record<string, string | boolean> = {};
          overrideObj[oProp] = msg.overrides[oProp];
          instance.setProperties(overrideObj);
        } catch (propError) {
          Logger.debug('[MCP Bridge] Could not set property ' + oProp + ': ' + propError);
        }
      }
    }
  }

  if (msg.variant) {
    try {
      instance.setProperties(msg.variant);
    } catch (variantError) {
      Logger.debug('[MCP Bridge] Could not set variant: ' + variantError);
    }
  }

  if (msg.parentId) {
    var parent = await figma.getNodeByIdAsync(msg.parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(instance);
    }
  }

  replySuccess('INSTANTIATE_COMPONENT_RESULT', requestId, {
    instance: {
      id: instance.id,
      name: instance.name,
      x: instance.x,
      y: instance.y,
      width: instance.width,
      height: instance.height
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetNodeDescription(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('description' in node)) throw new Error('Node type ' + node.type + ' does not support description');

  (node as ComponentNode).description = msg.description || '';
  if (msg.descriptionMarkdown && 'descriptionMarkdown' in node) {
    (node as ComponentNode).descriptionMarkdown = msg.descriptionMarkdown;
  }

  replySuccess('SET_NODE_DESCRIPTION_RESULT', requestId, {
    node: { id: node.id, name: node.name, description: (node as ComponentNode).description }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddComponentProperty(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error('Node must be a COMPONENT or COMPONENT_SET. Got: ' + node.type);
  }
  if (node.type === 'COMPONENT' && node.parent && node.parent.type === 'COMPONENT_SET') {
    throw new Error('Cannot add properties to variant components. Add to the parent COMPONENT_SET instead.');
  }

  var options = msg.preferredValues ? { preferredValues: msg.preferredValues } : undefined;
  var propertyNameWithId = (node as ComponentNode).addComponentProperty(msg.propertyName, msg.propertyType, msg.defaultValue, options);

  replySuccess('ADD_COMPONENT_PROPERTY_RESULT', requestId, { propertyName: propertyNameWithId });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEditComponentProperty(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error('Node must be a COMPONENT or COMPONENT_SET. Got: ' + node.type);
  }

  var propertyNameWithId = (node as ComponentNode).editComponentProperty(msg.propertyName, msg.newValue);
  replySuccess('EDIT_COMPONENT_PROPERTY_RESULT', requestId, { propertyName: propertyNameWithId });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeleteComponentProperty(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET') {
    throw new Error('Node must be a COMPONENT or COMPONENT_SET. Got: ' + node.type);
  }

  (node as ComponentNode).deleteComponentProperty(msg.propertyName);
  replySuccess('DELETE_COMPONENT_PROPERTY_RESULT', requestId, {});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleResizeNode(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('resize' in node)) throw new Error('Node type ' + node.type + ' does not support resize');

  var resizeable = node as FrameNode;
  if (msg.withConstraints !== false) {
    resizeable.resize(msg.width, msg.height);
  } else {
    resizeable.resizeWithoutConstraints(msg.width, msg.height);
  }

  replySuccess('RESIZE_NODE_RESULT', requestId, {
    node: { id: node.id, name: node.name, width: resizeable.width, height: resizeable.height }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMoveNode(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('x' in node)) throw new Error('Node type ' + node.type + ' does not support positioning');

  var positioned = node as FrameNode;
  positioned.x = msg.x;
  positioned.y = msg.y;

  replySuccess('MOVE_NODE_RESULT', requestId, {
    node: { id: node.id, name: node.name, x: positioned.x, y: positioned.y }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetNodeFills(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('fills' in node)) throw new Error('Node type ' + node.type + ' does not support fills');

  var fillable = node as GeometryMixin & BaseNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var processedFills = msg.fills.map(function(fill: any) {
    if (fill.type === 'SOLID' && typeof fill.color === 'string') {
      var rgb = hexToFigmaRGB(fill.color);
      return {
        type: 'SOLID',
        color: { r: rgb.r, g: rgb.g, b: rgb.b },
        opacity: rgb.a !== undefined ? rgb.a : (fill.opacity !== undefined ? fill.opacity : 1)
      };
    }
    return fill;
  });

  fillable.fills = processedFills;

  replySuccess('SET_NODE_FILLS_RESULT', requestId, {
    node: { id: node.id, name: node.name }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetNodeStrokes(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('strokes' in node)) throw new Error('Node type ' + node.type + ' does not support strokes');

  var strokable = node as GeometryMixin & BaseNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var processedStrokes = msg.strokes.map(function(stroke: any) {
    if (stroke.type === 'SOLID' && typeof stroke.color === 'string') {
      var rgb = hexToFigmaRGB(stroke.color);
      return {
        type: 'SOLID',
        color: { r: rgb.r, g: rgb.g, b: rgb.b },
        opacity: rgb.a !== undefined ? rgb.a : (stroke.opacity !== undefined ? stroke.opacity : 1)
      };
    }
    return stroke;
  });

  strokable.strokes = processedStrokes;
  if (msg.strokeWeight !== undefined) {
    (node as GeometryMixin).strokeWeight = msg.strokeWeight;
  }

  replySuccess('SET_NODE_STROKES_RESULT', requestId, {
    node: { id: node.id, name: node.name }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetNodeOpacity(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('opacity' in node)) throw new Error('Node type ' + node.type + ' does not support opacity');

  var blendable = node as BlendMixin & BaseNode;
  blendable.opacity = Math.max(0, Math.min(1, msg.opacity));

  replySuccess('SET_NODE_OPACITY_RESULT', requestId, {
    node: { id: node.id, name: node.name, opacity: blendable.opacity }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetNodeCornerRadius(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('cornerRadius' in node)) throw new Error('Node type ' + node.type + ' does not support corner radius');

  (node as RectangleNode).cornerRadius = msg.radius;

  replySuccess('SET_NODE_CORNER_RADIUS_RESULT', requestId, {
    node: { id: node.id, name: node.name, cornerRadius: (node as RectangleNode).cornerRadius }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCloneNode(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('clone' in node)) throw new Error('Node type ' + node.type + ' does not support cloning');

  var cloned = (node as FrameNode).clone();

  replySuccess('CLONE_NODE_RESULT', requestId, {
    node: { id: cloned.id, name: cloned.name, x: cloned.x, y: cloned.y }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeleteNode(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);

  var deletedInfo = { id: node.id, name: node.name };
  node.remove();

  replySuccess('DELETE_NODE_RESULT', requestId, { deleted: deletedInfo });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRenameNode(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);

  var oldName = node.name;
  node.name = msg.newName;

  replySuccess('RENAME_NODE_RESULT', requestId, {
    node: { id: node.id, name: node.name, oldName: oldName }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetTextContent(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (node.type !== 'TEXT') throw new Error('Node must be a TEXT node. Got: ' + node.type);

  var textNode = node as TextNode;
  await figma.loadFontAsync(textNode.fontName as FontName);
  textNode.characters = msg.text;

  if (msg.fontSize) textNode.fontSize = msg.fontSize;

  replySuccess('SET_TEXT_CONTENT_RESULT', requestId, {
    node: { id: node.id, name: node.name, characters: textNode.characters }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateChildNode(msg: any, requestId: string): Promise<void> {
  var parent = await figma.getNodeByIdAsync(msg.parentId);
  if (!parent) throw new Error('Parent node not found: ' + msg.parentId);
  if (!('appendChild' in parent)) throw new Error('Parent node type ' + parent.type + ' does not support children');

  var parentNode = parent as FrameNode;
  var newNode: SceneNode;
  var props = msg.properties || {};

  switch (msg.nodeType) {
    case 'RECTANGLE':
      newNode = figma.createRectangle();
      break;
    case 'ELLIPSE':
      newNode = figma.createEllipse();
      break;
    case 'FRAME':
      newNode = figma.createFrame();
      break;
    case 'TEXT': {
      var textN = figma.createText();
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      textN.fontName = { family: 'Inter', style: 'Regular' };
      if (props.text) textN.characters = props.text;
      newNode = textN;
      break;
    }
    case 'LINE':
      newNode = figma.createLine();
      break;
    case 'POLYGON':
      newNode = figma.createPolygon();
      break;
    case 'STAR':
      newNode = figma.createStar();
      break;
    case 'VECTOR':
      newNode = figma.createVector();
      break;
    default:
      throw new Error('Unsupported node type: ' + msg.nodeType);
  }

  if (props.name) newNode.name = props.name;
  if (props.x !== undefined) newNode.x = props.x;
  if (props.y !== undefined) newNode.y = props.y;
  if (props.width !== undefined && props.height !== undefined) {
    (newNode as FrameNode).resize(props.width, props.height);
  }

  if (props.fills) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    var processedFills = props.fills.map(function(fill: any) {
      if (fill.type === 'SOLID' && typeof fill.color === 'string') {
        var rgb = hexToFigmaRGB(fill.color);
        return { type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: rgb.a !== undefined ? rgb.a : 1 };
      }
      return fill;
    });
    (newNode as GeometryMixin).fills = processedFills;
  }

  parentNode.appendChild(newNode);

  replySuccess('CREATE_CHILD_NODE_RESULT', requestId, {
    node: { id: newNode.id, name: newNode.name, type: newNode.type, x: newNode.x, y: newNode.y, width: newNode.width, height: newNode.height }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCaptureScreenshot(msg: any, requestId: string): Promise<void> {
  var node: BaseNode | null = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : figma.currentPage;
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (!('exportAsync' in node)) throw new Error('Node type ' + node.type + ' does not support export');

  var exportable = node as SceneNode;
  var format = msg.format || 'PNG';
  var scale = msg.scale || 2;

  var bytes = await exportable.exportAsync({
    format: format as 'PNG' | 'JPG' | 'SVG',
    constraint: { type: 'SCALE', value: scale }
  });

  var base64 = figma.base64Encode(bytes);

  var bounds = null;
  if ('absoluteBoundingBox' in exportable) {
    bounds = (exportable as FrameNode).absoluteBoundingBox;
  }

  replySuccess('CAPTURE_SCREENSHOT_RESULT', requestId, {
    image: {
      base64: base64,
      format: format,
      scale: scale,
      byteLength: bytes.length,
      node: { id: node.id, name: node.name, type: node.type },
      bounds: bounds
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetInstanceProperties(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (node.type !== 'INSTANCE') throw new Error('Node must be an INSTANCE. Got: ' + node.type);

  var instance = node as InstanceNode;
  var mainComponent = await instance.getMainComponentAsync();
  var currentProps = instance.componentProperties;

  var propsToSet: Record<string, string | boolean | VariableAlias> = {};
  var propUpdates = msg.properties || {};

  for (var propName in propUpdates) {
    if (!Object.prototype.hasOwnProperty.call(propUpdates, propName)) continue;
    var newValue = propUpdates[propName];

    if (currentProps[propName] !== undefined) {
      propsToSet[propName] = newValue;
    } else {
      var foundMatch = false;
      for (var existingProp in currentProps) {
        if (existingProp.indexOf(propName + '#') === 0) {
          propsToSet[existingProp] = newValue;
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
        Logger.debug('[MCP Bridge] Property not found: ' + propName + ' - Available: ' + Object.keys(currentProps).join(', '));
      }
    }
  }

  if (Object.keys(propsToSet).length === 0) {
    throw new Error('No valid properties to set. Available: ' + Object.keys(currentProps).join(', '));
  }

  instance.setProperties(propsToSet);
  var updatedProps = instance.componentProperties;

  var currentPropsResult: Record<string, unknown> = {};
  for (var uk in updatedProps) {
    if (Object.prototype.hasOwnProperty.call(updatedProps, uk)) {
      currentPropsResult[uk] = { type: updatedProps[uk].type, value: updatedProps[uk].value };
    }
  }

  replySuccess('SET_INSTANCE_PROPERTIES_RESULT', requestId, {
    instance: {
      id: instance.id,
      name: instance.name,
      componentId: mainComponent ? mainComponent.id : null,
      propertiesSet: Object.keys(propsToSet),
      currentProperties: currentPropsResult
    }
  });
}

function handleGetFileInfo(requestId: string): void {
  replySuccess('GET_FILE_INFO_RESULT', requestId, {
    fileInfo: {
      fileName: figma.root.name,
      fileKey: figma.fileKey || null,
      currentPage: figma.currentPage.name
    }
  });
}

function handleReloadUI(requestId: string): void {
  replySuccess('RELOAD_UI_RESULT', requestId, {});
  setTimeout(function() {
    figma.showUI(__html__, { width: 320, height: 56, visible: true, themeColors: true });
  }, 100);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleArrangeComponentSet(msg: any, requestId: string): Promise<void> {
  var node = await figma.getNodeByIdAsync(msg.nodeId);
  if (!node) throw new Error('Node not found: ' + msg.nodeId);
  if (node.type !== 'COMPONENT_SET') throw new Error('Node must be a COMPONENT_SET. Got: ' + node.type);

  var setNode = node as ComponentSetNode;
  var gap = msg.gap || 20;
  var columns = msg.columns || 4;

  var children = setNode.children.slice();
  var col = 0;
  var row = 0;
  var maxHeightInRow = 0;
  var yOffset = 0;

  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    child.x = col * (child.width + gap);
    child.y = yOffset;

    if (child.height > maxHeightInRow) maxHeightInRow = child.height;

    col++;
    if (col >= columns) {
      col = 0;
      row++;
      yOffset += maxHeightInRow + gap;
      maxHeightInRow = 0;
    }
  }

  replySuccess('ARRANGE_COMPONENT_SET_RESULT', requestId, {
    arranged: children.length,
    columns: columns,
    gap: gap
  });
}

// ---------------------------------------------------------------------------
// Pre-fetch variables data on plugin start
// ---------------------------------------------------------------------------

export async function fetchAndSendVariablesData(): Promise<void> {
  try {
    var variables = await figma.variables.getLocalVariablesAsync();
    var collections = await figma.variables.getLocalVariableCollectionsAsync();

    var variablesData = {
      success: true,
      timestamp: Date.now(),
      fileKey: figma.fileKey || null,
      variables: variables.map(serializeVariable),
      variableCollections: collections.map(serializeCollection)
    };

    figma.ui.postMessage({ type: 'VARIABLES_DATA', data: variablesData });
    Logger.debug('[MCP Bridge] Variables data sent: ' + variables.length + ' vars, ' + collections.length + ' collections');
  } catch (error) {
    Logger.debug('[MCP Bridge] Error fetching variables: ' + error);
    figma.ui.postMessage({ type: 'ERROR', error: String(error) });
  }
}
