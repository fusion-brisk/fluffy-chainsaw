# CJM: Core Loop Contentify — ежедневный цикл импорта («Toothbrush Journey»)

> **Repeating Journey** — цикл, который пользователь повторяет 5–15 раз в день.
> Каждая лишняя секунда friction × 10 повторений = ощутимая потеря продуктивности.
>
> **Актуально на:** 2026-04-26 (после миграции на YC cloud-relay + heads-up narrative)
> **Версия плагина:** 3.1.2

---

## Обзор пути (10 шагов)

```
1. Open Plugin → 2. Checking → 3. Ready (waiting) → 4. Click Extension →
5. Incoming (heads-up) → 6. Data Received → 7. Configure Import →
8. Processing → 9. Success → 10. Back to Ready
```

**Компоненты системы (cloud-only):**

```
Chrome Extension → POST /push (kind:'heads-up' OR payload)
                                ↓
                       YC Cloud Function (stateless)
                                ↓
                       YDB serverless: queue_entries + session_heads_up (TTL 30s)
                                ↓
Figma Plugin polls GET /status (1s active / 5s idle)
                  └─ headsUp present  → AppState='incoming' + narrative
                  └─ hasData=true     → GET /peek → AppState='confirming'
                  └─ both             → payload wins
                                ↓
                  Sandbox apply (schema engine + handlers)
                                ↓
                  POST /ack (3-retry) → success
```

**AppState FSM:** `checking` → `ready` → **`incoming`** → `confirming` → `processing` → `success` → `ready`

**UI размеры (UI_SIZES):**

