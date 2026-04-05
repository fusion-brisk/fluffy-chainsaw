---
globs: packages/plugin/src/ui/**
---

# UI State Machine Rules

## AppState is the single source of truth

The plugin UI has one FSM: `appState: setup → checking → ready → confirming → processing → success → error`.

**Never cache appState in a ref for later restoration.** Always read the current `appState` when you need to resize or make decisions. Stale saved state causes bugs when appState changes while a panel is open.

```tsx
// BAD — stale if appState changed while panel was open
previousStateRef.current = appState;
// ... later:
resizeUI(previousStateRef.current);

// GOOD — always current
resizeUI(appState);
```

## Only one UI layer is visible at a time

Mutual exclusion enforced by `panels.isPanelOpen`:

1. **Setup flow** — full screen, appState='setup'
2. **Compact strip** — 56px, appState ∈ {checking, ready, processing, success, error}
3. **Confirm dialog** — 320×220, appState='confirming'
4. **Panel overlay** — 420×520, panels.activePanel ∈ {logs, inspector, setup}

When opening a panel from a menu, **do not resize to compact first** — the panel handles its own resize. Double resize (shrink → expand) causes visual flicker.

## State variables must be read in JSX

Every `useState` variable must appear in at least one JSX conditional or prop.
`const [, setSomething] = useState(...)` (destructured to discard the value) is dead code — the setter runs but nothing renders.

**If you're building a feature incrementally**, add a TODO comment on the state variable pointing to the render location where it will be consumed. If it's not consumed within the same PR, remove it.

## Timers must be cancellable by user action

Any `setTimeout` / `setInterval` that changes state (e.g., auto-advance in onboarding, auto-dismiss success) must be stored in a ref and cleared when the user takes manual action:

```tsx
// In the manual navigation handler:
if (timerRef.current) {
  clearTimeout(timerRef.current);
  timerRef.current = null;
}
```

Otherwise fast user clicks can race with the timer and produce unexpected state transitions.

## Relay is disabled during confirming and processing

Relay polling is disabled when `appState ∈ {setup, processing, confirming}` to prevent data arrival during user decisions. But relay IS active during panel overlays (logs, inspector). This means:

- Data can arrive while a panel is open → appState changes to 'confirming'
- The confirm dialog won't render until the panel is closed (`!panels.isPanelOpen` guard)
- When panel closes, it must resize to the **current** appState size (confirming=standard), not the saved one (ready=compact)

## Confetti lifecycle

- `isFirstRun` controls whether confetti animation plays on success
- `isFirstRun` must NOT be set to `false` until **after** the first successful import (when `onDone` fires)
- Setting `isFirstRun=false` during data receipt or setup completion kills the confetti feature
- `confettiActive` is always set to `true` on success; the `Confetti` component handles the `isFirstRun` check internally and calls `onComplete` immediately if no animation needed

## Accessibility invariants

- All modal-like containers (confirm dialog, panel overlays) must have `role="dialog"` and `aria-modal="true"`
- All buttons must have either visible text or `aria-label`
- Modal dialogs must trap focus (Tab/Shift+Tab cycle within the dialog)
- Dropdown menus must support Arrow Up/Down keyboard navigation
