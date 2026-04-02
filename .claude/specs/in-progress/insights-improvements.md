# План доработок по результатам Insights Report

> Источник: /insights от 2026-04-02, 70 сессий, 834 сообщения

## Статус покрытия CLAUDE.md

| Рекомендация из репорта | Уже в CLAUDE.md? | Действие |
|------------------------|-------------------|----------|
| Prettier перед коммитом | ✅ Есть (строка 74) | Усилить: добавить hook |
| Безопасный merge через PR | ✅ Есть (строки 75-79) | — |
| Не использовать неустановленные зависимости | ✅ Есть (строка 117) | — |
| Gather evidence before debugging | ✅ Есть (строки 83-87) | — |
| Post-refactor lint/cleanup | ✅ Есть (строки 112-113) | — |
| Pre-commit hook (Hooks feature) | ❌ Нет | **Добавить** |
| /cleanup skill | ❌ Нет | **Создать** |
| /merge skill | ✅ Есть (работает) | — |

---

## Фаза 1 — Hooks (автоматизация повторяющегося friction)

### 1.1 Pre-commit formatting hook

**Проблема**: Prettier failures блокировали коммиты в 10+ сессиях.
CLAUDE.md говорит "run prettier before committing", но это инструкция для Claude, а не enforcement.

**Решение**: Hook в `.claude/settings.json` — автоматический prettier + lint fix.

```jsonc
// .claude/settings.json → hooks
{
  "hooks": {
    "PreCommit": [{
      "command": "npx prettier --write $(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(ts|tsx|js|json|css)$' | tr '\\n' ' ')",
      "description": "Auto-format staged files before commit"
    }]
  }
}
```

**Ожидаемый эффект**: Полное устранение formatting friction (было ~10 сессий).

### 1.2 Post-build rebuild reminder hook (опционально)

**Проблема**: Stale dist/ после редактирования src/ — частая причина "баг не воспроизводится".

**Решение**: Hook после Edit на packages/*/src/** — напоминание о rebuild.
Отложить: сложно реализовать без ложных срабатываний.

---

## Фаза 2 — Custom Skills

### 2.1 /cleanup skill

**Проблема**: Dead code audit + branch cleanup повторялся в 12 сессиях с одинаковым flow.

**Файл**: `.claude/skills/cleanup/SKILL.md`

**Содержание**:
1. `npx ts-prune` → список неиспользуемых экспортов
2. Grep по codebase для подтверждения (исключить тесты)
3. Удалить мёртвый код + ассоциированные CSS/типы
4. `npm run verify` после каждого batch
5. Коммит с форматом: `chore: remove dead code (-N lines)`
6. Отчёт: файлы, строки, процент уменьшения

### 2.2 /status skill (уже есть, проверить)

Skill уже определён. Убедиться что он работает и включает:
- git branch + worktree list
- Stale dist/ detection
- Queue status (relay)

---

## Фаза 3 — Debugging improvements

### 3.1 Параллельные гипотезы через sub-agents

**Проблема**: 37 инцидентов wrong_approach — Claude последовательно перебирает гипотезы.

**Решение**: Добавить в CLAUDE.md правило для сложных багов:

```markdown
## Debugging (дополнение)
- Для багов с неочевидной причиной: запустить 2-3 параллельных Agent
  с разными гипотезами. Каждый агент: читает код → формулирует гипотезу →
  находит доказательства за/против. Сводка гипотез → пользователь выбирает.
```

**Ожидаемый эффект**: Сокращение debug-циклов с 4-5 до 1-2 итераций.

### 3.2 Build-vs-source mismatch detection

Уже в CLAUDE.md (строка 87). Но можно усилить — добавить в /status skill
автоматическую проверку `stat -f "%Sm" packages/*/dist/*.js`.

---

## Фаза 4 — Autonomous refactor workflow

### 4.1 Автономные фазовые рефакторы

**Проблема**: Пользователь вручную вводит "proceed" между фазами.

**Решение**: Не сейчас. Текущий подход с ручным подтверждением надёжнее.
Вернуться когда тест-покрытие вырастет до >80% (сейчас покрыты schema + handlers,
но не UI и не extension).

---

## Приоритеты

| # | Задача | Effort | Impact | Когда |
|---|--------|--------|--------|-------|
| 1 | Pre-commit hook (prettier) | 15 мин | Высокий | Сейчас |
| 2 | /cleanup skill | 30 мин | Средний | Сейчас |
| 3 | Parallel debugging в CLAUDE.md | 5 мин | Средний | Сейчас |
| 4 | /status skill проверка | 10 мин | Низкий | Позже |
| 5 | Autonomous refactors | — | Высокий | После роста тестов |
