# Contentify Validation Agent — Prompt

Use this prompt to start a Claude Code session that validates import results against source data.

---

## Prompt

You are validating Contentify plugin import results. Your job is to find every discrepancy between source data (from Yandex SERP) and the rendered Figma components.

### Available infrastructure

1. **Debug log server** — `http://localhost:3848/debug-log`
   - `GET /debug-log` — all logs (supports `?level=error&source=bridge&limit=100`)
   - `DELETE /debug-log` — clear before new test run

2. **Relay server** — `http://localhost:3847`
   - `GET /source-data` — imported CSV rows (all fields from extension parsing)
   - `GET /source-data?index=N` — single row by index
   - `GET /screenshot` — screenshot metadata (segment count, viewport size)
   - `GET /screenshot?index=N` — individual screenshot segment (JPEG binary)
   - `GET /result` — exported Figma frame metadata
   - `GET /result?index=0` — exported Figma frame (JPEG binary)
   - `GET /comparison` — availability status of all data types
   - `GET /debug` — latest component structure dump from plugin
   - `GET /peek` — raw queue entry (full payload with rawRows, wizards, productCard)

3. **Figma MCP** — `mcp__figma__get_design_context`, `mcp__figma__get_screenshot`, `mcp__figma__get_metadata`
   - Read actual rendered components, their properties, structure, screenshots

4. **Chrome MCP** — browse the source Yandex SERP page if still open
   - `mcp__Claude_in_Chrome__read_page` / `get_page_text` / `find` / `screenshot`

5. **Codebase** — schema definitions, CSV field types, handler logic:
   - `packages/plugin/src/types/csv-fields.ts` — 200+ field definitions
   - `packages/plugin/src/sandbox/schema/` — property mapping schemas
   - `packages/plugin/src/sandbox/handlers/` — imperative handler logic

### Validation procedure

#### Phase 1: Gather data
```bash
# Clear debug log
curl -X DELETE http://localhost:3848/debug-log

# Check what data is available
curl http://localhost:3847/comparison

# Get source rows
curl http://localhost:3847/source-data > /tmp/source-data.json

# Get debug log (after import)
curl http://localhost:3848/debug-log > /tmp/debug-log.json

# Get component dump
curl http://localhost:3847/debug > /tmp/component-dump.json
```

#### Phase 2: Check for errors in debug log
Read `/debug-log?level=error` — any handler errors, bridge failures, timeouts.
Categorize: which containers failed, which handlers, which fields.

#### Phase 3: Field-by-field validation
For each source row from `/source-data`, compare against the rendered Figma component:

**Text fields** — verify these match source exactly:
| Source field | Expected in Figma |
|---|---|
| `#OrganicTitle` | Title text node content |
| `#OrganicText` | Description text content |
| `#OrganicHost` | Host/domain text |
| `#OrganicPath` | URL path breadcrumb |
| `#ShopName` | Shop name label |
| `#OrganicPrice` | Current price text |
| `#OldPrice` | Crossed-out old price |
| `#DiscountPercent` | Discount badge text |
| `#Promo` | Promo label text |
| `#Sitelink_1..4` | Sitelink text items |
| `#EDeliveryGroup-Item-1..3` | Delivery info lines |
| `#EQuote-Text` | Quote/review text |

**Image fields** — verify images are loaded (not placeholder):
| Source field | Expected in Figma |
|---|---|
| `#FaviconImage` | Favicon loaded (not empty rectangle) |
| `#OrganicImage` | Main product image loaded |
| `#ThumbImage` | Thumbnail image loaded |
| `#Image1..3` | Gallery images loaded |
| `#EQuote-AuthorAvatar` | Quote author avatar |

**Boolean/visibility props** — verify component properties match:
| Source field | Figma property |
|---|---|
| `#withPromo` | `withPromo` boolean on component |
| `#withQuotes` | `withQuotes` boolean |
| `#withDelivery` | `withDelivery` boolean |
| `#withThumb` | `withThumb` boolean |
| `#BUTTON` | `withButton`/`BUTTON`/`BUTTONS` |
| `#OfficialShop` | `isOfficial` on EShopName |
| `#EOfferItem_hasButton` | button visibility |
| `#EOfferItem_hasReviews` | reviews visibility |

**Variant props** — verify correct variant selected:
| Source field | Figma variant property |
|---|---|
| `#EPriceGroup_Size` | `Size` variant (m/l/L2) |
| `#ButtonView` | `View` variant on EButton |
| `#ButtonType` | `Type` variant on EButton |
| `#imageType` | Image type handler result |
| `#EPrice_View` | `View` on EPrice |
| `#platform` | `Desktop` variant (True/False) |

#### Phase 4: Layout validation
- Containers should be arranged in a grid, grouped by `#serpItemId`
- Containers with same `#serpItemId` must be adjacent (consecutive)
- Page frame should have correct width (desktop: 1920, touch: varies)
- Wizard elements inserted at correct position relative to organic results

#### Phase 5: Visual comparison
If both screenshot and result are available:
```bash
python3 tools/visual-compare.py
# Outputs to /tmp/contentify-compare/
```
Open comparison images and identify visual discrepancies.

#### Phase 6: Cross-reference with schema
For each error found, check:
1. Is the field defined in the schema? (`src/sandbox/schema/*.ts`)
2. Is there a handler for it? (`src/sandbox/handlers/*.ts`)
3. Is the property name correct? (check `trySetProperty` name variants)
4. Is there a known Figma limitation? (check `esnippet-rendering.md` memory)

### Output format

Produce a structured report:

```
## Validation Report — [query] ([date])

### Summary
- Source rows: N
- Rendered containers: M
- Handler errors: X
- Field mismatches: Y

### Errors by category

#### Missing text
| Row | Field | Expected | Got |
|-----|-------|----------|-----|

#### Missing images
| Row | Field | URL | Status |
|-----|-------|-----|--------|

#### Wrong props
| Row | Prop | Expected | Got |
|-----|------|----------|-----|

#### Layout issues
- [description]

### Root cause analysis
For each error category, identify whether it's:
- Schema gap (field not mapped)
- Handler bug (logic error)
- Figma limitation (API constraint)
- Extension parsing issue (wrong data from DOM)
- Missing field in CSVFields type
```

### Important rules
- Always read CLAUDE.md first for project conventions
- Use `debugLog` to trace specific operations
- Don't modify Yandex frontend code (read-only)
- Test with `npm run build && npm run test` after any code fix
- Copy dist files to main repo after build: `cp packages/plugin/dist/code.js ../../dist/code.js`
