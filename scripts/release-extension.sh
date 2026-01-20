#!/bin/bash
#
# Release Extension — автоматизация релиза CRX расширения
#
# Использование:
#   ./scripts/release-extension.sh 1.5.0
#   ./scripts/release-extension.sh 1.5.0 --push
#
# Что делает:
# 1. Обновляет version в manifest.json
# 2. Обновляет version в updates.xml
# 3. Пересобирает extension.crx
# 4. (опционально) Коммитит и пушит изменения
# 5. (опционально) Загружает CRX в GitHub Release
#

set -e

VERSION=$1
PUSH_FLAG=$2

if [ -z "$VERSION" ]; then
  echo "❌ Использование: $0 <version> [--push]"
  echo "   Пример: $0 1.5.0"
  echo "   Пример: $0 1.5.0 --push"
  exit 1
fi

# Валидация формата версии (x.y.z)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Неверный формат версии: $VERSION"
  echo "   Ожидается: x.y.z (например, 1.5.0)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
EXTENSION_DIR="$ROOT_DIR/extension"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 Release Extension v$VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$ROOT_DIR"

# === 1. Обновляем manifest.json ===
echo "📝 Обновление manifest.json..."
if [ -f "$EXTENSION_DIR/manifest.json" ]; then
  # Используем sed для замены версии
  sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$EXTENSION_DIR/manifest.json"
  echo "   ✓ version: $VERSION"
else
  echo "   ✗ manifest.json не найден"
  exit 1
fi

# === 2. Обновляем updates.xml ===
echo "📝 Обновление updates.xml..."
if [ -f "$EXTENSION_DIR/updates.xml" ]; then
  sed -i '' "s/version='[^']*'/version='$VERSION'/" "$EXTENSION_DIR/updates.xml"
  echo "   ✓ version: $VERSION"
else
  echo "   ✗ updates.xml не найден"
  exit 1
fi

# === 3. Пересобираем CRX ===
echo "🔧 Сборка extension.crx..."
if [ -f "$EXTENSION_DIR/extension.pem" ]; then
  npx crx3 pack "$EXTENSION_DIR" -o "$EXTENSION_DIR/extension.crx" -p "$EXTENSION_DIR/extension.pem"
  echo "   ✓ extension.crx создан"
else
  echo "   ⚠ extension.pem не найден, создаём новый ключ"
  npx crx3 pack "$EXTENSION_DIR" -o "$EXTENSION_DIR/extension.crx" -p "$EXTENSION_DIR/extension.pem"
  echo "   ✓ extension.crx создан (новый ключ)"
fi

# Размер файла
CRX_SIZE=$(ls -lh "$EXTENSION_DIR/extension.crx" | awk '{print $5}')
echo "   📦 Размер: $CRX_SIZE"

# === 4. Опционально: коммит и push ===
if [ "$PUSH_FLAG" = "--push" ]; then
  echo ""
  echo "📤 Коммит и push..."
  
  git add "$EXTENSION_DIR/manifest.json" "$EXTENSION_DIR/updates.xml"
  git commit -m "chore(extension): bump version to $VERSION"
  git push origin main
  echo "   ✓ Изменения запушены"
  
  # === 5. Загружаем в GitHub Release ===
  echo ""
  echo "📤 Загрузка в GitHub Release..."
  
  # Проверяем, существует ли релиз
  RELEASE_TAG="v$VERSION"
  if gh release view "$RELEASE_TAG" >/dev/null 2>&1; then
    # Обновляем существующий релиз
    gh release upload "$RELEASE_TAG" "$EXTENSION_DIR/extension.crx" --clobber
    echo "   ✓ CRX загружен в $RELEASE_TAG"
  else
    echo "   ⚠ Релиз $RELEASE_TAG не существует"
    echo "   Создайте релиз: gh release create $RELEASE_TAG"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Готово!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Файлы обновлены:"
echo "  • extension/manifest.json (version: $VERSION)"
echo "  • extension/updates.xml (version: $VERSION)"
echo "  • extension/extension.crx ($CRX_SIZE)"
echo ""

if [ "$PUSH_FLAG" != "--push" ]; then
  echo "Следующие шаги:"
  echo "  1. Проверьте изменения: git diff"
  echo "  2. Закоммитьте: git add -A && git commit -m 'chore(extension): bump version to $VERSION'"
  echo "  3. Запушьте: git push origin main"
  echo "  4. Загрузите CRX: gh release upload v$VERSION extension/extension.crx --clobber"
  echo ""
  echo "Или запустите с --push для автоматизации:"
  echo "  $0 $VERSION --push"
fi
