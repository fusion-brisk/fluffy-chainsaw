# UI Redesign v3 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Contentify Figma plugin UI using CJM-driven approach with native Figma UI3 design tokens, FSM state machine, and unified visual language across all states.

**Architecture:** 10 sequential phases. Each phase produces working, testable output. Phases 0-1 are documentation + types. Phase 2 is CSS migration. Phases 3-7 are component rewrites. Phases 8-9 are polish. Every phase ends with `npm run typecheck && npm run build`.

**Tech Stack:** React 18, CSS custom properties (Figma native), TypeScript, Vitest

**Design Doc:** `docs/plans/2026-03-25-ui-redesign-v3-design.md`

**Key Codebase References:**
- UI entry: `packages/plugin/src/ui/ui.tsx` (388 LOC)
- Components: `packages/plugin/src/ui/components/` (13 files, 1,663 LOC)
- Hooks: `packages/plugin/src/ui/hooks/` (7 hooks, 1,217 LOC)
- Styles: `packages/plugin/src/ui/styles.css` (62.5 KB)
- Types: `packages/plugin/src/types.ts`
- Config: `packages/plugin/src/config.ts` (version 2.4.1)

**Conventions (from CLAUDE.md):**
- ES5 constraint applies to `src/sandbox/` only — UI code is modern
- Logger only — no `console.log`
- Commits: `<type>: <subject>`, English, imperative mood
- Russian for all user-facing strings, English for technical terms
- Verify: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`

---

## Phase 0: Customer Journey Maps

> Documentation only — no code changes. Foundation for all design decisions.

### Task 0.1: Create Onboarding CJM

**Files:**
- Create: `docs/CJM_ONBOARDING.md`

**Context to read first:**
- `docs/ARCHITECTURE.md` — system overview
- `packages/plugin/src/types.ts` — AppState, UIMessage, CodeMessage types
- `packages/plugin/src/ui/ui.tsx` — state machine, rendering logic
- `packages/plugin/src/ui/components/SetupFlow.tsx` — current 6-step wizard
- `packages/plugin/src/ui/hooks/useRelayConnection.ts` — connection lifecycle

**Step 1: Read all context files listed above**

Understand: how does the current onboarding flow work? What states does the user traverse? Where are the failure points?

**Step 2: Write CJM_ONBOARDING.md**

"Pivotal Journey" — first plugin launch → first successful import.

10 columns (states): Plugin Install → First Launch → Relay Setup → Extension Setup → Connection Check → First SERP Browse → First Data Received → First Confirm → First Processing → First Success

For each column, provide these rows in a markdown table:
- User Goal, User Action, UI State (AppState + window size + key elements)
- System Action (relay/extension/postMessage behind the scenes)
- Emotional Valence (1-5), Cognitive Load (LOW/MEDIUM/HIGH)
- Drop-off Risk (LOW/MEDIUM/HIGH + reason)
- Error Paths (what can go wrong + recovery)
- Pain Points (current UI problems), Opportunities (redesign improvements)
- Key Metric (completion rate / time-on-task / error rate)

Also include:
- ASCII emotional curve across all 10 steps
- TTV (Time-to-Value): current estimate vs target
- Top-3 critical drop-off barriers

Language: Russian descriptions, English technical terms.

**Step 3: Self-review**

Verify: every state from SetupFlow.tsx is represented. Every error path from useRelayConnection.ts is covered. Emotional curve makes sense.

**Step 4: Commit**

```bash
git add docs/CJM_ONBOARDING.md
git commit -m "docs: add onboarding customer journey map"
```

### Task 0.2: Create Core Loop CJM

**Files:**
- Create: `docs/CJM_CORE_LOOP.md`

**Context to read first:**
- `docs/CJM_ONBOARDING.md` — just created, use same format
- `packages/plugin/src/ui/hooks/useImportFlow.ts` — import lifecycle
- `packages/plugin/src/ui/components/ImportConfirmDialog.tsx` — confirm screen
- `packages/plugin/src/ui/components/ProcessingView.tsx` — progress screen
- `packages/plugin/src/ui/components/SuccessView.tsx` — completion screen

**Step 1: Read all context files**

**Step 2: Write CJM_CORE_LOOP.md**

"Toothbrush Journey" — daily usage cycle.

9 columns: Open Plugin → Checking → Ready (waiting) → Browse SERP → Data Received (confirming) → Configure Import (confirming) → Processing → Success → Back to Ready

Same row structure as onboarding CJM, plus:
- Usage frequency estimate (times per day)
- Average imports per session
- Sequential import patterns (batch workflow)
- Friction points in repeating cycle

**Step 3: Self-review**

Verify: every AppState is represented. Import flow from useImportFlow.ts is accurately mapped. Batch workflow patterns documented.

**Step 4: Commit**

```bash
git add docs/CJM_CORE_LOOP.md
git commit -m "docs: add core loop customer journey map"
```

---

## Phase 1: FSM State Machine

> Formalize transitions + update types. No UI changes yet.

### Task 1.1: Create FSM Documentation

**Files:**
- Create: `docs/FSM_STATES.md`

**Context to read first:**
- `docs/CJM_ONBOARDING.md`, `docs/CJM_CORE_LOOP.md` — journey maps
- `packages/plugin/src/types.ts` — current AppState type
- `packages/plugin/src/ui/ui.tsx` — current state transitions (grep for `setAppState`)

**Step 1: Read context files. Map every setAppState() call in ui.tsx and hooks**

**Step 2: Write FSM_STATES.md with:**

1. Full transition table:

| From State | Event | To State | Side Effects |
|------------|-------|----------|-------------|
| setup | SETUP_COMPLETE | checking | Start relay polling, resize to compact |
| checking | CONNECTION_SUCCESS | ready | Resize to standard |
| checking | CONNECTION_FAILURE | ready | Show status warning |
| ready | DATA_RECEIVED | confirming | Show ImportConfirmDialog |
| confirming | CONFIRM_IMPORT | processing | Send import-csv message |
| confirming | CANCEL_IMPORT | ready | Clear pending data |
| processing | IMPORT_COMPLETE | success | Show stats, start 3s timer |
| processing | IMPORT_FAILURE | ready | Show error in StatusBar |
| success | DISMISS_SUCCESS | ready | Clear stats |
| ready | OPEN_PANEL | ready | Show panel overlay, resize to extended |
| ready | CLOSE_PANEL | ready | Hide panel, resize to standard |

2. Mermaid stateDiagram-v2 covering main flow + error paths + panel overlays

3. Rules: one primary action per state, impossible transitions list, timeouts

**Step 3: Self-review against both CJMs**

**Step 4: Commit**

```bash
git add docs/FSM_STATES.md
git commit -m "docs: add FSM state machine specification"
```

### Task 1.2: Update types.ts with FSM Types

**Files:**
- Modify: `packages/plugin/src/types.ts`

**Step 1: Read `packages/plugin/src/types.ts` fully**

Find: current AppState definition, STATE_TO_TIER mapping, all related types.

**Step 2: Add 'setup' to AppState**

Change:
```typescript
// FROM:
export type AppState = 'checking' | 'ready' | 'confirming' | 'processing' | 'success';
// TO:
export type AppState = 'setup' | 'checking' | 'ready' | 'confirming' | 'processing' | 'success';
```

**Step 3: Add AppEvent type**

```typescript
export type AppEvent =
  | 'SETUP_COMPLETE'
  | 'CONNECTION_SUCCESS'
  | 'CONNECTION_FAILURE'
  | 'DATA_RECEIVED'
  | 'CONFIRM_IMPORT'
  | 'CANCEL_IMPORT'
  | 'IMPORT_COMPLETE'
  | 'IMPORT_FAILURE'
  | 'DISMISS_SUCCESS'
  | 'OPEN_PANEL'
  | 'CLOSE_PANEL';
