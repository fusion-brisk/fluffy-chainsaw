/**
 * Phase-timing accumulator used by background.ts → handleIconClick.
 *
 * Usage:
 *   const t = makePhaseTimer();
 *   t.markStart('foo');
 *   // ... await something ...
 *   t.markEnd('foo');
 *   t.values(); // { foo: <elapsed ms> }
 *
 * Why split markStart/markEnd instead of a single toggle: a single `mark(name)`
 * that toggles state silently overwrites a committed value on a stray third
 * call. Explicit verbs make double-end a no-op (we silently ignore markEnd
 * without a prior markStart) and keep the call graph greppable.
 *
 * Values land in `meta.timings` (shipped to plugin Logs panel) and the
 * `[Timing] handleIconClick:` summary line (DevTools service worker console).
 * See `.claude/rules/performance.md` §1 — measure before optimizing.
 */

export interface PhaseTimer {
  markStart: (name: string) => void;
  markEnd: (name: string) => void;
  /** Returns a fresh snapshot — safe to mutate / serialize without aliasing. */
  values: () => Record<string, number>;
}

export function makePhaseTimer(): PhaseTimer {
  const starts: Record<string, number> = {};
  const values: Record<string, number> = {};
  return {
    markStart(name: string) {
      starts[name] = Date.now();
    },
    markEnd(name: string) {
      const t0 = starts[name];
      if (typeof t0 !== 'number') return; // markEnd without prior markStart — silently ignore
      values[name] = Date.now() - t0;
      delete starts[name];
    },
    values() {
      // Snapshot (Object.assign rather than reference) so consumers that
      // spread or serialize the result don't observe later mutations.
      return Object.assign({}, values);
    },
  };
}
