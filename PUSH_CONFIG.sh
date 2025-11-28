#!/bin/bash

# Contentify - Push Remote Config to GitHub
# Этот скрипт добавит файлы конфигурации в репозиторий

echo "📦 Adding config files..."
git add config/parsing-rules.json
git add config/README.md
git add src/parsing-rules-manager.ts
git add src/components/SettingsPanel.tsx
git add docs/parsing-rules-example.json
git add docs/REMOTE_CONFIG_GUIDE.md
git add docs/PARSING_RULES_REPO_README.md

echo "✅ Files staged. Ready to commit!"
echo ""
echo "Next steps:"
echo "1. Review changes: git status"
echo "2. Commit: git commit -m \"Add remote config support with Settings UI\""
echo "3. Push: git push origin main"
echo ""
echo "After push, config will be available at:"
echo "https://raw.githubusercontent.com/shchuchkin/fluffy-chainsaw/main/config/parsing-rules.json"