```

**Step 4: Add FSM_TRANSITIONS map**

```typescript
export const FSM_TRANSITIONS: Record<AppState, Partial<Record<AppEvent, AppState>>> = {
  setup:      { SETUP_COMPLETE: 'checking' },
  checking:   { CONNECTION_SUCCESS: 'ready', CONNECTION_FAILURE: 'ready' },
  ready:      { DATA_RECEIVED: 'confirming', OPEN_PANEL: 'ready', CLOSE_PANEL: 'ready' },
  confirming: { CONFIRM_IMPORT: 'processing', CANCEL_IMPORT: 'ready' },
  processing: { IMPORT_COMPLETE: 'success', IMPORT_FAILURE: 'ready' },
  success:    { DISMISS_SUCCESS: 'ready' },
};
```

**Step 5: Update STATE_TO_TIER**

Add `'setup': 'extended'` to the existing mapping.

**Step 6: Verify**

```bash
npm run typecheck -w packages/plugin
```

Expected: no new type errors (existing pre-existing errors in snippet-parser/ui/network are OK).

**Step 7: Commit**

```bash
git add packages/plugin/src/types.ts
git commit -m "feat: add FSM state types and transition map"
```

---

## Phase 2: Design Tokens — Figma Native CSS Variables

> Migrate styles.css to Figma native variables. Automatic dark mode.

### Task 2.1: Audit Current CSS Variables

**Files:**
- Read: `packages/plugin/src/ui/styles.css` (entire file)

**Step 1: Read styles.css fully**

**Step 2: Create a mapping document (scratch, not committed)**

List every custom CSS variable in :root and categorize:
- A) Has Figma native equivalent → will be replaced
- B) Semantic token with no Figma equivalent → will be kept
- C) Unused or deprecated → will be removed

**Step 3: Find applyFigmaTheme()**

```bash
grep -r "applyFigmaTheme" packages/plugin/src/
```

Note all files that reference it.

**Step 4: Find all hardcoded hex colors in components**

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}" packages/plugin/src/ui/components/ packages/plugin/src/ui/hooks/
```

