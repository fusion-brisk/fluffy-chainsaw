# Stale Build Detection & Safe Auto-Reload

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect when the running plugin code is older than the latest build, and auto-close the plugin with a toast after import completes — guaranteeing all async operations finish first.

**Architecture:** Rollup injects a build hash at compile time. Relay exposes `GET /build-hash` by reading the hash from `dist/code.js`. Plugin UI polls this endpoint and sets a `buildStale` flag. After import, sandbox sends `all-operations-complete` (after all awaits), and UI closes the plugin if stale.

**Tech Stack:** Rollup replace plugin, Express route, React hook, Figma postMessage protocol.

---

## Task 1: Inject BUILD_HASH at build time

**Files:**

- Modify: `packages/plugin/rollup.config.mjs`
- Modify: `packages/plugin/src/config.ts:14` (near PLUGIN_VERSION)

**Step 1: Add BUILD_HASH placeholder to config.ts**

Add after line 14 (`PLUGIN_VERSION`):

```typescript
// Build hash — injected by Rollup at build time. Used for stale-build detection.
// Format: "<short-git-hash>-<timestamp>"
export const BUILD_HASH = '__BUILD_HASH__';
```

**Step 2: Add @rollup/plugin-replace to rollup config**

In `rollup.config.mjs`, add the import and plugin to BOTH bundles (code + UI share the same config.ts):

```javascript
import replace from '@rollup/plugin-replace';
import { execFileSync } from 'child_process';

function buildHash() {
  const gitHash = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
  return `${gitHash}-${Date.now()}`;
}
```

Add `replace({ preventAssignment: true, __BUILD_HASH__: JSON.stringify(buildHash()) })` as the FIRST plugin in both bundles' `plugins` arrays.

**Step 3: Install the dependency**

Run: `npm install -D @rollup/plugin-replace -w packages/plugin`

**Step 4: Verify**

Run: `npm run build -w packages/plugin`
Then: `grep 'BUILD_HASH' packages/plugin/dist/code.js | head -3`
Expected: the literal hash string (e.g., `"a8a200a-1743782400000"`), NOT `__BUILD_HASH__`

**Step 5: Commit**

```bash
git add packages/plugin/rollup.config.mjs packages/plugin/src/config.ts packages/plugin/package.json package-lock.json
git commit -m "feat: inject BUILD_HASH at build time via Rollup replace plugin"
```

---

## Task 2: Relay endpoint GET /build-hash

**Files:**

- Create: `packages/relay/src/routes/build-hash.ts`
- Modify: `packages/relay/src/index.ts` (register route)

**Step 1: Create the route**

```typescript
// packages/relay/src/routes/build-hash.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import { openSync, readSync, closeSync, statSync } from 'fs';
import { resolve } from 'path';

const router = Router();

// Path to plugin dist — relay and plugin are siblings in the monorepo
const CODE_JS_PATH = resolve(__dirname, '../../plugin/dist/code.js');

// Regex to extract the hash from the bundled code
// Rollup replace turns: export const BUILD_HASH = '__BUILD_HASH__'
// into: var BUILD_HASH = "a8a200a-1743782400000"
const HASH_RE = /BUILD_HASH\s*=\s*["']([^"']+)["']/;

/** GET /build-hash */
router.get('/build-hash', (_req: Request, res: Response) => {
  try {
    // Read first 4KB — hash is near the top of the IIFE
    const fd = openSync(CODE_JS_PATH, 'r');
    const buf = Buffer.alloc(4096);
    readSync(fd, buf, 0, 4096, 0);
    closeSync(fd);

    const chunk = buf.toString('utf8');
    const match = chunk.match(HASH_RE);

    if (match) {
      res.json({ hash: match[1] });
    } else {
      // Fallback: return mtime as hash (works when replace plugin not yet installed)
      const { mtimeMs } = statSync(CODE_JS_PATH);
      res.json({ hash: `mtime-${Math.floor(mtimeMs)}` });
    }
  } catch {
    res.status(404).json({ error: 'dist/code.js not found' });
  }
});

export default router;
```

