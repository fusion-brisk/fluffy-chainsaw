# Промпт для Claude Design — UI-аудит Contentify

> **Как использовать:** скопировать содержимое этого файла (включая markdown-разметку) и отправить в Claude Design сессию вместе с приложенными скриншотами и ссылками на CJM-документы. Промпт самодостаточный — Claude Design не нужен доступ к репозиторию.

---

## Исходный запрос для Claude Design

Привет. Прошу провести UI/UX-аудит плагина **Contentify** для Figma — это инструмент, который автозаполняет макеты данными из живой поисковой выдачи Яндекса через цепочку Chrome Extension → Cloud Function → Figma Plugin.

### Что приложено

1. **Три CJM-документа** (Customer Journey Maps):
   - [`docs/CJM_FOR_DESIGN_AUDIT.md`](CJM_FOR_DESIGN_AUDIT.md) — сводный документ с описанием продукта, персон, UI-инвентаря, шести journey'ев и hot zones
   - [`docs/CJM_ONBOARDING.md`](CJM_ONBOARDING.md) — детальная карта первого запуска (10 шагов × 9 аспектов)
   - [`docs/CJM_CORE_LOOP.md`](CJM_CORE_LOOP.md) — детальная карта ежедневного цикла (10 шагов × 9 аспектов)
2. **Скриншоты** в `docs/screenshots/` — 10 ключевых состояний (см. `docs/screenshots/README.md` для списка)
3. (Опционально) видео-walkthrough если есть

### Контекст продукта

- **Целевая аудитория** — продуктовые дизайнеры в Яндексе, делают 5–15 импортов в день
- **Core promise** — один клик в Chrome → данные в Figma за 3 секунды
- **Архитектура** — плагин в Figma iframe + Chrome MV3 extension + Yandex Cloud Function (stateless) + YDB serverless
- **UI размеры:** compact 320×56 / standard 320×280 / extended 420×520 (Figma добавляет ~40 px заголовка)
- **AppState FSM:** `setup → checking → ready → incoming → confirming → processing → success → ready`
- **Версия:** 3.1.2 (2026-04-26). Свежие изменения: миграция local relay → cloud-relay; auto-pair handshake вместо ручного ввода кода; новое `incoming` AppState с heads-up narrative
- **Что НЕ менять:** value prop, FSM-машина, набор фичей. Аудитим только UI/UX

---

## Что нам нужно от тебя

### Приоритет 1 — Аудит Core Loop (CJM_CORE_LOOP.md)

Это **toothbrush journey** — 5–15 раз в день. Каждая лишняя секунда × 10 = ощутимая потеря.

**Особенно внимательно посмотри на новый шаг 5 «Incoming»** (heads-up narrative):

- Скриншот `07-incoming-uploading-screenshots.png` — компактная 56-px полоска с бренд-spinner'ом, текстом «Грузим скриншоты K/M…» и ссылкой «Отменить» справа
- Помещаются ли длинные значения K/M (например 99/127)?
- Контрастен ли spinner на разных темах Figma?
- Достаточно ли заметна ссылка «Отменить»? Не путается ли она с меню ⋮?
- Нужен ли тонкий progress bar снизу strip'а (как в processing)?

Также:

- Шаги 6–7 — `ImportConfirmDialog` 320×280 (скриншот 08): radio-буквы «Новый артборд / Все брейкпоинты / Заполнить выделение». Disabled-состояния понятны?
- Шаг 9 — Success state с auto-dismiss 3 сек: достаточно ли времени? Confetti уместен на повторных импортах или только на первом дня?
- Меню ⋮ (скриншот 13) — 8 пунктов, в т.ч. danger zone. Не перегружено?

### Приоритет 2 — Аудит Onboarding (CJM_ONBOARDING.md)

**Pivotal journey** — каждый drop-off здесь = потерянный пользователь.

- Шаги 2–3 (скриншоты 01–02) — SetupSplash → SetupFlow idle. Понятен ли value prop без welcome-экрана?
- Шаг 3–4 (скриншот 03) — клик «Подключить расширение» открывает в Chrome `ya.ru/?contentify_pair=<code>`. Объясняем ли мы **почему** Yandex?
- Шаг 5 (скриншот 04) — `timed-out` состояние с install instructions для расширения. Это **главная Valley of Despair** в slow path. Можно ли сделать инструкцию визуальнее без кардинальной перестройки?
- Шаг 6 (скриншот 05) — `PairedBanner` flash (3 сек). Видно ли это? Не слишком ли быстро?
- Шаг 7 (скриншот 06) — `OnboardingTip` баннер с текстовой подсказкой «Откройте поисковую выдачу Яндекса…». Достаточно ли он мотивирует первый импорт?