Note all instances for Step 2.5 cleanup.

### Task 2.2: Migrate CSS Variables

**Files:**
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Remove the entire `[data-theme="dark"]` block**

Figma manages theme switching natively via CSS variable injection.

**Step 2: In `:root`, remove all custom variables that duplicate Figma native ones**

Apply this replacement mapping throughout the file:
```
--color-primary → --figma-color-bg-brand
--color-primary-hover → --figma-color-bg-brand-hover
--color-success → --figma-color-text-success
--color-warning → --figma-color-text-warning
--color-error → --figma-color-text-danger
--card-bg → --figma-color-bg
--card-border → --figma-color-border
--status-connected → --figma-color-text-success
--status-offline → --figma-color-text-danger
--icon-circle-bg → --figma-color-bg-secondary
--icon-circle-border → --figma-color-border
--status-pill-bg → --figma-color-bg-secondary
--status-pill-border → --figma-color-border
```

For each: (a) remove the variable definition from :root, (b) find-and-replace all usages in the file.

**Step 3: Remove deprecated tokens**

Delete: `--gradient-brand`, `--overlay-bg`, `--overlay-bg-dark`, `--toggle-thumb-bg`, `--toggle-thumb-shadow`. Replace any usages inline (e.g., overlay → `rgba(0,0,0,0.4)`).

**Step 4: Keep semantic tokens not provided by Figma**

Verify these remain in :root:
- Typography: `--font-size-xs` through `--font-size-3xl`, `--font-weight-*`
- Spacing: `--space-xs` through `--space-2xl`
- Radii: `--radius-small/medium/large/xl`
- Shadows: `--shadow-sm/md/lg`
- Transitions: `--transition-fast/normal/slow/spring`
- Durations: `--duration-fast/normal/slow`

