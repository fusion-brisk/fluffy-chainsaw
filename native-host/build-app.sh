#!/bin/bash
#
# Собирает самодостаточный .app bundle с бинарниками внутри
# Бинарники берутся из relay/dist/ (собираются из relay/server.js)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RELAY_DIR="$(dirname "$SCRIPT_DIR")/relay"
APP_NAME="Contentify Relay"
APP_PATH="$SCRIPT_DIR/$APP_NAME.app"
RESOURCES_DIR="$APP_PATH/Contents/Resources"

echo "🔨 Сборка $APP_NAME.app..."
echo ""

# === 1. Собираем бинарники в relay/ ===
echo "📦 Сборка бинарников из relay/server.js..."

if [ ! -d "$RELAY_DIR/node_modules" ]; then
  echo "   Установка зависимостей..."
  (cd "$RELAY_DIR" && npm install)
fi

(cd "$RELAY_DIR" && npm run build)
echo ""

# === 2. Создаём структуру .app ===
mkdir -p "$RESOURCES_DIR"

# === 3. Копируем бинарники ===
echo "📂 Копирование бинарников в .app..."

ARM64_SRC="$RELAY_DIR/dist/contentify-relay-arm64"
X64_SRC="$RELAY_DIR/dist/contentify-relay-x64"

if [ -f "$ARM64_SRC" ]; then
  cp "$ARM64_SRC" "$RESOURCES_DIR/contentify-relay-host-arm64"
  echo "   ✅ contentify-relay-host-arm64 ($(du -h "$ARM64_SRC" | cut -f1))"
else
  echo "   ⚠️  arm64 бинарник не найден: $ARM64_SRC"
fi

if [ -f "$X64_SRC" ]; then
  cp "$X64_SRC" "$RESOURCES_DIR/contentify-relay-host-x64"
  echo "   ✅ contentify-relay-host-x64 ($(du -h "$X64_SRC" | cut -f1))"
else
  echo "   ⚠️  x64 бинарник не найден: $X64_SRC"
fi

# Делаем исполняемыми
chmod +x "$RESOURCES_DIR/"* 2>/dev/null || true
chmod +x "$APP_PATH/Contents/MacOS/run"

echo ""
echo "✅ $APP_NAME.app готов!"
echo ""
echo "📦 Размер: $(du -sh "$APP_PATH" | cut -f1)"
echo ""
echo "Для установки в Applications:"
echo "   cp -r \"$APP_PATH\" /Applications/"
echo ""
echo "Для добавления в автозапуск:"
echo "   1. System Preferences → Users & Groups → Login Items"
echo "   2. Добавьте $APP_NAME"