### Приоритет 3 — Repair / Cloud unreachable (CJM_FOR_DESIGN_AUDIT.md §CJM-3)

Сценарий «возвращающийся пользователь, что-то отвалилось». Скриншоты 11 (`CloudUnreachableBanner`).

- Различаем ли мы offline / cold-start / CORS-ошибка?
- Достаточно ли пути из меню `⋮ → Настройки` в repair-mode для re-pair?

### Приоритет 4 — UI consistency и accessibility

- Все ли `var(--figma-color-*)` имеют hardcoded fallback'и (мы проверили грепом, но визуальная проверка важна)
- Контраст всех элементов в light + dark темах
- Touch (iPad/mobile) — меню переходит в bottom-sheet overlay, тестировался ли иконометрический набор?
- Screen-reader flow для онбординга и core-loop
- Keyboard-only flow (focus trap, arrow nav в меню — мы реализовали, но дизайн-ревью полезен)

### Приоритет 5 (опционально) — большая картина

- Меню ⋮ — единственный путь ко всем 8 второстепенным фичам. Стоит ли вынести что-то в отдельный CTA?
- 56-px CompactStrip — иногда тесно. Стоит ли позволить ему расти при необходимости (например, при длинном narrative)?

---

## Формат ожидаемой обратной связи

Структурированный ответ:

### 1. Общее впечатление

2–3 предложения: что работает хорошо, какой главный системный недочёт.

### 2. Список проблем по серьёзности

Для каждой проблемы:

```
[Critical/Important/Minor] — <Title>
- Где: CJM-N шаг M, скриншот NN, компонент `Foo`
- Что не так: <конкретное наблюдение>
- Почему важно: <impact на user metric>
- Предложение: <конкретная альтернатива, не требующая полного редизайна>
- Альтернатива: <если первое предложение слишком радикально>
```

Тэги серьёзности:

- **Critical** — ломает основной flow, blocker для merge
- **Important** — заметно ухудшает UX, фиксить в ближайшем спринте
- **Minor** — nice-to-have, в backlog

### 3. Что **не** надо трогать

Полезный negative space — что выглядит хорошо и не требует вмешательства, чтобы случайно не сломать (например, мы добавили `incoming` state и не хотели бы его удалять или сильно перерабатывать без сильного аргумента).

### 4. (Опционально) предложения новых паттернов

Если видишь решение которое выходит за рамки текущего набора компонентов (например, нужен новый Toast-компонент которого у нас нет) — предложи, но обозначь как «expansion», а не «fix».

---

## Что НЕ нужно делать

- Не делай brand-redesign (логотипы, шрифты — Figma-system, не наше)
- Не предлагай миграцию архитектуры (cloud-relay, FSM, sandbox-ограничения)
- Не лезь в производительность — мониторим сами
- Не предлагай Chrome Web Store как UX-решение — мы знаем, это backlog

---

## Технические референсы (если нужны детали)

Список файлов исходного кода с их назначением — на случай если нужно посмотреть конкретный компонент:

- `packages/plugin/src/ui/ui.tsx` — главный App-компонент с FSM-wiring
- `packages/plugin/src/ui/components/CompactStrip.tsx` — унифицированная 56-px полоска для всех compact-состояний
- `packages/plugin/src/ui/components/ImportConfirmDialog.tsx` — диалог 320×280
- `packages/plugin/src/ui/components/SetupFlow.tsx` — single-screen wizard с idle/waiting/timed-out
- `packages/plugin/src/ui/components/{OnboardingTip,UpdateBanner,PairedBanner,CloudUnreachableBanner}.tsx` — thin banners над strip'ом
- `packages/plugin/src/ui/components/{LogViewer,ComponentInspector,WhatsNewContent}.tsx` — extended-панели
- `packages/plugin/src/ui/styles.css` — все стили (с задокументированной trap'ой про global button hover exclusion)
- `packages/plugin/src/types.ts` — `AppState`, `UI_SIZES`, `STATE_TO_TIER`, `FSM_TRANSITIONS`
- `packages/plugin/src/ui/utils/heads-up-messages.ts` — `formatHeadsUpPhase` (русские narrative-фразы)
- `.claude/rules/ui-css.md` — CSS pitfalls (CSS variables fallbacks, button hover exclusion)
- `.claude/rules/ui-state.md` — UI state machine rules

---

## Спасибо

Документы и скриншоты — попытка дать тебе достаточный контекст без необходимости запускать плагин самому. Если чего-то критично не хватает, отметь это в конце ответа и попроси конкретный артефакт (доп. скриншот, видео, исходник конкретного компонента).