**Step 5: Update typography for UI3**

```css
--font-size-base: 11px;  /* was 12px */
--font-size-sm: 10px;    /* was 11px */
--font-weight-semibold: 550;  /* was 600 */
```

**Step 6: Verify**

```bash
npm run build -w packages/plugin
```

**Step 7: Commit**

```bash
git add packages/plugin/src/ui/styles.css
git commit -m "refactor: migrate CSS variables to Figma native tokens"
```

### Task 2.3: Remove applyFigmaTheme() and Fix Hardcoded Colors

**Files:**
- Modify: files found in Task 2.1 Step 3 (applyFigmaTheme references)
- Modify: files found in Task 2.1 Step 4 (hardcoded hex colors in components)

**Step 1: Remove applyFigmaTheme() function and its call from ui.tsx**

If it's in a utils file, remove the function. Remove the import and call from ui.tsx.

**Step 2: Replace hardcoded hex colors in component TSX files**

For each hex found in Task 2.1 Step 4, replace with the appropriate CSS variable reference. If inline style, convert to className or use `var(--figma-color-*)`.

**Step 3: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 4: Verify no remaining hardcoded colors**

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}" packages/plugin/src/ui/components/
```

Should return zero or only legitimate uses (SVG data URIs, non-color hex).

**Step 5: Commit**

```bash
git add -A packages/plugin/src/
git commit -m "refactor: remove applyFigmaTheme and hardcoded colors"
```

---

## Phase 3: Onboarding Wizard

> Rewrite SetupFlow with auto-detect, progress stepper, step validation.

### Task 3.1: Create StepIndicator Component

**Files:**
- Create: `packages/plugin/src/ui/components/StepIndicator.tsx`
- Modify: `packages/plugin/src/ui/styles.css` (add step-indicator styles)

**Step 1: Read current SetupFlow.tsx to understand step structure**

**Step 2: Create StepIndicator component**

```tsx
interface StepIndicatorProps {
  steps: Array<{ id: string; title: string }>;
  currentStep: number;
  completedSteps: Set<number>;
}
```

Renders: horizontal dots with connecting lines.
- Completed: filled circle (`--figma-color-bg-brand`)
- Current: ring with CSS pulse animation
- Future: grey circle (`--figma-color-border`)
- Lines: solid for completed, dashed for future

**Step 3: Add CSS for `.step-indicator` in styles.css**

```css
.step-indicator { display: flex; align-items: center; justify-content: center; gap: 0; padding: 16px; }
.step-indicator__dot { width: 8px; height: 8px; border-radius: 50%; ... }
.step-indicator__dot--completed { background: var(--figma-color-bg-brand); }
.step-indicator__dot--current { border: 2px solid var(--figma-color-bg-brand); animation: pulse 2s infinite; }
.step-indicator__dot--future { background: var(--figma-color-border); }
.step-indicator__line { width: 32px; height: 1px; }
.step-indicator__line--completed { background: var(--figma-color-bg-brand); }
.step-indicator__line--future { background: var(--figma-color-border); border-top: 1px dashed; }
```

**Step 4: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 5: Commit**

```bash
git add packages/plugin/src/ui/components/StepIndicator.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: add StepIndicator component for setup wizard"
```

### Task 3.2: Rewrite SetupFlow

**Files:**
- Modify: `packages/plugin/src/ui/components/SetupFlow.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Read current SetupFlow.tsx (218 LOC) and useRelayConnection.ts (418 LOC) fully**

**Step 2: Rewrite SetupFlow with 3-step wizard**

Steps:
1. "Relay-сервер" — download/verify, auto-skip if connected
2. "Расширение браузера" — download/instructions, auto-skip if extension detected
3. "Всё готово!" — "Начать работу" button

Structure per design doc:
- StepIndicator at top
- Step content (title + description + action area) in middle, flex: 1
- Footer with Back/Skip/Next buttons, sticky bottom with border-top

