# Contentify Redesign Plan v3 — CJM-Driven, Figma UI3

> Replaces UI_REFACTOR_PLAN_v2.md. Each phase is a self-contained prompt for Claude Code. Strictly sequential: each phase depends on the previous one.

## Architecture

```
Phase 0: CJM ──────────► Phase 1: FSM ──────────► Phase 2: Tokens
  (two journey maps)       (state machine)           (CSS variables)
       │                        │                         │
       └────────────────────────┴─────────────────────────┘
                                │
                          Phase 3: Onboarding Wizard
                                │
                          Phase 4: Ready State (Day 0)
                                │
                          Phase 5: Core Flow (confirm → process → success)
                                │
                          Phase 6: Secondary Panels (logs, inspector, guides)
                                │
                          Phase 7: StatusBar
                                │
                          Phase 8: Motion & Transitions
                                │
                          Phase 9: Polish & Dark Mode QA
```

---

## Phase 0: Customer Journey Maps (docs, no code)

**Result:** Two CJM documents in docs/ — foundation for all design decisions.
**Effort:** 2-3 hours. **Files:** 2 markdown.

### Prompt:

Read CLAUDE.md, docs/ARCHITECTURE.md, packages/plugin/src/types.ts (AppState, UIMessage, CodeMessage), packages/plugin/src/ui/ui.tsx (states, hooks, components).

Create two CJM documents.

#### docs/CJM_ONBOARDING.md

"Pivotal Journey" — from first plugin launch to first successful import.

Columns (states):

1. Plugin Install → 2. First Launch → 3. Relay Setup → 4. Extension Setup →
2. Connection Check → 6. First SERP Browse → 7. First Data Received →
3. First Confirm → 9. First Processing → 10. First Success

Rows for each column:

- User Goal: what the user wants at this step
- User Action: specific action (click, navigate, wait)
- UI State: current AppState, window size, key elements on screen
- System Action: what happens behind the scenes (relay, extension, postMessage)
- Emotional Valence: scale 1-5 (1=frustration, 5=delight)
- Cognitive Load: LOW / MEDIUM / HIGH
- Drop-off Risk: LOW / MEDIUM / HIGH + reason
- Error Paths: what can go wrong + recovery path
- Pain Points: specific problems in current UI
- Opportunities: what can be improved in redesign
- Key Metric: completion rate / time-on-task / error rate

Also include:

- Emotional curve (ASCII chart by steps)
- TTV (Time-to-Value): estimate current and target time
- Critical barriers: top-3 drop-off points

Current flow context:

- SetupFlow.tsx: step-by-step wizard (relay download → extension install → verify)
- useRelayConnection.ts: WebSocket + HTTP polling to localhost:3847
- On first launch: isFirstRun=true, shows SetupFlow
- figma.clientStorage stores setup-skipped flag

#### docs/CJM_CORE_LOOP.md

"Toothbrush Journey" — daily usage cycle.

Columns (states):

1. Open Plugin → 2. Checking → 3. Ready (waiting) → 4. Browse SERP →
2. Data Received (confirming) → 6. Configure Import (confirming) →
3. Processing → 8. Success → 9. Back to Ready

Rows: same as Onboarding CJM.

Also include:

- Usage frequency (times per day)
- Average imports per session
- Sequential import patterns (batch workflow)
- Friction points in the repeating cycle

Format: markdown with tables. Each CJM is one file. Language: Russian for descriptions, English for technical terms.

---

## Phase 1: FSM State Machine (docs + types)

**Result:** Formalized transition table, updated types.
**Effort:** 1-2 hours. **Files:** 2 (docs + types.ts).

### Prompt:

Read CLAUDE.md, docs/CJM_ONBOARDING.md, docs/CJM_CORE_LOOP.md, packages/plugin/src/types.ts, packages/plugin/src/ui/ui.tsx.

Formalize all UI states as a finite state machine (FSM).

#### Step 1: docs/FSM_STATES.md

Create a document with:

1. Full transition table:
   | From State | Event | To State | Side Effects |
   Include ALL possible transitions, including error paths.

2. State diagram (Mermaid stateDiagram-v2):
   - Main flow: setup → checking → ready → confirming → processing → success → ready
   - Error paths: checking --fail--> setup, processing --fail--> ready
   - Secondary panels: ready --> logs/inspector/guides --> ready

