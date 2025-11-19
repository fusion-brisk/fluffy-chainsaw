const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.resolve(__dirname, file), 'utf8');
}

function write(file, content) {
  fs.writeFileSync(path.resolve(__dirname, file), content, 'utf8');
}

function buildEmbeddedHtml() {
  const css = read('src/styles.css');
  const js = read('dist/ui.js');
  const shim = 'window.process=window.process||{env:{}};';

  const html = `<!DOCTYPE html>
<html lang="ru" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), clipboard-write=(), display-capture=()" />
    <title>Contentify UI</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>(function(){${shim}\n${js}\n})();</script>
  </body>
  </html>`;

  write('dist/ui-embedded.html', html);
  console.log('✅ ui-embedded.html generated');
}

try {
  buildEmbeddedHtml();
} catch (e) {
  console.error('❌ Failed to generate embedded UI:', e);
  process.exit(1);
}


