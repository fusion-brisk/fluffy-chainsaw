---
globs: packages/plugin/src/sandbox/schema/**
---

# Schema Convention

## Preferred path for new properties

Always use schema `PropertyMapping` before writing a handler.

## PropertyMapping modes

```typescript
// Boolean: set to true if field has a truthy value
{ mode: 'hasValue', field: '#EDeliveryGroup', property: ['withDelivery', 'DELIVERY'] }

// String: direct text mapping
{ mode: 'stringValue', field: '#OrganicTitle', property: ['Title', 'TITLE'] }

// Equals: boolean if field matches a specific value
{ mode: 'equals', field: '#ButtonView', value: 'cart', property: ['withCart'] }

// Compute: pure function from transforms.ts
{ mode: 'compute', field: '#OrganicPrice', compute: formatPrice, property: ['Price'] }
```

## Rules

1. Property names always in array (multiple variants): `['withButton', 'BUTTON']`
2. Compute functions must be pure (no side effects, no Figma API)
3. Compute functions live in `transforms.ts`
4. One schema file per container type
5. Read `docs/EXTENDING.md` §0 for the full process

## Paired text + boolean mapping on the same field

Some Figma components expose **two properties with the same name but different
case and type** to let the designer control both content and visibility
independently:

- `SourceMeta` (TEXT) — the text rendered in the Source-Meta layer
- `sourceMeta` (BOOLEAN) — visibility of that layer

**Wrong**: a single compute that returns the text OR empty string — the
BOOLEAN stays at whatever the default variant uses, so an empty text leaves
the placeholder visible (e.g. «Какой-то текст»).

**Wrong**: a dedicated imperative handler that toggles `.visible` on the text
node — bypasses the schema engine and leaks imperative state.

**Right**: two `PropertyMapping` entries on the same `fieldName`, each
targeting the corresponding property:

```ts
// TEXT content
{
  propertyNames: ['SourceMeta'],      // capital S — TEXT property
  fieldName: '#SourceMeta',
  stringValue: '#SourceMeta',
},
// BOOLEAN visibility
{
  propertyNames: ['sourceMeta'],      // lowercase s — BOOLEAN property
  fieldName: '#SourceMeta',
  hasValue: '#SourceMeta',            // true when non-empty, false otherwise
},
```

**Why separate entries (not combined)**: `trySetProperty` resolves each
`propertyNames` list against the instance's cached property map — names are
matched exactly first, so case-sensitivity is preserved. One entry = one
property target. Don't try to glue them together.

**Applicable to**: any component set that ships a TEXT + BOOLEAN pair for the
same semantic field. Check `scripts/output/library-inventory.md` — **and
verify against runtime `[ContainerType] Доступные свойства: …` logs**, because
inventory files can lag behind designer changes (real case: `sourceMeta`
BOOLEAN was added later and only showed up in live logs, not in the static
inventory).