- `compact` — 320 × 56 px — `checking` / `ready` / **`incoming`** / `processing` / `success` / `error` (унифицированный `CompactStrip`)
- `standard` — 320 × 280 px — `confirming` (`ImportConfirmDialog`)
- `extended` — 420 × 520 px — `setup` / панели (logs / inspector / settings / what's new)

> Figma добавляет ~40 px заголовка iframe → реальная высота контента = `height − 40`.

**Частота использования:**

- 5–15 импортов в день, batch'ами по 3–5 запросов подряд
- Средняя сессия: 10–20 минут активной работы
- Паттерн: batch-импорт → работа с макетами → следующий batch

---

## Карта пути (9 аспектов × 10 шагов)

### 1. Open Plugin

| Аспект                | Описание                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Открыть плагин для начала работы с макетами                                                                                                                                                                      |
| **User Action**       | Plugins → Contentify, Quick Actions, или правый клик. Опытные пользователи: hot-key или pin плагина                                                                                                              |
| **UI State**          | Figma запускает UI iframe. `SetupSplash` (compact 320×56) → переход в `checking`. Окно появляется в последней сохранённой позиции                                                                                |
| **System Action**     | React mount → `useEffect` отправляет `get-settings`, `get-setup-skipped`, `get-session-code`, `check-whats-new`, `check-onboarding-seen`. Инициализация `useRelayConnection`, `useImportFlow`, `usePanelManager` |
| **Emotional Valence** | 3/5 — привычное действие                                                                                                                                                                                         |
| **Cognitive Load**    | LOW — мышечная память                                                                                                                                                                                            |
| **Drop-off Risk**     | LOW — пользователь уже мотивирован                                                                                                                                                                               |
| **Error Paths**       | (1) Плагин не в списке → переустановка через Community. (2) Sandbox crash → перезапуск                                                                                                                           |
| **Pain Points**       | (1) Нет dedicated keyboard shortcut. (2) Полная реинициализация при каждом открытии (нет persistent connection — плагинский iframe пересоздаётся)                                                                |
| **Opportunities**     | (1) Pin to toolbar. (2) Quick Actions «contentify». (3) Сохранять последний импорт визуально, чтобы юзер мог сразу продолжить                                                                                    |
| **Key Metric**        | Время от решения до открытого плагина, частота запусков в день                                                                                                                                                   |

---

### 2. Checking

| Аспект                | Описание                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Дождаться подключения к cloud-relay                                                                                                                                                                                                |
| **User Action**       | Пассивное ожидание. `CompactStrip` со спиннером + «Подключение…»                                                                                                                                                                   |
| **UI State**          | `AppState: 'checking'`, размер `compact`. Spinner + текст. Переход в `ready` при `relay.connected === true`. Если probe не завершён за 15 сек (`CHECKING_TIMEOUT_MS`) → `error` + «Не удалось подключиться к облаку»               |
| **System Action**     | `useRelayConnection.checkRelay()` → `GET /status?session=<code>` с timeout 8 сек (`STATUS_FETCH_TIMEOUT_MS` — окно для cold-start YC API Gateway 3–5 сек). При успехе → `connected: true`. Failures: 2 подряд → `connected: false` |
| **Emotional Valence** | 2/5 — холодный старт может ощущаться долго (5–8 сек на cold)                                                                                                                                                                       |
| **Cognitive Load**    | LOW — ничего не требуется                                                                                                                                                                                                          |
| **Drop-off Risk**     | LOW — но если YC offline на 15 сек → `error` state с предложением «Повторить»                                                                                                                                                      |
| **Error Paths**       | (1) Cold-start длиннее 8 сек → AbortError → второй poll через 1 сек подхватит. (2) Network offline → `CloudUnreachableBanner` показывается после ready (см. шаг 3)                                                                 |
| **Pain Points**       | (1) Cold-start 5–8 сек ощущается как «висит». (2) Spinner — единственная обратная связь, не различает «греется» / «лежит»                                                                                                          |
| **Opportunities**     | (1) Прогресс-инфо «прогреваем облако…» при cold-start. (2) Skip-checking если успешно резолвили в недавней сессии                                                                                                                  |
| **Key Metric**        | Checking → ready latency p50/p95, cold-start hit rate                                                                                                                                                                              |

---

### 3. Ready (waiting)

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Убедиться что система готова, переключиться в Chrome для парсинга                                                                                                                                                                                                                                                                                           |
| **User Action**       | Смотрит на CompactStrip — зелёная точка + «Подключено». Переключается в Chrome. На первом ready после онбординга может быть `OnboardingTip` баннер сверху                                                                                                                                                                                                   |
| **UI State**          | `AppState: 'ready'`, размер `compact` (56 px + опциональные баннеры сверху: UpdateBanner, CloudUnreachableBanner, PairedBanner, OnboardingTip). Кнопка ⋮ открывает меню (Логи / Инспектор / Настройки / Что нового / Макеты брейкпоинтов / Экспорт HTML / Очистить очередь / Сбросить сниппеты)                                                             |
| **System Action**     | Polling `/status` каждые 1 сек active / 5 сек idle (idle ≥ `ACTIVE_THRESHOLD_MS = 10s` без активности). При `data.hasData` → `peekRelayData()`. При `data.headsUp` → `onIncoming` callback → `setAppState('incoming')`. Visibility-change → немедленный probe при возврате в Figma. Relay enabled: `appState !== 'processing' && appState !== 'confirming'` |
| **Emotional Valence** | 3/5 — спокойное ожидание, привычная фаза                                                                                                                                                                                                                                                                                                                    |
| **Cognitive Load**    | LOW — пользователь знает что переключиться в Chrome                                                                                                                                                                                                                                                                                                         |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                         |
| **Error Paths**       | (1) Relay 2 fail подряд (`DISCONNECT_CONFIRM_THRESHOLD`) → `connected: false` → `CloudUnreachableBanner`. (2) Tab visibility-hidden → polling приостановлен, возобновится на focus                                                                                                                                                                          |
| **Pain Points**       | (1) Idle polling 5 сек — данные доходят с задержкой 1–5 сек. (2) Зелёная точка статична, не передаёт «слежу за расширением». (3) Меню ⋮ — единственный путь ко всем второстепенным фичам                                                                                                                                                                    |
| **Opportunities**     | (1) Анимированная «слушаю» точка. (2) Auto-detect Chrome tab Yandex (через extension presence). (3) Счётчик импортов за сессию                                                                                                                                                                                                                              |
| **Key Metric**        | Time in ready, idle vs active poll ratio, banner display rate                                                                                                                                                                                                                                                                                               |

---

### 4. Click Extension Icon (Browse SERP)

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Отправить данные текущей выдачи Яндекса в плагин                                                                                                                                                                                                                                                                                                                                                                        |
| **User Action**       | В Chrome открывает `yandex.ru/search?text=…`, кликает иконку расширения в toolbar. Опционально: правый клик иконки → переключатель «Захватывать скриншоты»                                                                                                                                                                                                                                                              |
| **UI State**          | Plugin UI остаётся в `ready` (пользователь смотрит в Chrome). Chrome: иконка badge меняется на `...` синим                                                                                                                                                                                                                                                                                                              |
| **System Action**     | Background SW `handleIconClick`: (1) `void sendHeadsUp('parsing')` — лёгкий POST на YC. (2) `chrome.scripting.executeScript` инъектирует content.ts → парсит DOM → `__contentifyResult`. (3) Если `captureScreenshots` (default ON) — `captureFullPage` сегментирует страницу с `void sendHeadsUp('uploading_screenshots', {current,total})` per segment. (4) `void sendHeadsUp('uploading_json')` → POST /push payload |
| **Emotional Valence** | 3/5 — рутинный клик                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Error Paths**       | (1) Не на Yandex-домене → badge `✗` 2 сек. (2) Session code не настроен → openOptionsPage. (3) Парсинг 0 сниппетов → badge `0 ✗` 2 сек. (4) `void sendHeadsUp('error', {message})` в любом catch блоке. (5) /push fail → `addToRetryQueue` с exp. backoff [1s, 3s, 10s], badge `N↻`                                                                                                                                     |
| **Pain Points**       | (1) Если Figma скрыта, пользователь не видит heads-up narrative — переключение Chrome ↔ Figma всё ещё нужно для confirm. (2) Захват скриншотов меняет ширину окна Chrome (resize до 1440 desktop / 393 touch) — заметно                                                                                                                                                                                                 |
| **Opportunities**     | (1) Хотя heads-up `'parsing'` уже летит — Chrome ничего не показывает «отправлено в Figma». Toast в Chrome был бы win. (2) Auto-trigger при определённой комбинации параметров URL                                                                                                                                                                                                                                      |
| **Key Metric**        | Parse success rate, items per page, push→peek latency (через `meta.pushedAt` стэмп), screenshot total size                                                                                                                                                                                                                                                                                                              |

---

### 5. Incoming (heads-up narrative) — **НОВОЕ В 3.1**

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **User Goal**         | Понять, что расширение работает (визуальная уверенность пока идёт upload)                                                                                                                                                                                                                                                                              |
| **User Action**       | Если плагин виден — наблюдает narrative. Может нажать «Отменить» (link справа от текста)                                                                                                                                                                                                                                                               |
| **UI State**          | `AppState: 'incoming'`, размер `compact` (тот же 56-px CompactStrip что у ready). Спиннер `--incoming` (brand-цвет) + текст: «Расширение собирает данные…» / «Загружаем структуру…» / «Грузим скриншоты K/M…» / «Завершаем загрузку…». Справа ссылка «Отменить»                                                                                        |
| **System Action**     | `useRelayConnection.checkRelay()` видит `data.headsUp` в /status response. Если `Date.now() − ts ≤ 10s` → `onIncoming(state)` callback в `ui.tsx` → `setAppState((prev) => prev === 'ready' ? 'incoming' : prev)` + `setIncomingMessage(formatHeadsUpPhase(state))`. Watchdog: если ts старше 10 сек → `onIncomingExpired` → возврат в `ready` + toast |
| **Emotional Valence** | 4/5 — «работает!» — главный UX-выигрыш этой фичи                                                                                                                                                                                                                                                                                                       |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                                                                                                                    |
| **Drop-off Risk**     | LOW (пользователь видит что система живёт)                                                                                                                                                                                                                                                                                                             |
| **Error Paths**       | (1) Heads-up `phase: 'error'` от расширения → `onIncomingError(message)` → `error` state с `errorMessage`. (2) Сеть упала, /status 2 fail подряд → `CloudUnreachableBanner`. (3) Watchdog 10 сек без новых heads-up → возврат в `ready`. (4) Юзер кликает «Отменить» → `relay.clearQueue()` + `setAppState('ready')`                                   |
| **Pain Points**       | (1) Узкая 56-px полоска: длинные K/M (например 99/127) могут плохо читаться. (2) «Отменить» — маленький link, легко промахнуться при быстрой работе. (3) Если плагин минимизирован — пользователь не видит narrative                                                                                                                                   |
| **Opportunities**     | (1) Прогресс-bar на 3-px полоске снизу strip'а (как в processing). (2) Подсветка «Отменить» при наведении. (3) Если есть Figma push notification API — пинговать пользователя                                                                                                                                                                          |
| **Key Metric**        | Time-to-first-heads-up (от click до первого incoming render), watchdog fire rate, cancel-rate-during-incoming                                                                                                                                                                                                                                          |

---

### 6. Data Received (Confirming)

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Увидеть что данные дошли, выбрать режим импорта                                                                                                                                                                                                                                                                                                                                                            |
| **User Action**       | Возвращается в Figma (или видит автопереход если плагин на экране). `ImportConfirmDialog` 320×280                                                                                                                                                                                                                                                                                                          |
| **UI State**          | `AppState: 'confirming'`, размер `standard` (320×280). Заголовок «Импорт». Карточка: query + summary fields (количество rows / wizards / productCard offers). Группа radio «Режим»: ◉ Новый артборд (default) / ○ Все брейкпоинты (disabled для feed) / ○ Заполнить выделение (disabled если !hasSelection). Footer: «Очистить» (danger, если pending), «Отмена», «Импорт» (primary, autoFocus)            |
| **System Action**     | `/status` вернул `hasData: true` → `peekRelayData()` → `GET /peek` non-destructive read. Discriminate `pair-ack` (silent ack) vs feed (`sourceType === 'feed'`) vs SERP (`extractRowsFromPayload`). `flow.showConfirmation()` сохраняет `pendingEntryIdRef`, `flow.updateInfo({itemCount, summary, summaryData})`. Polling приостановлен (`enabled = false`). Для timing: `confirmShownAtRef = Date.now()` |
| **Emotional Valence** | 4/5 — подтверждение что система работает                                                                                                                                                                                                                                                                                                                                                                   |
| **Cognitive Load**    | LOW (повторный цикл) / MEDIUM (первые разы) — нужно понять разницу между Артборд / Брейкпоинты / Выделение                                                                                                                                                                                                                                                                                                 |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Error Paths**       | (1) Payload пустой (0 rows) → `peekRelayData` не зовёт callback. (2) Duplicate `entryId` → `lastProcessedEntryIdRef` блокирует. (3) Юзер в Chrome, не видит Figma → данные ждут в `confirming`, polling приостановлен                                                                                                                                                                                      |
| **Pain Points**       | (1) Нет push-notification в Figma — в Chrome пользователь не знает что данные пришли. (2) `summary` может быть техничным («42 SERP-сниппета, фильтры (5), сайдбар (8 офферов)»). (3) При batch: каждый раз ручное «Импорт» — раздражает                                                                                                                                                                    |
| **Opportunities**     | (1) Figma notification по data-received. (2) Auto-confirm mode для batch-flow. (3) Mini-preview 2–3 карточки. (4) Запоминать последний выбранный режим (artboard/breakpoints/selection)                                                                                                                                                                                                                    |
| **Key Metric**        | Push→peek latency (через `meta.pushedAt`), confirm dwell time                                                                                                                                                                                                                                                                                                                                              |

---

### 7. Configure Import

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Выбрать режим импорта, запустить обработку                                                                                                                                                                                                                                                                                                                                                                                                                |
| **User Action**       | Выбирает radio «Режим» → нажимает «Импорт» (Enter). Или «Отмена» (Esc). Или «Очистить» (если хочет сбросить очередь до confirm)                                                                                                                                                                                                                                                                                                                           |
| **UI State**          | Тот же `ImportConfirmDialog`. Кнопка «Импорт» — primary autoFocus (Enter работает). «Отмена» — secondary. «Очистить» — danger, слева в footer                                                                                                                                                                                                                                                                                                             |
| **System Action**     | `handleDialogConfirm` → seedит `progressData = {current: 5, total: 100, message: 'Подготовка импорта…'}` (instant feedback ≤16 ms) → `flow.confirm({mode})`. Sandbox получает `apply-relay-payload` или `import-csv`. `safetyTimeout = 30s` — auto-ack чтобы не потерять данные. `applyStartedAtRef = Date.now()`. На cancel: `flow.cancel()` → `relay.blockEntry(entryId, 10s)` → возврат в `ready`. На clearQueue: `relay.clearQueue()` → DELETE /clear |
| **Emotional Valence** | 4/5                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Cognitive Load**    | LOW (повтор) / MEDIUM (первый раз — нужно понять «Все брейкпоинты»)                                                                                                                                                                                                                                                                                                                                                                                       |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Error Paths**       | (1) «Заполнить выделение» disabled при `!hasSelection` → пользователь забыл выделить контейнеры. (2) При cancel `blockEntry(10s)` чтобы не показать тот же entry повторно. (3) Esc → cancel; Enter → confirm                                                                                                                                                                                                                                              |
| **Pain Points**       | (1) 10 сек block после cancel — если случайно отменил, нужно ждать. (2) Нет keyboard shortcut для «брейкпоинтов» / «выделения» (только Enter = artboard). (3) Чекбокс скриншотов нет в UI плагина — он в context-menu расширения (легко забыть)                                                                                                                                                                                                           |
| **Opportunities**     | (1) Запоминание последнего mode. (2) Shift+Enter = selection. (3) Undo cancel: «Отменено. Вернуть?» вместо silent block                                                                                                                                                                                                                                                                                                                                   |
| **Key Metric**        | Mode split (artboard / breakpoints / selection), time-to-confirm, cancel rate                                                                                                                                                                                                                                                                                                                                                                             |

---

### 8. Processing

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Дождаться обработки данных                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **User Action**       | Пассивное ожидание. Видит CompactStrip processing с brand-spinner и текущим narrative                                                                                                                                                                                                                                                                                                                                                                                                  |
| **UI State**          | `AppState: 'processing'`, размер `compact`. Brand-spinner + `processingMessage` (с sandbox phase: «Размещаем 23/76…», «Загружаем картинки 12/35…», «Подготавливаем компоненты…»). Снизу strip'а — 3-px progress bar (`progressData.current / total`)                                                                                                                                                                                                                                   |
| **System Action**     | Sandbox получает `apply-relay-payload` → `createSerpPage` (или feed-builder). Phases: payload-received → resolving components → render loop (`Размещаем K/M`) → image-apply (parallel via image-apply.ts с promise-based URL cache) → screenshot placement (fire-and-forget) → done. Каждый phase шлёт `progress` message → `setProgressData`. По завершении: `done` или `relay-payload-applied` → `finishProcessing('success')` + `ackPendingEntry()` (3-retry с delays [1s, 2s, 4s]) |
| **Emotional Valence** | 3/5 — narrative делает ожидание сносным                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Drop-off Risk**     | LOW (типичный 5–15 сек) / MEDIUM (большие страницы 20–30 сек)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Error Paths**       | (1) Sandbox crash → `onError` → `finishProcessing('error')` + `errorMessage`. (2) Image fetch fail → partial success (`failedImages` в stats). (3) Component key missing → fallback canvas rendering. (4) Stale-ref после variant swap → `removed` guard (см. `.claude/rules/performance.md` §4) — silently evicted, no exception. (5) Safety timeout 30 сек → auto-ack чтобы не потерять данные                                                                                       |
| **Pain Points**       | (1) Sandbox-phase progress линейный по counter (current/total), но фактический прогресс нелинейный — image-apply занимает 30–50% времени. (2) Менеджмент очень больших импортов (100+ сниппетов) — может занимать 30+ сек, narrative помогает но всё равно долго                                                                                                                                                                                                                       |
| **Opportunities**     | (1) Streaming render: элементы появляются по мере обработки. (2) Background processing: пользователь работает с другими фреймами, success приходит уведомлением. (3) ETA based на N items (после Apr 2026 имеем real timing data)                                                                                                                                                                                                                                                      |
| **Key Metric**        | Processing time p50/p95, stage breakdown, error rate, image-fetch dedup hit-rate                                                                                                                                                                                                                                                                                                                                                                                                       |

---

### 9. Success

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Увидеть результат и перейти к следующему запросу                                                                                                                                                                                                                                                                                                                           |
| **User Action**       | Видит CompactStrip success: ✓ галочка + «N элементов · X.X сек» (3-сек auto-dismiss). Если первый импорт сессии — `Confetti` overlay (один раз через `isFirstRun` flag). Может кликнуть в strip чтобы dismiss раньше                                                                                                                                                       |
| **UI State**          | `AppState: 'success'`, размер `compact`. Зелёная ✓ + «N элементов · X.X сек» (или «Импорт завершён» если нет данных). Снизу strip'а — заполняющийся 3-px progress bar (auto-dismiss 3s, `AUTO_DISMISS_DELAY`). `Confetti` поверх (only when `isFirstRun === true`, который flip-ится на `false` в `Confetti.onComplete`)                                                   |
| **System Action**     | `finishProcessing('success')` → `setAppState('success')` → `resizeUI('success')`. `ackData(entryId)` через 3-retry: POST /ack → ack accepted → удаляет из YDB queue. `setLastImportCount/lastImportTime` запоминает для tooltip. `setConfettiActive(true)`. Auto-dismiss timer фирится `AUTO_DISMISS_DELAY = 3000`. Логирование: `[Timing] Apply total (UI-observed): Xms` |
| **Emotional Valence** | 5/5 — пиковая точка цикла, особенно с confetti                                                                                                                                                                                                                                                                                                                             |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                                                                                                                                        |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                                        |
| **Error Paths**       | (1) ack 3 retry fail → данные останутся в очереди и будут показаны повторно при следующем /status. (2) Confetti не отрендерится если плагин минимизирован. (3) Auto-dismiss слишком быстрый → нет возможности задержаться на статистике                                                                                                                                    |
| **Pain Points**       | (1) 3 сек auto-dismiss — мало для чтения статистики. (2) Нет «Zoom to frame» кнопки — после success юзер не знает где смотреть результат. (3) При batch — confetti на каждом первом импорте сессии (правильно) но повторный плагин-reload откатывает `isFirstRun` → confetti снова                                                                                         |
| **Opportunities**     | (1) Hover на strip — пауза auto-dismiss. (2) «Zoom to frame» quick action. (3) Tooltip с детальной статистикой при hover                                                                                                                                                                                                                                                   |
| **Key Metric**        | Success rate, ack hit rate (1st/2nd/3rd retry), auto-dismiss-vs-manual ratio                                                                                                                                                                                                                                                                                               |

---

### 10. Back to Ready

| Аспект                | Описание                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Начать следующий импорт или работу с макетами                                                                                                                                                                                                      |
| **User Action**       | Два сценария: (A) Batch — сразу в Chrome для следующего запроса. (B) Work — начинает редактировать макет, плагин в фоне                                                                                                                            |
| **UI State**          | `AppState: 'ready'` после auto-dismiss. CompactStrip ready с `lastQuery` в tooltip («Последний: «диван купить» · 76 сниппетов · только что»). Если в очереди уже есть данные → мгновенный переход в `confirming`                                   |
| **System Action**     | `completeSuccess()` → `setAppState('ready')` + `resizeUI('ready')`. Polling возобновляется (`enabled = true`). Если `data.hasData = true` → немедленный `peekRelayData()` → `confirming`. `lastQuery`/`lastImportCount`/`lastImportTime` сохранены |
| **Emotional Valence** | 4/5 — удовлетворение от завершения                                                                                                                                                                                                                 |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                |
| **Error Paths**       | (1) Если auto-dismiss закончился ровно когда пришёл новый payload → переход success → ready → confirming за 50–100 ms (выглядит как мерцание). (2) Cloud disconnect за время processing → reconnect при возврате в ready (debounced)               |
| **Pain Points**       | (1) При batch: 3-сек auto-dismiss всё равно остаётся overhead. (2) «Последний» tooltip показывается только при hover — easy to miss                                                                                                                |
| **Opportunities**     | (1) Skip auto-dismiss если в очереди есть pending. (2) Visible queue indicator: «В очереди ещё 2 запроса». (3) Session count: «Импорт #3 за сегодня»                                                                                               |
| **Key Metric**        | Time success→next-action, batch throughput                                                                                                                                                                                                         |

---

## Эмоциональная кривая (один цикл)

```
Valence
  5 │                                                  ★ SUCCESS
    │                                                 ╱ ╲
  4 │                ●Incoming  ●Data  ●Confirm     ╱   ╲ ●Back
    │                  (NEW!)                       ╱     ╲╱to Ready
  3 │  ●Open  ●Check  ●Ready ●Browse        ●Process
    │             ╲   ╱  ╲   ╱
  2 │              ╲ ╱    ╲ ╱
    │
  1 │
    │
  0 └──────────────────────────────────────────────────── Steps
       1     2     3     4     5     6     7     8     9     10
                              NEW                  PEAK
```

**Изменение от 3.0 → 3.1:** добавление шага 5 (Incoming) поднимает кривую с 3 (Browse) до 4 (Incoming) до 4 (Data) — раньше между шагами 4 (Browse) и 6 (Data) была «дыра» 1–5 сек чистого ожидания.

---

## Паттерны batch-импорта

### Типичный batch (5 циклов)

```
[Browse]→[Click ext]→[Incoming]→[Confirm]→[Process]→[Success 3s]→
└─ ~1с    ~0.5с      ~3с heads  ~1-3с    ~5-15с    ~3с
[Browse]→...
```

### Временная раскладка одного цикла (cloud-relay 3.1)

| Фаза                  | Время         | % от цикла |
| --------------------- | ------------- | ---------- |
| Ready → Chrome switch | 1–2 сек       | 5%         |
| SERP browse + click   | 1–3 сек       | 8%         |
| Heads-up incoming     | 2–4 сек       | 12%        |
| Chrome → Figma switch | 1–2 сек       | 5%         |
| Confirm dialog        | 1–3 сек       | 8%         |
| Processing            | 5–15 сек      | 40%        |
| Success auto-close    | 3 сек         | 12%        |
| Idle to next          | 1–3 сек       | 10%        |
| **Итого**             | **15–35 сек** | **100%**   |

### Friction points в повторяющемся цикле

| Friction                         | За цикл    | За 5 циклов | Решение                                   |
| -------------------------------- | ---------- | ----------- | ----------------------------------------- |
| Chrome ↔ Figma switching         | 2–4 сек    | 10–20 сек   | Auto-confirm mode, Chrome side panel      |
| Success auto-dismiss wait        | 3 сек      | 15 сек      | Skip-when-pending, instant transition     |
| Confirm dialog (always artboard) | 1–2 сек    | 5–10 сек    | Remember last mode, auto-confirm setting  |
| Heads-up watchdog overhead       | 0 сек\*    | 0 сек\*     | \* not friction — improvement vs 3.0 idle |
| **Суммарный overhead**           | **~6 сек** | **~30 сек** | —                                         |

> Для сравнения: в 3.0 на месте «Heads-up incoming» (12%) была чёрная дыра ожидания «Idle ready waiting for data» — пользователь не знал, идёт upload или нет. Теперь это видимая фаза.

---

## Покрытие AppState переходов

| Переход                   | CJM State           | Trigger                                    | Covered |
| ------------------------- | ------------------- | ------------------------------------------ | ------- |
| `→ checking`              | 1. Open Plugin      | React mount, `appState='checking'`         | ✓       |
| `checking → ready`        | 2. Checking         | `relay.connected === true`                 | ✓       |
| `checking → error`        | 2. Checking timeout | 15s no relay reply → `CHECKING_TIMEOUT_MS` | ✓       |
| `ready → incoming`        | 5. Incoming (NEW)   | `data.headsUp != null`, ts within 10s      | ✓       |
| `incoming → ready`        | 5. Watchdog/Cancel  | watchdog 10s OR user click «Отменить»      | ✓       |
| `incoming → error`        | 5. Heads-up error   | `headsUp.phase === 'error'`                | ✓       |
| `incoming → confirming`   | 6. Data Received    | `data.hasData=true` → `peekRelayData`      | ✓       |
| `ready → confirming`      | 6. Data Received    | `data.hasData=true` (без heads-up window)  | ✓       |
| `confirming → processing` | 7. Confirm          | `flow.confirm({mode})`                     | ✓       |
| `confirming → ready`      | 7. Cancel           | `flow.cancel()` + `blockEntry(10s)`        | ✓       |
| `processing → success`    | 8→9. Done           | `done`/`relay-payload-applied` message     | ✓       |
| `processing → error`      | 8. Error            | sandbox `onError`                          | ✓       |
| `success → ready`         | 9→10. Auto-dismiss  | 3s `AUTO_DISMISS_DELAY`                    | ✓       |
| `error → ready`           | (any error)         | 5s `ERROR_DISMISS_DELAY` или click         | ✓       |

---

## Top-3 friction points для будущей оптимизации

### 1. Context Switching Chrome ↔ Figma — 2–4 сек × N

**Текущий UX:** Heads-up narrative помогает, если плагин виден. Но для подтверждения всё равно нужно вернуться в Figma.

**Решения:**

- **Краткосрочное:** Chrome extension toast при `confirming` готовности.
- **Среднесрочное:** Auto-confirm mode (опция в Settings).
- **Долгосрочное:** Queue mode — батч из Chrome → одно подтверждение в Figma.

### 2. Success auto-dismiss vs queue handoff — 3 сек × N

**Текущий UX:** 3-сек wait перед `ready`, даже если pending data уже в очереди.

**Решения:**

- **Краткосрочное:** Skip auto-dismiss если `/status.hasData = true` сразу после success.
- **Среднесрочное:** Pipeline mode — confetti/stats в дополнительном banner, не блокирует ready.

### 3. Длинный confirm для batch-flow — 1–3 сек × N

**Текущий UX:** Каждый раз ручной выбор radio + клик «Импорт».

**Решения:**

- **Краткосрочное:** Запоминать последний mode (artboard/breakpoints/selection) в clientStorage.
- **Среднесрочное:** Auto-confirm setting с настраиваемым delay (например, «3 сек preview перед auto-import»).
- **Долгосрочное:** Удалить confirming для trusted flow (если из ya.ru — auto-import).

---

## Связанные документы

- [CJM_ONBOARDING.md](CJM_ONBOARDING.md) — путь нового пользователя
- [CJM_FOR_DESIGN_AUDIT.md](CJM_FOR_DESIGN_AUDIT.md) — сводный документ для дизайн-аудита (включает feed/page-builder/HTML-export пути)
- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура системы
- [FSM_STATES.md](FSM_STATES.md) — диаграмма состояний
- [`.claude/rules/ui-state.md`](../.claude/rules/ui-state.md) — правила работы с UI state
- [`.claude/rules/performance.md`](../.claude/rules/performance.md) — performance guidelines
- Исходники: `packages/plugin/src/ui/ui.tsx`, `packages/plugin/src/ui/hooks/useImportFlow.ts`, `packages/plugin/src/ui/hooks/useRelayConnection.ts`, `packages/plugin/src/ui/components/CompactStrip.tsx`, `packages/plugin/src/ui/components/ImportConfirmDialog.tsx`, `packages/plugin/src/ui/utils/heads-up-messages.ts`, `packages/extension/src/background.ts`