**NOTE on path resolution:** `__dirname` in the compiled relay (`dist/`) is `packages/relay/dist/`. So `../../plugin/dist/code.js` resolves to `packages/plugin/dist/code.js`. If relay runs from a different location (e.g., installed binary), this path won't exist — the 404 fallback handles that gracefully.

**Step 2: Register in index.ts**

Add import after other route imports (~line 13):

```typescript
import buildHashRoutes from './routes/build-hash';
```

Add `app.use(buildHashRoutes);` alongside other route registrations (after `app.use(healthRoutes)`).

**Step 3: Build and verify**

Run: `npm run build -w packages/relay`
Then: `curl http://localhost:3847/build-hash` (with relay running)
Expected: `{"hash":"a8a200a-1743782400000"}` or `{"error":"dist/code.js not found"}`

**Step 4: Commit**

```bash
git add packages/relay/src/routes/build-hash.ts packages/relay/src/index.ts
git commit -m "feat: relay GET /build-hash endpoint reads hash from plugin dist"
```

---

## Task 3: UI hook useBuildCheck

**Files:**

- Create: `packages/plugin/src/ui/hooks/useBuildCheck.ts`
- Modify: `packages/plugin/src/ui/hooks/index.ts` (export)

**Step 1: Create the hook**

```typescript
// packages/plugin/src/ui/hooks/useBuildCheck.ts
/**
 * useBuildCheck — polls relay /build-hash to detect stale plugin builds.
 *
 * Compares the build hash baked into this bundle (BUILD_HASH from config.ts)
 * against the hash relay reads from the latest dist/code.js on disk.
 * If they differ, sets buildStale=true.
 */

import { useEffect, useRef, useState } from 'react';
import { BUILD_HASH } from '../../config';

const POLL_INTERVAL_MS = 10_000;
const FETCH_TIMEOUT_MS = 3000;

export interface UseBuildCheckReturn {
  /** true when relay reports a different hash than the one baked into this bundle */
  buildStale: boolean;
}

export function useBuildCheck(relayUrl: string, enabled: boolean): UseBuildCheckReturn {
  const [buildStale, setBuildStale] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Don't poll if disabled, already stale, or hash is the raw placeholder
    if (!enabled || buildStale || BUILD_HASH === '__BUILD_HASH__') return;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(`${relayUrl}/build-hash`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return;
        const data = await res.json();
        if (data.hash && data.hash !== BUILD_HASH) {
          setBuildStale(true);
        }
      } catch {
        // Relay unavailable — silently ignore
      }
    };

    // Initial check after short delay (let relay settle)
    const initialTimeout = setTimeout(check, 2000);
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [relayUrl, enabled, buildStale]);

  return { buildStale };
}
```

**Step 2: Export from index.ts**

Add to `packages/plugin/src/ui/hooks/index.ts`:

```typescript
export { useBuildCheck } from './useBuildCheck';
export type { UseBuildCheckReturn } from './useBuildCheck';
```

**Step 3: Verify typecheck**

Run: `npm run typecheck -w packages/plugin`
Expected: no new errors from useBuildCheck.ts

**Step 4: Commit**

```bash
git add packages/plugin/src/ui/hooks/useBuildCheck.ts packages/plugin/src/ui/hooks/index.ts
git commit -m "feat: useBuildCheck hook polls relay for stale build detection"
```

---

## Task 4: Fix fire-and-forget + add all-operations-complete message

**Files:**

- Modify: `packages/plugin/src/sandbox/code.ts:425-468` (SERP handler)
- Modify: `packages/plugin/src/sandbox/code.ts:533-542` (Feed handler)
- Modify: `packages/plugin/src/types.ts:202` (CodeMessage union)

**Step 1: Add message type to CodeMessage union**

