const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, file), 'utf8');
}

function write(file, content) {
  fs.writeFileSync(path.resolve(__dirname, file), content, 'utf8');
}

function buildEmbeddedHtml() {
  console.log('🔨 Generating embedded UI...');
  
  const template = read('src/ui.html');
  const css = read('src/styles.css');
  const js = read('dist/ui.js');
  
  const shim = 'window.process=window.process||{env:{}};';
  
  const errorHandler = `
    window.onerror = function(msg, url, line, col, error) {
      console.error("UI Launch Error:", msg, error);
      const div = document.getElementById('loading-splash');
      if (div) {
        div.innerHTML = '<div style="color: #ef5350; padding: 20px; font-family: sans-serif;">' + 
          '<h3 style="margin: 0 0 10px 0;">Startup Error</h3>' + 
          '<div style="font-family: monospace; font-size: 11px; background: rgba(255,0,0,0.1); padding: 10px; border-radius: 4px; white-space: pre-wrap; word-break: break-all;">' + 
          msg + '\\nLine: ' + line + 
          '</div></div>';
      }
    };
  `;
  
  // 1. Вставляем CSS. replace со строкой безопасен для CSS (обычно)
  // Но лучше использовать callback, чтобы $& не интерпретировались
  let html = template.replace(
    /<link\s+rel="stylesheet"\s+href="styles\.css"\s*>/, 
    () => `<style>\n${css}\n</style>`
  );
  
  // 2. Вставляем JS. 
  // КРИТИЧНО: Используем функцию-callback в replace, чтобы спецсимволы ($) в коде JS 
  // не интерпретировались как подстановки regex.
  html = html.replace(
    /<script\s+src="ui\.js"\s*><\/script>/, 
    () => `<script>\n${errorHandler}\n(function(){\n${shim}\n${js}\n})();\n</script>`
  );
  
  write('dist/ui-embedded.html', html);
  console.log('✅ ui-embedded.html generated successfully');
}

try {
  buildEmbeddedHtml();
} catch (e) {
  console.error('❌ Failed to generate embedded UI:', e);
  process.exit(1);
}
