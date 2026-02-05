#!/bin/bash
#
# Contentify Relay - macOS Installer
# Устанавливает Native Messaging Host + автозапуск при входе в систему
#

set -e

# === Конфигурация ===
HOST_NAME="com.contentify.relay"
DEFAULT_EXTENSION_ID="bkgihkkkahjfjpbplmcpggfnfkckhpnm"
EXTENSION_ID="${1:-$DEFAULT_EXTENSION_ID}"

# Определяем директорию скрипта
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Определяем архитектуру и бинарник
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  BINARY_NAME="contentify-relay-host-arm64"
else
  BINARY_NAME="contentify-relay-host-x64"
fi

# Ищем исполняемый файл (порядок: relay/dist, native-host/dist, native-host/, .app Resources)
RELAY_DIR="$(dirname "$SCRIPT_DIR")/relay"
APP_RESOURCES="$SCRIPT_DIR/Contentify Relay.app/Contents/Resources"

if [ -f "$RELAY_DIR/dist/$BINARY_NAME" ]; then
  HOST_PATH="$RELAY_DIR/dist/$BINARY_NAME"
elif [ -f "$SCRIPT_DIR/dist/$BINARY_NAME" ]; then
  HOST_PATH="$SCRIPT_DIR/dist/$BINARY_NAME"
elif [ -f "$SCRIPT_DIR/$BINARY_NAME" ]; then
  HOST_PATH="$SCRIPT_DIR/$BINARY_NAME"
elif [ -f "$APP_RESOURCES/$BINARY_NAME" ]; then
  HOST_PATH="$APP_RESOURCES/$BINARY_NAME"
else
  echo "❌ Ошибка: бинарник не найден ($BINARY_NAME)"
  echo ""
  echo "   Попробуйте собрать бинарники:"
  echo "   cd relay && npm install && npm run build"
  exit 1
fi

# Директории
CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

echo ""
echo "🚀 Contentify Relay - Установка"
echo ""
echo "📋 Параметры:"
echo "   Архитектура: $ARCH"
echo "   Host: $HOST_PATH"
echo "   Extension ID: $EXTENSION_ID"
echo ""

# === 1. Native Messaging Host ===
echo "📦 Установка Native Messaging Host..."

create_manifest() {
  local dir="$1"
  local manifest_path="$dir/$HOST_NAME.json"
  
  mkdir -p "$dir"
  
  cat > "$manifest_path" << EOF
{
  "name": "$HOST_NAME",
  "description": "Contentify Relay - connects Chrome Extension with Figma Plugin",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
  
  echo "   ✅ $manifest_path"
}

if [ -d "$HOME/Library/Application Support/Google/Chrome" ]; then
  create_manifest "$CHROME_MANIFEST_DIR"
fi

if [ -d "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts" ]; then
  create_manifest "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
fi

if [ -d "$HOME/Library/Application Support/Chromium" ]; then
  create_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
fi

if [ -d "$HOME/Library/Application Support/Microsoft Edge" ]; then
  create_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
fi

if [ -d "$HOME/Library/Application Support/BraveSoftware/Brave-Browser" ]; then
  create_manifest "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
fi

chmod +x "$HOST_PATH"

# === 2. LaunchAgent (автозапуск) ===
echo ""
echo "🔄 Установка автозапуска..."

mkdir -p "$LAUNCH_AGENTS_DIR"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$HOST_NAME.plist"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$HOST_NAME</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$HOST_PATH</string>
    </array>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    
    <key>StandardOutPath</key>
    <string>/tmp/contentify-relay.log</string>
    
    <key>StandardErrorPath</key>
    <string>/tmp/contentify-relay.err</string>
    
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
EOF

echo "   ✅ $PLIST_PATH"

# Загружаем LaunchAgent
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo "   ✅ LaunchAgent загружен"

# === 3. Запускаем сейчас ===
echo ""
echo "🚀 Запуск relay..."

# Проверяем, не запущен ли уже
if lsof -i :3847 >/dev/null 2>&1; then
  echo "   ✅ Relay уже работает на порту 3847"
else
  launchctl start "$HOST_NAME" 2>/dev/null || true
  sleep 1
  if lsof -i :3847 >/dev/null 2>&1; then
    echo "   ✅ Relay запущен на порту 3847"
  else
    echo "   ⚠️  Relay запустится при следующем входе в систему"
  fi
fi

# === 4. Устанавливаем .app в Applications ===
APP_NAME="Contentify Relay"
APP_SRC="$SCRIPT_DIR/$APP_NAME.app"
APP_DEST="$HOME/Applications/$APP_NAME.app"

if [ -d "$APP_SRC" ]; then
  echo ""
  echo "📱 Установка приложения..."
  
  mkdir -p "$HOME/Applications"
  
  # Копируем .app
  rm -rf "$APP_DEST" 2>/dev/null || true
  cp -R "$APP_SRC" "$APP_DEST"
  
  # Копируем бинарники в Resources
  RESOURCES_DIR="$APP_DEST/Contents/Resources"
  mkdir -p "$RESOURCES_DIR"
  
  if [ -f "$HOST_PATH" ]; then
    cp "$HOST_PATH" "$RESOURCES_DIR/$BINARY_NAME"
    chmod +x "$RESOURCES_DIR/$BINARY_NAME"
  fi
  
  chmod +x "$APP_DEST/Contents/MacOS/run"
  
  echo "   ✅ $APP_DEST"
fi

echo ""
echo "✅ Установка завершена!"
echo ""
echo "📌 Что установлено:"
echo "   • Native Messaging Host для Chrome"
echo "   • Автозапуск при входе в систему (LaunchAgent)"
echo "   • Приложение в ~/Applications"
echo "   • Relay сервер на localhost:3847"
echo ""
echo "🔧 Для удаления: ./uninstall-macos.sh"
