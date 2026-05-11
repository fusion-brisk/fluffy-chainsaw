/**
 * Unit tests for the extension's phase-timer helper. Imported directly from
 * the extension src (no chrome.* globals are touched at module top level —
 * deliberately split into its own file so it's testable without mocks).
 */

import { describe, expect, it, vi } from 'vitest';
import { makePhaseTimer } from '../../../extension/src/phase-timer';

describe('makePhaseTimer', () => {
  it('records elapsed ms between matched markStart / markEnd', () => {
    let now = 1_000_000;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const t = makePhaseTimer();
      t.markStart('phaseA');
      now += 123;
      t.markEnd('phaseA');
      expect(t.values()).toEqual({ phaseA: 123 });
    } finally {
      spy.mockRestore();
    }
  });

  it('tracks multiple independent phases', () => {
    let now = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const t = makePhaseTimer();
      t.markStart('a');
      now = 10;
      t.markStart('b');
      now = 50;
      t.markEnd('a'); // a took 50ms
      now = 70;
      t.markEnd('b'); // b took 60ms
      expect(t.values()).toEqual({ a: 50, b: 60 });
    } finally {
      spy.mockRestore();
    }
  });

  it('markEnd without prior markStart is a silent no-op', () => {
    const t = makePhaseTimer();
    t.markEnd('orphan');
    expect(t.values()).toEqual({});
  });

  it('returns a fresh snapshot — mutating the result does not affect later calls', () => {
    let now = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const t = makePhaseTimer();
      t.markStart('a');
      now = 30;
      t.markEnd('a');
      const snapshot1 = t.values();
      snapshot1.a = 999; // tamper with returned object
      snapshot1.x = 1;

      // Add a new phase AFTER the snapshot was taken.
      now = 100;
      t.markStart('b');
      now = 150;
      t.markEnd('b');
      const snapshot2 = t.values();

      // First snapshot stays mutated by caller but doesn't leak back into the
      // timer state — second snapshot still has correct values.
      expect(snapshot1).toEqual({ a: 999, x: 1 });
      expect(snapshot2).toEqual({ a: 30, b: 50 });
    } finally {
      spy.mockRestore();
    }
  });

  it('overlapping markStart on the same name overwrites the start anchor', () => {
    // Defensive behavior: if a developer accidentally double-markStart the
    // same phase, the second start wins (later markEnd measures from the
    // newer start). This matches "measure the most recent attempt".
    let now = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const t = makePhaseTimer();
      t.markStart('p');
      now = 10;
      t.markStart('p'); // overwrites
      now = 25;
      t.markEnd('p');
      expect(t.values()).toEqual({ p: 15 });
    } finally {
      spy.mockRestore();
    }
  });
});
