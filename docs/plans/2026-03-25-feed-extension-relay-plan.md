# Feed Pipeline: Extension + Relay Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect feed DOM parser (extension) → relay server → plugin UI, so feed cards flow from ya.ru into Figma alongside existing SERP pipeline.

**Architecture:** Extension detects page type (SERP vs feed), parses accordingly, sends to relay with `sourceType` flag. Relay queues agnostically. Plugin UI routes to `apply-feed-payload` handler.

**Tech Stack:** TypeScript (extension: Chrome APIs, relay: Express/Node, plugin UI: React)

**Prereqs:** Plugin-side feed pipeline already implemented (Tasks 1-7 from previous plan).

---

### Task 1: Relay — Add sourceType to Payload Types

**Files:**
- Modify: `packages/relay/src/types.ts`
- Modify: `packages/relay/src/routes/push.ts`

**Step 1: Read current types**

Read `packages/relay/src/types.ts` to understand `QueueEntryPayload` and `WsNewDataMessage`.

**Step 2: Extend QueueEntryPayload**

Add to `QueueEntryPayload`:
```typescript
/** 'serp' (default) or 'feed' — determines plugin handler routing */
sourceType?: 'serp' | 'feed';

/** Feed card rows (when sourceType='feed'). Parallel to rawRows for SERP. */
feedCards?: Array<Record<string, string>>;
```

**Step 3: Extend WsNewDataMessage**

Add to WebSocket broadcast message:
```typescript
sourceType?: 'serp' | 'feed';
feedCardCount?: number;
```

**Step 4: Update push.ts logging**

In POST /push handler, update the log line to show sourceType:
```typescript
const sourceType = payload.sourceType || 'serp';
const itemCount = sourceType === 'feed'
  ? (payload.feedCards || []).length
  : (payload.rawRows || []).length;
Logger.info(`[Push] ${sourceType}: ${itemCount} items`);
```

**Step 5: Update WebSocket broadcast**

Add sourceType + feedCardCount to the broadcast message.

**Step 6: Test manually**

```bash
curl -X POST http://localhost:3847/push \
  -H "Content-Type: application/json" \
  -d '{"payload":{"sourceType":"feed","feedCards":[{"#Feed_CardType":"market","#Feed_CardSize":"m","#Feed_Platform":"desktop","#Feed_Index":"0","#Feed_Title":"Test","#Feed_Price":"999"}],"schemaVersion":3,"source":{"url":"https://ya.ru"}},"meta":{"extensionVersion":"2.5.0"}}'
```

Expected: 200 OK, WebSocket broadcasts `{ type: 'new-data', sourceType: 'feed', feedCardCount: 1 }`.

**Step 7: Commit**

```
git commit -m "feat(relay): add sourceType and feedCards to payload types"
```

---

### Task 2: Extension — Integrate Feed Parser

**Files:**
- Create: `packages/extension/src/feed-parser.ts` (copy from Downloads, adapt)
- Modify: `packages/extension/src/content.ts` (add feed detection + parsing)

**Step 1: Copy feed-parser.ts**

Copy `/Users/shchuchkin/Downloads/files 6/feed-parser.ts` to `packages/extension/src/feed-parser.ts`.

Note: The parser file imports types from `./feed-card-types`. Since the canonical types live in the plugin package and the extension doesn't share types, **duplicate the needed type definitions** at the top of feed-parser.ts (just `FeedCardRow`, `FeedCardType`, `FeedCardSize` — minimal interfaces).

**Step 2: Add feed page detection**

In `content.ts`, add a detection function:
```typescript
function isFeedPage(): boolean {
  // ya.ru home feed has masonry layout
  return !!document.querySelector('[class*="masonry-feed--rythm-feed"]');
}
```

**Step 3: Integrate into extraction flow**

In the main extraction logic (where `extractSnippets()` is called), add:
```typescript
if (isFeedPage()) {
  const { extractFeedCards } = await import('./feed-parser');
  const feedCards = extractFeedCards(document);
  // Set result with sourceType: 'feed'
  window.__contentifyResult = {
    sourceType: 'feed',
    feedCards: feedCards,
    // No rawRows, wizards, productCard for feed
  };
  return;
}
// Existing SERP path...
```

**Step 4: Update payload sent to relay**

In the background script where `POST /push` is called, check for feed data:
```typescript
const isFeed = result.sourceType === 'feed';
const payload = {
  sourceType: isFeed ? 'feed' : 'serp',
  rawRows: isFeed ? undefined : result.rows,
  feedCards: isFeed ? result.feedCards : undefined,
  schemaVersion: 3,
  source: { url: tab.url },
};
```

