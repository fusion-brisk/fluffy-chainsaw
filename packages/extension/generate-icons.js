/**
 * Генератор иконок для Chrome Extension
 *
 * Запуск: node generate-icons.js
 * Требует: npm install canvas
 */

const fs = require('fs');
const path = require('path');

// SVG логотипа с параметризованным цветом
const getLogoSvg = (
  color,
  size = 128,
) => `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0 6C0 2.68629 2.68629 0 6 0H14C17.3137 0 20 2.68629 20 6V14C20 17.3137 17.3137 20 14 20H6C2.68629 20 0 17.3137 0 14V6Z" fill="${color}"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M10.599 13.703L13.775 10.527L14.623 11.376L9.999 16L5.375 11.376L6.224 10.527L9.399 13.703V4H10.599V13.703Z" fill="white"/>
</svg>`;

const COLORS = {
  green: '#00B341',
  gray: '#888888',
};

const SIZES = [16, 48, 128];

// Создаём папку если не существует
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

// Генерация иконок
async function generateIcons() {
  let canvasAvailable = false;
  let createCanvas, loadImage;

  try {
    const canvas = require('canvas');
    createCanvas = canvas.createCanvas;
    loadImage = canvas.loadImage;
    canvasAvailable = true;
    console.log('✓ Canvas module found');
  } catch (e) {
    console.log('⚠ Canvas module not found. Saving SVG files instead.');
    console.log('  Install with: npm install canvas');
  }

  for (const [colorName, colorValue] of Object.entries(COLORS)) {
    const svg = getLogoSvg(colorValue);

    // Save SVG
    const svgPath = path.join(iconsDir, `logo-${colorName}.svg`);
    fs.writeFileSync(svgPath, svg);
    console.log(`Created: ${svgPath}`);

    if (canvasAvailable) {
      // Render to PNG at different sizes
      for (const size of SIZES) {
        try {
          const canvas = createCanvas(size, size);
          const ctx = canvas.getContext('2d');

          // Create high-res SVG
          const svgForSize = getLogoSvg(colorValue, size);
          const svgBuffer = Buffer.from(svgForSize);
          const img = await loadImage(svgBuffer);

          // Draw
          ctx.drawImage(img, 0, 0, size, size);

          // Save PNG
          const pngPath = path.join(iconsDir, `icon${size}-${colorName}.png`);
          const pngBuffer = canvas.toBuffer('image/png');
          fs.writeFileSync(pngPath, pngBuffer);
          console.log(`Created: ${pngPath} (${pngBuffer.length} bytes)`);

          // Create default icons (green = default)
          if (colorName === 'green') {
            const defaultPath = path.join(iconsDir, `icon${size}.png`);
            fs.writeFileSync(defaultPath, pngBuffer);
            console.log(`Created: ${defaultPath} (default)`);
          }
        } catch (err) {
          console.log(`Error creating ${size}x${size} ${colorName}: ${err.message}`);
        }
      }
    }
  }

  if (!canvasAvailable) {
    console.log('\n📝 SVG files created. To generate PNG icons:');
    console.log('   1. Install canvas: npm install canvas');
    console.log('   2. Run again: node generate-icons.js');
    console.log('   Or use online converter for SVG → PNG');
  }

  console.log('\n✅ Icon generation complete!');
}

generateIcons().catch(console.error);
