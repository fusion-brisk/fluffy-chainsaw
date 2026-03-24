# Specs Workflow

## Purpose

Specs prevent wasted implementation effort by requiring a plan before code.

## Flow

1. Create spec: `.claude/specs/in-progress/<name>.md` (use template from `templates/feature.md`)
2. Review & approve spec
3. Implement
4. Move completed spec to `.claude/specs/done/<name>.md`

## Resume

To continue work across sessions: "Resume work. Check `.claude/specs/in-progress/`"

## Rules

- `in-progress/` is gitignored (local WIP)
- `done/` is committed (decision history)
