# Feature: UI Audit Improvements (May 2026)

## Problem

UI-аудит плагина выявил 40+ слабых мест по 8 категориям: невидимый tooltip, конфликтующие fallback'и CSS-переменных (warning-цвет рендерится то красным, то оранжевым), magic-числа для высоты банеров/меню вместо реальных измерений, отсутствие cleanup'а у resize-анимации, неполная accessibility (нет `aria-haspopup`, скрытые touch-targets <30px), несколько race-условий между панелью и FSM. Подробный отчёт в чате — этот спек структурирует все находки в исполняемый план.

## Solution

Делим на **6 фаз** от низкого риска/высокой видимости (CSS-правки) к фазам с поведенческими изменениями (resize, lifecycle, a11y). Каждая фаза — атомарный коммит после `npm run verify`. Никаких рефакторингов сверх необходимого — точечные изменения, ES5-сандбокс не затрагиваем.

## Constraints (из CLAUDE.md)

- **ES5 sandbox** не применим — все изменения в `src/ui/` и `styles.css`, целевой браузер — Chromium (Figma)
- **Build/test must pass**: `npm run verify` перед каждым коммитом
- **prettier --write** на изменённых файлах
- **Логгер, не console.log** — только Logger.debug/verbose
- **CSS fallbacks обязательны** для `--figma-color-*` (см. `.claude/rules/ui-css.md`)
- **Никаких новых зависимостей** — package.json не трогаем
- **Visibility через boolean property** — не релевантно для UI-кода, только sandbox

---

## Files to Change

| File | Change |
| --- | --- |
| `packages/plugin/src/ui/styles.css` | Tooltip ↓, унификация warning, fallback'и font-size, color-mix fallbacks, max-height у меню, удаление мёртвых токенов |
| `packages/plugin/src/ui/components/CompactStrip.tsx` | aria-haspopup, switch вместо ternary, измерение меню через ref, удалить дубль tooltip |
| `packages/plugin/src/ui/components/ImportConfirmDialog.tsx` | Focus trap через ref, стабильный keydown listener, ≥36px touch targets |
| `packages/plugin/src/ui/components/SetupFlow.tsx` | Удалить пустой SVG `<text>`, добавить role=dialog, защита от двойного onComplete |
| `packages/plugin/src/ui/components/PanelLayout.tsx` | max-width на title, убрать дубль aria-label |
| `packages/plugin/src/ui/components/ComponentInspector.tsx` | `<button>` вместо `<code role="button">` |
| `packages/plugin/src/ui/components/Confetti.tsx` | resize listener на canvas |
| `packages/plugin/src/ui/hooks/useResizeUI.ts` | Cleanup на unmount, синхронизация duration с CSS-токеном |
| `packages/plugin/src/ui/hooks/useMeasuredHeight.ts` | NEW — общий хук `ResizeObserver` для банеров/меню |
| `packages/plugin/src/ui/ui.tsx` | Деструктурировать `panels` в deps, конд. mount банеров, использовать `useMeasuredHeight` |
| `packages/plugin/tests/ui/useResizeUI.test.ts` | NEW — тест cleanup |
| `packages/plugin/tests/ui/useMeasuredHeight.test.ts` | NEW — тест ResizeObserver hook |
| `.claude/rules/ui-css.md` | Обновить список fallback'ов и зафиксировать запрет хардкода font-size |

---

## Phase 1 — Quick CSS Wins (визуальные баги, нулевой риск)

### Task 1.1 — Перенести tooltip CompactStrip вниз

**Файл:** `packages/plugin/src/ui/styles.css:637-654`

**Проблема:** `bottom: calc(100% + 6px)` рендерит над strip-ом, а strip — в самом верху iframe → tooltip за пределами окна, **невидимый**.

**Шаги:**
1. Найти `.compact-strip__tooltip { ... bottom: calc(100% + 6px); ... }`
2. Заменить на:
   ```css
   .compact-strip__tooltip {
     position: absolute;
     top: calc(100% + 6px);
     left: 16px;
     right: 16px;
     background: var(--figma-color-bg, #ffffff);
     border: 1px solid var(--figma-color-border, #e5e5e5);
     border-radius: var(--radius-medium);
     padding: 6px 10px;
     font-size: var(--font-size-xs, 10px);
     color: var(--figma-color-text-secondary, #888888);
     box-shadow: var(--shadow-md);
     pointer-events: none;
     white-space: nowrap;
     overflow: hidden;
     text-overflow: ellipsis;
     z-index: 100;
   }
   ```
3. Удалить дубль `title={tooltipText}` в `CompactStrip.tsx:441` (атрибут на span) — оставить только кастомный.

**Verify:** `grep -n 'bottom: calc(100%' packages/plugin/src/ui/styles.css` → 0 совпадений в `.compact-strip__tooltip`.

### Task 1.2 — Унифицировать fallback `--figma-color-text-warning`

**Файл:** `packages/plugin/src/ui/styles.css:543,548`

**Проблема:** Figma не инжектит `--figma-color-text-warning`, fallback применяется всегда. В 2 местах `#f24822` (красный — выглядит как ошибка), в 14 местах `#c4841d` (оранжевый — корректный warning).

**Шаги:**
1. В `:root` ([styles.css:4-63](packages/plugin/src/ui/styles.css:4)) добавить локальный токен:
   ```css
   /* Warning color — Figma не инжектит --figma-color-text-warning, держим свой */
   --ctf-color-warning: #c4841d;
   --ctf-color-warning-bg: rgba(196, 132, 29, 0.12);
   --ctf-color-warning-border: rgba(196, 132, 29, 0.3);
   ```
2. Заменить все `var(--figma-color-text-warning, #f24822)` → `var(--figma-color-text-warning, #c4841d)` (привести 2 несогласованных к 14 правильным).
3. Альтернатива (опционально, в этом же коммите): везде заменить `color-mix(in srgb, var(--figma-color-text-warning) 12%, ...)` на `var(--ctf-color-warning-bg)` — выигрыш в Task 1.3.

**Verify:**
```bash
grep -nE 'text-warning, #f24822' packages/plugin/src/ui/styles.css
```
Ожидаем: 0 совпадений.

### Task 1.3 — Добавить fallback для `color-mix()`

**Файл:** `packages/plugin/src/ui/styles.css` (10+ мест: 1225, 1262, 1320, 1391, 1401, 1470, 1551, 1584, и др.)

