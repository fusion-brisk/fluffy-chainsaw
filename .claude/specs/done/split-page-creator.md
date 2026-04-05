# Spec: Split page-creator.ts into Modules

**Status:** in-progress
**Target:** `packages/plugin/src/sandbox/page-builder/page-creator.ts` (2753 LOC → ~530 LOC)

## Goal

Pure structural refactor — extract 5 new modules from the god file. No behavior changes.

## Phase 0: Duplicate Elimination

### 0a. Remove `detectSnippetType` duplicate (lines 463–482)

The function in page-creator.ts is a **subset** of the one in structure-builder.ts (missing `Organic_withOfferInfo` case). Delete from page-creator.ts and import:

```ts
import { detectSnippetType } from './structure-builder';
```

Used only in `createPageFromRows` (line 497).

### 0b. Extract shared `findFillableLayer` to utils

Two different implementations exist:

- **page-creator.ts:1640** — more sophisticated (skips "White BG", checks min dimensions 20x20, has `#OrganicImage` priority)
- **wizard-processor.ts:244** — simpler (finds first non-TEXT node with fills)

These serve **different purposes** — page-creator's version is for image grid thumbnails, wizard-processor's is for favicon placeholders. **Keep both in place** — they are NOT true duplicates. No shared utility needed.

> Correction from original plan: the two `findFillableLayer` functions have different signatures (`SceneNode` vs `BaseNode`) and different logic. Extracting a shared one would require a compatibility shim that adds complexity for no gain.

## Phase 1: Extract `fill-utils.ts` (~97 LOC)

**Functions:**

- `applyFillVariable` (lines 127–164)
- `applyFillStyle` (lines 174–190)
- `applyFill` (lines 201–220)

**Imports needed:**

- `Logger` from `../../logger`
- `VARIABLE_KEYS`, `PAINT_STYLE_KEYS` from `./component-map`

**Exports:** `applyFillVariable`, `applyFillStyle`, `applyFill`

**Consumers:** panel-builders.ts (createAsideFiltersPanel), page-creator.ts (createSerpPage)

**No circular deps:** fill-utils → component-map (constants only)

## Phase 2: Extract `component-import.ts` (~70 LOC)

**Functions + state:**

- `const componentCache = new Map<string, ComponentNode>()` (line 86)
- `clearComponentCache` (lines 91–93) — **exported**
- `importComponent` (lines 98–119)
- `createPlaceholder` (lines 56–80)

**Imports needed:**

- `Logger` from `../../logger`

**Exports:** `clearComponentCache`, `importComponent`, `createPlaceholder`

**Consumers:** instance-factory.ts, panel-builders.ts, page-creator.ts (createSerpPage for Header/Footer)

**No circular deps:** component-import has no local deps

## Phase 3: Extract `instance-factory.ts` (~144 LOC)

**Functions:**

- `createInstanceForElement` (lines 225–269) — used only by legacy `createPageFromStructure`
- `applyDataToInstance` (lines 274–309) — used by legacy path
- `createGroupWithChildren` (lines 314–365) — used by legacy path

**Imports needed:**

- `Logger` from `../../logger`
- `getComponentConfig` from `./component-map`
- `importComponent`, `createPlaceholder` from `./component-import`
- `buildInstanceCache` from `../../utils/instance-cache`
- `handlerRegistry` from `../handlers/registry`
- Types: `PageElement`, `SnippetType` from `./types`, `HandlerContext` from `../handlers/types`

**Exports:** `createInstanceForElement`, `applyDataToInstance`, `createGroupWithChildren`

**Consumers:** page-creator.ts (`createPageFromStructure`)

**No circular deps:** instance-factory → component-import, component-map

## Phase 4: Extract `image-operations.ts` (~388 LOC)

**Functions:**

- `preloadInstanceFonts` (lines 601–617)
- `findImageLayer` (lines 622–639)
- `findLayerByPartialName` (lines 644–657)
- `findLayerRecursive` (lines 659–668)
- `loadAndApplyImage` (lines 673–732)
- `applySnippetImages` (lines 738–813)
- `applyFavicon` (lines 818–918)
- `applyQuoteAvatar` (lines 923–985)

**Imports needed:**

- `Logger` from `../../logger`

**Exports:** `preloadInstanceFonts`, `applySnippetImages`, `applyFavicon`, `applyQuoteAvatar`, `loadAndApplyImage`, `findImageLayer`, `findFillableLayer` (the page-creator version, for use in panel-builders)

Also move `findFillableLayer` (lines 1640–1665) and `ImageGridItem` interface here — it's used only by `createImagesGridPanel` which will import it.

**Consumers:** panel-builders.ts (`createSnippetInstance` via page-creator.ts, `createImagesGridPanel`)

**No circular deps:** image-operations has no local deps (only Logger + Figma API)

## Phase 5: Extract `panel-builders.ts` (~690 LOC)

**Functions:**

