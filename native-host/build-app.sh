#!/bin/bash
#
# Собирает самодостаточный .app bundle с бинарниками внутри
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="EProductSnippet Relay"
APP_PATH="$SCRIPT_DIR/$APP_NAME.app"
RESOURCES_DIR="$APP_PATH/Contents/Resources"

echo "🔨 Сборка $APP_NAME.app..."

# Создаём структуру
mkdir -p "$RESOURCES_DIR"

# Копируем бинарники
if [ -f "$SCRIPT_DIR/dist/eproductsnippet-relay-host-arm64" ]; then
  cp "$SCRIPT_DIR/dist/eproductsnippet-relay-host-arm64" "$RESOURCES_DIR/"
  echo "   ✅ eproductsnippet-relay-host-arm64"
fi

if [ -f "$SCRIPT_DIR/dist/eproductsnippet-relay-host-x64" ]; then
  cp "$SCRIPT_DIR/dist/eproductsnippet-relay-host-x64" "$RESOURCES_DIR/"
  echo "   ✅ eproductsnippet-relay-host-x64"
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