**Step 3: Add auto-detection logic**

useEffect per step:
- Step 1: poll relay `/status` every 2s → on connected, show checkmark for 1s, auto-advance
- Step 2: watch `extensionInstalled` from relay heartbeat → same pattern
- On auto-skip: green checkmark + "Уже подключено" text for 1s

**Step 4: Add CSS for `.setup-flow` in styles.css**

Flat layout (no cards/shadows). Title: `--font-size-xl`. Description: `--figma-color-text-secondary`. Footer sticky with `border-top`. 16px padding, 12px gaps.

**Step 5: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 6: Commit**

```bash
git add packages/plugin/src/ui/components/SetupFlow.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: rewrite SetupFlow as 3-step onboarding wizard"
```

### Task 3.3: Wire SetupFlow into ui.tsx

**Files:**
- Modify: `packages/plugin/src/ui/ui.tsx`

**Step 1: Read ui.tsx — understand current SetupFlow integration (needsSetup logic, panel manager)**

**Step 2: Update state machine**

- Initial state for first-run: `'setup'` instead of `'checking'`
- SetupFlow renders when `appState === 'setup'` (not as panel overlay)
- On "Начать работу" → transition to `'checking'` → auto-advance to `'ready'`
- Window tier: `'setup'` uses `'extended'` (420x520)

**Step 3: Clean up needsSetup logic if now redundant**

**Step 4: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 5: Commit**

```bash
git add packages/plugin/src/ui/ui.tsx
git commit -m "feat: wire new SetupFlow into main state machine"
```

---

## Phase 4: Ready State

> Redesign ReadyView with empty state, last import card, footer actions.

### Task 4.1: Create SVG Illustration

**Files:**
- Modify: `packages/plugin/src/ui/components/Icons.tsx`

**Step 1: Read Icons.tsx to understand existing icon patterns**

**Step 2: Add SearchToFigmaIcon component**

Monochrome SVG (80x80), thin lines (1.5px stroke), uses `currentColor`.
Content: stylized browser window with magnifier → arrow → layers stack.

**Step 3: Commit**

```bash
git add packages/plugin/src/ui/components/Icons.tsx
git commit -m "feat: add SearchToFigma illustration icon"
```

### Task 4.2: Rewrite ReadyView

**Files:**
- Modify: `packages/plugin/src/ui/components/ReadyView.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Read current ReadyView.tsx (90 LOC)**

**Step 2: Rewrite with new layout**

Structure per design doc:
- Empty state (no lastQuery): centered illustration + main text + subtext
- Last Import Card (has lastQuery): bordered card with query, count, timestamp
- Footer: "Заполнить выделение" (disabled if !hasSelection) + "Сбросить" (text button)

**Step 3: Integrate WhatsNewBanner**

Show between StatusBar and content as inline banner (not modal). Compact: icon + "Версия X.Y — что нового?" + dismiss button.

**Step 4: Add CSS for `.ready-view` in styles.css**

Content centered vertically. Illustration opacity 0.5. Last Import Card with border, no shadow. Footer with border-top, compact buttons.

**Step 5: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 6: Commit**

```bash
git add packages/plugin/src/ui/components/ReadyView.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: redesign ReadyView with empty state and footer actions"
```

---

## Phase 5: Core Flow — Confirming → Processing → Success

> Three screens, unified visual language, one primary action per screen.

### Task 5.1: Redesign ImportConfirmDialog

**Files:**
- Modify: `packages/plugin/src/ui/components/ImportConfirmDialog.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Read current ImportConfirmDialog.tsx (136 LOC)**

**Step 2: Rewrite with simplified layout**

Per design doc:
- Title "Импорт данных" + query string
- Summary list (icon + count per type): snippets, filters, sidebar offers
- Radio: "Новый артборд" (default) / "Заполнить выделение" (disabled if !hasSelection)
- Checkbox: "Включить скриншоты"
- Footer: "Отмена" (text) + "Импортировать" (primary)