3. Rules:
   - One primary action per state
   - Impossible transitions (what must NEVER happen)
   - Timeouts: checking (5s → ready without relay), success (3s → ready)

#### Step 2: Update packages/plugin/src/types.ts

Add:

1. Extend AppState, adding 'setup' as a separate state:

   ```typescript
   export type AppState = 'setup' | 'checking' | 'ready' | 'confirming' | 'processing' | 'success';
   ```

2. Add FSM event types:

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

3. Add transition map (type-safe):

   ```typescript
   export const FSM_TRANSITIONS: Record<AppState, Partial<Record<AppEvent, AppState>>>;
   ```

4. Update STATE_TO_TIER, adding 'setup': 'extended'

Do NOT change ui.tsx — that's later phases. Only types.ts + documentation.

After: `npm run typecheck -w packages/plugin`

---

## Phase 2: Design Tokens — Figma Native CSS Variables

**Result:** styles.css migrated to native Figma CSS variables. Automatic dark mode.
**Effort:** 3-4 hours. **Files:** 1 (styles.css) + check all components.

### Prompt:

Read CLAUDE.md, packages/plugin/src/ui/styles.css (entire file).

Migrate all custom CSS variables to native Figma CSS variables.

#### Context

Figma injects CSS variables into plugin iframe with themeColors: true. Full list: https://developers.figma.com/docs/plugins/css-variables/

Key native variables:

```
--figma-color-bg
--figma-color-bg-secondary
--figma-color-bg-tertiary
--figma-color-bg-brand
--figma-color-bg-brand-hover
--figma-color-bg-hover
--figma-color-bg-pressed
--figma-color-bg-selected
--figma-color-text
--figma-color-text-secondary
--figma-color-text-tertiary
--figma-color-text-onbrand
--figma-color-text-danger
--figma-color-text-success
--figma-color-text-warning
--figma-color-border
--figma-color-border-strong
--figma-color-border-selected
--figma-color-icon
--figma-color-icon-secondary
```

#### Step 1: Remove entire [data-theme="dark"] block

Figma switches CSS variable values itself. Custom dark mode NOT needed.

#### Step 2: Remove duplicate custom variables

Replacement mapping:

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

#### Step 3: Keep ONLY semantic tokens not provided by Figma

Keep:

- Typography scale: --font-size-xs through --font-size-3xl
- Font weights: --font-weight-regular/medium/semibold
- Spacing scale: --space-xs through --space-2xl
- Border radii: --radius-small/medium/large/xl
- Shadows: --shadow-sm/md/lg
- Transitions: --transition-fast/normal/slow/spring
- Durations: --duration-fast/normal/slow
- --btn-radius, --step-number-size

Remove:

- All --figma-color-\* overrides in :root (they come from Figma)
- Entire [data-theme="dark"] block
- --gradient-brand (not UI3)
- --overlay-bg, --overlay-bg-dark (replace with inline rgba)
- --toggle-thumb-bg, --toggle-thumb-shadow

#### Step 4: Update typography for UI3

Figma UI3 uses:

- Body: 11px / weight 400 (instead of current 12px)
- Emphasis: weight 500 (instead of 600)
- Spacing: strict 4px grid

Update:

```
--font-size-base: 11px (was 12px)
--font-size-sm: 10px (was 11px)
--font-weight-semibold: 550 (was 600)
```

#### Step 5: Remove applyFigmaTheme() from utils

The applyFigmaTheme() function in src/utils/ is no longer needed — Figma manages the theme. Remove the call from ui.tsx.

#### Step 6: Check all components

grep -r "color:" packages/plugin/src/ui/ — find hardcoded hex. Replace with CSS variables.