- `createEQuickFiltersPanel` (lines 1103–1242)
- `applyDefaultBooleans` (lines 1249–1269)
- `createAsideFiltersPanel` (lines 1274–1620)
- `createImagesGridPanel` (lines 1677–1818) + `ImageGridItem` interface (lines 1667–1672)
- `createContainerFrame` (lines 544–595)

**Imports needed:**

- `Logger` from `../../logger`
- `findTextNode`, `findFirstNodeByName` from `../../utils/node-search`
- `FILTER_COMPONENTS`, `ASIDE_FILTER_COMPONENTS`, `VARIABLE_KEYS`, `ETHUMB_CONFIG`, `LAYOUT_COMPONENT_MAP`, `getContainerConfig` from `./component-map`
- `importComponent` from `./component-import`
- `applyFill`, `applyFillStyle` from `./fill-utils`
- `loadAndApplyImage`, `findFillableLayer`, `findImageLayer` from `./image-operations`
- Types: `StructureNode`, `ContainerType`, `ContainerConfig` from `./types`

**Exports:** `createEQuickFiltersPanel`, `createAsideFiltersPanel`, `createImagesGridPanel`, `applyDefaultBooleans`, `createContainerFrame`

**Consumers:** page-creator.ts (`renderStructureNode`)

**No circular deps:** panel-builders → component-import, fill-utils, image-operations, component-map

## Phase 6: Slim down `page-creator.ts` (~530 LOC)

**Remains in page-creator.ts:**

- `DEFAULT_OPTIONS` constant
- `createSnippetInstance` (~108 LOC) — uses importComponent, preloadInstanceFonts, applySnippetImages, applyFavicon, applyQuoteAvatar
- `renderStructureNode` (~392 LOC) — the recursive dispatcher
- `createPageFromStructure` (exported, ~90 LOC) — legacy path
- `createPageFromRows` (exported, ~48 LOC) — legacy path
- `createSerpPage` (exported, ~486 LOC) — main entry
- `validateComponentKeys` (exported, ~24 LOC)

**New imports:**

```ts
import { importComponent, createPlaceholder, clearComponentCache } from './component-import';
import { applyFill, applyFillStyle } from './fill-utils';
import {
  createInstanceForElement,
  applyDataToInstance,
  createGroupWithChildren,
} from './instance-factory';
import {
  preloadInstanceFonts,
  applySnippetImages,
  applyFavicon,
  applyQuoteAvatar,
} from './image-operations';
import {
  createEQuickFiltersPanel,
  createAsideFiltersPanel,
  createImagesGridPanel,
  createContainerFrame,
} from './panel-builders';
import { detectSnippetType } from './structure-builder';
```

**Re-exports `clearComponentCache`** from component-import.

## Phase 7: Update `index.ts`

Keep ALL existing exports intact. Only change import paths:

```ts
// Page creation (updated: clearComponentCache moved to component-import)
export {
  createPageFromStructure,
  createPageFromRows,
  createSerpPage,
  validateComponentKeys,
} from './page-creator';

export { clearComponentCache } from './component-import';
```

No other exports change. Internal modules are not re-exported from index.ts.

## Dependency Graph (no cycles)

```
component-map (constants only, no deps)
     ↑
fill-utils ← component-map
     ↑
component-import (no local deps)
     ↑
instance-factory ← component-import, component-map
     ↑
image-operations (no local deps, only Logger)
     ↑
panel-builders ← component-import, fill-utils, image-operations, component-map
     ↑
page-creator ← ALL above + instance-factory, structure-builder
```

All arrows point upward (imports from lower-level modules). No cycles.

## Execution Order

1. Create `fill-utils.ts` → verify
2. Create `component-import.ts` → verify
3. Create `instance-factory.ts` → verify
4. Create `image-operations.ts` (including `findFillableLayer` + `ImageGridItem`) → verify
5. Create `panel-builders.ts` → verify
6. Slim down `page-creator.ts` (update imports, remove extracted code) → verify
7. Update `index.ts` → verify
8. Final: `npm run verify` (typecheck + lint + test + build)

## Verification at each step

```bash
npm run typecheck -w packages/plugin
npm run build
npm run test
```

## Constraints

- ES5 sandbox: no `?.`, `??`, `Promise.allSettled`, `Object.fromEntries`, `Array.flat`
- Logger only (no console.log)
- Keep all 5 public exports from index.ts
- No behavior changes

## Expected Result

```
page-builder/
├── component-import.ts    ~70 LOC   (new)
├── component-map.ts       727 LOC   (unchanged)
├── fill-utils.ts          ~97 LOC   (new)
├── image-operations.ts    ~400 LOC  (new, includes findFillableLayer + ImageGridItem)
├── index.ts               ~55 LOC   (updated imports)
├── instance-factory.ts    ~144 LOC  (new)
├── page-creator.ts        ~530 LOC  (from 2753 — −81%)
├── panel-builders.ts      ~690 LOC  (new)
├── structure-builder.ts   (unchanged)
├── structure-parser.ts    (unchanged)
└── types.ts               (unchanged)
```