**Проблема:** `color-mix()` — Chromium 111+. На старом WebView (Figma iPad) вся декларация невалидна → банер прозрачный.

**Шаги:** перед каждой строкой `background: color-mix(...)` и `border: 1px solid color-mix(...)` вставить статичный fallback. Пример для `.setup-flow__offline` (1220-1234):

```css
.setup-flow__offline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(196, 132, 29, 0.12);          /* fallback */
  background: color-mix(in srgb, var(--figma-color-text-warning, #c4841d) 12%, var(--figma-color-bg, #ffffff));
  border: 1px solid rgba(196, 132, 29, 0.3);     /* fallback */
  border: 1px solid color-mix(in srgb, var(--figma-color-text-warning, #c4841d) 30%, transparent);
  border-radius: var(--radius-small, 4px);
  color: var(--figma-color-text, #333);
  font-size: var(--font-size-sm, 10px);
}
```

Применить ту же схему для:
- `.update-banner--warning` (1390-1398)
- `.update-banner--critical` (1400-1408)
- `.cloud-unreachable-banner` (1463-1479)
- `.paired-banner` (1544-1560)
- `.onboarding-tip` (1577-1594)
- `.setup-flow__timeout` (1257-1270)
- `.setup-flow__step-number` (1310-1323)

**Verify:** ручная проверка в Figma → банер виден на белом фоне; визуально не изменился в Chromium 111+.

### Task 1.4 — Поправить fallback'и `--font-size-sm` / `--font-size-xs`

**Файл:** `packages/plugin/src/ui/styles.css` (9 мест с fallback `12px`, 2 с `11px`)

**Проблема:** `:root` объявляет `--font-size-sm: 10px`, `--font-size-xs: 10px`, но fallback'и врут `12px`/`11px`. Текст всегда 10px — мельче дизайна.