After: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`
Visually: plugin should look identical in light mode, dark mode works automatically.

---

## Phase 3: Onboarding Wizard (new SetupFlow)

**Result:** Unified wizard with auto-detect, progress stepper, step validation.
**Effort:** 6-8 hours. **Files:** 3-4.

### Prompt:

Read CLAUDE.md, docs/CJM_ONBOARDING.md, docs/FSM_STATES.md, packages/plugin/src/ui/components/SetupFlow.tsx, packages/plugin/src/ui/hooks/useRelayConnection.ts, packages/plugin/src/ui/styles.css.

Rewrite SetupFlow as a full onboarding wizard in Figma UI3 style.

#### Design Principles (from CJM)

1. Progress stepper ALWAYS visible — user knows how much is left
2. Auto-detection: if relay/extension already connected — step auto-completes
3. Each step explains WHY it's needed (one sentence)
4. Escape hatch on every step: "Skip setup"
5. Maximum time setup → first import: <3 minutes

#### New Step Structure

**Step 1: "Relay Server"**

- Description: "Relay transfers data from browser to Figma"
- Action: Download installer / Check connection
- Auto-skip: if useRelayConnection.connected === true
- Validation: ping localhost:3847/status

**Step 2: "Browser Extension"**

- Description: "Extension collects data from search results"
- Action: Download zip → Instructions for loading into Chrome
- Auto-skip: if extensionInstalled === true (from relay heartbeat)
- Validation: relay reports extension connected

**Step 3: "All Set!"**

- Description: "Open Yandex search — data will arrive automatically"
- Action: button "Start Working" → transition to Ready state
- Show mini-instruction: "Enter query → wait for SERP → data appears here"

#### Component

File: packages/plugin/src/ui/components/SetupFlow.tsx

```tsx
<div className="setup-flow">
  {/* Progress bar */}
  <div className="setup-flow__progress">
    <StepIndicator steps={steps} current={currentStep} />
  </div>

  {/* Current step content */}
  <div className="setup-flow__content">
    <h2 className="setup-flow__title">{step.title}</h2>
    <p className="setup-flow__description">{step.description}</p>
    {renderStepContent(step)}
  </div>

  {/* Navigation */}
  <div className="setup-flow__footer">
    {currentStep > 0 && (
      <button className="btn-text" onClick={prev}>
        ← Назад
      </button>
    )}
    <div className="setup-flow__footer-right">
      <button className="btn-text" onClick={skip}>
        Пропустить
      </button>
      <button className="btn-primary" onClick={next} disabled={!stepValid}>
        {isLastStep ? 'Начать' : 'Далее →'}
      </button>
    </div>
  </div>
</div>
```

#### StepIndicator

New component: horizontal dots with lines between them.

- Completed: filled dot (--figma-color-bg-brand)
- Current: ring with pulse animation
- Future: grey dot (--figma-color-border)
- Lines between dots: solid for completed, dashed for future

#### CSS (Figma UI3 style)

- No cards/shadows for steps — flat layout
- Step title: --font-size-xl, --font-weight-medium (not semibold)
- Description: --figma-color-text-secondary, --font-size-base
- Footer sticky at bottom with border-top: 1px solid var(--figma-color-border)
- Buttons: btn-primary (solid brand), btn-text (secondary)
- Spacing: 16px padding, 12px gaps
- Content height: flex: 1 with scroll if overflow

#### Auto-detect

In useEffect on each step:

- Step 1 (Relay): polling /status every 2s, on connected → markComplete + autoAdvance after 1s
- Step 2 (Extension): listen for extensionInstalled from useRelayConnection
- On auto-skip show green checkmark + "Already connected" for 1s, then next

#### Window Size

SetupFlow uses tier 'extended' (420x520). On "Start Working" → transition to 'standard' (400x400) with resize animation.

After: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`
Visually: wizard looks native, like Figma Variables panel setup.

---

## Phase 4: Ready State — "Day 0" Experience

**Result:** ReadyView with empty state, status indicators, quick actions.
**Effort:** 3-4 hours. **Files:** 2.

### Prompt:

Read CLAUDE.md, docs/CJM_CORE_LOOP.md, docs/FSM_STATES.md, packages/plugin/src/ui/components/ReadyView.tsx, packages/plugin/src/ui/styles.css.

Redesign ReadyView as the main plugin screen in Figma UI3 style.

#### From CJM: current Ready state problems

- User doesn't understand what to do next
- No visual feedback about connection status
- No quick access to frequent actions
- Too much empty space at 400x400

#### New ReadyView Structure

