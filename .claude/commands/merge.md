# Merge to main

Выполни полный merge-and-cleanup workflow:

1. Убедись что все изменения закоммичены на текущей ветке
2. Запусти `npm run verify` (typecheck + lint + test + build)
   - Если что-то падает — исправь автоматически и закоммить фикс
3. Push текущую ветку в remote
4. Создай PR в main (используй `gh pr create --fill`)
5. Merge PR через squash (`gh pr merge --squash --delete-branch`)
6. Переключись на main, pull
7. Подтверди чистое состояние: `git status`, `npm run typecheck`
8. Удали локальную ветку если осталась

Если на любом шаге ошибка — останови и покажи что случилось, не пытайся обойти.
