import { describe, it, expect } from 'vitest';
import { assembleHtml } from '../../src/sandbox/html-export/html-template';

describe('assembleHtml', () => {
  it('produces valid HTML document with all sections', () => {
    const html = assembleHtml({
      title: 'TestFrame',
      jsxCode: 'import { Line } from "@oceania/depot/components/Line";\n\n<Line />',
      previewHtml: '<div><span>Hello</span></div>',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>TestFrame');
    expect(html).toContain('panel-code');
    expect(html).toContain('panel-preview');
    expect(html).toContain('Hello');
  });

  it('includes copy button with clipboard script', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<A />', previewHtml: '<div/>' });
    expect(html).toContain('copyCode');
    expect(html).toContain('navigator.clipboard');
  });

  it('includes inline syntax highlight CSS and JS', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<A />', previewHtml: '<div/>' });
    expect(html).toContain('.kw');
    expect(html).toContain('.tag');
    expect(html).toContain('.str');
    expect(html).toContain('highlightJsx');
  });

  it('escapes JSX code for safe HTML embedding', () => {
    const html = assembleHtml({
      title: 'T',
      jsxCode: '<Component prop="value & more" />',
      previewHtml: '<div/>',
    });
    expect(html).toContain('&lt;Component');
  });

  it('has no external URLs', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<A />', previewHtml: '<div/>' });
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('stores raw JSX for copy in a script tag', () => {
    const html = assembleHtml({ title: 'T', jsxCode: '<Foo bar="baz" />', previewHtml: '<div/>' });
    expect(html).toContain('id="jsx-raw"');
    expect(html).toContain('<Foo bar="baz" />');
  });
});