**Step 3: Add CSS. Transition in: fade + translateY(8px), 200ms ease-out**

**Step 4: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 5: Commit**

```bash
git add packages/plugin/src/ui/components/ImportConfirmDialog.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: redesign ImportConfirmDialog with simplified layout"
```

### Task 5.2: Redesign ProcessingView

**Files:**
- Modify: `packages/plugin/src/ui/components/ProcessingView.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Read current ProcessingView.tsx (95 LOC)**

**Step 2: Rewrite with centered progress layout**

Per design doc:
- CSS spinner (2px stroke, `--figma-color-bg-brand`)
- "Импортируем данные..." primary text
- "Сниппет 12 из 42" live counter (secondary)
- Thin progress bar (3px, rounded)
- "Отменить" text link (tertiary, hover → danger)

**Step 3: Add CSS. Crossfade transition from confirming.**

**Step 4: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 5: Commit**

```bash
git add packages/plugin/src/ui/components/ProcessingView.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: redesign ProcessingView with progress bar and counter"
```

### Task 5.3: Redesign SuccessView

**Files:**
- Modify: `packages/plugin/src/ui/components/SuccessView.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Read current SuccessView.tsx (144 LOC) and Confetti.tsx (237 LOC)**

**Step 2: Rewrite with minimal success layout**

Per design doc:
- SVG checkmark (48px, `--figma-color-text-success`, bounceIn animation)
- "Импорт завершён" + stats line
- Auto-dismiss bar (2px, shrinks over 3s)
- "Готово" secondary button
- Confetti ONLY on `isFirstRun` first success, NOT regular imports
- Error variant: ✗ icon (danger) + error description + "Повторить"

**Step 3: Add CSS. BounceIn keyframe: scale(0.3) → scale(1.1) → scale(1).**

**Step 4: Update Confetti.tsx — only trigger when isFirstRun prop is true**

**Step 5: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 6: Commit**

```bash
git add packages/plugin/src/ui/components/SuccessView.tsx packages/plugin/src/ui/components/Confetti.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: redesign SuccessView with auto-dismiss and conditional confetti"
```

---

## Phase 6: Secondary Panels

> Unified PanelLayout with back navigation. Slide transitions.

### Task 6.1: Create PanelLayout Component

**Files:**
- Create: `packages/plugin/src/ui/components/PanelLayout.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Design PanelLayout**

```tsx
interface PanelLayoutProps {
  title: string;
  onBack: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}
```

Layout: 40px header (back button left, title centered) → scrollable content → optional sticky footer.

**Step 2: Create component and CSS**

Back button: "← Назад" text, `--figma-color-text-secondary`, 32px touch target.

**Step 3: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 4: Commit**

```bash
git add packages/plugin/src/ui/components/PanelLayout.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: add PanelLayout component for secondary panels"
```

### Task 6.2: Migrate LogViewer to PanelLayout

**Files:**
- Modify: `packages/plugin/src/ui/components/logs/LogViewer.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Read current LogViewer.tsx**

**Step 2: Wrap in PanelLayout**

```tsx
<PanelLayout title="Логи" onBack={onClose} footer={<LogFooter />}>
  <LogList messages={logMessages} />
</PanelLayout>
```

- Monospace, `--font-size-sm`
- Level badges: compact pills (ERROR=danger, WARN=warning, INFO=brand)
- Footer: "Очистить" button + level filter
- Auto-scroll to bottom

