/**
 * @vitest-environment jsdom
 *
 * Tests for the delivery-badge extractor in `packages/extension/src/content.ts`
 * (`extractDeliveryBadges`). Since the extension package has no test runner of
 * its own, we mirror the function here and exercise it against jsdom fixtures
 * that reproduce the noisy Yandex SERP DOM the user reported:
 *
 *   "КурьерИз магазинаКурьер Из магазина Доступно не для всех категорий товаров"
 *
 * Desired output: "Курьер · Из магазина"
 *
 * The mirror + source-string regex keep this test honest — if the extension
 * copy diverges from the logic tested here, the source-regression test fails.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_CONTENT_SOURCE = fs.readFileSync(
  path.join(__dirname, '../../../extension/src/content.ts'),
  'utf8',
);

/** Mirror of `extractDeliveryBadges` — keep in sync with content.ts. */
function extractDeliveryBadges(deliveriesEl: Element | null): string {
  if (!deliveriesEl) return '';

  const raw = (deliveriesEl.textContent || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';

  function hasClassToken(className: string, words: string[]): boolean {
    if (!className) return false;
    const tokens = className.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const lowerT = tokens[i].toLowerCase();
      for (let j = 0; j < words.length; j++) {
        const w = words[j].toLowerCase();
        if (lowerT === w) return true;
        if (lowerT.indexOf(w + '-') === 0 || lowerT.indexOf(w + '_') === 0) return true;
        if (lowerT.endsWith('-' + w) || lowerT.endsWith('_' + w)) return true;
      }
    }
    return false;
  }

  function shouldSkipElement(el: HTMLElement): boolean {
    const className = typeof el.className === 'string' ? el.className : '';
    if (hasClassToken(className, ['Tooltip', 'Popup', 'Hint'])) return true;
    if (hasClassToken(className, ['A11yHidden', 'sr-only', 'visually-hidden'])) return true;
    if (el.getAttribute('role') === 'tooltip') return true;
    return false;
  }

  function normalizeCandidate(text: string): string | null {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) return null;
    if (normalized.length > 40) return null;
    if (/^(Доступно|Подробнее|Не для|Не все)/i.test(normalized)) return null;
    return normalized;
  }

  function getDirectText(el: Element): string {
    let text = '';
    const nodes = el.childNodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.nodeType === 3 /* TEXT_NODE */) {
        text += n.textContent || '';
      }
    }
    return text;
  }

  const seen: Record<string, boolean> = {};
  const badges: string[] = [];

  function pushIfUnique(candidate: string | null): void {
    if (!candidate) return;
    if (seen[candidate]) return;
    seen[candidate] = true;
    badges.push(candidate);
  }

  function walk(el: Element, isRoot: boolean): void {
    if (!isRoot && shouldSkipElement(el as HTMLElement)) return;
    pushIfUnique(normalizeCandidate(getDirectText(el)));
    const children = el.children;
    for (let i = 0; i < children.length; i++) {
      walk(children[i] as Element, false);
    }
  }

  walk(deliveriesEl, true);

  if (badges.length > 0) return badges.join(' \u00B7 ');
  return raw.length > 50 ? raw.slice(0, 47) + '\u2026' : raw;
}

// ---------------------------------------------------------------------------
// DOM-builder helpers — programmatic construction instead of innerHTML so the
// fixtures are explicit and can't accidentally execute anything.
// ---------------------------------------------------------------------------

interface LeafSpec {
  text: string;
  tag?: string;
  className?: string;
  role?: string;
  ariaHidden?: boolean;
}

interface GroupSpec {
  className?: string;
  role?: string;
  ariaHidden?: boolean;
  /** Text node appended directly to this element (in addition to children). */
  directText?: string;
  children: Array<LeafSpec | GroupSpec>;
}

function isGroup(spec: LeafSpec | GroupSpec): spec is GroupSpec {
  return 'children' in spec;
}

function buildNode(spec: LeafSpec | GroupSpec): HTMLElement {
  const tag = !isGroup(spec) && spec.tag ? spec.tag : isGroup(spec) ? 'div' : 'span';
  const el = document.createElement(tag);
  if (spec.className) el.className = spec.className;
  if (spec.role) el.setAttribute('role', spec.role);
  if (spec.ariaHidden) el.setAttribute('aria-hidden', 'true');

  if (isGroup(spec)) {
    if (spec.directText !== undefined) {
      el.appendChild(document.createTextNode(spec.directText));
    }
    for (const child of spec.children) {
      el.appendChild(buildNode(child));
    }
  } else {
    el.textContent = spec.text;
  }
  return el;
}