```
┌──────────────────────────────────┐
│ StatusBar (compact)          ⚙ ≡ │ ← 32px, sticky top
├──────────────────────────────────┤
│                                  │
│     ┌──────────────────────┐     │
│     │    (illustration)     │     │ ← SVG, 80x80, monochrome
│     └──────────────────────┘     │
│                                  │
│   Откройте Яндекс в браузере    │ ← --font-size-lg, primary text
│   Данные из выдачи появятся      │ ← --font-size-base, secondary text
│   здесь автоматически            │
│                                  │
│  ┌─ Последний запрос ──────────┐ │ ← Only if lastQuery !== null
│  │  "купить iPhone 15 pro"     │ │
│  │  42 сниппета · 2 мин назад  │ │
│  └─────────────────────────────┘ │
│                                  │
├──────────────────────────────────┤
│ ⬚ Заполнить выделение  │ ⟳ Reset │ ← Footer actions, sticky bottom
└──────────────────────────────────┘
```

#### Components

1. **Empty State** (no lastQuery):
   - SVG icon: stylized search bar + arrow to Figma
   - Main text: "Откройте Яндекс в браузере"
   - Subtext: "Данные из поисковой выдачи появятся здесь автоматически"
   - Style: centered, soft colors, no card

2. **Last Import Card** (has lastQuery):
   - Card with border, not shadow
   - Query bold, count + timestamp secondary
   - Hover: border-color → --figma-color-border-brand

3. **Footer Actions:**
   - "Заполнить выделение" — disabled if !hasSelection
   - "Сбросить" — text button, tertiary color
   - Separator: 1px solid --figma-color-border

#### SVG Illustration

Create simple monochrome SVG (80x80):

- Use only --figma-color-text-tertiary and --figma-color-border
- Style: thin lines (1.5px stroke), minimal, like icons in Figma empty states
- Content: stylized browser window with magnifier → arrow → layers stack

#### CSS (Figma UI3)

- Content centered vertically in available space
- Illustration: opacity 0.5, margin-bottom 16px
- Text: max-width 280px, text-align center
- Last Import Card: padding 12px, border-radius var(--radius-medium)
- Footer: padding 12px 16px, border-top
- Buttons in footer: --font-size-sm, compact

#### Update WhatsNew

WhatsNewBanner (if update available) shows between StatusBar and content. Compact banner: icon + "Version X.Y — what's new?" + dismiss button. Not modal — inline banner.

