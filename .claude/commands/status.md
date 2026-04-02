# Repository status check

Покажи компактную сводку:

1. Текущая ветка + последний коммит (hash + message)
2. Uncommitted changes (staged / unstaged / untracked — только счётчики)
3. Все локальные ветки с tracking status (ahead/behind)
4. Активные worktrees
5. Синхронизация main ↔ dev: `git log main..dev --oneline` и `git log dev..main --oneline`
6. Stashes (если есть)
7. Port status: `lsof -i :3847 -i :8080` — занято ли что-то
8. Build freshness: для каждого пакета сравни время модификации `dist/` vs `src/`.
   Запусти: `stat -f "%m %N" packages/*/dist/*.js 2>/dev/null | sort -n | tail -1` vs
   `find packages/*/src -name "*.ts" -newer packages/plugin/dist/code.js 2>/dev/null | wc -l`
   Если src новее dist — пометь как ⚠ STALE BUILD
9. Relay status: `curl -s http://localhost:3847/health` — версия, очередь

Формат — компактная таблица, не raw git output.
