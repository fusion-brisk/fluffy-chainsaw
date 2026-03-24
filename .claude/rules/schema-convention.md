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
