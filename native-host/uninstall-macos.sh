#!/bin/bash
#
# EProductSnippet Relay - macOS Uninstaller
#

HOST_NAME="com.eproductsnippet.relay"

echo ""
echo "🗑️  EProductSnippet Relay - Удаление"
echo ""

# === 1. Останавливаем и удаляем LaunchAgent ===
echo "🔄 Удаление автозапуска..."

PLIST_PATH="$HOME/Library/LaunchAgents/$HOST_NAME.plist"
if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl stop "$HOST_NAME" 2>/dev/null || true
  rm "$PLIST_PATH"
  echo "   ✅ LaunchAgent удалён"
else
  echo "   ⏭️  LaunchAgent не найден"
fi

# === 2. Удаляем Native Messaging manifests ===
echo ""
echo "📦 Удаление Native Messaging Host..."

# Chrome
CHROME_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json"
if [ -f "$CHROME_MANIFEST" ]; then
  rm "$CHROME_MANIFEST"
  echo "   ✅ Chrome manifest удалён"
fi

# Chrome Canary
CANARY_MANIFEST="$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/$HOST_NAME.json"
if [ -f "$CANARY_MANIFEST" ]; then
  rm "$CANARY_MANIFEST"
  echo "   ✅ Chrome Canary manifest удалён"
fi

# Chromium
CHROMIUM_MANIFEST="$HOME/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json"
if [ -f "$CHROMIUM_MANIFEST" ]; then
  rm "$CHROMIUM_MANIFEST"
  echo "   ✅ Chromium manifest удалён"
fi

# === 3. Останавливаем процесс ===
echo ""
echo "🛑 Остановка relay..."

pkill -f "eproductsnippet-relay-host" 2>/dev/null && echo "   ✅ Процесс остановлен" || echo "   ⏭️  Процесс не запущен"

# Удаляем логи
rm -f /tmp/eproductsnippet-relay.log /tmp/eproductsnippet-relay.err 2>/dev/null

# === 4. Удаляем .app из Applications ===
APP_PATH="$HOME/Applications/EProductSnippet Relay.app"
if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH"
  echo "   ✅ Приложение удалено из ~/Applications"
fi

echo ""
echo "✅ Удаление завершено!"
echo "   Перезапустите Chrome для применения изменений."