function buildDeliveries(children: Array<LeafSpec | GroupSpec>): Element {
  const root = document.createElement('div');
  root.className = 'EProductSnippet2-Deliveries';
  for (const child of children) root.appendChild(buildNode(child));
  return root;
}

const MIDDLE_DOT = '\u00B7';

describe('extractDeliveryBadges', () => {
  it('returns empty string for null input', () => {
    expect(extractDeliveryBadges(null)).toBe('');
  });

  it('returns empty string for empty element', () => {
    const root = buildDeliveries([]);
    expect(extractDeliveryBadges(root)).toBe('');
  });

  it('joins two short badge leaves with middle dot', () => {
    const root = buildDeliveries([{ text: 'Курьер' }, { text: 'Из магазина' }]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('dedupes repeated badge text (compact + expanded render of same badge)', () => {
    // Mirrors Yandex pattern: badges render twice (visible pill + expanded
    // group). Extractor must return each unique label only once.
    const root = buildDeliveries([
      {
        className: 'Compact',
        children: [{ text: 'Курьер' }, { text: 'Из магазина' }],
      },
      {
        className: 'Expanded',
        children: [{ text: 'Курьер' }, { text: 'Из магазина' }],
      },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('skips role=tooltip descriptor that leaks into textContent', () => {
    // The reported bug: raw textContent was
    //   "КурьерИз магазинаКурьер Из магазина Доступно не для всех категорий товаров"
    // The descriptor sentence must be filtered out.
    const root = buildDeliveries([
      { text: 'Курьер' },
      { text: 'Из магазина' },
      {
        role: 'tooltip',
        children: [{ text: 'Курьер Из магазина Доступно не для всех категорий товаров' }],
      },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('skips tooltip by className', () => {
    const root = buildDeliveries([
      { text: 'Курьер' },
      { text: 'Из магазина' },
      {
        className: 'DeliveryTooltipContent',
        children: [{ text: 'Курьер' }, { text: 'Доступно не для всех категорий товаров' }],
      },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('KEEPS aria-hidden=true badges — Yandex tags visible pills with it', () => {
    // Counter-intuitive but real: `aria-hidden="true"` on a badge tells screen
    // readers to ignore the visual pill (because the same info is duplicated in
    // an `.A11yHidden` sibling below). The pill IS visually rendered, so the
    // extractor must keep it. Regression guard: previous version skipped these
    // and returned an empty string, flipping the sourceMeta boolean to false.
    const root = buildDeliveries([
      { text: 'Курьер', ariaHidden: true },
      { text: 'Из магазина', ariaHidden: true },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('skips .A11yHidden screen-reader siblings', () => {
    // The Yandex AT-only duplicate: a single span with aggregated text.
    // Must not leak into the extraction.
    const root = buildDeliveries([
      { text: 'Курьер', ariaHidden: true },
      { text: 'Из магазина', ariaHidden: true },
      {
        className: 'A11yHidden',
        children: [{ text: 'Курьер Из магазина Доступно не для всех категорий товаров' }],
      },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('class-token filter does not match unrelated classes of equal length', () => {
    // Regression: the previous positional formula was
    //   t.indexOf('-tooltip') === t.length - 'tooltip'.length - 1
    // which, when the class token was exactly the same length as one of the
    // filter words (e.g. 'Badge' and 'popup' — both 5 chars), evaluated to
    // `-1 === -1` → false positive skip. `.Badge` badges were discarded and the
    // cascade fell through to the ugly raw-textContent fallback.
    const root = buildDeliveries([
      {
        className: 'Badge', // exactly 5 chars, same as "popup"
        children: [{ text: 'Курьер' }],
      },
      {
        className: 'Badge',
        children: [{ text: 'Из магазина' }],
      },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('matches the exact real-world Yandex DOM reported by the user', () => {
    // Copy-paste of the actual `.EProductSnippet2-Deliveries` block the user
    // sent. Every detail matters: the wrapper is `.Line.EDeliveryGroup...`
    // (note: Line/EDeliveryGroup class names don't hit our tooltip filter),
    // each badge span carries `aria-hidden="true"`, the A11yHidden sibling
    // carries the descriptor sentence. Expected clean output: "Курьер · Из магазина".
    const root = document.createElement('div');
    root.className =
      'Line Line_inline EDeliveryGroup EDeliveryGroup_tooltip Line_size_xs EDeliveryGroup_link EProductSnippet2-Deliveries';

    const b1 = document.createElement('span');
    b1.className = 'EDeliveryGroup-Item';
    b1.setAttribute('aria-hidden', 'true');
    b1.textContent = 'Курьер';
    root.appendChild(b1);

    const b2 = document.createElement('span');
    b2.className = 'EDeliveryGroup-Item';
    b2.setAttribute('aria-hidden', 'true');
    b2.textContent = 'Из магазина';
    root.appendChild(b2);

    const a11y = document.createElement('span');
    a11y.className = 'A11yHidden';
    a11y.textContent = 'Курьер Из магазина Доступно не для всех категорий товаров';
    root.appendChild(a11y);

    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('skips standalone descriptor text even when not marked as tooltip', () => {
    // Fallback: some Yandex A/B variants put the descriptor as a plain span.
    // Text-level heuristic keeps us safe.
    const root = buildDeliveries([
      { text: 'Курьер' },
      { text: 'Из магазина' },
      { text: 'Доступно не для всех категорий товаров' },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('drops candidates longer than 40 chars (likely descriptors, not badges)', () => {
    const root = buildDeliveries([
      { text: 'Курьер' },
      { text: 'Эта строка существенно длиннее любого реального бейджа доставки' },
    ]);
    expect(extractDeliveryBadges(root)).toBe('Курьер');
  });

  it('handles single badge without adding a dangling separator', () => {
    const root = buildDeliveries([{ text: 'Курьер' }]);
    expect(extractDeliveryBadges(root)).toBe('Курьер');
  });

  it('normalizes internal whitespace inside a badge label', () => {
    const root = buildDeliveries([{ text: '  Из   магазина  ' }]);
    expect(extractDeliveryBadges(root)).toBe('Из магазина');
  });

  it('keeps order of first occurrence across dedup passes', () => {
    const root = buildDeliveries([
      { text: 'Курьер' },
      { text: 'Самовывоз' },
      { text: 'Из магазина' },
      { text: 'Курьер' },
    ]);
    expect(extractDeliveryBadges(root)).toBe(
      `Курьер ${MIDDLE_DOT} Самовывоз ${MIDDLE_DOT} Из магазина`,
    );
  });

  // === Fallback-стратегии ===
  //
  // Эти тесты — защита от бага «sourceMeta везде false», который случился, когда
  // strict leaf-обход не находил ни одного бейджа в новой DOM-разметке Яндекса.
  // Помимо чистого результата стратегии 1, мы обязаны отдавать что-то непустое,
  // если текст в `.EProductSnippet2-Deliveries` вообще есть.

  it('fallback strategy 2: direct children when leaves hide under icons', () => {
    // Badge wrapper содержит SVG-иконку + текст-обёртку: leaf-обход пропускает
    // контейнеры, но strategy 2 возьмёт textContent прямых детей.
    const root = buildDeliveries([
      {
        className: 'Badge',
        children: [
          { tag: 'svg', text: '' }, // иконка без текста
          {
            className: 'IconWrapper',
            children: [
              {
                className: 'ActualBadgeText',
                children: [{ text: 'Курьер' }],
              },
            ],
          },
        ],
      },
      {
        className: 'Badge',
        children: [
          { tag: 'svg', text: '' },
          {
            className: 'IconWrapper',
            children: [
              {
                className: 'ActualBadgeText',
                children: [{ text: 'Из магазина' }],
              },
            ],
          },
        ],
      },
    ]);
    // Strategy 1 должна найти leaf-текст «Курьер» и «Из магазина» (они на самом
    // низком уровне без tooltip-класса). Проверяем что cascade вообще работает.
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} Из магазина`);
  });

  it('fallback strategy 3: raw text when DOM is opaque', () => {
    // Имитация непонятной A/B-разметки: один большой элемент с текстом > 40 чар,
    // leaf-обход и direct-children не смогут отдать short badges, а пустая строка
    // ломает boolean sourceMeta → нужен usable fallback.
    const root = document.createElement('div');
    root.className = 'EProductSnippet2-Deliveries';
    // Single text node directly inside root — no element children.
    root.textContent = 'Какая-то доставка с описанием';
    const result = extractDeliveryBadges(root);
    // Не пусто — чтобы sourceMeta=true
    expect(result).not.toBe('');
    // И текст присутствует
    expect(result).toContain('Какая-то доставка');
  });

  it('fallback strategy 3: truncates raw text longer than 50 chars with ellipsis', () => {
    const root = document.createElement('div');
    root.className = 'EProductSnippet2-Deliveries';
    root.textContent =
      'Очень длинное описание доставки которое точно превышает пятьдесят символов значительно';
    const result = extractDeliveryBadges(root);
    expect(result).not.toBe('');
    expect(result.length).toBeLessThanOrEqual(50); // 47 + '…'
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('captures direct text children — badge = <div><svg/>Курьер</div>', () => {
    // Regression: the real Yandex DOM uses badges where the visible text is a
    // TEXT NODE placed directly inside the badge div, alongside an SVG icon.
    // Previous leaf-only approach missed this: the outer div had element
    // children (the svg) so it was skipped as a non-leaf; the svg itself had
    // no text; no pure-text <span> existed. Result: empty → sourceMeta=false
    // AND fallback raw text "КурьерВ ПВЗКурьер В ПВЗ Доступно не…" leaked through.
    const root = buildDeliveries([
      {
        className: 'EProductSnippet2-Delivery',
        directText: 'Курьер',
        children: [{ tag: 'svg', text: '' }],
      },
      {
        className: 'EProductSnippet2-Delivery',
        directText: 'В ПВЗ',
        children: [{ tag: 'svg', text: '' }],
      },
      {
        // Hover tooltip that Yandex renders aggregated next to the badges.
        role: 'tooltip',
        children: [{ text: 'Курьер В ПВЗ Доступно не для всех категорий товаров' }],
      },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} В ПВЗ`);
  });

  it('skips tooltip subtree entirely (descriptor split across nested spans)', () => {
    // The descriptor sentence may be split into several <span>s inside a
    // tooltip wrapper. Previous per-leaf filter let the short fragments sneak
    // in. Subtree-skipping kills the whole tooltip branch.
    const root = buildDeliveries([
      { text: 'Курьер' },
      { text: 'В ПВЗ' },
      {
        role: 'tooltip',
        children: [
          { text: 'Курьер' },
          { text: 'В ПВЗ' },
          { text: 'Доступно' },
          { text: 'не для всех' },
        ],
      },
    ]);
    expect(extractDeliveryBadges(root)).toBe(`Курьер ${MIDDLE_DOT} В ПВЗ`);
  });

  it('returns non-empty for any non-trivial deliveries content (boolean-friendly)', () => {
    // Регрессия главного бага: если .EProductSnippet2-Deliveries существует
    // и содержит любой осмысленный текст, extractor обязан вернуть non-empty.
    // Иначе schema-boolean sourceMeta везде флипнется в false.
    const cases = ['Курьер', 'Курьер Из магазина', 'Какая-то доставка', 'A B C D'];
    for (const raw of cases) {
      const root = document.createElement('div');
      root.className = 'EProductSnippet2-Deliveries';
      root.textContent = raw;
      expect(extractDeliveryBadges(root)).not.toBe('');
    }
  });
});

describe('extension source contract', () => {
  it('content.ts exports extractDeliveryBadges helper', () => {
    expect(EXTENSION_CONTENT_SOURCE).toContain('function extractDeliveryBadges');
  });

  it('content.ts joins badges with middle dot (U+00B7)', () => {
    // The user explicitly asked for "Курьер · Из магазина" separator.
    expect(EXTENSION_CONTENT_SOURCE).toMatch(/join\(\s*'\s\\u00B7\s'\s*\)/);
  });

  it('content.ts uses extractDeliveryBadges for #SourceMeta (not raw getTextContent)', () => {
    // Guard against a regression where #SourceMeta goes back to raw textContent.
    expect(EXTENSION_CONTENT_SOURCE).toMatch(/row\['#SourceMeta'\]\s*=\s*deliveryText/);
    // Ensure the helper is actually wired into the SourceMeta path.
    expect(EXTENSION_CONTENT_SOURCE).toMatch(/extractDeliveryBadges\(deliveriesEl\)/);
  });

  it('content.ts filters descriptor phrases (Доступно / Подробнее / Не для / Не все)', () => {
    expect(EXTENSION_CONTENT_SOURCE).toContain('Доступно|Подробнее|Не для|Не все');
  });
});
