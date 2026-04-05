# Feed Pipeline Design (Plugin Side)

**Date:** 2026-03-25
**Scope:** Plugin types, component key resolution, variant selectors, masonry page builder, schemas
**Out of scope:** Extension parser integration, relay protocol changes (later session)

## Overview

Parallel pipeline alongside SERP for ya.ru rhythm feed (masonry card grid).
Data flow: `FeedCardRow[]` → variant selector → Figma component instances → masonry layout.

DC Feed library file: `0dr1G4gFr6q8enaEOR1YUW`

## Approach

Option A: extend existing page builder. New message type `apply-feed-payload` in `code.ts`, new `feed-page-builder/` directory parallel to `page-builder/`. Reuse handler registry, instance cache, image loader, progress messages.

## Types

`packages/plugin/src/types/feed-card-types.ts` — already written.

- `FeedCardRow` = `FeedCardFields` (no index signature, same rule as CSVFields)
- `FeedCardType`: post | video | market | advert | product | collection
- `FeedCardSize`: xs | s | m | ml | l | xl
- `FeedPlatform`: desktop | mobile
- All fields `#Feed_` prefixed to distinguish from SERP `#Organic`, `#EPrice` etc.

## Message Protocol

```
UI → Code:  { type: 'apply-feed-payload', payload: { cards: FeedCardRow[], platform: FeedPlatform } }
Code → UI:  reuse existing progress/stats/done/error messages
```

For now: test with mock data via dev button. Later: relay sends `sourceType: 'feed'`.

## Component Key Resolution

Figma REST API → component keys from DC Feed sections:

| Type        | Section Node ID | Variant Range                                            |
| ----------- | --------------- | -------------------------------------------------------- |
| Posts       | 3086:34741      | 1–18, Platform=Desktop\|Mobile                           |
| Videos      | 3086:34758      | 1–5, Platform=Desktop\|Mobile                            |
| Collections | 3086:34767      | 1–4, Platform=Desktop\|Mobile                            |
| Market      | 3453:87507      | 1–8, Platform=Desktop\|Mobile                            |
| Ads Prod    | 3086:34824      | 1–6, Platform=Desktop\|Mobile                            |
| Ads Ex      | 5868:71590      | 1–9, Platform=Desktop\|Mobile                            |
| Products    | 5618:44663      | 1–21, Type=Independent\|Market, Platform=Desktop\|Mobile |

Result: `FEED_COMPONENT_MAP` — `Record<FeedCardType, { variants, select }>`.

## Variant Selector Logic

Each card type gets a `VariantSelector` function based on `FeedCardSize` + content flags:

- **market**: xs → 1-2, m → 3-6, xl → 7-8
- **post**: carousel count + product count → variant from 1–18 range
- **video**: size → variant from 1–5
- **advert**: production (1-6) vs examples (7-15), based on `#Feed_AdStyle`
- **product**: independent vs market sub-type × size
- **collection**: size → variant from 1–4

Selector returns `FeedComponentVariant` with `key` for `importComponentByKeyAsync`.

## Feed Page Builder

New directory: `packages/plugin/src/sandbox/feed-page-builder/`

```
feed-page-builder/
├── feed-component-map.ts      — FEED_COMPONENT_MAP + variant selectors
├── feed-structure-builder.ts  — FeedCardRow[] → FeedPageStructure (ordered, variant-resolved)
├── feed-page-creator.ts       — structure → Figma instances + schema apply
└── feed-masonry-layout.ts     — masonry column assignment + positioning
```

### Masonry Algorithm (greedy shortest-column)

1. Init N column height trackers (5 desktop, 2 mobile)
2. For each card: assign to shortest column
3. Position: `x = col * (columnWidth + gap)`, `y = columnHeights[col]`
4. Advance: `columnHeights[col] += instance.height + gap`
5. Wrap all in parent frame: `feedWidth × max(columnHeights)`

Config from `DEFAULT_MASONRY_CONFIG`:

- Desktop: 5 cols × 250px, 16px gap, total 1314px
- Mobile: 2 cols × 200px, 8px gap, total 408px

### Page Creation Flow

1. Parse `FeedCardRow[]` → `FeedPageStructure` (resolve variant keys)
2. For each card: `importComponentByKeyAsync(key)` → `createInstance()`
3. Build instance cache, apply schema mappings (title, price, source, flags)
4. Load images (thumbnail, avatar, carousel slots)
5. Measure instance heights
6. Run masonry layout — position all instances
7. Wrap in parent frame

## Schema Mappings

New files in `packages/plugin/src/sandbox/schema/`:

```
schema/
├── feed-post.ts        — Post card property mappings
├── feed-market.ts      — Market card property mappings
├── feed-video.ts       — Video card property mappings
├── feed-advert.ts      — Advert card property mappings
└── feed-transforms.ts  — Pure compute functions for feed data
```

Same `PropertyMapping` modes as SERP. Exact property names resolved after inspecting Figma component definitions.

Example mappings:

```typescript
{ mode: 'stringValue', field: '#Feed_Title', property: ['Title', 'TITLE'] }
{ mode: 'stringValue', field: '#Feed_Price', property: ['Value', 'PRICE'] }
{ mode: 'hasValue',    field: '#Feed_Discount', property: ['withDiscount', 'Pay'] }
{ mode: 'hasValue',    field: '#Feed_HasVideo', property: ['withVideo'] }
```

## Image Loading

Reuse existing `loadAndApplyImages()`. Feed image fields:

- `#Feed_ImageUrl` → card thumbnail (Img layer)
- `#Feed_SourceAvatarUrl` → source icon (Source Feed / Icon)
- `#Feed_CarouselImages` (JSON array) → carousel image slots

## Testing

- `tests/feed/variant-selector.test.ts` — variant selection logic per card type
- `tests/feed/masonry-layout.test.ts` — column assignment, positioning
- `tests/feed/feed-schema.test.ts` — property mapping for each card type
- Mock fixtures: 28-card dataset from spec analysis
