/**
 * html-template — assembles a self-contained HTML document with JSX code + visual preview.
 *
 * Scope: sandbox (ES5 via Babel). No external URLs. Zero CDN dependencies.
 * Works fully offline.
 */

export interface AssembleHtmlInput {
  title: string;
  jsxCode: string;
  previewHtml: string;
}

/**
 * Escapes a string for safe embedding inside HTML element content.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const INLINE_CSS = [
  '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
  'html, body { height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
  'body { display: flex; flex-direction: column; background: #1e1e1e; color: #d4d4d4; }',
  '.layout { display: flex; flex: 1; overflow: hidden; height: 100vh; }',
  '.panel-code { flex: 1; display: flex; flex-direction: column; background: #1e1e1e; border-right: 1px solid #333; min-width: 0; }',
  '.panel-preview { flex: 1; display: flex; flex-direction: column; background: #ffffff; min-width: 0; }',
  '.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: #252526; border-bottom: 1px solid #333; height: 40px; }',
  '.panel-header-preview { background: #f5f5f5; border-bottom: 1px solid #e0e0e0; color: #333; }',
  '.panel-label { font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #888; }',
  '.panel-label-preview { color: #555; }',
  '.code-scroll { flex: 1; overflow: auto; padding: 16px; }',
  'pre { font-family: "SF Mono", "Fira Code", "Cascadia Code", Consolas, monospace; font-size: 13px; line-height: 1.6; tab-size: 2; white-space: pre-wrap; word-break: break-word; }',
  '.preview-canvas { flex: 1; overflow: auto; padding: 24px; }',
  '.btn-copy { font-size: 12px; padding: 4px 10px; border: 1px solid #555; border-radius: 4px; background: #0e7aca; color: #fff; cursor: pointer; transition: background 0.15s; }',
  '.btn-copy:hover { background: #1a8fd1; }',
  '.btn-copy.copied { background: #2d8f4e; border-color: #2d8f4e; }',
  '.kw { color: #c586c0; }',
  '.tag { color: #4ec9b0; }',
  '.attr { color: #9cdcfe; }',
  '.str { color: #ce9178; }',
  '.cmt { color: #6a9955; font-style: italic; }',
  '.bool { color: #d7ba7d; }',
  '.punct { color: #808080; }',
].join('\n');

// NOTE: innerHTML is safe here — the JSX text is HTML-escaped before being placed in
// the #jsx-display element; highlightJsx only wraps already-escaped tokens in <span> tags.
const INLINE_JS = [
  'function copyCode() {',
  '  var raw = document.getElementById("jsx-raw");',
  '  var btn = document.getElementById("btn-copy");',
  '  if (!raw || !btn) return;',
  '  navigator.clipboard.writeText(raw.textContent || "").then(function() {',
  '    btn.textContent = "Copied!";',
  '    btn.classList.add("copied");',
  '    setTimeout(function() {',
  '      btn.textContent = "Copy";',
  '      btn.classList.remove("copied");',
  '    }, 2000);',
  '  });',
  '}',
  '',
  'function highlightJsx(code) {',
  '  // Comments (must run first)',
  '  code = code.replace(/(\\/{2}[^\\n]*)/g, \'<span class="cmt">$1<\\/span>\');',
  '  // Strings',
  '  code = code.replace(/("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\\\'\\\\]|\\\\.)*\')/g, \'<span class="str">$1<\\/span>\');',
  '  // Keywords',
  '  code = code.replace(/\\b(import|export|from|const|let|var|return|function|if|else|for|while|new|typeof|instanceof|default|as|of|in)\\b/g, \'<span class="kw">$1<\\/span>\');',
  '  // Booleans and null/undefined',
  '  code = code.replace(/\\b(true|false|null|undefined)\\b/g, \'<span class="bool">$1<\\/span>\');',
  '  // JSX closing tags',
  '  code = code.replace(/(&lt;\\/([A-Z][\\w.]*)&gt;)/g, \'<span class="tag">$1<\\/span>\');',
  '  // JSX opening tags',
  '  code = code.replace(/(&lt;)([A-Z][\\w.]*)/g, \'<span class="punct">$1<\\/span><span class="tag">$2<\\/span>\');',
  '  // JSX attributes',
  '  code = code.replace(/\\b([a-z][\\w-]*)(?==)/g, \'<span class="attr">$1<\\/span>\');',
  '  // Punctuation',
  '  code = code.replace(/([{}()[\\];&lt;&gt;])/g, \'<span class="punct">$1<\\/span>\');',
  '  return code;',
  '}',
  '',
  'document.addEventListener("DOMContentLoaded", function() {',
  '  var display = document.getElementById("jsx-display");',
  '  if (display) {',
  // Safe: textContent is already HTML-escaped; highlightJsx wraps escaped tokens in spans
  '    display.innerHTML = highlightJsx(display.textContent || "");',
  '  }',
  '});',
].join('\n');

/**
 * Assembles a complete self-contained HTML document.
 * No external URLs — works fully offline.
 */
export function assembleHtml(input: AssembleHtmlInput): string {
  var title = escapeHtml(input.title);
  var escapedJsx = escapeHtml(input.jsxCode);

  return (
    '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' +
    title +
    ' \u2014 JSX Export</title>\n' +
    '<style>\n' +
    INLINE_CSS +
    '\n</style>\n' +
    '</head>\n' +
    '<body>\n' +
    '<div class="layout">\n' +
    '  <div class="panel-code">\n' +
    '    <div class="panel-header">\n' +
    '      <span class="panel-label">JSX</span>\n' +
    '      <button id="btn-copy" class="btn-copy" onclick="copyCode()">Copy</button>\n' +
    '    </div>\n' +
    '    <div class="code-scroll">\n' +
    '      <pre><code id="jsx-display">' +
    escapedJsx +
    '<' +
    '/code><' +
    '/pre>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '  <div class="panel-preview">\n' +
    '    <div class="panel-header panel-header-preview">\n' +
    '      <span class="panel-label panel-label-preview">Preview</span>\n' +
    '    </div>\n' +
    '    <div class="preview-canvas">\n' +
    input.previewHtml +
    '\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<script type="text/plain" id="jsx-raw">' +
    input.jsxCode +
    '<' +
    '/script>\n' +
    '<script>\n' +
    INLINE_JS +
    '\n<' +
    '/script>\n' +
    '</body>\n' +
    '</html>'
  );
}
