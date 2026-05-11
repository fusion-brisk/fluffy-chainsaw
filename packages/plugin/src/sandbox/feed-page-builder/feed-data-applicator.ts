/**
 * Feed Data Applicator — fills feed card instances with parsed data.
 *
 * Traverses instance subtree, finds named child instances,
 * applies FeedCardRow fields via setProperties().
 *
 * ES5 sandbox: no optional chaining, no nullish coalescing.
 */

import { Logger } from '../../logger';
import { FeedCardRow } from '../../types/feed-card-types';
import { safeSetVisible } from '../handlers/visibility-handlers';
import { fetchAndApplyImage } from '../image-apply';
import { FEED_TILE_KEYS } from './feed-component-map';

// ============================================================================
// CHILD INSTANCE SEARCH
// ============================================================================

/**
 * Find first child INSTANCE with a given name (recursive, depth-limited).
 */
function findChildInstance(node: SceneNode, name: string, maxDepth: number): InstanceNode | null {
  if (maxDepth <= 0) return null;
  if (!('children' in node)) return null;

  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'INSTANCE' && child.name === name) {
      return child;
    }
  }
  // Recurse
  for (let j = 0; j < children.length; j++) {
    const found = findChildInstance(children[j], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Find first child node with a given name (any type, recursive).
 */
function findChildByName(node: SceneNode, name: string, maxDepth: number): SceneNode | null {
  if (maxDepth <= 0) return null;
  if (!('children' in node)) return null;

  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    if (children[i].name === name) return children[i];
  }
  for (let j = 0; j < children.length; j++) {
    const found = findChildByName(children[j], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

/**
 * Locate a Feed Card's swapped Media Tile slot after INSTANCE_SWAP.
 *
 * Two label conventions exist:
 *  - **Legacy** `Feed Card` (74489a31…): the slot wrapper keeps its set name
 *    after a swap, so the layer is named `"Tile / Media Content"`,
 *    `"Tile / Ads"`, etc.
 *  - **Feed Card_0426** (fe5ce5e0…): the slot has no wrapper; Figma labels
 *    the swapped child with the variant identifier directly, e.g.
 *    `"Type=Actions On, Style=Default"` or `"Type=SA, Style=Default"`.
 *
 * Strategy 1 — depth-first search by `Tile /` prefix (legacy).
 * Strategy 2 — fallback to the first direct INSTANCE child of the Feed Card
 *   that isn't part of the source row (Card Source / Source Feed / kebab),
 *   which is always the Media Tile slot in the Feed Card_0426 layout.
 *
 * Direct-child fallback runs only at the top level (the original `instance`
 * argument) — nested searches stay strict so we don't accidentally pick a
 * deep `Type=Carusel` Content Badge instance.
 */
function findFirstTileInSubtree(
  node: SceneNode,
  maxDepth: number,
  topLevel: boolean = true,
): InstanceNode | null {
  // Strategy 1: legacy "Tile /" prefix
  function legacy(n: SceneNode, depth: number): InstanceNode | null {
    if (depth <= 0) return null;
    if (n.type === 'INSTANCE' && n.name.indexOf('Tile /') === 0) {
      return n;
    }
    if (!('children' in n)) return null;
    const ch = (n as ChildrenMixin).children;
    for (let i = 0; i < ch.length; i++) {
      const found = legacy(ch[i], depth - 1);
      if (found) return found;
    }
    return null;
  }
  const legacyHit = legacy(node, maxDepth);
  if (legacyHit) return legacyHit;

  // Strategy 2: Feed Card_0426 — first direct INSTANCE child that's not the
  // source row. We only run this at the top level so nested badges /
  // sub-tiles can't be mistaken for the Media Tile slot.
  if (!topLevel || !('children' in node)) return null;
  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type !== 'INSTANCE') continue;
    if (
      c.name === 'Card Source' ||
      c.name === 'Source Feed' ||
      c.name === 'Source Feed / Icon' ||
      c.name === 'kebab' ||
      c.name.indexOf('Card Source') === 0
    ) {
      continue;
    }
    return c;
  }
  return null;
}

/**
 * Pick the avatar fill target inside a Source Feed / Icon instance.
 *
 * Strategy:
 *  1. Named: `#userpic` (Feed Card_0426 Placeholder+picture/container variant)
 *  2. Named: `Img` (legacy Feed Card)
 *  3. Structural: first direct child supporting `fills` whose name is
 *     **not** `Stroke` / `Placeholder`. Covers slim variants where the
 *     avatar layer is unnamed (e.g. a bare RECTANGLE sibling to Stroke).
 *
 * Returns null when no plausible target exists; callers should fall back
 * to a debug-log no-op rather than mis-applying a fill on a stroke node.
 */
function findAvatarTarget(sourceIcon: SceneNode): SceneNode | null {
  const named =
    findFillableByName(sourceIcon, '#userpic', 4) || findFillableByName(sourceIcon, 'Img', 4);
  if (named) return named;

  if (!('children' in sourceIcon)) return null;
  const direct = (sourceIcon as ChildrenMixin).children;
  for (let i = 0; i < direct.length; i++) {
    const c = direct[i];
    if (c.name === 'Stroke' || c.name === 'Placeholder') continue;
    if ('fills' in c) return c;
  }
  return null;
}

/**
 * Find first node with a given name that supports image fills.
 * Matches any node type that has a `fills` property (RECTANGLE, FRAME, ELLIPSE, etc.).
 */
function findFillableByName(node: SceneNode, name: string, maxDepth: number): SceneNode | null {
  if (maxDepth <= 0) return null;
  if (node.name === name && 'fills' in node) return node;
  if (!('children' in node)) return null;

  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    const found = findFillableByName(children[i], name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

// ============================================================================
// SAFE PROPERTY SETTER
// ============================================================================

/**
 * Set properties on a child instance, catching errors for missing props.
 */
function setPropsOnChild(
  parent: SceneNode,
  childName: string,
  props: Record<string, string | boolean>,
  label: string,
): void {
  const inst = findChildInstance(parent, childName, 6);
  if (!inst) {
    Logger.debug('[FeedApplicator] ' + label + ': child "' + childName + '" not found');
    return;
  }
  try {
    inst.setProperties(props);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.debug(
      '[FeedApplicator] ' + label + ': setProperties failed on "' + childName + '": ' + msg,
    );
  }
}

// ============================================================================
// SHARED APPLICATORS
// ============================================================================

/**
 * Apply source info (Source Feed instance) — shared across all card types.
 *
 * `subtitleOverride`, when provided, replaces the auto-domain Subtitle with
 * a literal string (used by advert cards to show the "Реклама" label
 * regardless of whether the parser produced a domain).
 */
function applySource(instance: InstanceNode, card: FeedCardRow, subtitleOverride?: string): void {
  const sourceName = (card['#Feed_SourceName'] || '').trim();
  const sourceDomain = (card['#Feed_SourceDomain'] || '').trim();

  let subtitleText = '';
  if (subtitleOverride !== undefined) {
    subtitleText = subtitleOverride;
  } else if (sourceDomain.length > 0 && sourceDomain.toLowerCase() !== sourceName.toLowerCase()) {
    // Hide Subtitle when it would just echo the title — saves the visual
    // duplicate `bentsony.mebel / bentsony.mebel` and matches the designer's
    // edited reference where empty/redundant subtitles are collapsed.
    subtitleText = sourceDomain;
  }

  const props: Record<string, string | boolean> = {};
  if (sourceName) {
    props['Source Name#3435:2'] = sourceName;
  }
  if (subtitleText.length > 0) {
    props['Subtitle2#3435:3'] = subtitleText;
    props['Subtitle#3435:1'] = true;
  } else {
    props['Subtitle#3435:1'] = false;
  }

  setPropsOnChild(instance, 'Source Feed', props, 'source');
}

/**
 * Switch the Source Feed / Icon child to its compact 24px / single-source
 * variant — matches the designer's edited reference where Feed Card uses a
 * smaller avatar + 12px title + tighter padding. Tile / Ads has the same
 * compact icon by default; we still call this for symmetry.
 *
 * **Guard against no-op variant swaps.** Feed Card_0426 already defaults
 * Source Feed / Icon to `Size=24 px, Number of sources=One`. Calling
 * `setProperties({ Size: '24 px', 'Number of sources': 'One' })` on an
 * instance already in that state is a logical no-op, but Figma still
 * registers it as a state change — the inner `#userpic` ref gets
 * invalidated and the render cache holds the pre-swap placeholder until
 * the user manually toggles the Size axis. We sidestep the bug by
 * comparing current values first and only calling setProperties when an
 * axis actually needs to change.
 *
 * Best-effort: if the icon variant axes don't match (older library version)
 * the call silently no-ops via try/catch.
 */
function applySourceCompact(instance: InstanceNode, label: string): void {
  const icons = collectInstancesByName(instance, 'Source Feed / Icon', 8);
  for (let i = 0; i < icons.length; i++) {
    const icon = icons[i];

    let current: ComponentProperties;
    try {
      current = icon.componentProperties;
    } catch (_e) {
      continue;
    }

    const sizeKey = findVariantKeyByPrefix(current, 'Size');
    const sourcesKey = findVariantKeyByPrefix(current, 'Number of sources');

    const patch: Record<string, string> = {};
    if (sizeKey && readVariantValue(current[sizeKey]) !== '24 px') {
      patch[sizeKey] = '24 px';
    }
    if (sourcesKey && readVariantValue(current[sourcesKey]) !== 'One') {
      patch[sourcesKey] = 'One';
    }
    if (Object.keys(patch).length === 0) continue; // already compact

    try {
      icon.setProperties(patch);
    } catch (e) {
      Logger.debug(
        '[FeedApplicator] ' +
          label +
          ': source-icon compact swap failed: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
}

/** Find the property key whose name starts with the given axis prefix. */
function findVariantKeyByPrefix(props: ComponentProperties, prefix: string): string | null {
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(prefix) === 0) return keys[i];
  }
  return null;
}

/**
 * Read a VARIANT property's current value as a string. Defensive against
 * the property entry being absent or non-VARIANT (returns empty string).
 */
function readVariantValue(entry: ComponentProperties[string] | undefined): string {
  if (!entry) return '';
  const v = (entry as { value?: unknown }).value;
  return typeof v === 'string' ? v : '';
}

/**
 * Walk subtree and collect every INSTANCE child with a given name.
 * Used by helpers that need to apply a setting to all matching nested
 * components (e.g. multiple Source Feed / Icon instances when the Card
 * Source row contains more than one).
 */
function collectInstancesByName(node: SceneNode, name: string, maxDepth: number): InstanceNode[] {
  const out: InstanceNode[] = [];
  function walk(n: SceneNode, depth: number) {
    if (depth <= 0) return;
    if (n.type === 'INSTANCE' && n.name === name) {
      out.push(n);
    }
    if ('children' in n) {
      const children = (n as ChildrenMixin).children;
      for (let i = 0; i < children.length; i++) {
        walk(children[i], depth - 1);
      }
    }
  }
  walk(node, maxDepth);
  return out;
}

/**
 * Math thin-space (U+202F) for thousands grouping. Matches the designer's
 * canonical price format ("18 686 ₽") used across all card types.
 */
const MATH_THIN_SPACE = ' ';

/**
 * Normalize a price string to math thin-space grouping. Strips any existing
 * separators (regular space, NBSP, narrow NBSP, comma) and re-groups digits
 * from the right by 3s. Returns the input unchanged when it has no digits
 * (e.g. empty / non-numeric placeholder).
 */
function formatPrice(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, MATH_THIN_SPACE);
}

/**
 * Apply price info to every PriceV2 instance in the subtree.
 *
 * **Walks ALL matching instances**, not just the first. Earlier
 * `applyTextPropByPrefix` stopped at the first match, which worked when
 * `Price#…` lived only on the deepest PriceV2 — but in some Tile / Media
 * Content variants the Tile master exposes `Price#…` as a top-level
 * proxy prop. The proxy match fires first, the walk returns, and the
 * underlying PriceV2 instance one or two layers deeper never receives
 * the value — Figma renders the variant placeholder ("112 000 ₽")
 * instead. Setting the prop on every matching instance covers both the
 * proxy and the underlying targets safely (a proxy assignment is a
 * no-op when the inner instance also gets the same value).
 *
 * Prefix `Price#` / `Old Price#` matches exactly one prop name per
 * instance master (false positives on `Price Group#…` /
 * `Price Disclaimer#…` are avoided by the trailing `#`).
 *
 * Prices are normalized to math-thin-space grouping (`18 686`) so all
 * card types render consistently regardless of parser format.
 */
function applyPrice(parent: SceneNode, card: FeedCardRow, label: string): void {
  const price = formatPrice(card['#Feed_Price'] || '');
  const oldPrice = formatPrice(card['#Feed_OldPrice'] || '');

  if (!price) return;

  const hits = applyTextPropToAllInstances(parent, 'Price#', price);
  if (hits.length === 0) {
    Logger.info(
      '[FeedApplicator] ' +
        label +
        ': applyPrice found NO instance with Price#… (PriceV2 not reachable from ' +
        parent.name +
        ')',
    );
  } else {
    Logger.debug(
      '[FeedApplicator] ' +
        label +
        ': applyPrice set on ' +
        hits.length +
        ' instance(s): ' +
        hits
          .map(function (h) {
            return h.name + ' (' + h.propKey + ')';
          })
          .join(', '),
    );
  }
  if (oldPrice) {
    // `Old Price#…` is the BOOLEAN visibility toggle for the strikethrough
    // old-price row. The actual old-price TEXT prop name isn't pinned yet —
    // for now we just enable the row, the rendered value will be the
    // PriceV2 variant placeholder. TODO: wire the old-price text prop once
    // we see a card with non-empty `#Feed_OldPrice`.
    applyBoolPropByPrefix(parent, 'Old Price#', true);
  }
}

/**
 * Walk the entire subtree and apply a TEXT prop value to EVERY INSTANCE
 * whose property keys match the given prefix. Returns a list of hits
 * (instance name + actual prop key) for diagnostics.
 *
 * Unlike `applyTextPropByPrefix` which stops at the first match, this
 * keeps going — necessary when both an outer proxy prop and an inner
 * concrete prop have the same prefix (e.g. Tile / Media Content's
 * `Price#…` proxy alongside the inner PriceV2's own `Price#…`).
 */
function applyTextPropToAllInstances(
  node: SceneNode,
  propPrefix: string,
  value: string,
): Array<{ name: string; propKey: string }> {
  const hits: Array<{ name: string; propKey: string }> = [];
  if (node.type === 'INSTANCE') {
    let props: ComponentProperties;
    try {
      props = node.componentProperties;
    } catch (_e) {
      props = {} as ComponentProperties;
    }
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf(propPrefix) !== 0) continue;
      if (props[k].type !== 'TEXT') continue;
      try {
        const patch: Record<string, string> = {};
        patch[k] = value;
        node.setProperties(patch);
        hits.push({ name: node.name, propKey: k });
      } catch (_e) {
        /* try next key on same instance */
      }
    }
  }
  if ('children' in node) {
    const children = (node as ChildrenMixin).children;
    for (let i = 0; i < children.length; i++) {
      const subHits = applyTextPropToAllInstances(children[i], propPrefix, value);
      for (let j = 0; j < subHits.length; j++) hits.push(subHits[j]);
    }
  }
  return hits;
}

/**
 * Walk the entire subtree and toggle a BOOLEAN prop on EVERY INSTANCE
 * whose property key matches the prefix. Like `applyTextPropToAllInstances`
 * — handles the proxy-prop case where both an outer Tile and an inner
 * PriceV2 expose the same boolean (e.g. `Discount Source#…`,
 * `Old Price#…`).
 *
 * Returns hit list for diagnostics.
 */
function applyBoolPropByPrefix(
  node: SceneNode,
  propPrefix: string,
  value: boolean,
): Array<{ name: string; propKey: string }> {
  const hits: Array<{ name: string; propKey: string }> = [];
  if (node.type === 'INSTANCE') {
    let props: ComponentProperties;
    try {
      props = node.componentProperties;
    } catch (_e) {
      props = {} as ComponentProperties;
    }
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf(propPrefix) !== 0) continue;
      if (props[k].type !== 'BOOLEAN') continue;
      try {
        const patch: Record<string, boolean> = {};
        patch[k] = value;
        node.setProperties(patch);
        hits.push({ name: node.name, propKey: k });
      } catch (_e) {
        /* try next key on same instance */
      }
    }
  }
  if ('children' in node) {
    const children = (node as ChildrenMixin).children;
    for (let i = 0; i < children.length; i++) {
      const subHits = applyBoolPropByPrefix(children[i], propPrefix, value);
      for (let j = 0; j < subHits.length; j++) hits.push(subHits[j]);
    }
  }
  return hits;
}

