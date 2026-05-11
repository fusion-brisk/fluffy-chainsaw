/**
 * @vitest-environment node
 *
 * Source-contract tests for Phase 3 interaction polish changes.
 * These are cheap regression guards against accidentally reverting
 * the a11y and UX improvements.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../../src/ui');
const READ = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('ImportConfirmDialog — interaction contract', () => {
  const source = READ('components/ImportConfirmDialog.tsx');

  it('focus trap uses dialogRef.current, not document.querySelector', () => {
    expect(source).toContain('dialogRef');
    expect(source).not.toMatch(/document\.querySelector\(['"]\.confirm-dialog/);
  });

  it('keydown listener has empty deps via ref-based handlers', () => {
    // No handleConfirm useCallback remains; ref pattern is used.
    expect(source).toContain('onConfirmRef');
    expect(source).toContain('onCancelRef');
    expect(source).toContain('modeRef');
  });

  it('disabled radios use info icon-tooltip instead of inline hint text', () => {
    expect(source).toContain('confirm-dialog__radio-hint-icon');
    // U+24D8 = ⓘ (Circled Latin Small Letter I) — used as the visual hint icon.
    expect(source).toContain('ⓘ');
  });
});

describe('CompactStrip — menu a11y contract', () => {
  const source = READ('components/CompactStrip.tsx');

  it('menu button declares aria-haspopup and id', () => {
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('id="compact-strip-menu-btn"');
  });

  it('menu has id matching the button aria-controls', () => {
    expect(source).toMatch(/id="compact-strip-menu"/);
    expect(source).toMatch(/aria-labelledby="compact-strip-menu-btn"/);
  });

  it('status dot has role=img + aria-label for ready/offline', () => {
    expect(source).toMatch(/compact-strip__dot--ok[\s\S]{0,200}aria-label="Подключено"/);
    expect(source).toMatch(/compact-strip__dot--offline[\s\S]{0,200}aria-label="Не подключено"/);
  });
});

describe('ComponentInspector — semantic button contract', () => {
  const source = READ('components/ComponentInspector.tsx');

  it('uses <button> wrapping <code>, not <code role="button">', () => {
    expect(source).not.toMatch(/<code[^>]*role="button"/);
    expect(source).toMatch(/<button[\s\S]{0,500}className="comp-inspector-key"[\s\S]{0,500}<code>/);
  });
});

describe('PanelLayout — back button accessibility', () => {
  const source = READ('components/PanelLayout.tsx');

  it('does not duplicate aria-label on the back button (visible text suffices)', () => {
    expect(source).not.toMatch(/aria-label="Назад"/);
  });
});

describe('SetupFlow — dialog semantics', () => {
  const source = READ('components/SetupFlow.tsx');

  it('root is role=dialog with aria-labelledby', () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby="setup-flow-title"');
  });

  it('h2 title carries the id referenced by aria-labelledby', () => {
    expect(source).toMatch(/<h2[^>]+id="setup-flow-title"/);
  });

  it('empty SVG <text> element removed', () => {
    expect(source).not.toMatch(/<text[\s\S]*?><\/text>/);
  });
});

describe('ui.tsx — destructive action confirmation', () => {
  const source = READ('ui.tsx');

  it('resetSnippets action prompts confirmation', () => {
    expect(source).toMatch(/window\.confirm\(['"]Сбросить все сниппеты/);
  });
});