**Step 5: Test in browser**

1. Open `ya.ru` (logged in, shows rhythm feed)
2. Click extension icon
3. Check relay console: should show `[Push] feed: N items`
4. Check plugin: should show confirm dialog

**Step 6: Commit**

```
git commit -m "feat(extension): add feed parser and detection for ya.ru rhythm feed"
```

---

### Task 3: Plugin UI — Route Feed Payload

**Files:**
- Modify: `packages/plugin/src/ui/hooks/useRelayConnection.ts`
- Modify: `packages/plugin/src/ui/hooks/useImportFlow.ts` (if exists)
- Modify: `packages/plugin/src/ui/components/ImportConfirmDialog.tsx`

**Step 1: Read current relay hook**

Read `useRelayConnection.ts` to understand how `peekRelayData()` parses relay response.

**Step 2: Detect feed sourceType in relay hook**

When peeking relay data, check `payload.sourceType`:
```typescript
const sourceType = payload.sourceType || 'serp';
const isFeed = sourceType === 'feed';

return {
  ...existingFields,
  sourceType,
  feedCards: isFeed ? payload.feedCards : undefined,
  rows: isFeed ? undefined : extractRowsFromPayload(payload),
};
```

**Step 3: Update confirm dialog**

In ImportConfirmDialog, show different label for feed:
```typescript
const itemLabel = data.sourceType === 'feed'
  ? `${data.feedCards.length} карточек фида`
  : `${data.rows.length} сниппетов`;
```

**Step 4: Route confirm action to correct handler**

When user clicks "Артборд" (confirm), send different message based on sourceType:
```typescript
if (data.sourceType === 'feed') {
  sendMessageToPlugin({
    type: 'apply-feed-payload',
    payload: {
      cards: data.feedCards,
      platform: data.platform || 'desktop',
    },
  });
} else {
  // Existing SERP path
  sendMessageToPlugin({
    type: 'apply-relay-payload',
    payload: relayPayload,
  });
}
```

**Step 5: Test end-to-end**

1. Send feed data via curl (from Task 1 test)
2. Plugin should show "N карточек фида" in confirm dialog
3. Click "Артборд" → should trigger feed page creation
4. Verify "Feed Page" frame appears in Figma

**Step 6: Commit**

```
git commit -m "feat(plugin-ui): route feed payload to apply-feed-payload handler"
```

---

### Task 4: Extension Manifest — URL Matching (if needed)

**Files:**
- Check: `packages/extension/manifest.json`

**Step 1: Verify ya.ru is in host_permissions**

The manifest should already include `https://*.ya.ru/*`. If not, add it.

**Step 2: Verify content script injection**

Content scripts are injected programmatically via `chrome.scripting.executeScript()` in background.ts. Verify the URL matching logic includes `ya.ru` pages (not just `yandex.ru/search`).

If content script only runs on search result pages, extend the match to include `ya.ru` home feed URLs.

**Step 3: Commit if changed**

```
git commit -m "feat(extension): extend URL matching to include ya.ru feed pages"
```

---

### Task 5: End-to-End Smoke Test

**No code changes — manual verification.**

1. Build all: `npm run build`
2. Load extension in Chrome (chrome://extensions → Load unpacked → `packages/extension/dist`)
3. Start relay: `packages/relay/contentify-relay-host-arm64` (or `npm start` in relay)
4. Open Figma with plugin running
5. Navigate to `ya.ru` in Chrome (logged in, feed visible)
6. Click extension icon
7. Plugin should show "N карточек фида" in confirm dialog
8. Click "Артборд"
9. Verify: "Feed Page" frame with masonry grid of DC Feed library components

**Known limitations for v1:**
- No schema mappings yet (cards appear with default data, not filled)
- No image loading (thumbnails empty)
- Variant selection is deterministic (first in range)
- Only desktop platform tested

---

## Summary

| Task | Package | What |
|------|---------|------|
| 1 | relay | sourceType + feedCards in payload types |
| 2 | extension | Feed parser + page detection |
| 3 | plugin UI | Route feed data to apply-feed-payload |
| 4 | extension | URL matching for ya.ru |
| 5 | all | End-to-end smoke test |

**Dependencies:** Task 1 → Task 2 → Task 3 (sequential). Task 4 is independent. Task 5 is last.
