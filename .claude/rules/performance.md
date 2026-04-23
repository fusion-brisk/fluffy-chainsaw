# Performance

Rules for keeping import latency under control. Derived from the v3.x perf
session that took SERP import from 49s → 31s on 78 snippets (−37%).

## 1. Measure before optimizing

Never guess where time is spent. Always add timing instrumentation first,
then read real numbers from a real import, then optimize the top contributor.

Minimum viable instrumentation lives on both sides of the pipeline:

**Extension**: stamp `meta.pushedAt = Date.now()` on the `/push` body right
before the fetch.

**Plugin UI**: subtract `meta.pushedAt` in `useRelayConnection.peekRelayData`
to get relay RTT (push → peek). Log via an `onTiming` callback that the UI
layer forwards into the Logs panel.

**Plugin sandbox**: emit `[Timing]` log lines from `code.ts`:

- `Sandbox apply started` at entry
- `Sandbox core apply: Xms (N items, images: M in Yms, K cache hits)` after
  `createSerpPage` returns
- `Screenshot placement: Xms`, `Sandbox total (apply→done): Xms`

Once timings exist, **show them to the user** (export Logs → paste in chat).
Don't optimize on hunches — the top timer is almost never what you'd have
guessed.

Concrete win from this session: guessed culprit was "too many Figma API
calls"; real culprit was a failing `exportResultToRelay` blocking the user
for 9 seconds behind an `await` after the frame was already rendered.

## 2. Fire-and-forget for non-user-visible side effects

Anything that runs AFTER the user's result is on screen (diagnostic export,
analytics ping, cache warmup) does not belong behind `await`. The user's
"done" signal should fire as soon as the visible output is ready.

```ts
// WRONG — user waits for the export to fail/timeout (~9s)
await exportResultToRelay(result.frame, query);

// RIGHT — export runs in background, user sees done immediately
exportResultToRelay(result.frame, query).catch((err) => Logger.error('bg export', err));
```

Keep `await` for operations whose output the user consumes (screenshot
placement that gets pasted into the frame, for example).

## 3. Cache by URL / input key in hot paths

For any async op that's called N times with a repeated argument (favicon
fetched per snippet, component import per container, etc), dedup at the
function boundary via a module-level `Map<key, Promise<result>>`.

**Promise-based cache**, not result cache: concurrent callers racing on the
same key share one in-flight request instead of each firing its own.

```ts
const imageHashCache = new Map<string, Promise<string | null>>();

function fetchImageHashForUrl(url: string): Promise<string | null> {
  const cached = imageHashCache.get(url);
  if (cached) return cached; // shared promise, no extra fetch
  const promise = doActualFetch(url);
  imageHashCache.set(url, promise);
  return promise;
}
```

Concrete win: 259 image fetches on a 78-snippet SERP became 259 − 135 =
124 actual network requests (favicons repeated across snippets). Saved ~9s.

**Reset per apply**, not persist: Figma may GC images referenced only by
deleted frames; a cross-import hash cache risks applying a hash Figma no
longer has. Call `resetImageCache()` at the top of `apply-relay-payload`.

## 4. Stale-ref guards in Figma instance caches

After a variant swap on a parent instance, previously cached sublayer
references silently become invalid. Reading `.componentProperties`,
`.children`, or `.name` on them throws `"The node (instance sublayer or
table cell) with id X does not exist"`.

Exceptions in the hot path are expensive (throw + stack unwind +
registry-level catch + log) and pollute logs. A cheap `.removed` guard
eliminates the class entirely.

**Required guards:**

```ts
// utils/instance-cache.ts
export function getCachedInstance(cache, name) {
  const instance = cache.instances.get(name);
  if (!instance) return null;
  try {
    if (instance.removed) {
      cache.instances.delete(name);
      return null;
    }
  } catch {
    cache.instances.delete(name);
    return null;
  }
  return instance;
}

// utils/component-cache.ts — getOrBuildPropertyCache
try {
  if ((instance as SceneNode).removed) return null;
  instanceId = instance.id;
} catch {
  return null;
}

try {
  componentProperties = instance.componentProperties;
} catch {
  return null;
}
```

Concrete win: eliminated ~45 `[LabelDiscountView] Error: … does not exist`
logs per import, plus the throw/catch overhead on each.

## 5. No hidden diagnostic layers on canvas

Do not create invisible Figma frames/nodes as a side channel for diagnostic
output. Use `Logger.info` + `figma.ui.postMessage({ type: 'debug-report' })`
instead. Every `figma.createFrame()` costs time and clutters the file.

Red flags to audit periodically:

- `figma.createFrame()` followed by `.visible = false`
- Node names like `__contentify_debug__`, `__log__`, `DebugInfo`
- `pageFrame.appendChild(debugFrame)` where `debugFrame` has no semantic
  meaning for the user

Concrete win: removing a legacy `__contentify_debug__` frame with 10–20
child 1×1 frames saved ~100–300ms per import.

## 6. Progress narrative, not progress counter

UI feedback during long operations: show **named phases with verbs**, not a
bare percentage. Users tolerate a 30-second wait when they see forward
motion; they panic at a bar frozen at 10%.

Required narrative for SERP import:

1. `5% "Подготовка импорта…"` — set in UI on confirm click (< 16ms feedback)
2. `10% "Разбор структуры: N сниппетов…"` — sandbox apply-start
3. `25%…90% "Размещаем K/M…"` — granular per-element, emitted inside the
   render loop
4. `95% "Размещаем скриншот…"` — after `createSerpPage` returns
5. `100% "Готово!"` — after screenshot placement

Implementation:

- `ProgressData.message` field in `types.ts`
- `CompactStrip` `processingMessage` prop — prefer over "X из Y" counter
- `code.ts` sends checkpoint messages at phase boundaries
- Render loops (e.g. `page-creator.ts:1255`) emit `{current: pct, message:
'Размещаем N/M…'}` every iteration

## 7. Don't batch, but don't over-log either

`Logger.info` in a hot inner loop (per snippet, per image, per property)
accumulates IPC cost. One `info` per handler × 78 snippets × 3 handlers =
234 postMessage calls.

Rule: only the **summary** per container goes at SUMMARY level. Every field
set, every variant probe, every "property not found" diagnostic goes to
`Logger.debug`. Debug level is off in production logs and only shown when
the user has opened the Logs panel in dev mode.

Concrete win: downgrading `[OldPrice] …` (5 lines per discount snippet) and
property-search diagnostics from `info` to `debug` saved ~1s of IPC +
rendering time.

## 8. Verify build before claiming speedup

Always run a full import after perf changes and compare before/after
timings. A change that "should" be faster sometimes isn't — measure.

Checklist:

- [ ] Rebuild: `npm run build -w packages/extension && npm run build -w packages/plugin`
- [ ] Reload extension in Chrome (chrome://extensions → ⟳)
- [ ] Reopen plugin in Figma
- [ ] Run import on a reference query (e.g. "диван купить" — ~76 snippets)
- [ ] Save Logs export, compare `Sandbox total` line with previous session