/**
 * Set the Image instance variant inside a Tile to a fixed Ratio. Used by
 * applyMarketData to force `4:5` so Yandex Market product crops show
 * without cropping in object-fit terms.
 *
 * Best-effort: if no Image / Ratio axis on this Tile variant, no-op.
 */
function applyImageRatio(tile: InstanceNode, ratio: string, label: string): void {
  const imageInst = findChildInstance(tile, 'Image', 8);
  if (!imageInst) return;
  try {
    imageInst.setProperties({ Ratio: ratio });
  } catch (e) {
    Logger.debug(
      '[FeedApplicator] ' +
        label +
        ': Image Ratio=' +
        ratio +
        ' set failed: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

/**
 * Hide Like in the Tile's Actions Set so only Save shows. Used for market
 * cards (designer-confirmed: `Like#2973:0 = false`, default state keeps
 * Save#2973:1 = true). Other booleans (Share, Dislike) stay default-false.
 */
function applyHideLike(tile: InstanceNode, label: string): void {
  const actionsSet = findChildInstance(tile, 'Actions Set', 8);
  if (!actionsSet) return;
  try {
    actionsSet.setProperties({ 'Like#2973:0': false });
  } catch (e) {
    Logger.debug(
      '[FeedApplicator] ' +
        label +
        ': Actions Set Like=false failed: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

/**
 * Set the Version axis on the Tile's Actions Set instance. Designer wants
 * `Exp` for post / video Like buttons (default is `MineHeart` which carries
 * a figure-inside-heart icon; `Exp` swaps to the experiment-style icon).
 *
 * Best-effort: if the axis name doesn't match (older library) or the value
 * is invalid, silent no-op via try/catch.
 */
function applyActionsSetVersion(tile: InstanceNode, version: string, label: string): void {
  const actionsSet = findChildInstance(tile, 'Actions Set', 8);
  if (!actionsSet) return;
  try {
    actionsSet.setProperties({ Version: version });
  } catch (e) {
    Logger.debug(
      '[FeedApplicator] ' +
        label +
        ': Actions Set Version=' +
        version +
        ' failed: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

/**
 * Toggle a boolean property on a Tile by name prefix. Used to flip
 * Media Meta booleans like `Dots#…` and `Sound#…` whose hash suffix
 * varies across library revisions.
 *
 * Returns true on success, false on miss / failure.
 */
function applyTileBooleanByPrefix(
  tile: InstanceNode,
  prefix: string,
  enable: boolean,
  label: string,
): boolean {
  let props: ComponentProperties;
  try {
    props = tile.componentProperties;
  } catch (_e) {
    return false;
  }
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k.indexOf(prefix) !== 0) continue;
    if (props[k].type !== 'BOOLEAN') continue;
    try {
      const patch: Record<string, boolean> = {};
      patch[k] = enable;
      tile.setProperties(patch);
      return true;
    } catch (e) {
      Logger.debug(
        '[FeedApplicator] ' +
          label +
          ': ' +
          prefix +
          '=' +
          enable +
          ' failed (' +
          k +
          '): ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
  return false;
}

/**
 * Hide a media-meta toggle (`Sound`, `Dots`, etc.) on a Tile, with a
 * layer-level fallback when no matching BOOLEAN property exists.
 *
 * Order of attempts:
 *   1. `applyTileBooleanByPrefix` — preferred, flips the parent's BOOLEAN
 *      property which is the schema-correct way to hide the layer.
 *   2. `findChildByName` + `.visible = false` — fallback for variants where
 *      the layer is NOT bound to a BOOLEAN property (e.g. some Tile /
 *      Media Content variants where Sound is just a plain layer rendered
 *      by default in `Type=Concept`).
 *
 * Setting `.visible = false` directly is safe here: if the layer IS bound
 * to a BOOLEAN we missed in step 1, Figma's bidirectional sync will flip
 * the BOOLEAN to false too — which is exactly what we want.
 */
function hideTileToggle(tile: InstanceNode, name: string, label: string): void {
  if (applyTileBooleanByPrefix(tile, name, false, label)) return;
  const layer = findChildByName(tile, name, 8);
  if (!layer) {
    Logger.debug(
      '[FeedApplicator] ' + label + ': could not find ' + name + ' (no BOOLEAN, no layer)',
    );
    return;
  }
  if (!('visible' in layer)) return;
  try {
    (layer as SceneNode & { visible: boolean }).visible = false;
  } catch (e) {
    Logger.debug(
      '[FeedApplicator] ' +
        label +
        ': fallback hide ' +
        name +
        ' (.visible=false) failed: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

/**
 * Toggle the "Ещё N" More button inside the Product row of a Media Tile.
 *
 * Used to hide the More button when the card has no related-product
 * preview (designer-confirmed default for market — single product, no
 * "more" — and for plain posts that surface a single product). Set key
 * for the Product instance is `12503b4451458b0f7a70e8c581dc5170b7e83da8`,
 * the boolean we toggle is `More#3093:9` per the designer's reference.
 *
 * Resolved by prefix to survive a library republish that might shift the
 * hash suffix.
 */
function applyProductMore(tile: InstanceNode, enable: boolean, label: string): void {
  const product = findChildInstance(tile, 'Product', 4);
  if (!product) return;
  let props: ComponentProperties;
  try {
    props = product.componentProperties;
  } catch (_e) {
    return;
  }
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k.indexOf('More') !== 0) continue;
    if (props[k].type !== 'BOOLEAN') continue;
    try {
      const patch: Record<string, boolean> = {};
      patch[k] = enable;
      product.setProperties(patch);
      return;
    } catch (e) {
      Logger.debug(
        '[FeedApplicator] ' +
          label +
          ': Product.More=' +
          enable +
          ' failed (' +
          k +
          '): ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
}

/**
 * Decide whether a card should show the Media Meta Dots indicator.
 *
 * STRICT signal: only true when the parser captured a real multi-image
 * gallery (`#Feed_CarouselImages` JSON has > 1 entries). The earlier
 * heuristic (`#Feed_CarouselCount > 1`) was a false-positive trap because
 * the parser counts `[class*="Dot"]` substring matches, which catches
 * anything with "Dot" in a class name on Yandex's video creative DOM —
 * a single-video card was getting Dots enabled.
 */
function hasRealGallery(card: FeedCardRow): boolean {
  const raw = card['#Feed_CarouselImages'];
  if (!raw || raw === '[]') return false;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 1;
  } catch (_e) {
    return false;
  }
}

/**
 * Set a TEXT property whose name starts with `propPrefix` on any INSTANCE
 * in the subtree. Prefix matching is resilient to library hash-suffix
 * shifts (e.g. `Description#2984:0` vs `Description#3061:5`) — we only
 * fix the human-readable prefix, the suffix is whatever Figma assigned.
 */
function applyTextPropByPrefix(node: SceneNode, propPrefix: string, value: string): boolean {
  if (node.type === 'INSTANCE') {
    let props: ComponentProperties;
    try {
      props = node.componentProperties;
    } catch (_e) {
      props = {} as ComponentProperties;
    }
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.indexOf(propPrefix) !== 0) continue;
      if (props[k].type !== 'TEXT') continue;
      try {
        const patch: Record<string, string> = {};
        patch[k] = value;
        node.setProperties(patch);
        return true;
      } catch (_e) {
        /* keep searching */
      }
    }
  }
  if (!('children' in node)) return false;
  const children = (node as ChildrenMixin).children;
  for (let i = 0; i < children.length; i++) {
    if (applyTextPropByPrefix(children[i], propPrefix, value)) return true;
  }
  return false;
}

/**
 * Configure the Content Badge Set inside a Tile.
 *
 * Rules (designer-confirmed):
 *  - `Carusel#2724:5` is **always** false — multi-image cards use the Dots
 *    indicator inside Media Meta, not the Carusel badge.
 *  - For `advert` all badges are off (no badge on advert tiles).
 *  - For other types we enable a single badge based on parser flags
 *    (`#Feed_HasVideoBadge` → Video). Other badges (Appointment, AI,
 *    Product, Checkout) are reserved for future parser flags and stay
 *    false until we wire them up.
 */
function applyContentBadgeSet(instance: InstanceNode, card: FeedCardRow, label: string): void {
  const tile = findFirstTileInSubtree(instance, 8);
  if (!tile) return;
  const badge = findChildInstance(tile, 'Content Badge Set', 8);
  if (!badge) return;

  const cardType = card['#Feed_CardType'] || '';
  const isAdvert = cardType === 'advert';
  const wantsVideo = !isAdvert && card['#Feed_HasVideoBadge'] === 'true';

  const props: Record<string, boolean> = {
    'Appointment#5289:0': false,
    'AI#3595:6': false,
    'Video#2724:4': wantsVideo,
    'Product#2724:6': false,
    'Carusel#2724:5': false,
    'Checkout#5193:20': false,
  };

  try {
    badge.setProperties(props);
  } catch (e) {
    Logger.debug(
      '[FeedApplicator] ' +
        label +
        ': Content Badge Set setProperties failed: ' +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

// ============================================================================
// TYPE-SPECIFIC APPLICATORS
// ============================================================================

function applyMarketData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  // Market joined the unified Feed Card shell on 2026-05-08. Same Tile as
  // post (Tile / Media Content `Type=Actions On`) but with `Product=true`
  // so the inner Product row exposes a single-line title + PriceV2. The
  // legacy direct-text Description path (`applyMarketDescription` writing
  // `textNode.characters`) is gone — everything flows through component
  // properties now.
  return applyFeedCardShell(
    instance,
    FEED_TILE_KEYS.media_content_actions_on,
    { Type: 'Actions On', Style: 'Default' },
    true,
    'market',
  ).then(function () {
    // Force Subtitle collapse for market — designer's edited reference shows
    // only "Яндекс Маркет" without the `market.yandex.ru` second line, even
    // though SourceDomain is non-empty. Pass an empty subtitleOverride to
    // bypass the auto-domain heuristic.
    applySource(instance, card, '');
    applySourceCompact(instance, 'market');
    applyContentBadgeSet(instance, card, 'market');

    const tile = findFirstTileInSubtree(instance, 8);
    if (tile) {
      // Enable the Product row inside the swapped Tile so title + price show.
      try {
        tile.setProperties({ 'Product#2773:26': true });
      } catch (_e) {
        // Property absent on this Tile variant — the row stays hidden;
        // nothing else to do.
      }
      // Hide Like in Actions Set (market keeps Save only).
      applyHideLike(tile, 'market');
      // Force 4:5 image aspect — Yandex Market product crops are near-square
      // and the designer reference uses this ratio uniformly for market.
      applyImageRatio(tile, '4:5', 'market');
      // Hide the "Ещё N" More button — market is a single-product card,
      // there are no related products to "show more" of.
      applyProductMore(tile, false, 'market');
    }

    // Hide the Follow icon — Яндекс Маркет isn't a followable account.
    hideFollowIcon(instance, 'market');

    // Title goes into the Product row's single-line Info text. Use
    // prefix-search so a library republish (which shifts the hash suffix
    // on the prop key) doesn't silently kill the title — we observed this
    // exact failure mode on the Price prop, so applying the same defence
    // here pre-emptively.
    const productTitle = card['#Feed_Title'] || '';
    if (productTitle) {
      applyTextPropByPrefix(instance, 'Product Title#', productTitle);
    }

    // Price into the Tile's PriceV2 instance. `applyPrice` handles
    // formatting + prefix-search internally — no direct hardcoded key
    // needed here anymore.
    const price = formatPrice((card['#Feed_Price'] || '').trim());
    if (price) {
      applyPrice(instance, card, 'market');
    }

    // Discount Source ("Через Пэй" / "Картой Пэй") — explicitly toggle
    // PriceV2's `Discount Source#…` BOOLEAN based on the parser signal.
    // Not all market cards carry the badge; without this we'd leak the
    // variant default into cards that lack it. Walking all matching
    // instances covers proxy-prop layouts (Tile exposes Discount Source,
    // PriceV2 also exposes it — both get toggled).
    const wantsDiscountSource = card['#Feed_HasDiscountSource'] === 'true';
    const dsHits = applyBoolPropByPrefix(instance, 'Discount Source#', wantsDiscountSource);
    if (dsHits.length === 0) {
      Logger.info('[FeedApplicator] market: Discount Source#… not found anywhere in subtree');
    } else {
      Logger.debug(
        '[FeedApplicator] market: Discount Source=' +
          wantsDiscountSource +
          ' set on ' +
          dsHits.length +
          ' instance(s): ' +
          dsHits
            .map(function (h) {
              return h.name + ' (' + h.propKey + ')';
            })
            .join(', '),
      );
    }
  });
}

function applyVideoData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  // Per the designer: video cards use Tile / Media Content with the Concept
  // variant (separate from the post variant which is Actions On). Concept
  // exposes Stroke / Action / Product BOOLEAN props the applicator flips
  // based on card data — the Product=true case below adds the price row.
  return applyFeedCardShell(
    instance,
    FEED_TILE_KEYS.media_content_concept,
    { Type: 'Concept', Style: 'Default' },
    true,
    'video',
  ).then(function () {
    applySource(instance, card);
    applySourceCompact(instance, 'video');
    applyContentBadgeSet(instance, card, 'video');

    // Title resolution — for video cards with an attached product preview,
    // the human-meaningful title is the PRODUCT name
    // (`#Feed_PreviewProductTitle`, e.g. "Шкаф-купе TSS Mebel Twist 1175"),
    // NOT the a11y h3 ("Видео: tss_mebel.ru") which just echoes the source
    // domain. Fall back to the a11y title for video-only cards (no product).
    const previewTitle = (card['#Feed_PreviewProductTitle'] || '').trim();
    const a11yTitle = (card['#Feed_Title'] || '').trim();
    const description = previewTitle || a11yTitle;
    if (description) {
      applyTextPropByPrefix(instance, 'Description', description);
    }

    // Product info — only show Product section when there is a price
    // (enabling it with only a title shows the component's default price)
    const productTitle = description;
    const hasProduct = !!card['#Feed_Price'];

    const tile = findFirstTileInSubtree(instance, 8);
    if (tile) {
      try {
        tile.setProperties({ 'Product#2773:26': hasProduct });
      } catch (_e) {
        /* prop may not exist on this Tile variant */
      }

      // Switch Like icon to Exp.
      applyActionsSetVersion(tile, 'Exp', 'video');
      // Force Sound + Dots off on video. Type=Concept defaults to showing
      // both, but live ya.ru video cards don't carry an interactive sound
      // toggle and the Dots indicator only makes sense for a real
      // multi-slide gallery (which video creatives almost never are —
      // earlier `hasRealGallery` heuristic over-triggered when the parser
      // mistook product-preview thumbnails for gallery slides).
      //
      // `hideTileToggle` tries the BOOLEAN first, falls back to direct
      // layer.visible=false when the variant exposes no matching prop.
      hideTileToggle(tile, 'Dots', 'video');
      hideTileToggle(tile, 'Sound', 'video');

      const product = findChildInstance(tile, 'Product', 4);
      if (product && productTitle) {
        // Prefix-search — see `applyMarketData` rationale: a library
        // republish flips the hash suffix on the prop key and silently
        // breaks rendering. `applyTextPropByPrefix` walks the subtree.
        applyTextPropByPrefix(product, 'Product Title#', productTitle);
      }
      if (product) {
        applyPrice(product, card, 'video/product');
      }
      // Hide the "Ещё N" More button — no preview-products signal in the
      // parser yet, so we treat single-product as the universal default.
      applyProductMore(tile, false, 'video');
    }
  });
}

function applyPostData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  return applyFeedCardShell(
    instance,
    FEED_TILE_KEYS.media_content_actions_on,
    { Type: 'Actions On', Style: 'Default' },
    true,
    'post',
  ).then(function () {
    applySource(instance, card);
    applySourceCompact(instance, 'post');
    applyContentBadgeSet(instance, card, 'post');

    // Determine if this post has an attached product preview (vkusvill,
    // teakhouse, Елена-style — `[class*="post-products-preview"]` block in
    // the live DOM, parsed into `#Feed_PreviewProductTitle` + `#Feed_Price`).
    // Plain posts (just text + image, no product) leave Product=false so
    // the placeholder ("Product Title / 270 000 ₽") doesn't leak through.
    const previewTitle = (card['#Feed_PreviewProductTitle'] || '').trim();
    const previewPrice = (card['#Feed_Price'] || '').trim();
    const hasPreviewProduct = !!previewTitle || !!previewPrice;

    const tile = findFirstTileInSubtree(instance, 8);
    if (tile) {
      // Toggle Product row based on preview presence — earlier this was
      // unconditionally false, which dropped description + price on
      // post-with-products cards (regression #1801:82272).
      try {
        tile.setProperties({ 'Product#2773:26': hasPreviewProduct });
      } catch (_e) {
        /* prop absent — placeholder stays hidden anyway */
      }
      // Switch Like icon to the Exp variant (designer-confirmed for posts).
      applyActionsSetVersion(tile, 'Exp', 'post');
      // Explicit Dots + Sound — Dots only on for real multi-image
      // galleries (now honest: post-products-preview thumbnails no longer
      // pollute `#Feed_CarouselImages`). Sound always off — posts never
      // carry a sound toggle.
      applyTileBooleanByPrefix(tile, 'Dots', hasRealGallery(card), 'post');
      hideTileToggle(tile, 'Sound', 'post');

      if (hasPreviewProduct) {
        const product = findChildInstance(tile, 'Product', 4);
        if (product && previewTitle) {
          // Prefix-search for resilience against library-republish hash
          // shifts (see `applyMarketData` rationale).
          applyTextPropByPrefix(product, 'Product Title#', previewTitle);
        }
        if (product) {
          applyPrice(product, card, 'post/product');
        }
        // Hide the "Ещё N" More button — single-product preview, no
        // related products to "show more" of.
        applyProductMore(tile, false, 'post');
      }
    }

    // Description text (for variants that expose a Description prop separate
    // from Product row). Same precedence as video: prefer the attached
    // product's name over the a11y "Галерея: <author>" / "Изображение:
    // <author>" auto-title. Silent no-op when no Description prop exists.
    const a11yTitle = (card['#Feed_Title'] || '').trim();
    const description = previewTitle || a11yTitle;
    if (description) {
      applyTextPropByPrefix(instance, 'Description', description);
    }
  });
}

/**
 * Cache for slot-tile components imported via INSTANCE_SWAP.
 * Keyed by component key (32-char hex).
 */
const tileComponentCache: Record<string, ComponentNode> = {};

function importTileByKey(key: string): Promise<ComponentNode | null> {
  const cached = tileComponentCache[key];
  if (cached) {
    try {
      if (!(cached as SceneNode).removed) return Promise.resolve(cached);
    } catch (_e) {
      // fall through and re-import
    }
    delete tileComponentCache[key];
  }
  return figma
    .importComponentByKeyAsync(key)
    .then(function (comp) {
      tileComponentCache[key] = comp;
      return comp;
    })
    .catch(function (e) {
      Logger.error(
        '[FeedApplicator] importComponentByKeyAsync failed (key=' +
          key +
          '): ' +
          (e instanceof Error ? e.message : String(e)),
      );
      return null;
    });
}

/**
 * Find the property name on a Feed Card instance that matches a given prefix.
 * Figma INSTANCE_SWAP property keys carry a hash suffix (e.g. "Media Tile SA#4900:6"),
 * so we resolve by prefix to be resilient to set re-publishes.
 */
function findPropertyByPrefix(instance: InstanceNode, prefix: string): string | null {
  let props: ComponentProperties;
  try {
    props = instance.componentProperties;
  } catch (_e) {
    return null;
  }
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(prefix) === 0) return keys[i];
  }
  return null;
}

/**
 * Generic Feed Card shell setup:
 *  - Imports the type-specific Tile and swaps it into the `Media Tile SA` slot
 *  - Forces the variant axes on the swapped Tile (defensive — the slot's
 *    INSTANCE_SWAP can silently coerce to the slot's default variant when
 *    its preferredValues constrain the set; an explicit setProperties on the
 *    swapped child guarantees the variant we asked for)
 *  - Toggles the `Source` BOOLEAN row on/off
 */
function applyFeedCardShell(
  instance: InstanceNode,
  tileKey: string,
  variantProps: Record<string, string> | null,
  sourceOn: boolean,
  label: string,
): Promise<void> {
  return importTileByKey(tileKey).then(function (tile) {
    if (tile) {
      const mediaProp = findPropertyByPrefix(instance, 'Media Tile SA');
      if (mediaProp) {
        try {
          const patch: Record<string, string> = {};
          patch[mediaProp] = tile.id;
          instance.setProperties(patch);
        } catch (e) {
          Logger.debug(
            '[FeedApplicator] ' +
              label +
              ': Media Tile swap failed: ' +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      } else {
        Logger.debug('[FeedApplicator] ' + label + ': Media Tile property not found on Feed Card');
      }

      // Re-affirm variant axes on the swapped Tile so an Actions-On variant
      // doesn't fall back to e.g. Type=Concept after the swap. The slot's
      // INSTANCE_SWAP can silently coerce the variant when the imported key
      // doesn't survive setProperties — explicitly applying the variant
      // afterwards is the only reliable way to lock it.
      //
      // Subtree match strategy: walk every INSTANCE descendant and pick the
      // first one whose name starts with "Tile /" (matches "Tile / Media
      // Content", "Tile / Video", "Tile / Ads", "Tile / Product", etc).
      // Earlier we matched by exact name which missed cases where Figma
      // labels the swapped child with the variant string instead of the
      // set name.
      if (variantProps) {
        const swapped = findFirstTileInSubtree(instance, 8);
        if (swapped) {
          try {
            swapped.setProperties(variantProps);
          } catch (e) {
            Logger.debug(
              '[FeedApplicator] ' +
                label +
                ': swapped-tile variant set failed (props=' +
                JSON.stringify(variantProps) +
                ', tile=' +
                swapped.name +
                '): ' +
                (e instanceof Error ? e.message : String(e)),
            );
          }
        } else {
          Logger.debug(
            '[FeedApplicator] ' + label + ': could not locate swapped tile to set variant',
          );
        }
      }
    }

    const sourceProp = findPropertyByPrefix(instance, 'Source#');
    if (sourceProp) {
      try {
        const patch: Record<string, boolean> = {};
        patch[sourceProp] = sourceOn;
        instance.setProperties(patch);
      } catch (e) {
        Logger.debug(
          '[FeedApplicator] ' +
            label +
            ': Source toggle failed: ' +
            (e instanceof Error ? e.message : String(e)),
        );
      }
    }
  });
}

/**
 * Advert flow — architecture pivot 2026-05-10.
 *
 * Old: Tile / Ads went into the Media Tile SLOT. That left the default
 * Tile / Media Content placeholders (Product Title / 270 000 ₽) showing
 * because the swap silently coerced and the Media Tile inherited Type=SA
 * with Product=true.
 *
 * New: Media Tile keeps its default Tile / Media Content (we just disable
 * the Product row) so the advert creative renders as a normal image.
 * Tile / Ads is swapped into the **Content** slot (`Content#2768:0`)
 * where it provides Description + optional Price.
 *
 * Per designer reference (artboard 1791:21855..7):
 *  - Description filled, Price boolean = false (advert with no price)
 *  - Follow icon disabled on Source Feed
 *  - Image Ratio re-applied AFTER Content swap (Content swap resets Ratio)
 */
function applyAdsData(instance: InstanceNode, card: FeedCardRow): Promise<void> {
  // Source row toggle on (default state, but explicit). We don't swap the
  // Media Tile — it stays at Feed Card_0426's default Tile / Media Content.
  const sourceProp = findPropertyByPrefix(instance, 'Source#');
  if (sourceProp) {
    try {
      const patch: Record<string, boolean> = {};
      patch[sourceProp] = true;
      instance.setProperties(patch);
    } catch (e) {
      Logger.debug(
        '[FeedApplicator] advert: Source toggle failed: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  // Disable the Product row on the default Media Tile so its placeholder
  // "Product Title / 270 000 ₽" doesn't peek through under the creative.
  const mediaTile = findFirstTileInSubtree(instance, 8);
  if (mediaTile) {
    try {
      mediaTile.setProperties({ 'Product#2773:26': false });
    } catch (_e) {
      // Property absent on this Tile variant — placeholder stays hidden anyway.
    }
  }

  // Swap Content slot to Tile / Ads (variant key from FEED_TILE_KEYS).
  return importTileByKey(FEED_TILE_KEYS.ads_default).then(function (adsTile) {
    if (adsTile) {
      const contentProp = findPropertyByPrefix(instance, 'Content#');
      if (contentProp) {
        try {
          const patch: Record<string, string> = {};
          patch[contentProp] = adsTile.id;
          instance.setProperties(patch);
        } catch (e) {
          Logger.debug(
            '[FeedApplicator] advert: Content slot swap failed: ' +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      }
    }

    // Source row data — name + literal "Реклама" subtitle, compact icon.
    const adLabel = (card['#Feed_SourceLabel'] || 'Реклама').trim();
    applySource(instance, card, adLabel);
    applySourceCompact(instance, 'advert');
    applyContentBadgeSet(instance, card, 'advert');
    hideFollowIcon(instance, 'advert');

    // Configure the swapped Tile / Ads in the Content slot.
    const contentSlot = findContentSlotInstance(instance);
    if (contentSlot) {
      // Description text (without the trailing price — parser strips it).
      // Use prefix-matching so we hit whatever Description#… hash the
      // current Tile / Ads variant exposes.
      const title = card['#Feed_Title'] || '';
      if (title) {
        applyTextPropByPrefix(contentSlot, 'Description', title);
      }

      // Price: if parser gave one, fill & enable; otherwise turn the row off.
      const price = formatPrice((card['#Feed_Price'] || '').trim());
      if (price) {
        // Prefix-search — resilient to library-republish hash shifts
        // (see `applyMarketData` rationale).
        applyTextPropByPrefix(contentSlot, 'Price#', price);
        // Best-effort enable Price boolean on Tile / Ads if such a prop exists.
        try {
          contentSlot.setProperties({ 'Price#2753:0': true });
        } catch (_e) {
          /* prop may not exist — text fill alone is enough */
        }
      } else {
        try {
          contentSlot.setProperties({ 'Price#2753:0': false });
        } catch (_e) {
          /* */
        }
      }
    }

    // Image Ratio MUST be re-applied after Content swap — Figma resets the
    // Ratio variant on the Media Tile's Image when Content slot changes.
    if (mediaTile) {
      const ratio = card['#Feed_ImageRatio'];
      if (ratio) applyImageRatio(mediaTile, ratio, 'advert');
    }
  });
}

/**
 * Locate the Content-slot instance — the second non-source-row direct
 * INSTANCE child of a Feed Card_0426. Children order:
 *   1. Media Tile (first non-source instance)
 *   2. Content   (second non-source instance) ← returned
 *   3. Card Source (excluded by name)
 */
function findContentSlotInstance(instance: InstanceNode): InstanceNode | null {
  if (!('children' in instance)) return null;
  const children = (instance as ChildrenMixin).children;
  let nonSourceSeen = 0;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type !== 'INSTANCE') continue;
    if (
      c.name === 'Card Source' ||
      c.name === 'Source Feed' ||
      c.name === 'Source Feed / Icon' ||
      c.name === 'kebab' ||
      c.name.indexOf('Card Source') === 0
    ) {
      continue;
    }
    nonSourceSeen += 1;
    if (nonSourceSeen === 2) return c;
  }
  return null;
}

/**
 * Hide the Follow icon inside the Source Feed instance. Used for advert
 * cards where the source domain isn't a followable account.
 *
 * Strategy: scan Source Feed's componentProperties for any BOOLEAN whose
 * name starts with `Follow`. If found, set to false. Best-effort — silent
 * no-op on libraries that don't expose this toggle.
 */
function hideFollowIcon(instance: InstanceNode, label: string): void {
  const sourceFeed = findChildInstance(instance, 'Source Feed', 8);
  if (!sourceFeed) return;
  let props: ComponentProperties;
  try {
    props = sourceFeed.componentProperties;
  } catch (_e) {
    return;
  }
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k.indexOf('Follow') !== 0) continue;
    const entry = props[k];
    if (entry.type !== 'BOOLEAN') continue;
    try {
      const patch: Record<string, boolean> = {};
      patch[k] = false;
      sourceFeed.setProperties(patch);
    } catch (e) {
      Logger.debug(
        '[FeedApplicator] ' +
          label +
          ': hide Follow (' +
          k +
          ') failed: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }
}

// ============================================================================
// IMAGE APPLICATOR
// ============================================================================

/**
 * Apply images (thumbnail + source avatar) to a feed card instance.
 * Returns a Promise chain (ES5-safe).
 */
function applyImages(instance: InstanceNode, card: FeedCardRow, relayUrl?: string): Promise<void> {
  const imageUrl = card['#Feed_ImageUrl'] || '';
  const avatarUrl = card['#Feed_SourceAvatarUrl'] || '';
  // Diagnostic: trace advert specifically — the user can spot at a glance
  // whether images are reaching the apply step or being dropped earlier.
  if (card['#Feed_CardType'] === 'advert') {
    Logger.info(
      '[advert-img] card "' +
        (card['#Feed_SourceName'] || '?') +
        '" imageUrl=' +
        (imageUrl
          ? imageUrl.slice(0, 80) + (imageUrl.length > 80 ? '…' : '')
          : 'EMPTY (placeholder will show)'),
    );
  }
  let chain = Promise.resolve();

  // Main image — path: instance > ... > Thumb > Image (INSTANCE) > Img (fill target)
  if (imageUrl) {
    chain = chain.then(function () {
      const thumb = findChildByName(instance, 'Thumb', 8);

      // Step 1: Find Image instance and set properties.
      //
      // Order matters: set the variant axis (Ratio) FIRST in its own call,
      // then the boolean (Placeholder=false) in a second call.
      //
      // Why: when a single setProperties() call combines a variant change
      // with a boolean, Figma swaps the variant first, which resets ALL
      // boolean component properties on the new variant to their defaults
      // (Placeholder default is `true`). The boolean we asked to set is
      // applied to the OLD variant, which then gets discarded. Result —
      // every imported card shows the placeholder over our Img fill.
      const imageInst = findChildInstance(instance, 'Image', 8);
      if (imageInst) {
        const ratio = card['#Feed_ImageRatio'];
        if (ratio) {
          try {
            imageInst.setProperties({ Ratio: ratio });
          } catch (e) {
            Logger.debug(
              '[FeedApplicator] Image Ratio: ' + (e instanceof Error ? e.message : String(e)),
            );
          }
        }
        try {
          imageInst.setProperties({ 'Placeholder#4004:1': false });
        } catch (e) {
          Logger.debug(
            '[FeedApplicator] Image Placeholder: ' + (e instanceof Error ? e.message : String(e)),
          );
        }
      }

      // Step 2: Find Img fill target — try multiple paths
      let imgNode: SceneNode | null = null;

      // Path A: inside Image instance
      if (imageInst) {
        imgNode = findFillableByName(imageInst, 'Img', 4);
      }
      // Path B: inside Thumb
      if (!imgNode && thumb) {
        imgNode = findFillableByName(thumb, 'Img', 6);
      }
      // Path C: any child named Img from root
      if (!imgNode) {
        imgNode = findFillableByName(instance, 'Img', 10);
      }

      if (!imgNode) {
        const msg = '[FeedApplicator] Img not found in ' + instance.name;
        if (card['#Feed_CardType'] === 'advert') {
          Logger.info('[advert-img] FAIL: ' + msg);
        } else {
          Logger.debug(msg);
        }
        return;
      }

      // Scale mode: market + advert use FIT (object-contain) so product /
      // creative images aren't cropped to fill a square frame. Posts and
      // videos use FILL (object-cover) — their crops are intentional.
      const cardType = card['#Feed_CardType'] || '';
      const scaleMode: 'FILL' | 'FIT' =
        cardType === 'market' || cardType === 'advert' ? 'FIT' : 'FILL';
      Logger.debug(
        '[FeedApplicator] Applying image to ' +
          imgNode.name +
          ' in ' +
          instance.name +
          ' scale=' +
          scaleMode,
      );
      return fetchAndApplyImage(imgNode, imageUrl, scaleMode, '[Feed/thumb]', relayUrl).then(
        function (success) {
          if (card['#Feed_CardType'] === 'advert') {
            Logger.info(
              '[advert-img] ' +
                (success ? 'APPLIED' : 'FETCH-RETURNED-FALSE') +
                ' on ' +
                instance.name +
                ' for ' +
                imageUrl.substring(0, 80),
            );
          }
        },
        function (err) {
          if (card['#Feed_CardType'] === 'advert') {
            Logger.info(
              '[advert-img] THROWN ' +
                instance.name +
                ': ' +
                (err instanceof Error ? err.message : String(err)),
            );
          }
        },
      );
    });
  }

  // Source avatar — fill the avatar layer inside `Source Feed / Icon`.
  //
  // Source Feed / Icon ships across multiple library revisions / variants:
  //  - `#userpic` named layer (Feed Card_0426 with Placeholder + picture/container)
  //  - `Img` named layer (legacy Feed Card)
  //  - **unnamed** RECTANGLE / FRAME with image-fill defaults (slim Tile
  //     variants where the avatar layer just sits as a sibling to Stroke)
  //
  // Try named targets first, then fall back to a structural pick: the first
  // direct child of Source Feed / Icon that supports `fills` and isn't an
  // obviously decorative element (`Stroke`, `Placeholder`).
  if (avatarUrl) {
    chain = chain.then(function () {
      const sourceIcon = findChildByName(instance, 'Source Feed / Icon', 8);
      if (!sourceIcon) {
        Logger.debug('[FeedApplicator] Source Feed / Icon not found in ' + instance.name);
        return;
      }
      const imgNode = findAvatarTarget(sourceIcon);
      if (!imgNode) {
        Logger.debug(
          '[FeedApplicator] avatar target not found in Source Feed / Icon ' +
            '(tried #userpic, Img, structural fallback)',
        );
        return;
      }
      Logger.debug('[FeedApplicator] avatar target=' + imgNode.name + ' (' + imgNode.type + ')');
      // Hide "Placeholder" child layer inside Source Feed / Icon
      const placeholder = findChildByName(sourceIcon, 'Placeholder', 2);
      if (placeholder) {
        safeSetVisible(placeholder, false, sourceIcon);
      }
      return fetchAndApplyImage(imgNode, avatarUrl, 'FILL', '[Feed/avatar]', relayUrl).then(
        function () {},
      );
    });
  }

  return chain;
}

// ============================================================================
// MARKET DESCRIPTION (direct TEXT node edit)
// ============================================================================

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Apply feed card data to a Figma instance.
 *
 * 1. Sets text/boolean properties on child instances (Tile swap + variant
 *    axes + Source row + Product/Description/Price properties)
 * 2. Loads and applies images (thumbnail + avatar)
 *
 * Every card type now flows through the unified Feed Card shell — the
 * applicator is a property-driven pipeline, no direct text-node edits or
 * font-loading required.
 *
 * @param instance  The feed card instance (already created)
 * @param card      Parsed feed card data from extension
 */
export function applyFeedData(
  instance: InstanceNode,
  card: FeedCardRow,
  relayUrl?: string,
): Promise<void> {
  const cardType = card['#Feed_CardType'] || '';
  Logger.debug(
    '[FeedApplicator] Applying data: type=' +
      cardType +
      ', title="' +
      (card['#Feed_Title'] || '').substring(0, 30) +
      '"',
  );

  let chain: Promise<void>;
  switch (cardType) {
    case 'market':
      chain = applyMarketData(instance, card);
      break;
    case 'video':
      chain = applyVideoData(instance, card);
      break;
    case 'post':
      chain = applyPostData(instance, card);
      break;
    case 'advert':
      chain = applyAdsData(instance, card);
      break;
    default:
      Logger.debug('[FeedApplicator] Unknown card type: ' + cardType);
      chain = Promise.resolve();
  }

  // Step 2: Apply images (async) — pass relayUrl for CORS-blocked proxy fallback.
  return chain.then(function () {
    return applyImages(instance, card, relayUrl);
  });
}