In `packages/plugin/src/types.ts`, add to the `CodeMessage` union after the `relay-payload-applied` entry (~line 221):

```typescript
  | { type: 'all-operations-complete' }
```

**Step 2: Fix SERP handler — await fire-and-forget, send completion**

In `packages/plugin/src/sandbox/code.ts`, replace lines 425-468 (the success block inside `apply-relay-payload`) with:

```typescript
        if (result.success && result.frame) {
          figma.currentPage.selection = [result.frame];
          figma.viewport.scrollAndZoomIntoView([result.frame]);

          const count = result.createdCount || rows.length;

          figma.ui.postMessage({
            type: 'relay-payload-applied',
            success: true,
            itemCount: count,
            frameName: result.frame.name,
          });

          Logger.info(`✅ SERP "${result.frame.name}": ${count} сниппетов`);

          // Render ProductCard sidebar if present
          if (payload.productCard) {
            try {
              const sidebarFrame = await renderProductCardSidebar(payload.productCard, platform);
              if (sidebarFrame) {
                result.frame.appendChild(sidebarFrame);
                sidebarFrame.layoutPositioning = 'ABSOLUTE';
                sidebarFrame.x = result.frame.width - sidebarFrame.width;
                sidebarFrame.y = 0;

                figma.currentPage.selection = [result.frame];
                figma.viewport.scrollAndZoomIntoView([result.frame]);
              } else {
                Logger.error('[ProductCard] render returned null');
              }
            } catch (pcErr) {
              Logger.error('[ProductCard] render failed:', pcErr);
            }
          }

          // Await secondary operations (were fire-and-forget before)
          try {
            await placeScreenshotSegments(result.frame, query);
          } catch (err) {
            Logger.error('Screenshot placement failed:', err);
          }

          try {
            await exportResultToRelay(result.frame, query);
          } catch (err) {
            Logger.error('Result export failed:', err);
          }

          // Signal that ALL async work is done — safe to close plugin
          figma.ui.postMessage({ type: 'all-operations-complete' });
```

Key changes vs current code:

1. `placeScreenshotSegments` and `exportResultToRelay` are now `await`ed (were `.catch()` fire-and-forget)
2. ProductCard sidebar moved BEFORE screenshot/export (it modifies the frame, so export should capture it)
3. New `all-operations-complete` message sent after everything

**Step 3: Fix Feed handler — add completion message**

In the feed handler success block (after `relay-payload-applied` is sent, ~line 546), add before the closing `}`:

```typescript
// No secondary async operations for feed — signal immediately
figma.ui.postMessage({ type: 'all-operations-complete' });
```

**Step 4: Verify build**

Run: `npm run build -w packages/plugin`
Expected: clean build

**Step 5: Commit**

```bash
git add packages/plugin/src/sandbox/code.ts packages/plugin/src/types.ts
git commit -m "fix: await fire-and-forget ops, add all-operations-complete message"
```

---

## Task 5: Handle all-operations-complete + stale close in UI

**Files:**

- Modify: `packages/plugin/src/ui/hooks/usePluginMessages.ts` (add handler + callback)
- Modify: `packages/plugin/src/ui/ui.tsx` (wire useBuildCheck + close logic)
- Modify: `packages/plugin/src/sandbox/code.ts` (close-plugin handler)
- Modify: `packages/plugin/src/types.ts` (UIMessage union)

**Step 1: Add handler to usePluginMessages**

In `packages/plugin/src/ui/hooks/usePluginMessages.ts`:

Add to `PluginMessageHandlers` interface (~line 55):

```typescript
  // All operations complete (safe to close if build is stale)
  onAllOperationsComplete?: () => void;
```

Add case in the switch statement (after `relay-payload-applied` case, ~line 213):

```typescript
        // === ALL OPERATIONS COMPLETE ===
        case 'all-operations-complete':
          if (h.onAllOperationsComplete) {
            h.onAllOperationsComplete();
          }
          break;
```