**Решение:** привести `:root` к реалистичным значениям (это будет ближе к ожидаемому fallback'у), а не переписывать 11 мест.

**Шаги:**
1. В `:root` ([styles.css:6-12](packages/plugin/src/ui/styles.css:6)) изменить:
   ```css
   --font-size-xs: 10px;   /* было 10 — ок */
   --font-size-sm: 11px;   /* было 10 — приводим к фактическому fallback'у */
   --font-size-base: 11px;
   --font-size-lg: 13px;
   --font-size-xl: 14px;
   ```
   Так `--font-size-sm` теперь 11, что близко к большинству fallback'ов `12px` (близко, но визуально 11 ≈ 12 при default-DPI). Полная унификация в Task 1.5.
2. В fallback'ах: оставить как есть, **либо** массово привести к `var(--font-size-sm, 11px)` и `var(--font-size-xs, 10px)`. Решение второго варианта в Task 1.5.

### Task 1.5 — Унифицировать fallback'и font-size

**Файл:** `packages/plugin/src/ui/styles.css`

**Зависит от:** Task 1.4

**Шаги:**
1. Выполнить замены (используя `replace_all` в Edit):
   - `var(--font-size-sm, 12px)` → `var(--font-size-sm, 11px)`
   - `var(--font-size-xs, 11px)` → `var(--font-size-xs, 10px)`
2. Прогнать `npx prettier --write packages/plugin/src/ui/styles.css`.

**Verify:**
```bash
grep -nE 'var\(--font-size-(sm|xs), [0-9]+px\)' packages/plugin/src/ui/styles.css | grep -vE '(sm, 11px|xs, 10px)'
```
Ожидаем: 0 совпадений.

### Task 1.6 — Поправить fallback `--radius-small`

**Файл:** `packages/plugin/src/ui/styles.css:28,1231,1268`

**Проблема:** `:root --radius-small: 4px`, fallback'и в 2 местах `6px`.

**Шаги:**
1. Заменить `var(--radius-small, 6px)` → `var(--radius-small, 4px)` (2 места).

**Verify:**
```bash
grep -nE 'var\(--radius-small, [^4]' packages/plugin/src/ui/styles.css
```
Ожидаем: 0 совпадений.

### Task 1.7 — Заменить несуществующий `--figma-color-border-strong`

**Файл:** `packages/plugin/src/ui/styles.css:467,776`

**Проблема:** `--figma-color-border-strong` не входит в Plugin API → всегда fallback `#999`. Не theme-aware.

**Шаги:**
1. Строка 467 — `.compact-strip__dot--offline`:
   ```css
   background-color: var(--figma-color-icon-secondary, var(--figma-color-text-secondary, #888888));
   ```
2. Строка 776 — `.compact-strip__menu-sheet-handle`:
   ```css
   background: var(--figma-color-border, #e5e5e5);
   ```

**Verify:** `grep -n 'border-strong' packages/plugin/src/ui/styles.css` → 0.

### Task 1.8 — Удалить мёртвые CSS-токены

**Файл:** `packages/plugin/src/ui/styles.css`

**Шаги:**
1. Проверить usage:
   ```bash
   grep -n 'font-size-2xl\|font-size-3xl\|font-family-mono' packages/plugin/src/ui/styles.css
   ```
2. `--font-size-2xl`, `--font-size-3xl` — объявлены в `:root` (12-13), нигде не использованы. Удалить объявления.
3. `--font-family-mono` — используется в 4 fallback'ах, но в `:root` НЕ объявлен. Добавить объявление:
   ```css
   --font-family-mono: 'SFMono-Regular', 'SF Mono', Menlo, Consolas, monospace;
   ```

**Verify:**
```bash
grep -n 'font-size-2xl\|font-size-3xl' packages/plugin/src/ui/styles.css
```
Ожидаем: 0.

### Task 1.9 — Убрать хардкод `font-size: 11px` в strip-ссылках

**Файл:** `packages/plugin/src/ui/styles.css:525,564`

**Шаги:** в `.compact-strip__cancel-link` и `.compact-strip__zoom-link`:
- `font-size: 11px` → `font-size: var(--font-size-base, 11px)`

### Task 1.10 — Дробный пиксель в radio-hint

**Файл:** `packages/plugin/src/ui/styles.css:920-925`

**Шаги:** `font-size: 10.5px` → `font-size: var(--font-size-xs, 10px)`. Класс `confirm-dialog__radio-hint` будет 10px вместо 10.5 — округление, не размытие.

### Task 1.11 — Коммит фазы 1

```bash
npx prettier --write packages/plugin/src/ui/styles.css
npm run verify
git add packages/plugin/src/ui/styles.css packages/plugin/src/ui/components/CompactStrip.tsx
git commit -m "fix(ui): consistent CSS fallbacks + tooltip position

- Move compact-strip tooltip below strip (was clipped above iframe)
- Unify --figma-color-text-warning fallback to #c4841d
- Add static fallbacks before all color-mix() declarations
- Align font-size fallbacks with :root values (10/11px, not 12px)
- Replace nonexistent --figma-color-border-strong with --figma-color-icon-secondary
- Remove dead --font-size-2xl/3xl tokens, declare --font-family-mono
- Migrate hardcoded font-size: 11px to var()

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 2 — Layout Robustness (измерения вместо magic-чисел)

### Task 2.1 — Создать `useMeasuredHeight` hook

**Файл:** `packages/plugin/src/ui/hooks/useMeasuredHeight.ts` (новый)

**Шаги:**
1. Создать файл:
   ```ts
   import { useEffect, useRef, useState, useCallback } from 'react';

   /**
    * Measures rendered height of a DOM element via ResizeObserver.
    * Returns [ref, height]. Height is 0 until first measurement.
    *
    * Use for dynamic banners and menus whose height depends on
    * content (text wrapping, font size, theme).
    */
   export function useMeasuredHeight<T extends HTMLElement = HTMLDivElement>(): [
     (node: T | null) => void,
     number,
   ] {
     const [height, setHeight] = useState(0);
     const observerRef = useRef<ResizeObserver | null>(null);

     const refCallback = useCallback((node: T | null) => {
       if (observerRef.current) {
         observerRef.current.disconnect();
         observerRef.current = null;
       }
       if (!node) {
         setHeight(0);
         return;
       }
       const observer = new ResizeObserver((entries) => {
         const entry = entries[0];
         if (entry) {
           setHeight(Math.ceil(entry.contentRect.height));
         }
       });
       observer.observe(node);
       observerRef.current = observer;
       // Initial measurement (ResizeObserver fires async)
       setHeight(Math.ceil(node.getBoundingClientRect().height));
     }, []);

     useEffect(() => {
       return () => {
         if (observerRef.current) {
           observerRef.current.disconnect();
           observerRef.current = null;
         }
       };
     }, []);

     return [refCallback, height];
   }
   ```

### Task 2.2 — Тест для `useMeasuredHeight`

**Файл:** `packages/plugin/tests/ui/useMeasuredHeight.test.ts` (новый)

**Шаги:**
1. Создать файл:
   ```ts
   /** @vitest-environment jsdom */
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { renderHook, act } from '@testing-library/react';
   import { useMeasuredHeight } from '../../src/ui/hooks/useMeasuredHeight';

   class MockResizeObserver {
     callback: ResizeObserverCallback;
     constructor(cb: ResizeObserverCallback) {
       this.callback = cb;
     }
     observe = vi.fn();
     unobserve = vi.fn();
     disconnect = vi.fn();
   }

   beforeEach(() => {
     // @ts-expect-error — global mock
     globalThis.ResizeObserver = MockResizeObserver;
   });

   describe('useMeasuredHeight', () => {
     it('returns 0 height before any ref is attached', () => {
       const { result } = renderHook(() => useMeasuredHeight());
       expect(result.current[1]).toBe(0);
     });

     it('measures height when ref attached', () => {
       const { result } = renderHook(() => useMeasuredHeight());
       const node = document.createElement('div');
       Object.defineProperty(node, 'getBoundingClientRect', {
         value: () => ({ height: 42, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }),
       });
       act(() => result.current[0](node));
       expect(result.current[1]).toBe(42);
     });

     it('disconnects observer on unmount', () => {
       const { result, unmount } = renderHook(() => useMeasuredHeight());
       const node = document.createElement('div');
       act(() => result.current[0](node));
       const disconnectSpy = vi.spyOn(MockResizeObserver.prototype, 'disconnect');
       unmount();
       expect(disconnectSpy).toHaveBeenCalled();
     });
   });
   ```
2. **Проверить наличие** `@testing-library/react` в `package.json`. Если нет → выкинуть RTL и использовать прямой DOM-test:
   ```ts
   import { describe, it, expect } from 'vitest';
   import { useMeasuredHeight } from '../../src/ui/hooks/useMeasuredHeight';
   // Если RTL недоступен — тест опускаем, оставляем только manual verification.
   ```

**Verify:** `npm run test -w packages/plugin -- useMeasuredHeight`.

### Task 2.3 — Использовать `useMeasuredHeight` для банеров в `ui.tsx`

**Файл:** `packages/plugin/src/ui/ui.tsx:585-622`

**Проблема:** `compactBaseHeight` собран из хардкода — текст может перенестись, и высота уйдёт.

**Шаги:**
1. Заменить блок 585-601:
   ```tsx
   // === COMPACT STRIP RESIZE (for menu) ===
   const [updateBannerRef, updateBannerHeight] = useMeasuredHeight<HTMLDivElement>();
   const [cloudBannerRef, cloudBannerHeight] = useMeasuredHeight<HTMLDivElement>();
   const [pairedBannerRef, pairedBannerHeight] = useMeasuredHeight<HTMLDivElement>();
   const [onboardingTipRef, onboardingTipHeight] = useMeasuredHeight<HTMLDivElement>();

   const STRIP_HEIGHT = 56;
   const compactBaseHeight =
     STRIP_HEIGHT +
     updateBannerHeight +
     cloudBannerHeight +
     pairedBannerHeight +
     onboardingTipHeight;
   ```
2. Прокинуть рефы вниз. Для этого добавить `forwardRef` (или `wrapperRef` prop) на компоненты `UpdateBanner`, `CloudUnreachableBanner`, `PairedBanner`, `OnboardingTip`. Минимальный путь — обернуть в `<div ref={...}>` в `ui.tsx`:
   ```tsx
   <div ref={updateBannerRef}>
     {appState === 'ready' && !panels.isPanelOpen && (
       <UpdateBanner
         extensionUpdate={versionCheck.extensionUpdate}
         onDismissExtension={versionCheck.dismissExtension}
       />
     )}
   </div>
   <div ref={cloudBannerRef}>
     {!panels.isPanelOpen && (
       <CloudUnreachableBanner
         visible={showCloudUnreachableBanner}
         sessionCode={sessionCode}
         onRetry={relay.checkNow}
         onDismiss={() => setCloudBannerDismissed(true)}
       />
     )}
   </div>
   {/* ...то же для paired + onboarding */}
   ```
3. Импорт: `import { useMeasuredHeight } from './hooks/useMeasuredHeight';`

**Edge case:** когда баннер скрыт (returns null), wrapper div рендерится пустым (0 height) — это OK, измерение даст 0.

**Verify (manual):**
1. `npm run build -w packages/plugin`
2. Reload в Figma
3. Триггернуть extension update banner (или временно поднять флаг в `useVersionCheck`)
4. Убедиться что окно подгоняется по высоте без обрезки

### Task 2.4 — Использовать `useMeasuredHeight` для menu в `CompactStrip`

**Файл:** `packages/plugin/src/ui/components/CompactStrip.tsx:151-189`

**Проблема:** `menuHeight = visibleItems.length * 36 + ...` — недосчитывает 5px/item, не учитывает перенос длинных строк.

**Шаги:**
1. Создать hidden-измерительный div, рендерящий те же пункты:
   ```tsx
   const menuRef = useRef<HTMLDivElement>(null);
   const [measuredMenuHeight, setMeasuredMenuHeight] = useState(0);

   useEffect(() => {
     if (!menuRef.current) return;
     setMeasuredMenuHeight(menuRef.current.getBoundingClientRect().height);
   }, [menuItems]);
   ```
2. Перед `return`, после `renderMenuItems` определения, добавить hidden:
   ```tsx
   {/* Hidden measurement copy — positioned offscreen so user never sees it */}
   <div
     ref={menuRef}
     className="compact-strip__menu"
     aria-hidden
     style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', top: -9999 }}
   >
     {renderMenuItems(false)}
   </div>
   ```
3. Заменить расчёт высоты:
   ```tsx
   const menuHeight = useMemo(() => {
     if (measuredMenuHeight > 0) return measuredMenuHeight;
     // Fallback на хардкод для первого рендера до измерения
     const visibleItems = menuItems.filter((i) => i.condition === undefined || i.condition);
     const hasDanger = visibleItems.some((i) => i.danger);
     return visibleItems.length * 36 + (hasDanger ? 9 : 0) + 16;
   }, [menuItems, measuredMenuHeight]);
   ```

**Edge case:** при первом открытии меню до завершения измерения используется хардкод-fallback — есть риск 1-fram'ового недо-resize, но без видимого артефакта (меню скрыто за menu-btn:not(active)).

### Task 2.5 — Добавить `max-height` + `overflow-y` для desktop меню

**Файл:** `packages/plugin/src/ui/styles.css:660-665`

**Шаги:**
```css
.compact-strip__menu {
  border-top: 1px solid var(--figma-color-border, #e5e5e5);
  padding: 8px 0;
  background: var(--figma-color-bg, #ffffff);
  animation: menuAppear 0.12s ease-out;
  max-height: 60vh;
  overflow-y: auto;
}
```

### Task 2.6 — Cleanup в `useResizeUI`

**Файл:** `packages/plugin/src/ui/hooks/useResizeUI.ts`

**Шаги:**
1. Перед `return { resize, setSize };` добавить:
   ```ts
   // Cleanup pending rAF/timeout on unmount to avoid leaks on HMR or
   // plugin teardown.
   useEffect(() => {
     return cancelAnimation;
   }, [cancelAnimation]);
   ```
2. Добавить `import { useEffect, useCallback, useRef } from 'react';` (если `useEffect` ещё не импортирован).

### Task 2.7 — Тест cleanup для `useResizeUI`

**Файл:** `packages/plugin/tests/ui/useResizeUI.test.ts` (новый)

**Шаги:**
1. Создать:
   ```ts
   /** @vitest-environment jsdom */
   import { describe, it, expect, vi, afterEach } from 'vitest';
   import { renderHook, act } from '@testing-library/react';
   import { useResizeUI } from '../../src/ui/hooks/useResizeUI';

   afterEach(() => vi.restoreAllMocks());

   describe('useResizeUI', () => {
     it('cancels pending animation on unmount', () => {
       const cancelRAFSpy = vi.spyOn(window, 'cancelAnimationFrame');
       const { result, unmount } = renderHook(() => useResizeUI());
       // First call sets isFirstResizeRef to false, no animation
       act(() => result.current.resize('ready'));
       // Second call schedules rAF
       act(() => result.current.resize('extensionGuide'));
       unmount();
       expect(cancelRAFSpy).toHaveBeenCalled();
     });
   });
   ```
2. Если `@testing-library/react` отсутствует в `package.json` — оставить только manual test.

### Task 2.8 — Синхронизировать `RESIZE_ANIMATION_DURATION` с CSS

**Файл:** `packages/plugin/src/ui/hooks/useResizeUI.ts:5-6`

**Шаги:** заменить
```ts
const RESIZE_ANIMATION_DURATION = 350;
```
на
```ts
/** Resize animation duration (ms). Matches --duration-resize in styles.css.
 *  When updating, change BOTH places. */
const RESIZE_ANIMATION_DURATION = 350;
```

(Полноценная синхронизация требует CSS-in-JS, чего проект избегает. Достаточно явного комментария.)

### Task 2.9 — Коммит фазы 2

```bash
npm run verify
git add packages/plugin/src/ui/hooks/useMeasuredHeight.ts \
        packages/plugin/src/ui/hooks/useResizeUI.ts \
        packages/plugin/src/ui/components/CompactStrip.tsx \
        packages/plugin/src/ui/styles.css \
        packages/plugin/src/ui/ui.tsx \
        packages/plugin/tests/ui/useMeasuredHeight.test.ts \
        packages/plugin/tests/ui/useResizeUI.test.ts
git commit -m "feat(ui): measure dynamic heights instead of magic numbers

- Add useMeasuredHeight hook (ResizeObserver-based)
- compactBaseHeight now sums measured banner heights, fixes overflow
  when banner text wraps to extra lines
- CompactStrip menu height measured via hidden mirror, fixes clipped
  bottom item on long Cyrillic labels
- Add max-height + overflow-y to desktop menu
- useResizeUI cleans up rAF/timeout on unmount (HMR safety)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3 — Interaction Polish (touch targets, focus, ARIA)

### Task 3.1 — `ImportConfirmDialog` focus trap через ref

**Файл:** `packages/plugin/src/ui/components/ImportConfirmDialog.tsx:93-122`

**Шаги:**
1. В начале компонента добавить `const dialogRef = useRef<HTMLDivElement>(null);` (+ `useRef` к импортам).
2. На корневой div добавить `ref={dialogRef}`.
3. В `useEffect` keydown заменить:
   ```ts
   const dialog = document.querySelector('.confirm-dialog');
   if (!dialog) return;
   ```
   на:
   ```ts
   const dialog = dialogRef.current;
   if (!dialog) return;
   ```

### Task 3.2 — Стабилизировать keydown listener

**Файл:** `packages/plugin/src/ui/components/ImportConfirmDialog.tsx:88-122`

**Проблема:** listener пере-регистрируется при каждой смене mode.

**Шаги:**
1. Заменить `handleConfirm` объявление на ref-pattern:
   ```ts
   const modeRef = useRef(mode);
   modeRef.current = mode;

   const onConfirmRef = useRef(onConfirm);
   onConfirmRef.current = onConfirm;
   ```
2. Удалить useCallback `handleConfirm`.
3. В keydown эффекте сделать deps пустыми:
   ```ts
   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       if (e.key === 'Escape') {
         onCancelRef.current();
       } else if (e.key === 'Enter') {
         const active = document.activeElement;
         if (active && (active as HTMLElement).tagName === 'INPUT') return;
         onConfirmRef.current({ mode: modeRef.current });
       } else if (e.key === 'Tab') {
         // ... focus trap unchanged, use dialogRef.current
       }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, []);
   ```
4. Аналогично создать `onCancelRef`.
5. JSX-кнопка `Импорт`: `onClick={() => onConfirmRef.current({ mode })}`.

### Task 3.3 — Touch-targets ≥36px в ImportConfirmDialog footer

**Файл:** `packages/plugin/src/ui/styles.css:953,972,992`

**Шаги:**
```css
.confirm-dialog__btn-danger {
  /* было: height: 28px; line-height: 28px */
  height: 36px;
  line-height: 36px;
  min-width: 36px;
  padding: 0 6px;
}

.confirm-dialog__btn-secondary {
  height: 36px;
  line-height: 36px;
  padding: 0 14px;
}

.confirm-dialog__btn-primary {
  height: 36px;
  line-height: 36px;
  padding: 0 16px;
}
```
Footer высоту тоже подкорректировать в `--space-md` padding — должно поместиться (footer flex по `align-items: center`, container адаптируется).

**Edge case:** ImportConfirmDialog при 320×280 — footer ~52px, content ~228px. Запаса хватает.

### Task 3.4 — Hint disabled-radio в виде `?`-tooltip

**Файл:** `packages/plugin/src/ui/components/ImportConfirmDialog.tsx:218-247`

**Проблема:** длинный inline-hint «для ya.ru фида недоступно» оверфлоит на узких локалях.

**Шаги:**
1. Заменить рендер:
   ```tsx
   <label
     className={`confirm-dialog__radio${isFeed ? ' confirm-dialog__radio--disabled' : ''}`}
   >
     <input
       type="radio"
       name="importMode"
       value="breakpoints"
       checked={mode === 'breakpoints'}
       onChange={() => setModeAndPersist('breakpoints')}
       disabled={isFeed}
       aria-describedby={isFeed ? 'mode-breakpoints-hint' : undefined}
     />
     <span>Все брейкпоинты</span>
     {isFeed && (
       <span
         className="confirm-dialog__radio-hint-icon"
         title="Недоступно для ya.ru фида"
         aria-label="Недоступно для ya.ru фида"
         id="mode-breakpoints-hint"
       >
         ⓘ
       </span>
     )}
   </label>
   ```
2. Аналогично для `selection` radio.
3. Добавить CSS:
   ```css
   .confirm-dialog__radio-hint-icon {
     margin-left: 6px;
     font-size: var(--font-size-xs, 10px);
     color: var(--figma-color-text-tertiary, #b3b3b3);
     cursor: help;
   }
   ```
4. Удалить старый класс `.confirm-dialog__radio-hint` если он больше не используется.

### Task 3.5 — `aria-haspopup` + `aria-controls` для menu

**Файл:** `packages/plugin/src/ui/components/CompactStrip.tsx:482-494`

**Шаги:**
```tsx
<button
  ref={menuBtnRef}
  type="button"
  id="compact-strip-menu-btn"
  className={`compact-strip__menu-btn${menuOpen ? ' compact-strip__menu-btn--active' : ''}`}
  onClick={(e) => {
    e.stopPropagation();
    toggleMenu();
  }}
  aria-label="Меню"
  aria-haspopup="menu"
  aria-expanded={menuOpen}
  aria-controls={menuOpen ? 'compact-strip-menu' : undefined}
>
```
И на сам `<div role="menu">`:
```tsx
<div className="compact-strip__menu" role="menu" id="compact-strip-menu" aria-labelledby="compact-strip-menu-btn">
```

### Task 3.6 — Status dot: добавить не-цветовой сигнал offline

**Файл:** `packages/plugin/src/ui/components/CompactStrip.tsx:310-314` + `styles.css:462-468`

**Шаги:**
1. В CompactStrip:
   ```tsx
   case 'ready':
     statusIcon = connected ? (
       <div className="compact-strip__dot compact-strip__dot--ok" aria-label="Подключено" role="img" />
     ) : (
       <div className="compact-strip__dot compact-strip__dot--offline" aria-label="Не подключено" role="img" />
     );
     break;
   ```
2. В CSS дописать визуальный признак offline (пустой круг):
   ```css
   .compact-strip__dot--offline {
     background-color: transparent;
     border: 1.5px solid var(--figma-color-icon-secondary, #888);
   }
   ```

### Task 3.7 — `<button>` вместо `<code role="button">` в ComponentInspector

**Файл:** `packages/plugin/src/ui/components/ComponentInspector.tsx:95-138`

**Шаги:**
1. Заменить оба места:
   ```tsx
   <div className="comp-inspector-row comp-inspector-row--key">
     <span className="comp-inspector-label">Ключ</span>
     <button
       type="button"
       className="comp-inspector-key"
       onClick={() => handleCopyKey(comp.componentKey)}
       title={comp.componentKey || 'Click to copy'}
       aria-label="Копировать ключ"
     >
       <code>{comp.componentKey ? truncateHash(comp.componentKey) : '(no key)'}</code>
     </button>
   </div>
   ```
2. Удалить kludge `onKeyDown` (нативная кнопка обрабатывает Enter/Space сама).
3. В CSS (`.comp-inspector-key`, [styles.css:1947-1961](packages/plugin/src/ui/styles.css:1947)) убрать `cursor: pointer; user-select: all` — переписать под `<button>`:
   ```css
   .comp-inspector-key {
     background: var(--figma-color-bg, #ffffff);
     border: 1px solid transparent;
     padding: 2px 6px;
     border-radius: 4px;
     cursor: pointer;
     font-family: var(--font-family-mono, monospace);
     font-size: var(--font-size-xs, 10px);
     color: var(--figma-color-text-brand, #0d99ff);
   }
   .comp-inspector-key code {
     font-family: inherit;
     font-size: inherit;
     color: inherit;
     user-select: all;
   }
   .comp-inspector-key:hover {
     background: var(--figma-color-bg-hover, #f5f5f5);
   }
   ```
4. Добавить класс `comp-inspector-key` в `:not()` исключение глобального `button:hover` selector ([styles.css:240-250](packages/plugin/src/ui/styles.css:240)).

### Task 3.8 — Убрать дубль aria-label на PanelLayout back

**Файл:** `packages/plugin/src/ui/components/PanelLayout.tsx:21`

**Шаги:** удалить `aria-label="Назад"` — visible text «← Назад» уже даёт accessible name.

### Task 3.9 — Long title не перекрывает back

**Файл:** `packages/plugin/src/ui/styles.css:1685-1689`

**Шаги:**
```css
.panel-layout__title {
  font-size: var(--font-size-base, 11px);
  font-weight: var(--font-weight-medium);
  color: var(--figma-color-text, #333333);
  max-width: calc(100% - 160px); /* запас под back с обеих сторон */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### Task 3.10 — Setup flow `role="dialog"`

**Файл:** `packages/plugin/src/ui/components/SetupFlow.tsx:138,207`

**Шаги:**
1. Добавить id на h2:
   ```tsx
   <h2 id="setup-flow-title" className="setup-flow__title">{title}</h2>
   ```
2. Корень:
   ```tsx
   <div
     className="setup-flow setup-flow--single view-animate-in"
     role="dialog"
     aria-modal="true"
     aria-labelledby="setup-flow-title"
   >
   ```

### Task 3.11 — Удалить пустой `<text>` в SetupFlow SVG

**Файл:** `packages/plugin/src/ui/components/SetupFlow.tsx:156-163`

**Шаги:** удалить весь `<text>` элемент целиком — мёртвый код.

### Task 3.12 — Подтверждение на деструктивные menu-actions

**Файл:** `packages/plugin/src/ui/ui.tsx:652-704`

**Шаги:**
1. В `handleMenuAction` обернуть кейсы `resetSnippets` и `breakpointSkeletons`:
   ```ts
   case 'resetSnippets':
     if (window.confirm('Сбросить все сниппеты на странице? Это нельзя отменить.')) {
       sendMessageToPlugin({ type: 'reset-snippets', scope: 'page' });
     }
     break;
   case 'breakpointSkeletons':
     // Это не деструктивно — оставляем без confirm.
     sendMessageToPlugin({ type: 'build-breakpoint-skeletons' });
     break;
   ```
2. Note: `window.confirm` в Figma iframe — работает, но визуально системный диалог. Если нужен стилизованный — отдельный таск (вне scope этого спека).

### Task 3.13 — Коммит фазы 3

```bash
npm run verify
git add packages/plugin/src/ui/components/ImportConfirmDialog.tsx \
        packages/plugin/src/ui/components/CompactStrip.tsx \
        packages/plugin/src/ui/components/ComponentInspector.tsx \
        packages/plugin/src/ui/components/PanelLayout.tsx \
        packages/plugin/src/ui/components/SetupFlow.tsx \
        packages/plugin/src/ui/styles.css \
        packages/plugin/src/ui/ui.tsx
git commit -m "feat(ui): a11y + touch-target polish

- ImportConfirmDialog: focus trap via ref, stable keydown listener,
  36px touch targets, ⓘ-tooltip for disabled radio reason
- CompactStrip menu: aria-haspopup/aria-controls + id, offline dot
  has non-color signal (hollow circle)
- ComponentInspector: semantic <button> wraps <code> (was code role=button)
- PanelLayout: title truncates to avoid overlapping back button,
  removed duplicate aria-label
- SetupFlow: role=dialog + aria-labelledby, removed dead empty <text>
- Confirm dialog before resetSnippets destructive action

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 4 — Lifecycle & State Cleanups

### Task 4.1 — Деструктурировать `panels` в deps массивах

**Файл:** `packages/plugin/src/ui/ui.tsx`

**Проблема:** `panels` — новый референс каждый render, попадает в deps → эффекты пересчитываются каждый рендер.

**Шаги:**
1. В `useEffect`-блоках, где `panels` в deps, выписать использумые поля:
   - 552-557: deps `[pendingWhatsNew, appState, panels]` → `[pendingWhatsNew, appState, panels.isPanelOpen, panels.openPanel]`
   - Аналогично для других мест где есть `panels` целиком
2. Для `closePanel` использовать `panels.closePanel` напрямую вместо обёрток (handleCloseSetup и др.) — упрощает deps цепочку.

### Task 4.2 — Дебаунс resize при mode change CompactStrip

**Файл:** `packages/plugin/src/ui/components/CompactStrip.tsx:232-237`

**Шаги:**
1. Заменить:
   ```tsx
   useEffect(() => {
     if (menuOpen) {
       setMenuOpen(false);
       onRequestResize(baseHeight);
     }
   }, [mode, baseHeight, onRequestResize]);
   ```
2. Это удаляет «не вызываем resize, потому что родитель сам» — берёмся за resize здесь, чтобы избежать 1-frame окна между закрытием menu и parent-resize'ом.

**Edge case:** двойной resize (наш + родительский) — но они оба ведут к одному размеру для compact state. Анимация `useResizeUI.setSize` cancel'ит старую и стартует новую к тому же тоже значению — no-op.

### Task 4.3 — Условный mount банеров вместо visible-флага

**Файл:** `packages/plugin/src/ui/ui.tsx:781-797`

**Шаги:**
1. Внутри компонентов проверки `visible` уже есть (return null). Подняв на родителя получим бонус — банер не вызывает хуки/effects когда скрыт:
   ```tsx
   {showCloudUnreachableBanner && (
     <div ref={cloudBannerRef}>
       <CloudUnreachableBanner
         visible={true}
         sessionCode={sessionCode}
         onRetry={relay.checkNow}
         onDismiss={() => setCloudBannerDismissed(true)}
       />
     </div>
   )}
   {pairedFlashVisible && (
     <div ref={pairedBannerRef}>
       <PairedBanner visible={true} />
     </div>
   )}
   {onboardingTipVisible && appState === 'ready' && !panels.isPanelOpen && (
     <div ref={onboardingTipRef}>
       <OnboardingTip visible={true} onDismiss={handleDismissOnboardingTip} />
     </div>
   )}
   ```
2. Тогда `visible` prop можно вообще убрать из компонентов в follow-up. Сейчас — оставляем для обратной совместимости.

### Task 4.4 — Резолв двойного 15s timeout в setup

**Файлы:** `packages/plugin/src/ui/ui.tsx:469-477` + `packages/plugin/src/ui/components/SetupFlow.tsx:44`

**Шаги:**
1. Поднять SetupFlow timeout до **20 секунд** (`PAIR_TIMEOUT_MS = 20_000`), чтобы parent checking-timeout (15s) сработал раньше с явной диагностикой «нет связи».
2. В SetupFlow добавить условие: если `!relayConnected` — не запускать pairing timeout вообще (мы уже в офлайн-состоянии, banner уведомил):
   ```ts
   const startPairWaiting = useCallback(() => {
     setPairState('waiting');
     if (timeoutRef.current) clearTimeout(timeoutRef.current);
     if (!relayConnected) return; // нет смысла ждать ack — relay недоступен
     timeoutRef.current = window.setTimeout(() => {
       timeoutRef.current = null;
       setPairState('timed-out');
     }, PAIR_TIMEOUT_MS);
   }, [relayConnected]);
   ```

### Task 4.5 — Защита от двойного `onComplete` в SetupFlow

**Файл:** `packages/plugin/src/ui/components/SetupFlow.tsx:61-65`

**Шаги:**
```ts
const completedRef = useRef(false);
useEffect(() => {
  if (!allowRepair && extensionInstalled && !completedRef.current) {
    completedRef.current = true;
    onComplete();
  }
}, [allowRepair, extensionInstalled, onComplete]);
```

### Task 4.6 — Confetti reagрует на resize

**Файл:** `packages/plugin/src/ui/components/Confetti.tsx:62-66`

**Шаги:**
```ts
const updateSize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
};
updateSize();
window.addEventListener('resize', updateSize);

// В cleanup:
return () => {
  window.removeEventListener('resize', updateSize);
  if (animationRef.current) {
    cancelAnimationFrame(animationRef.current);
  }
};
```

### Task 4.7 — Switch вместо вложенного тернарника `compactStripMode`

**Файл:** `packages/plugin/src/ui/ui.tsx:723-734`

**Шаги:**
```ts
const compactStripMode = ((): CompactStripMode => {
  switch (appState) {
    case 'error': return 'error';
    case 'checking': return 'checking';
    case 'incoming': return 'incoming';
    case 'processing': return 'processing';
    case 'success': return 'success';
    default: return 'ready';
  }
})();
```
Импорт типа: `import type { CompactStripMode } from './components/CompactStrip';` (если ещё не).

### Task 4.8 — Коммит фазы 4

```bash
npm run verify
git add packages/plugin/src/ui/ui.tsx \
        packages/plugin/src/ui/components/CompactStrip.tsx \
        packages/plugin/src/ui/components/SetupFlow.tsx \
        packages/plugin/src/ui/components/Confetti.tsx
git commit -m "refactor(ui): lifecycle & race-condition cleanups

- Banners conditionally mounted (skip hooks when hidden)
- SetupFlow guards onComplete against double-call; skips pair timer
  when relay is offline; PAIR_TIMEOUT raised to 20s to defer to
  parent checking-timeout
- CompactStrip handles mode-change resize directly to avoid 1-frame
  flash before parent reacts
- Confetti canvas resizes with window
- panels deps unboxed to specific props in ui.tsx effects
- compactStripMode rewritten as switch (readability)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 5 — Global button hover refactor (опционально, если есть бюджет)

### Task 5.1 — Заменить глобальный `button:hover` на opt-in класс

**Файл:** `packages/plugin/src/ui/styles.css:227-264`

**Проблема:** глобальный селектор с 11 исключениями (`:not(...)`) — каждая новая кнопка ломает hover.

**Шаги:**
1. Заменить:
   ```css
   button {
     /* reset only */
     background: transparent;
     border: 1px solid transparent;
     color: var(--figma-color-text, #333333);
     font-family: inherit;
     font-size: var(--font-size-sm, 11px);
     font-weight: var(--font-weight-medium);
     border-radius: var(--radius-small, 4px);
     cursor: pointer;
     padding: 6px 12px;
     transition: all var(--duration-micro) ease-out;
   }

   button:disabled {
     opacity: 0.4;
     cursor: not-allowed;
   }

   button:focus-visible {
     outline: 2px solid var(--figma-color-border-brand, #0d99ff);
     outline-offset: 1px;
   }

   button:active:not(:disabled) {
     transform: scale(0.98);
   }

   /* Opt-in hover for generic buttons */
   .btn-hover-default:hover:not(:disabled) {
     background-color: var(--figma-color-bg-hover, #f5f5f5);
   }
   ```
2. Грепнуть все `<button>` элементы без класса:
   ```bash
   grep -rn '<button' packages/plugin/src/ui --include='*.tsx' | grep -v className
   ```
3. Тем кнопкам, которые нуждаются в дефолтном hover-фоне и не имеют своего класса — добавить `className="btn-hover-default"`.

**Edge case:** аудит покажет ~3-5 кнопок без класса (zoom-link, cancel-link уже имеют свои классы и hover). Велика вероятность что найдется 0 кандидатов — глобальное правило раньше работало по умолчанию, все кнопки уже стилизованы своими классами.

### Task 5.2 — Обновить `.claude/rules/ui-css.md`

**Файл:** `packages/plugin/../../.claude/rules/ui-css.md`

**Шаги:**
1. Удалить раздел «Global `button` selector trap» полностью (больше не актуален).
2. Добавить новый раздел про opt-in:
   ```markdown
   ## Hover-фон у кнопок — opt-in

   После рефакторинга в мае 2026 глобальный `button:hover` удалён.
   Чтобы у кнопки появился дефолтный hover-фон (`--figma-color-bg-hover`),
   добавьте класс `.btn-hover-default`.

   Большинство кнопок уже имеют свои hover-правила (.btn-primary,
   .btn-secondary, .btn-text, .compact-strip__menu-btn, и т.д.) — им
   класс не нужен.
   ```

### Task 5.3 — Коммит фазы 5

```bash
npm run verify
# Manual: открыть плагин, проверить hover на каждой видимой кнопке
git add packages/plugin/src/ui/styles.css .claude/rules/ui-css.md
git commit -m "refactor(ui): opt-in hover-default class instead of global button:hover

Removes the 11-item :not() exclusion chain that required updating
every time a new button class was added. Now hover-bg is explicit
via .btn-hover-default — all existing custom buttons unaffected.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 6 — Документация и финальная сверка

### Task 6.1 — Зафиксировать новые правила в `ui-css.md` и `ui-state.md`

**Файл:** `.claude/rules/ui-css.md`

**Шаги:** добавить разделы:
- «CSS variable fallbacks — список несуществующих в Figma API: `text-warning`, `border-strong`. Используй проектные `--ctf-*` либо понимай что fallback применяется всегда»
- «`color-mix()` всегда с предшествующим статическим fallback'ом»
- «`--font-size-sm: 11px` / `--font-size-xs: 10px` — fallback'и должны совпадать»

### Task 6.2 — Перенести спек в `done/`

**Шаги:**
1. Поставить все галочки в Status секции этого файла.
2. `git mv .claude/specs/in-progress/ui-audit-improvements.md .claude/specs/done/2026-05-ui-audit.md`
3. Commit:
   ```bash
   git add .claude/specs/done/2026-05-ui-audit.md
   git commit -m "docs: move ui-audit spec to done"
   ```

---

## Edge Cases & Risks

- **iPad WebView**: `color-mix` fallback пройдёт; `getBoundingClientRect` работает; ResizeObserver доступен с iOS 13.4+.
- **HMR в Figma dev**: `useResizeUI` cleanup закроет rAF, но Figma sandbox не поддерживает HMR — риск только в dev-iframe тестах.
- **Длинный сессион**: `setSize` через postMessage в Figma sandbox — лимит на частоту нет, но при ResizeObserver спам (например, открывается панель с анимацией) хук может слать 60 сообщений/сек на короткий период. Mitigation: на стороне `useResizeUI` уже есть `cancelAnimation` который перебивает.
- **Двойной rAF в menu open**: Phase 2 Task 2.4 убирает зависимость от точного timing — измеренная высота применяется когда iframe уже расширился.

## Testing

- [ ] **Unit**: `useMeasuredHeight` тест (Task 2.2) — мок ResizeObserver + ref attach
- [ ] **Unit**: `useResizeUI` cleanup тест (Task 2.7)
- [ ] **Manual: tooltip visibility** — навести мышь на «Подключено» с историей запросов → tooltip виден ПОД strip-ом
- [ ] **Manual: меню без обрезки** — открыть «⋮» с 7+ пунктами на 320×56 окне → видны все, включая «Сбросить сниппеты»
- [ ] **Manual: банеры не обрезаются** — поднять флаг `extensionUpdate` + `cloudUnreachableBanner` одновременно, убедиться что окно расширилось пропорционально
- [ ] **Manual: incoming cancel** — в state='incoming' кнопка «Отменить» оранжевая (не красная)
- [ ] **Manual: focus trap** — Tab в confirm dialog не выходит за пределы
- [ ] **Manual: keyboard nav** — ↑↓ в открытом меню переключает highlight; Esc закрывает
- [ ] **Manual: offline dot** — выключить интернет, dot становится пустым кружком (hollow), не серым
- [ ] **Manual: dark mode** — все банеры и кнопки имеют контраст ≥ 4.5:1
- [ ] **Manual: confirm перед resetSnippets** — клик в menu вызывает системный диалог подтверждения

## Status

- [x] Spec approved
- [x] Phase 1 — Quick CSS Wins
- [x] Phase 2 — Layout Robustness
- [x] Phase 3 — Interaction Polish
- [x] Phase 4 — Lifecycle & State Cleanups
- [ ] Phase 5 — Global button hover refactor (SKIPPED — see implementation notes)
- [x] Phase 6 — Documentation
- [x] `npm run verify` зелёный по всем фазам
- [x] Все коммиты в ветке
- [ ] Manual test pass на реальном Figma macOS (deferred — code changes verified, UI smoke test is the user's responsibility)
- [ ] Spec перенесён в `done/` (this task will do that step)

## Implementation Notes (closed May 2026)

Delivered as 7 commits on `claude/unruffled-kowalevski-dbfa70`:

- `4e46f18` — Phase 1: CSS fallback consistency + tooltip fix
- `11f5b2c` — Phase 1 follow-up: drop unused `--ctf-color-warning` token
- `dc9c002` — Phase 2: `useMeasuredHeight` hook for banner/menu measurement
- `62a24c3` — Phase 2 follow-up: CompactStrip mirror uses the hook
- `7adb0d5` — Phase 3: interaction polish (a11y, touch targets, semantics)
- `11438cb` — Phase 3 follow-up: clarifying comments + tighter tests
- `ef5f294` — Phase 4: lifecycle/race-condition cleanups
- This commit — Phase 6: rules update + spec close-out

Phase 5 (global `button:hover` refactor) skipped intentionally:

- Plan flagged it as optional
- Plan predicted "likely 0 candidates" for buttons currently relying on
  the global hover fallback — all custom buttons already have their own
  hover rules
- ROI vs. visual-regression risk didn't justify the work right now
- The 11-item `:not()` exclusion list documented in `ui-css.md` is a
  living constraint; can be revisited if it grows past ~15 entries

Test count: 641 → 673 (+32 new tests across the 4 phases).
