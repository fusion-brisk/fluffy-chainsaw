#!/bin/bash
#
# Contentify Relay - macOS Uninstaller
#

HOST_NAME="com.contentify.relay"

echo ""
echo "🗑️  Contentify Relay - Удаление"
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

# Microsoft Edge
EDGE_MANIFEST="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$HOST_NAME.json"
if [ -f "$EDGE_MANIFEST" ]; then
  rm "$EDGE_MANIFEST"
  echo "   ✅ Microsoft Edge manifest удалён"
fi

# Brave Browser
BRAVE_MANIFEST="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/$HOST_NAME.json"
if [ -f "$BRAVE_MANIFEST" ]; then
  rm "$BRAVE_MANIFEST"
  echo "   ✅ Brave Browser manifest удалён"
fi

# === 3. Останавливаем процесс ===
echo ""
echo "🛑 Остановка relay..."

pkill -f "contentify-relay" 2>/dev/null && echo "   ✅ Процесс остановлен" || echo "   ⏭️  Процесс не запущен"

# Удаляем логи
rm -f /tmp/contentify-relay.log /tmp/contentify-relay.err 2>/dev/null

# === 4. Удаляем .app из Applications ===
APP_PATH="$HOME/Applications/Contentify Relay.app"
if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH"
  echo "   ✅ Приложение удалено из ~/Applications"
fi

# === 5. Очистка старых идентификаторов (миграция с EProductSnippet) ===
OLD_HOST_NAME="com.eproductsnippet.relay"
OLD_PLIST_PATH="$HOME/Library/LaunchAgents/$OLD_HOST_NAME.plist"
if [ -f "$OLD_PLIST_PATH" ]; then
  echo ""
  echo "🧹 Очистка устаревших файлов (EProductSnippet)..."
  launchctl unload "$OLD_PLIST_PATH" 2>/dev/null || true
  launchctl stop "$OLD_HOST_NAME" 2>/dev/null || true
  rm "$OLD_PLIST_PATH"
  echo "   ✅ Старый LaunchAgent удалён"
fi

# Удаляем старые manifests
OLD_CHROME_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$OLD_HOST_NAME.json"
if [ -f "$OLD_CHROME_MANIFEST" ]; then
  rm "$OLD_CHROME_MANIFEST"
  echo "   ✅ Старый Chrome manifest удалён"
fi

pkill -f "eproductsnippet-relay-host" 2>/dev/null || true
rm -f /tmp/eproductsnippet-relay.log /tmp/eproductsnippet-relay.err 2>/dev/null

OLD_APP_PATH="$HOME/Applications/EProductSnippet Relay.app"
if [ -d "$OLD_APP_PATH" ]; then
  rm -rf "$OLD_APP_PATH"
  echo "   ✅ Старое приложение удалено"
fi

echo ""
echo "✅ Удаление завершено!"
echo "   Перезапустите Chrome для применения изменений."
