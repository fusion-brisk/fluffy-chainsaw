# Repository status check

Покажи компактную сводку:

1. Текущая ветка + последний коммит (hash + message)
2. Uncommitted changes (staged / unstaged / untracked — только счётчики)
3. Все локальные ветки с tracking status (ahead/behind)
4. Активные worktrees
5. Синхронизация main ↔ dev: `git log main..dev --oneline` и `git log dev..main --oneline`
6. Stashes (если есть)
7. Port status: `lsof -i :3847 -i :8080` — занято ли что-то

Формат — компактная таблица, не raw git output.