After: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`

---

## Phase 5: Core Flow — Confirming → Processing → Success

**Result:** Three core loop screens, unified visual language, one primary action per screen.
**Effort:** 6-8 hours. **Files:** 4.

### Prompt:

Read CLAUDE.md, docs/CJM_CORE_LOOP.md, docs/FSM_STATES.md, packages/plugin/src/ui/components/ImportConfirmDialog.tsx, packages/plugin/src/ui/components/ProcessingView.tsx, packages/plugin/src/ui/components/SuccessView.tsx, packages/plugin/src/ui/styles.css.

Redesign three core flow screens for Figma UI3.

#### Principle: one primary action per state

- Confirming: "Импортировать" (primary) + "Отмена" (text)
- Processing: no actions (only cancel as text link)
- Success: auto-dismiss in 3s + "Готово" (secondary)

#### Confirming (ImportConfirmDialog)

Current problem: too many options, overloaded.

New layout (400x400, tier standard):

```
┌──────────────────────────────────┐
│ StatusBar                    ⚙ ≡ │
├──────────────────────────────────┤
│                                  │
│  Импорт данных                   │ ← --font-size-xl
│  «купить iphone 15 pro»         │ ← query, --figma-color-text-secondary
│                                  │
│  ┌─ Содержимое ────────────────┐ │
│  │ 42 сниппета                 │ │
│  │ 5 фильтров                  │ │
│  │ 8 офферов в сайдбаре        │ │ ← list with icons, compact
│  └─────────────────────────────┘ │
│                                  │
│  Режим:  ◉ Новый артборд        │ ← radio, default
│          ○ Заполнить выделение   │ ← disabled if !hasSelection
│                                  │
│  ☐ Включить скриншоты            │ ← checkbox, secondary option
│                                  │
├──────────────────────────────────┤
│      Отмена      [ Импортировать ]│ ← sticky footer
└──────────────────────────────────┘
```

Style:

- Summary list: simple vertical list, no card
- Each item: emoji/icon + text, --font-size-base
- Radio buttons: native style, no custom components
- Footer: gap 12px, primary button right-aligned
- Transition in: fade + translateY(8px), 200ms ease-out

#### Processing (ProcessingView)

Current problem: generic spinner, no progress details.

New layout (400x400):

```
┌──────────────────────────────────┐
│ StatusBar                    ⚙ ≡ │
├──────────────────────────────────┤
│                                  │
│                                  │
│         ┌──────────┐             │
│         │ progress │             │ ← circular or linear, 48px
│         └──────────┘             │
│                                  │
│    Импортируем данные...         │ ← primary text
│    Сниппет 12 из 42             │ ← secondary, live counter
│                                  │
│    ━━━━━━━━━━━░░░░░░░░          │ ← progress bar, thin (3px)
│                                  │
│                                  │
│           Отменить               │ ← text link, tertiary
│                                  │
└──────────────────────────────────┘
```

Style:

- Centered vertically
- Spinner: simple CSS (border-top trick), 2px stroke, --figma-color-bg-brand
- Progress bar: 3px height, rounded, --figma-color-bg-brand fill
- Counter text: updates via progress events, monospace for digits
- "Отменить": --figma-color-text-tertiary, hover → --figma-color-text-danger
- Transition in: crossfade from confirming, 200ms

#### Success (SuccessView)

Current problem: confetti on error, overloaded with stats.

New layout (400x400):

```
┌──────────────────────────────────┐
│ StatusBar                    ⚙ ≡ │
├──────────────────────────────────┤
│                                  │
│                                  │
│             ✓                    │ ← checkmark icon, bounce-in animation
│                                  │
│    Импорт завершён               │ ← --font-size-xl, --figma-color-text-success
│    42 элемента за 3.2 сек        │ ← --font-size-base, secondary
│                                  │
│    ━━━━━━━━━━━━━━━━━━━━━━━━━━    │ ← auto-dismiss progress, 3s
│                                  │
│         [ Готово ]               │ ← secondary button, dismiss
│                                  │
│                                  │
└──────────────────────────────────┘
```

Style:

- Checkmark: SVG, 48px, --figma-color-text-success, bounceIn animation (scale 0.3→1.1→1)
- Auto-dismiss bar: thin (2px), shrinks from left over 3s, --figma-color-bg-brand
- Confetti: ONLY on onboarding first success (isFirstRun), NOT on regular import
- On error: ✗ icon (--figma-color-text-danger) + error description + "Retry"
- Transition in: scale(0.95) → scale(1) + fade, 200ms spring easing

#### Common Rules for All Three Screens

1. StatusBar ALWAYS visible (sticky top, 32px)
2. Content centered in remaining space
3. Sticky footer for actions (border-top)
4. Transitions between states: opacity + translateY, 200ms ease-out
5. Window size does NOT change (all three = standard tier, 400x400)

After: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`
Visually: three screens look like a unified sequence, no design "jumps".

---

## Phase 6: Secondary Panels — Logs, Inspector, Guides

**Result:** Unified layout for secondary panels with back navigation.
**Effort:** 4-5 hours. **Files:** 4.

### Prompt:

Read CLAUDE.md, docs/FSM_STATES.md, packages/plugin/src/ui/components/logs/LogViewer.tsx, packages/plugin/src/ui/components/ComponentInspector.tsx, packages/plugin/src/ui/styles.css.

Unify all secondary panels (extended tier, 420x520).

#### Unified Layout for Secondary Panels

```
┌──────────────────────────────────────┐
│ ← Назад              Panel Title     │ ← 40px header
├──────────────────────────────────────┤
│                                      │
│  [Scrollable content area]           │ ← flex: 1, overflow-y: auto
│                                      │
│                                      │
│                                      │
│                                      │
├──────────────────────────────────────┤
│  [Optional footer actions]           │ ← sticky, if present
└──────────────────────────────────────┘
```

#### Component PanelLayout (new)

```typescript
interface PanelLayoutProps {
  title: string;
  onBack: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}
```

Usage:

```tsx
<PanelLayout title="Логи" onBack={() => setShowLogViewer(false)}>
  <LogList messages={logMessages} />
</PanelLayout>
```

#### Back Button

UI3 style: not a pill, simple text "← Назад" or icon ← (16px).

- --figma-color-text-secondary, hover → --figma-color-text
- Clickable zone height: 32px (touch target)
- Position: absolute left, title centered

#### LogViewer