**Step 3: Verify and commit**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
git add packages/plugin/src/ui/components/logs/LogViewer.tsx packages/plugin/src/ui/styles.css
git commit -m "refactor: migrate LogViewer to PanelLayout"
```

### Task 6.3: Migrate ComponentInspector to PanelLayout

**Files:**
- Modify: `packages/plugin/src/ui/components/ComponentInspector.tsx`

**Step 1: Read current ComponentInspector.tsx (117 LOC)**

**Step 2: Wrap in PanelLayout with title "Инспектор"**

Footer: "Копировать всё" secondary button.

**Step 3: Verify and commit**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
git add packages/plugin/src/ui/components/ComponentInspector.tsx
git commit -m "refactor: migrate ComponentInspector to PanelLayout"
```

---

## Phase 7: StatusBar

> Minimalist bottom bar with click-toggle popup.

### Task 7.1: Redesign StatusBar

**Files:**
- Modify: `packages/plugin/src/ui/components/StatusBar.tsx`
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Read current StatusBar.tsx (243 LOC) and useMcpStatus.ts (41 LOC)**

**Step 2: Rewrite StatusBar**

Position: fixed bottom (not top), 32px height.

States:
- All OK: green dot (6px) + "Подключено" + ⚙ (inspector) + ≡ (logs)
- Problem: ⚠ icon + specific message + [Настроить] action button

Click on status text → toggle detail popup (NOT hover):
- List: Relay/Extension/MCP with status dots
- "Очистить очередь" action if pending data

**Step 3: Remove onMouseEnter/onMouseLeave logic. Remove expanded state. Remove three separate pills.**

**Step 4: Add CSS**

Background: `--figma-color-bg-secondary`. Border-top. Icon buttons 24x24. Popup: absolute bottom 32px, shadow-md.

**Step 5: Verify**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
```

**Step 6: Commit**

```bash
git add packages/plugin/src/ui/components/StatusBar.tsx packages/plugin/src/ui/styles.css
git commit -m "feat: redesign StatusBar as bottom bar with click popup"
```

### Task 7.2: Update ui.tsx for Bottom StatusBar

**Files:**
- Modify: `packages/plugin/src/ui/ui.tsx`

**Step 1: Move StatusBar from top to bottom in render order**

Ensure it renders as last child in `.glass-app`, with CSS `position: fixed; bottom: 0`.

**Step 2: Add padding-bottom to content area to avoid overlap with StatusBar**

**Step 3: Verify and commit**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
git add packages/plugin/src/ui/ui.tsx
git commit -m "refactor: move StatusBar to bottom of plugin window"
```

---

## Phase 8: Motion & Transitions

> Unified animation system with Figma-native timings.

### Task 8.1: Update Animation Tokens

**Files:**
- Modify: `packages/plugin/src/ui/styles.css`

