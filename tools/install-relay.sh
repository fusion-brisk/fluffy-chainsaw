#!/bin/bash
#
# Contentify Relay — One-Line Installer
# 
# Использование:
#   curl -fsSL https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/scripts/install-relay.sh | bash
#

set -e

# === Конфигурация ===
INSTALL_DIR="$HOME/.contentify"
RELEASE_URL="https://github.com/fusion-brisk/fluffy-chainsaw/releases/latest/download"
HOST_NAME="com.contentify.relay"
EXTENSION_ID="bkgihkkkahjfjpbplmcpggfnfkckhpnm"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Contentify Relay — Установка"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# === Определяем архитектуру ===
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  BINARY_NAME="contentify-relay-host-arm64"
  echo "📱 Платформа: Apple Silicon (arm64)"
else
  BINARY_NAME="contentify-relay-host-x64"
  echo "💻 Платформа: Intel (x64)"
fi
echo ""

# === Создаём директорию установки ===
echo "📁 Создание директории..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
echo "   ✓ $INSTALL_DIR"
echo ""

# === Скачиваем Relay бинарник ===
echo "📦 Скачивание Relay..."

echo -n "   $BINARY_NAME: "
if curl -L -s -f -o relay-host "$RELEASE_URL/$BINARY_NAME" 2>/dev/null; then
  chmod +x relay-host
  echo "✓"
else
  echo "✗"
  echo ""
  echo "❌ Ошибка: не удалось скачать $BINARY_NAME"
  echo "   URL: $RELEASE_URL/$BINARY_NAME"
  echo ""
  echo "   Возможные причины:"
  echo "   • Нет подключения к интернету"
  echo "   • GitHub Release ещё не создан"
  echo ""
  exit 1
fi
echo ""

# === Устанавливаем Native Messaging Host ===
echo "🔧 Настройка Native Messaging Host..."

# Chrome
CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/Google/Chrome" ]; then
  mkdir -p "$CHROME_MANIFEST_DIR"
  cat > "$CHROME_MANIFEST_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "Contentify Relay - connects Chrome Extension with Figma Plugin",
  "path": "$INSTALL_DIR/relay-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
  echo "   ✓ Chrome"
fi

# Chrome Canary
CANARY_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/Google/Chrome Canary" ]; then
  mkdir -p "$CANARY_MANIFEST_DIR"
  cp "$CHROME_MANIFEST_DIR/$HOST_NAME.json" "$CANARY_MANIFEST_DIR/$HOST_NAME.json"
  echo "   ✓ Chrome Canary"
fi

# Chromium
CHROMIUM_MANIFEST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/Chromium" ]; then
  mkdir -p "$CHROMIUM_MANIFEST_DIR"
  cp "$CHROME_MANIFEST_DIR/$HOST_NAME.json" "$CHROMIUM_MANIFEST_DIR/$HOST_NAME.json"
  echo "   ✓ Chromium"
fi

# Microsoft Edge
EDGE_MANIFEST_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/Microsoft Edge" ]; then
  mkdir -p "$EDGE_MANIFEST_DIR"
  cp "$CHROME_MANIFEST_DIR/$HOST_NAME.json" "$EDGE_MANIFEST_DIR/$HOST_NAME.json"
  echo "   ✓ Microsoft Edge"
fi

# Brave Browser
BRAVE_MANIFEST_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/BraveSoftware/Brave-Browser" ]; then
  mkdir -p "$BRAVE_MANIFEST_DIR"
  cp "$CHROME_MANIFEST_DIR/$HOST_NAME.json" "$BRAVE_MANIFEST_DIR/$HOST_NAME.json"
  echo "   ✓ Brave Browser"
fi
echo ""

# === Настраиваем автозапуск через LaunchAgent ===
echo "🔄 Настройка автозапуска..."

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
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
        <string>$INSTALL_DIR/relay-host</string>
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

# Загружаем LaunchAgent
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "   ✓ LaunchAgent установлен"
echo ""

# === Запускаем Relay ===
echo "🚀 Запуск Relay сервера..."

if lsof -i :3847 >/dev/null 2>&1; then
  echo "   ✓ Relay уже работает на порту 3847"
else
  launchctl start "$HOST_NAME" 2>/dev/null || true
  sleep 1
  if lsof -i :3847 >/dev/null 2>&1; then
    echo "   ✓ Relay запущен на порту 3847"
  else
    echo "   ⚠ Relay запустится при следующем входе в систему"
  fi
fi
echo ""

# === Финал ===
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Relay установлен!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📌 Следующий шаг: установите расширение Chrome"
echo "   Скачайте: $RELEASE_URL/extension.crx"
echo "   Перетащите в chrome://extensions (Developer mode ON)"
echo ""