**Step 2: Add close-plugin message type**

In `packages/plugin/src/types.ts`, add to the `UIMessage` union (find it by searching for existing UI→Code message types):

```typescript
  | { type: 'close-plugin'; message?: string }
```

**Step 3: Add close-plugin handler in sandbox**

In `packages/plugin/src/sandbox/code.ts`, in the `figma.ui.onmessage` handler (inside the try block, before the relay-payload handlers), add:

```typescript
if (msg.type === 'close-plugin') {
  figma.closePlugin(msg.message || 'Plugin closed');
  return;
}
```

**Step 4: Wire useBuildCheck into ui.tsx**

In `packages/plugin/src/ui/ui.tsx`:

Add import:

```typescript
import { useBuildCheck } from './hooks/useBuildCheck';
```

Inside the main component, after `useVersionCheck`:

```typescript
const { buildStale } = useBuildCheck(relayUrl, appState !== 'setup');
```

**Step 5: Add close-on-stale handler in ui.tsx**

In the `usePluginMessages` handlers object, add:

```typescript
onAllOperationsComplete: () => {
  if (buildStale) {
    // Small delay so user sees success state before close
    setTimeout(() => {
      sendMessageToPlugin({ type: 'close-plugin', message: 'Плагин обновлён — откройте заново' });
    }, 1500);
  }
},
```

**Step 6: Verify build + typecheck**

Run: `npm run build -w packages/plugin && npm run typecheck -w packages/plugin`
Expected: no errors

**Step 7: Commit**

```bash
git add packages/plugin/src/ui/hooks/usePluginMessages.ts packages/plugin/src/ui/ui.tsx packages/plugin/src/sandbox/code.ts packages/plugin/src/types.ts
git commit -m "feat: auto-close plugin on stale build after import completes"
```

---

## Task 6: Verify end-to-end + run tests

**Step 1: Run existing tests**

Run: `npm run test`
Expected: all 465+ tests pass (no regressions)

**Step 2: Run full verification**

Run: `npm run verify`
Expected: typecheck + lint + test + build all pass

**Step 3: Fix any lint issues**

Run: `npm run lint -w packages/plugin -- --fix`

**Step 4: Final commit (if lint fixes needed)**

```bash
git add -u
git commit -m "chore: fix lint issues from stale-build-detection"
```

---

## Summary of changes

| Component                    | Change                             | Risk                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rollup.config.mjs`          | Add replace plugin for BUILD_HASH  | Low — build-time only                                                                                                                                                                  |
| `config.ts`                  | New `BUILD_HASH` export            | Low — string constant                                                                                                                                                                  |
| `relay/routes/build-hash.ts` | New GET endpoint                   | Low — read-only, 404 fallback                                                                                                                                                          |
| `relay/index.ts`             | Register route                     | Low — one line                                                                                                                                                                         |
| `ui/hooks/useBuildCheck.ts`  | New polling hook                   | Low — passive, no side effects                                                                                                                                                         |
| `sandbox/code.ts:441-447`    | **Fix**: fire-and-forget → await   | **Medium** — changes timing of screenshot/export. They now block before `all-operations-complete`. If they're slow, the "safe to close" signal is delayed (which is correct behavior). |
| `sandbox/code.ts:449-468`    | Reorder: sidebar before screenshot | **Medium** — export now captures sidebar. This is better behavior.                                                                                                                     |
| `sandbox/code.ts`            | New `close-plugin` handler         | Low — simple `figma.closePlugin()`                                                                                                                                                     |
| `types.ts`                   | Two new message types              | Low — additive                                                                                                                                                                         |
| `usePluginMessages.ts`       | New handler callback               | Low — follows existing pattern                                                                                                                                                         |
| `ui.tsx`                     | Wire hook + close logic            | Low — conditional, behind stale flag                                                                                                                                                   |
