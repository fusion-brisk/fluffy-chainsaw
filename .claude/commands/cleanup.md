# Post-session cleanup

1. `cd` to repo root (verify with `git rev-parse --show-toplevel`)
2. Show current state: `git status && git branch -a && git worktree list`
3. Kill stale processes: `lsof -i :3847 -i :8080` (relay/extension ports) — kill if running
4. Remove stale worktrees:
   - `git worktree list` — for each non-main worktree, `git worktree remove <path>`
   - If removal fails: `git worktree remove --force <path>`
   - `git worktree prune`
5. Delete merged local branches: `git branch --merged main | grep -v 'main\|master\|dev' | xargs -r git branch -d`
6. Prune remote refs: `git remote prune origin`
7. Final: `git branch -a && git worktree list`
8. Summary: сколько веток удалено, worktrees очищено, процессов убито