**Step 1: Replace transition/easing tokens in :root**

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
--spring-quick: cubic-bezier(0.34, 1.56, 0.64, 1);
--spring-gentle: cubic-bezier(0.22, 1, 0.36, 1);
--duration-micro: 100ms;
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--duration-resize: 350ms;
```

**Step 2: Add view transition classes**

```css
.view-enter { opacity: 0; transform: translateY(8px); }
.view-enter-active { opacity: 1; transform: translateY(0); transition: all var(--duration-normal) var(--ease-out); }
.view-exit { opacity: 0; transition: opacity var(--duration-micro) var(--ease-in-out); }
```

**Step 3: Add button press feedback**

```css
.btn-primary:active, .btn-text:active { transform: scale(0.98); transition: transform 50ms; }
```

**Step 4: Standardize all hover transitions to 100ms ease-out**

Find-and-replace inconsistent transition durations on `:hover` rules.

**Step 5: Add prefers-reduced-motion media query**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Step 6: Remove unused @keyframes**

Grep for `@keyframes` names, check if they're referenced. Delete unused ones.

**Step 7: Verify and commit**

```bash
npm run build -w packages/plugin
git add packages/plugin/src/ui/styles.css
git commit -m "feat: unify animation system with Figma UI3 motion tokens"
```

### Task 8.2: Add View Transitions in ui.tsx

**Files:**
- Modify: `packages/plugin/src/ui/ui.tsx`
- Modify: `packages/plugin/src/ui/hooks/useResizeUI.ts`

**Step 1: Add CSS class-based view transitions**

On appState change: apply `.view-exit` to outgoing, then swap to new view with `.view-enter` → `.view-enter-active`.

Simple approach: track `prevState` via useRef, apply transition classes with setTimeout.

**Step 2: Update resizeUI easing**

In useResizeUI.ts, update RESIZE_ANIMATION_DURATION to 350ms and easing to match `--ease-out`.

**Step 3: Verify and commit**

```bash
npm run typecheck -w packages/plugin && npm run build -w packages/plugin
git add packages/plugin/src/ui/ui.tsx packages/plugin/src/ui/hooks/useResizeUI.ts
git commit -m "feat: add view transitions between app states"
```

---

## Phase 9: Polish & Dark Mode QA

> Final pass: accessibility, spacing, typography, cleanup.

### Task 9.1: Dark Mode Audit

**Files:**
- Modify: any files with hardcoded colors found

**Step 1: Find all remaining hardcoded colors**

```bash
grep -rn "#[0-9a-fA-F]\{3,8\}" packages/plugin/src/ui/
```

**Step 2: Check SVG illustrations use currentColor or CSS variables**

**Step 3: Fix any issues found. Commit.**

```bash
git commit -m "fix: remove remaining hardcoded colors for dark mode"
```

### Task 9.2: Accessibility Pass

**Files:**
- Modify: `packages/plugin/src/ui/styles.css` and component files as needed

**Step 1: Add focus-visible styles to all interactive elements**

```css
:focus-visible { outline: 2px solid var(--figma-color-border-selected); outline-offset: 2px; }
```

**Step 2: Verify all buttons have accessible labels (aria-label where icon-only)**

**Step 3: Commit**

```bash
git commit -m "fix: add focus-visible styles and accessible labels"
```

### Task 9.3: Spacing & Typography Audit

**Files:**
- Modify: `packages/plugin/src/ui/styles.css` and components

**Step 1: Find inline font-size/font-weight in components — replace with CSS variables**

```bash
grep -rn "fontSize\|fontWeight\|font-size\|font-weight" packages/plugin/src/ui/components/
```

**Step 2: Verify all spacing is 4px-grid aligned (multiples of 4)**

**Step 3: Verify border radii use CSS variables, not arbitrary values**

**Step 4: Commit**

```bash
git commit -m "fix: standardize typography and spacing to 4px grid"
```

### Task 9.4: Cleanup

**Files:**
- Multiple

**Step 1: Delete unused CSS classes**

For each class in styles.css, grep for usage in components. Remove orphans.

**Step 2: Delete commented-out code**

**Step 3: Verify all user-facing strings are Russian**

```bash
grep -rn "'" packages/plugin/src/ui/components/ | grep -i "[a-z]\{5,\}"
```

Check for English strings that should be Russian.

**Step 4: Final verification**

```bash
npm run verify
```

This runs: typecheck + lint + test + build.

**Step 5: Commit**

```bash
git commit -m "chore: cleanup unused CSS, commented code, and string localization"
```

---

## Verification Checklist (after all phases)

```bash
npm run typecheck -w packages/plugin  # Types
npm run lint -w packages/plugin       # Linter
npm run build -w packages/plugin      # Build
npm run test                          # Tests
```

Visual verification:
- [ ] All 6 app states render correctly (setup, checking, ready, confirming, processing, success)
- [ ] Dark mode works automatically (no custom theme switching)
- [ ] Transitions between states are smooth (200ms ease-out)
- [ ] StatusBar at bottom, not clipped
- [ ] Panel overlays slide in/out correctly
- [ ] All text in Russian (except technical values)
- [ ] Spacing multiples of 4px
- [ ] No hardcoded colors remaining
- [ ] prefers-reduced-motion respected
- [ ] Keyboard navigation (Tab) works through all interactive elements
