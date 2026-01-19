#!/bin/bash
#
# EProductSnippet One-Click Installer for macOS
# 
# Установка: Double-click в Finder
# 
# Что делает:
# 1. Скачивает Extension и Relay бинарник
# 2. Устанавливает Native Messaging Host для Chrome
# 3. Настраивает автозапуск Relay при входе в систему
# 4. Открывает папку с Extension для установки в Chrome
#

set -e

# === Конфигурация ===
INSTALL_DIR="$HOME/.eproductsnippet"
# TODO: Заменить на реальный URL репозитория
RELEASE_URL="https://github.com/user/fluffy-chainsaw/releases/latest/download"
HOST_NAME="com.eproductsnippet.relay"
# Extension ID (стабильный, из manifest.json key)
EXTENSION_ID="bkgihkkkahjfjpbplmcpggfnfkckhpnm"

# === Цвета ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🚀 EProductSnippet — Установка для macOS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# === Определяем архитектуру ===
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  BINARY_NAME="relay-host-arm64"
  echo -e "📱 Платформа: ${GREEN}Apple Silicon (arm64)${NC}"
else
  BINARY_NAME="relay-host-x64"
  echo -e "💻 Платформа: ${GREEN}Intel (x64)${NC}"
fi
echo ""

# === Создаём директорию установки ===
echo -e "${YELLOW}📁 Создание директории...${NC}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
echo -e "   ${GREEN}✓${NC} $INSTALL_DIR"
echo ""

# === Скачиваем компоненты ===
echo -e "${YELLOW}📦 Скачивание компонентов...${NC}"

# Extension
echo -n "   Extension.zip: "
if curl -L -s -f -o extension.zip "$RELEASE_URL/Extension.zip" 2>/dev/null; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo ""
  echo -e "${RED}❌ Ошибка: не удалось скачать Extension.zip${NC}"
  echo -e "   URL: $RELEASE_URL/Extension.zip"
  echo ""
  echo "   Возможные причины:"
  echo "   • Нет подключения к интернету"
  echo "   • GitHub Release ещё не создан"
  echo ""
  read -p "Нажмите Enter для выхода..."
  exit 1
fi

# Relay бинарник
echo -n "   $BINARY_NAME: "
if curl -L -s -f -o relay-host "$RELEASE_URL/$BINARY_NAME" 2>/dev/null; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo ""
  echo -e "${RED}❌ Ошибка: не удалось скачать $BINARY_NAME${NC}"
  echo -e "   URL: $RELEASE_URL/$BINARY_NAME"
  echo ""
  read -p "Нажмите Enter для выхода..."
  exit 1
fi
echo ""

# === Распаковываем Extension ===
echo -e "${YELLOW}📂 Распаковка Extension...${NC}"
rm -rf extension/ 2>/dev/null || true
unzip -o -q extension.zip -d extension/
echo -e "   ${GREEN}✓${NC} extension/"
echo ""

# === Делаем бинарник исполняемым ===
chmod +x relay-host

# === Устанавливаем Native Messaging Host ===
echo -e "${YELLOW}🔧 Настройка Native Messaging Host...${NC}"

# Chrome
CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/Google/Chrome" ]; then
  mkdir -p "$CHROME_MANIFEST_DIR"
  cat > "$CHROME_MANIFEST_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "EProductSnippet Relay - connects Chrome Extension with Figma Plugin",
  "path": "$INSTALL_DIR/relay-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
  echo -e "   ${GREEN}✓${NC} Chrome"
fi

# Chrome Canary
CANARY_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/Google/Chrome Canary" ]; then
  mkdir -p "$CANARY_MANIFEST_DIR"
  cp "$CHROME_MANIFEST_DIR/$HOST_NAME.json" "$CANARY_MANIFEST_DIR/$HOST_NAME.json"
  echo -e "   ${GREEN}✓${NC} Chrome Canary"
fi

# Chromium
CHROMIUM_MANIFEST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
if [ -d "$HOME/Library/Application Support/Chromium" ]; then
  mkdir -p "$CHROMIUM_MANIFEST_DIR"
  cp "$CHROME_MANIFEST_DIR/$HOST_NAME.json" "$CHROMIUM_MANIFEST_DIR/$HOST_NAME.json"
  echo -e "   ${GREEN}✓${NC} Chromium"
fi
echo ""

# === Настраиваем автозапуск через LaunchAgent ===
echo -e "${YELLOW}🔄 Настройка автозапуска...${NC}"

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
    <string>/tmp/eproductsnippet-relay.log</string>
    
    <key>StandardErrorPath</key>
    <string>/tmp/eproductsnippet-relay.err</string>
    
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
EOF

# Загружаем LaunchAgent
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo -e "   ${GREEN}✓${NC} LaunchAgent установлен"
echo ""

# === Запускаем Relay ===
echo -e "${YELLOW}🚀 Запуск Relay сервера...${NC}"

if lsof -i :3847 >/dev/null 2>&1; then
  echo -e "   ${GREEN}✓${NC} Relay уже работает на порту 3847"
else
  launchctl start "$HOST_NAME" 2>/dev/null || true
  sleep 1
  if lsof -i :3847 >/dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Relay запущен на порту 3847"
  else
    echo -e "   ${YELLOW}⚠${NC} Relay запустится при следующем входе в систему"
  fi
fi
echo ""

# === Финальные инструкции ===
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Установка завершена!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📌 Осталось установить расширение в Chrome:${NC}"
echo ""
echo "   1. Откройте в Chrome: chrome://extensions"
echo ""
echo "   2. Включите 'Developer mode' (переключатель справа вверху)"
echo ""
echo "   3. Нажмите 'Load unpacked'"
echo ""
echo "   4. Выберите папку:"
echo -e "      ${GREEN}$INSTALL_DIR/extension${NC}"
echo ""
echo "   5. Перезапустите Chrome"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Открываем Finder с папкой extension
open "$INSTALL_DIR/extension"

read -p "Нажмите Enter для выхода..."
