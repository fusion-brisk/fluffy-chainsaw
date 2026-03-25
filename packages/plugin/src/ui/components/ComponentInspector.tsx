/**
 * ComponentInspector — Displays selected Figma component instances with keys and properties.
 *
 * Wrapped in PanelLayout for consistent secondary-panel chrome.
 * Shows instance name, component key, component set key, and all properties.
 */

import React, { memo, useCallback } from 'react';
import type { ComponentInspectorData } from '../../types';
import { PanelLayout } from './PanelLayout';

interface ComponentInspectorProps {
  components: ComponentInspectorData[];
  onClose: () => void;
}

function copyToClipboard(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export const ComponentInspector: React.FC<ComponentInspectorProps> = memo(({ components, onClose }) => {

  const handleCopyKey = useCallback((key: string) => {
    copyToClipboard(key);
  }, []);

  const handleCopyAll = useCallback(() => {
    const text = components.map(c => {
      const lines = [
        `Name: ${c.name}`,
        `Component: ${c.componentName}`,
        `Key: ${c.componentKey}`,
      ];
      if (c.componentSetKey) {
        lines.push(`Set: ${c.componentSetName}`);
        lines.push(`Set Key: ${c.componentSetKey}`);
      }
      lines.push('Properties:');
      for (const [k, v] of Object.entries(c.properties)) {
        lines.push(`  ${k}: ${v.type} = ${JSON.stringify(v.value)}`);
      }
      return lines.join('\n');
    }).join('\n\n---\n\n');
    copyToClipboard(text);
  }, [components]);

  const footer = components.length > 0 ? (
    <button type="button" className="btn-secondary" onClick={handleCopyAll}>
      Копировать всё
    </button>
  ) : undefined;

  return (
    <PanelLayout title="Инспектор" onBack={onClose} footer={footer}>
      <div className="comp-inspector-body">
        {components.length === 0 ? (
          <div className="comp-inspector-empty">
            Выберите экземпляр компонента в Figma для просмотра ключа и свойств.
          </div>
        ) : (
          components.map((comp, idx) => (
            <div key={idx} className="comp-inspector-card">
              <div className="comp-inspector-row comp-inspector-row--name">
                <span className="comp-inspector-label">Экземпляр</span>
                <span className="comp-inspector-value">{comp.name}</span>
              </div>

              <div className="comp-inspector-row">
                <span className="comp-inspector-label">Компонент</span>
                <span className="comp-inspector-value">{comp.componentName}</span>
              </div>

              <div className="comp-inspector-row comp-inspector-row--key">
                <span className="comp-inspector-label">Ключ</span>
                <code className="comp-inspector-key" onClick={() => handleCopyKey(comp.componentKey)} title="Click to copy">
                  {comp.componentKey || '(no key)'}
                </code>
              </div>

              {comp.componentSetKey && (
                <>
                  <div className="comp-inspector-row">
                    <span className="comp-inspector-label">Набор</span>
                    <span className="comp-inspector-value">{comp.componentSetName}</span>
                  </div>
                  <div className="comp-inspector-row comp-inspector-row--key">
                    <span className="comp-inspector-label">Ключ набора</span>
                    <code className="comp-inspector-key" onClick={() => handleCopyKey(comp.componentSetKey!)} title="Click to copy">
                      {comp.componentSetKey}
                    </code>
                  </div>
                </>
              )}

              {Object.keys(comp.properties).length > 0 && (
                <div className="comp-inspector-props">
                  <span className="comp-inspector-props-title">Свойства ({Object.keys(comp.properties).length})</span>
                  {Object.entries(comp.properties).map(([propName, propData]) => (
                    <div key={propName} className="comp-inspector-prop">
                      <span className="comp-inspector-prop-name">{propName}</span>
                      <span className="comp-inspector-prop-type">{propData.type}</span>
                      <span className="comp-inspector-prop-value">{JSON.stringify(propData.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </PanelLayout>
  );
});

ComponentInspector.displayName = 'ComponentInspector';