- Title: "Логи"
- Content: monospace, --font-size-sm
- Each line: timestamp (tertiary) + level badge + message
- Level badges: compact pills (ERROR=danger, WARN=warning, INFO=brand)
- Footer: "Очистить" (text button) + level selector (segmented control)
- Auto-scroll to bottom

#### ComponentInspector

- Title: "Инспектор"
- Content: component list → each expands to properties table
- Property row: name (secondary) + value (primary) + type badge
- Footer: "Копировать всё" (secondary button)

#### Transitions

- Open panel: slide-in from right, 250ms ease-out
- Close panel (back): slide-out to right, 200ms ease-in
- Or simpler: fade + translateX(16px), 200ms

After: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`

---

## Phase 7: StatusBar

**Result:** Minimalist StatusBar with click-toggle instead of hover.
**Effort:** 3-4 hours. **Files:** 2.

### Prompt:

Read CLAUDE.md, docs/FSM_STATES.md, packages/plugin/src/ui/components/StatusBar.tsx, packages/plugin/src/ui/hooks/useMcpStatus.ts, packages/plugin/src/ui/styles.css.

Redesign StatusBar in Figma UI3 bottom bar style.

#### From CJM: current StatusBar problems

- Hover-trigger: awkward on trackpads, accidental activations
- 3 pills overload 320px width
- On error it's unclear what to do

#### New StatusBar

Height: 32px. Position: fixed bottom (not top!).

**State "all ok":**

```
┌──────────────────────────────────┐
│  ● Подключено          ⚙    ≡   │
└──────────────────────────────────┘
```

- Green dot (6px) + "Подключено" (text-secondary, font-size-sm)
- ⚙ → open Inspector (icon button)
- ≡ → open Logs (icon button)

**State "has problem":**

```
┌──────────────────────────────────┐
│  ⚠ Relay офлайн   [Настроить]   │
└──────────────────────────────────┘
```

- Warning icon + specific message
- Action button → open corresponding guide

**Click on status text → toggle detail popup (not hover!):**

```
┌──────────────────────┐
│  Relay         ● онлайн  │
│  Расширение    ● онлайн  │
│  MCP           ○ офлайн  │
├──────────────────────┤
│  Очистить очередь        │ ← if pending data
└──────────────────────┘
```

#### CSS

- Background: --figma-color-bg-secondary
- Border-top: 1px solid --figma-color-border
- Icon buttons: 24x24, --figma-color-icon-secondary, hover bg transparent
- Popup: absolute bottom 32px, --figma-color-bg, shadow-md, border-radius var(--radius-large)
- Status dots: 6px circle, inline with text

#### Remove

- onMouseEnter / onMouseLeave
- Expanded state (replace with click popup)
- Three separate pills

After: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`

---

## Phase 8: Motion & Transitions

**Result:** Unified animation system, Figma-native timings.
**Effort:** 2-3 hours. **Files:** 2.

### Prompt:

Read CLAUDE.md, packages/plugin/src/ui/styles.css, packages/plugin/src/ui/ui.tsx (resizeUI function, RESIZE_ANIMATION_DURATION).

Unify all animations and transitions.

#### Figma UI3 Motion Principles

- Ease Out (fast start, slow finish): for elements appearing in viewport
- Ease In Out: for standard transitions
- Spring Quick: for micro-interactions (buttons, toggles)
- Spring Gentle: for scaling (success checkmark)

#### CSS Animation Tokens (update in styles.css)

```css
:root {
  /* Transitions */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1); /* Figma ease out */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1); /* Standard */
  --spring-quick: cubic-bezier(0.34, 1.56, 0.64, 1); /* Bounce */
  --spring-gentle: cubic-bezier(0.22, 1, 0.36, 1); /* Soft scale */

  --duration-micro: 100ms; /* Button feedback */
  --duration-fast: 150ms; /* Component transitions */
  --duration-normal: 200ms; /* View transitions */
  --duration-slow: 300ms; /* Panel slides */
  --duration-resize: 350ms; /* Window resize */
}
```

#### State Transition Animations

| Transition              | Animation                    | Duration      | Easing                      |
| ----------------------- | ---------------------------- | ------------- | --------------------------- |
| checking → ready        | fade + scaleY expand         | 350ms         | --ease-out                  |
| ready → confirming      | crossfade                    | 200ms         | --ease-out                  |
| confirming → processing | crossfade                    | 200ms         | --ease-out                  |
| processing → success    | crossfade + checkmark bounce | 200ms + 500ms | --ease-out + --spring-quick |
| success → ready         | fade out                     | 150ms         | --ease-in-out               |
| ready → panel           | slideX(16px)                 | 250ms         | --ease-out                  |
| panel → ready           | slideX(-16px)                | 200ms         | --ease-in-out               |

