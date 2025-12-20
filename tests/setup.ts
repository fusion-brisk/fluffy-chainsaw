/**
 * Vitest setup — моки Figma API для тестирования без Figma sandbox
 */

import { vi } from 'vitest';

// === Мок типов Figma ===

interface MockSceneNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  removed: boolean;
  locked: boolean;
  parent: MockSceneNode | null;
  children?: MockSceneNode[];
  componentProperties?: Record<string, { value: string; type: string }>;
  setProperties?: (props: Record<string, string>) => void;
}

interface MockInstanceNode extends MockSceneNode {
  type: 'INSTANCE';
  componentProperties: Record<string, { value: string; type: string }>;
  setProperties: (props: Record<string, string>) => void;
  resetOverrides: () => void;
}

interface MockTextNode extends MockSceneNode {
  type: 'TEXT';
  characters: string;
  fontName: { family: string; style: string };
}

// === Фабрики для создания моков ===

export function createMockInstance(
  name: string,
  properties: Record<string, string> = {}
): MockInstanceNode {
  const componentProperties: Record<string, { value: string; type: string }> = {};
  for (const [key, value] of Object.entries(properties)) {
    componentProperties[key] = { value, type: 'VARIANT' };
  }

  return {
    id: `instance-${Math.random().toString(36).substr(2, 9)}`,
    name,
    type: 'INSTANCE',
    visible: true,
    removed: false,
    locked: false,
    parent: null,
    children: [],
    componentProperties,
    setProperties: vi.fn((props: Record<string, string>) => {
      for (const [key, value] of Object.entries(props)) {
        componentProperties[key] = { value, type: 'VARIANT' };
      }
    }),
    resetOverrides: vi.fn()
  };
}

export function createMockTextNode(name: string, text: string): MockTextNode {
  return {
    id: `text-${Math.random().toString(36).substr(2, 9)}`,
    name,
    type: 'TEXT',
    visible: true,
    removed: false,
    locked: false,
    parent: null,
    characters: text,
    fontName: { family: 'Inter', style: 'Regular' }
  };
}

export function createMockFrame(
  name: string,
  children: MockSceneNode[] = []
): MockSceneNode {
  const frame: MockSceneNode = {
    id: `frame-${Math.random().toString(36).substr(2, 9)}`,
    name,
    type: 'FRAME',
    visible: true,
    removed: false,
    locked: false,
    parent: null,
    children
  };

  // Устанавливаем parent для детей
  for (const child of children) {
    child.parent = frame;
  }

  return frame;
}

// === Глобальные моки Figma API ===

const mockFigma = {
  mixed: Symbol('mixed'),
  currentPage: {
    selection: [] as MockSceneNode[],
    children: [] as MockSceneNode[],
    findAll: vi.fn((predicate: (node: MockSceneNode) => boolean) => {
      return mockFigma.currentPage.children.filter(predicate);
    })
  },
  ui: {
    postMessage: vi.fn()
  },
  notify: vi.fn(),
  loadFontAsync: vi.fn().mockResolvedValue(undefined)
};

// @ts-expect-error — мокаем глобальный figma
globalThis.figma = mockFigma;

// === Хелперы для тестов ===

export function resetFigmaMocks(): void {
  mockFigma.currentPage.selection = [];
  mockFigma.currentPage.children = [];
  mockFigma.ui.postMessage.mockClear();
  mockFigma.notify.mockClear();
  mockFigma.loadFontAsync.mockClear();
}

export { mockFigma };