#### Implementation

1. In ui.tsx: wrap view switching in AnimatePresence-like logic:
   - On appState change: outgoing view fade out (100ms) → incoming view fade in (200ms)
   - Use CSS classes: .view-exit, .view-enter, .view-enter-active

2. resizeUI: update easing to --ease-out, duration to 350ms

3. Remove all existing @keyframes that aren't used

4. Standardize hover transitions: all 100ms ease-out (not different values)

5. Button press: scale(0.98) on 50ms for tactile feedback

#### Reduce Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

After: `npm run typecheck -w packages/plugin && npm run build -w packages/plugin`

---

## Phase 9: Polish & Dark Mode QA

**Result:** Final polish, dark mode verification, accessibility.
**Effort:** 2-3 hours. **Files:** 5+.

### Prompt:

Read CLAUDE.md, packages/plugin/src/ui/styles.css.

Final polish for all screens.

#### Checklist

1. **Dark Mode:**
   - Open Figma Desktop → Settings → Theme → Dark
   - Check EVERY plugin state
   - Find and remove any hardcoded colors (grep -r "#[0-9a-fA-F]{6}" src/ui/)
   - Check SVG illustrations — must use currentColor or CSS variables

2. **Accessibility:**
   - All interactive elements have focus-visible styles
   - Contrast ratio: all text passes WCAG AA (4.5:1)
   - Keyboard navigation: Tab through all actions
   - All buttons have accessible labels

3. **Typography audit:**
   - Find all inline font-size/font-weight — replace with CSS variables
   - Check line-height: 1.4 for body, 1.2 for headings
   - Ensure Inter loads (or fallback without "jump")

4. **Spacing audit:**
   - All margins/paddings multiples of 4px
   - Padding in components: 8px / 12px / 16px (not arbitrary)
   - Gap between elements: 4px / 8px / 12px

5. **Border radius audit:**
   - Inputs/buttons: var(--radius-medium) = 6px
   - Cards/panels: var(--radius-large) = 8px
   - Pills/badges: var(--radius-xl) = 12px
   - No arbitrary values

6. **Cleanup:**
   - Delete unused CSS classes (grep each class from styles.css)
   - Delete commented-out code
   - Delete unused components

7. **Russian language:**
   - Check ALL strings in components — Russian only
   - Exceptions: technical values (URLs, numbers, service names)

After: `npm run verify` (typecheck + lint + test + build)
Visually: walk through ALL states in light + dark mode.

---

## Summary

| Phase     | Description                   | Effort       | Result                 |
| --------- | ----------------------------- | ------------ | ---------------------- |
| 0         | CJM (two journey maps)        | 2-3 h        | 2 docs                 |
| 1         | FSM (state machine)           | 1-2 h        | doc + types.ts         |
| 2         | Design Tokens (CSS migration) | 3-4 h        | styles.css             |
| 3         | Onboarding Wizard             | 6-8 h        | SetupFlow.tsx          |
| 4         | Ready State                   | 3-4 h        | ReadyView.tsx          |
| 5         | Core Flow (3 screens)         | 6-8 h        | 3 components           |
| 6         | Secondary Panels              | 4-5 h        | PanelLayout + 3 panels |
| 7         | StatusBar                     | 3-4 h        | StatusBar.tsx          |
| 8         | Motion & Transitions          | 2-3 h        | styles.css + ui.tsx    |
| 9         | Polish & QA                   | 2-3 h        | audit + fixes          |
| **Total** |                               | **~33-44 h** | **~15 files**          |

## Post-PR Checklist

```bash
npm run typecheck -w packages/plugin  # Types
npm run lint -w packages/plugin       # Linter
npm run build -w packages/plugin      # Build
npm run test                          # Tests
```

Visual verification:

- [ ] All states render correctly
- [ ] Dark mode works automatically
- [ ] Transitions between states are smooth
- [ ] StatusBar not clipped
- [ ] All text in Russian
- [ ] Spacing multiples of 4px
- [ ] No hardcoded colors
