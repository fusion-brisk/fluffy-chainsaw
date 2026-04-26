# CJM: Онбординг Contentify — от первого запуска до первого импорта

> **Pivotal Journey** — критический путь пользователя через 10 состояний.
> Каждый drop-off на этом пути = потерянный пользователь навсегда.
>
> **Актуально на:** 2026-04-26 (после миграции на YC cloud-relay + auto-pair handshake)
> **Версия плагина:** 3.1.2

---

## Что изменилось со времён 3.0

| Аспект            | До (3.0, local relay)                                       | Сейчас (3.1, cloud-relay)                                                       |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Relay setup       | 3 шага: download CRX → распаковать → installer + Gatekeeper | **Шага нет.** Cloud-relay живёт в YC, `CLOUD_RELAY_URL` baked-in в `config.ts`  |
| Extension pairing | Ручной ввод 6-значного кода в options page                  | **Auto-pair** через `ya.ru/?contentify_pair=<code>` — клик на кнопку и всё      |
| Wizard structure  | 6 шагов с `StepIndicator`                                   | **Один экран** с тремя inline-состояниями (idle / waiting / timed-out)          |
| First-run TTV     | 15–25 минут                                                 | **2–5 минут** (если расширение уже установлено — ~30 сек)                       |
| Top drop-off      | Step 3 Relay install (~40%)                                 | Step 3 «Установка extension если её нет» (предположительно ~25%, нужны метрики) |

---

## Обзор пути (10 шагов)

```
1. Install Plugin → 2. First Launch → 3. Click «Подключить расширение» →
4. Waiting Pair-Ack → 5. (optional) Install Extension →
6. Paired ✓ Flash → 7. Ready (with OnboardingTip) →
8. First Browse + Click → 9. First Incoming → Confirm → Process →
10. First Success (confetti)
```

**Компоненты системы (cloud-only):**

```
Chrome Extension → POST /push?session=X → YC Cloud Function → YDB
                                                                  ↓
Figma Plugin polls GET /status?session=X (1s active / 5s idle)
```

**AppState через онбординг:** `setup` → `checking` → `ready` → (см. CJM_CORE_LOOP.md для дальнейшего)

**UI размеры:**

- `extended` — 420 × 520 px — `setup`/SetupFlow
- `compact` — 320 × 56 px — `checking`/`ready` (после онбординга)
- `standard` — 320 × 280 px — `confirming` (на 9-м шаге)

**Session code** — 6-значный код, генерируется автоматически при первом запуске и хранится в `figma.clientStorage`. Пользователь его никогда не видит и не вводит.

---

## Карта пути (9 аспектов × 10 шагов)

### 1. Plugin Install

| Аспект                | Описание                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| **User Goal**         | Установить плагин                                                                       |
| **User Action**       | Поиск «Contentify» в Figma Community → Install                                          |
| **UI State**          | Figma Community page                                                                    |
| **System Action**     | Figma скачивает и регистрирует плагин                                                   |
| **Emotional Valence** | 3/5                                                                                     |
| **Cognitive Load**    | LOW                                                                                     |
| **Drop-off Risk**     | LOW                                                                                     |
| **Pain Points**       | Описание плагина в Community может не объяснять что это и зачем нужно расширение Chrome |
| **Opportunities**     | Скриншоты до/после, видео-превью «один клик в Chrome → данные в Figma за 3 секунды»     |
| **Key Metric**        | Install rate                                                                            |

---

### 2. First Launch

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Запустить плагин и понять что делать дальше                                                                                                                                                                                                                                                                                                                                                                                             |
| **User Action**       | Plugins → Contentify (или Quick Actions)                                                                                                                                                                                                                                                                                                                                                                                                |
| **UI State**          | `AppState: 'setup'`. Сначала `SetupSplash` (compact 320×56) пока async-чтения clientStorage не вернутся. Затем — если `setup-skipped=false` И session code сгенерирован → `SetupFlow` (extended 420×520) с idle-состоянием: текст «Подключите расширение Contentify к плагину», primary кнопка «Подключить расширение», secondary «У меня нет расширения»                                                                               |
| **System Action**     | React mount → 5 параллельных запросов в sandbox: `get-settings`, `get-setup-skipped`, `get-session-code`, `check-whats-new`, `check-onboarding-seen`. На `onSessionCodeLoaded`: если кода нет — `generateSessionCode()` (6 символов) и `set-session-code`. На `onSetupSkippedLoaded`: если skipped → пропускаем SetupFlow и идём в `checking` (returning user). Размер окна: `setup` если first-time (extended), иначе остаётся compact |
| **Emotional Valence** | 3/5 — «понятно что нужно настроить расширение»                                                                                                                                                                                                                                                                                                                                                                                          |
| **Cognitive Load**    | MEDIUM — нужно понять что плагин требует расширение. Но текст в SetupFlow это объясняет                                                                                                                                                                                                                                                                                                                                                 |
| **Drop-off Risk**     | LOW–MEDIUM — главный риск: пользователь не понимает зачем расширение и закрывает окно                                                                                                                                                                                                                                                                                                                                                   |
| **Error Paths**       | (1) `clientStorage` async fail → SetupSplash висит дольше обычного (есть таймаут защитный, но не пользовательский). (2) Session code generation crash → пользователь застрянет (маловероятно)                                                                                                                                                                                                                                           |
| **Pain Points**       | (1) `SetupSplash → SetupFlow` flicker'ит на медленных машинах ~100–300 ms. (2) Нет welcome-экрана с описанием value prop — сразу просим действие                                                                                                                                                                                                                                                                                        |
| **Opportunities**     | (1) Welcome-screen перед SetupFlow с одним предложением: «Заполняем макеты данными из живого Яндекса в один клик». (2) Видео-превью результата                                                                                                                                                                                                                                                                                          |
| **Key Metric**        | Time first-launch → ready, abandon rate в SetupFlow                                                                                                                                                                                                                                                                                                                                                                                     |

---

### 3. Click «Подключить расширение»

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Связать плагин и расширение                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **User Action**       | Кликает primary-кнопку «Подключить расширение» в SetupFlow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **UI State**          | SetupFlow переходит в `waiting` state: spinner + «Ждём подтверждение от расширения…» + ссылка «Отмена / повторить». Плагин открывает в новой вкладке Chrome `https://ya.ru/?contentify_pair=<sessionCode>` через `figma.openExternal()`                                                                                                                                                                                                                                                                                                                                                     |
| **System Action**     | `buildPairUrl(sessionCode)` строит pair-URL. Browser Chrome открывает страницу. Если расширение установлено → `chrome.tabs.onUpdated` listener в `background.ts` ловит URL, парсит `contentify_pair=<code>` параметр, валидирует через `SESSION_CODE_PATTERN` (6 alpha-цифр). При успехе: `chrome.storage.local.set({ session_code })` + `sendPairAck(code)` → POST /push с payload `{sourceType: 'pair-ack', ts: Date.now()}` → закрывает вкладку. Plugin polls `/status` → `peekRelayData` → видит `pair-ack` → `onPaired()` callback → `markExtensionInstalled()` + `PairedBanner` flash |
| **Emotional Valence** | 3/5 — лёгкое напряжение «сработает или нет»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Cognitive Load**    | LOW — один клик                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Error Paths**       | (1) `figma.openExternal` заблокирован Figma → fallback на copy-to-clipboard? Сейчас просто silent fail. (2) Браузер по умолчанию не Chrome → пользователь увидит Yandex-страницу без расширения, ничего не произойдёт                                                                                                                                                                                                                                                                                                                                                                       |
| **Pain Points**       | (1) Пользователь видит, как открывается Yandex — для не-разработчика это удивляет («зачем мне Yandex?»). (2) Нет объяснения «почему именно Yandex» — на самом деле это просто канал для передачи кода в расширение                                                                                                                                                                                                                                                                                                                                                                          |
| **Opportunities**     | (1) Перед открытием браузера показать tooltip: «Откроется страница Яндекса — это нужно чтобы расширение получило код связки». (2) Если default browser не Chrome — детектировать и предлагать установить                                                                                                                                                                                                                                                                                                                                                                                    |
| **Key Metric**        | Click rate, time-to-pair-ack                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

### 4. Waiting for Pair-Ack

| Аспект                | Описание                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Дождаться подтверждения связки                                                                                                                                                                                                                                                                                |
| **User Action**       | Ожидает в Figma. Может посмотреть Chrome (но вкладка скоро закроется автоматически)                                                                                                                                                                                                                           |
| **UI State**          | SetupFlow в `waiting` state: спиннер + «Ждём подтверждение от расширения…» + ссылка «Отмена / повторить»                                                                                                                                                                                                      |
| **System Action**     | `useRelayConnection` поллит `/status` каждые 1 сек. На каждом poll: смотрит `pendingCount`. Если приходит pair-ack — peek получает `{sourceType: 'pair-ack'}`, ack-ит entry внутри hook'а (silent), вызывает `onPaired()`. 15-секундный таймаут в SetupFlow: если ack не пришёл → переход в `timed-out` state |
| **Emotional Valence** | 3/5 (если успешно ≤2 сек) / 2/5 (если приходится ждать)                                                                                                                                                                                                                                                       |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                                                                           |
| **Drop-off Risk**     | LOW (если расширение установлено) / HIGH (если нет)                                                                                                                                                                                                                                                           |
| **Error Paths**       | (1) Расширение не установлено → 15 сек таймаут → `timed-out` state. (2) Расширение установлено, но не в активном профиле → таймаут. (3) Pair-ack потерян (network) → таймаут                                                                                                                                  |
| **Pain Points**       | (1) 15 сек ожидания — для пользователя без расширения это вечность. (2) Spinner один и тот же независимо от стадии (отправили запрос / ждём ack / cold-start). (3) «Отмена» возвращает в idle, но не объясняет что делать дальше                                                                              |
| **Opportunities**     | (1) Прогресс-этапы внутри waiting: «Открыли Yandex…» → «Ждём расширение…». (2) Вместо «Отмена» — «Не удаётся? Попробуем другой способ»                                                                                                                                                                        |
| **Key Metric**        | Pair-ack success rate, time-to-ack p50/p95, timeout rate                                                                                                                                                                                                                                                      |

---

### 5. (Optional) Install Extension — `timed-out` state

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **User Goal**         | Установить расширение Chrome и завершить связку                                                                                                                                                                                                                                                                                                              |
| **User Action**       | После 15 сек таймаута видит auto-expanded инструкции: (1) ссылка «Скачать расширение» (CRX из GitHub Releases). (2) Текст-инструкция: открыть `chrome://extensions`, включить Developer Mode, drag-and-drop CRX. (3) Кнопка «Я установил, повторить» — возвращает в `waiting` state                                                                          |
| **UI State**          | SetupFlow в `timed-out` state: иконка warning + «Расширение не отвечает. Возможно, оно не установлено». Auto-expanded блок с инструкциями. Кнопки: «Скачать расширение» (primary), «Я установил, повторить» (secondary)                                                                                                                                      |
| **System Action**     | `EXTENSION_URLS.EXTENSION_DOWNLOAD` ведёт на GitHub Releases с `contentify.crx`. Browser Chrome требует Developer Mode для установки CRX из не-Web-Store source. После установки расширения пользователь нажимает «Повторить» → SetupFlow перезапускает auto-pair (новый клик внутри waiting state открывает ya.ru снова — но теперь расширение его поймает) |
| **Emotional Valence** | 1/5 — **главная Valley of Despair**. Developer Mode пугающий                                                                                                                                                                                                                                                                                                 |
| **Cognitive Load**    | **HIGH** — `chrome://extensions` нельзя открыть deep-link'ом (Chrome blocks `chrome://` URLs from external pages). Developer Mode + drag-and-drop CRX = разработческий UX                                                                                                                                                                                    |
| **Drop-off Risk**     | **CRITICAL** — главный барьер всего онбординга                                                                                                                                                                                                                                                                                                               |
| **Error Paths**       | (1) Chrome заблокировал CRX (политика). (2) Пользователь не нашёл `chrome://extensions`. (3) Drag-and-drop не сработал. (4) Расширение установилось, но Developer Mode выключен → расширение неактивно. (5) Пользователь установил, нажал «Повторить» — но нужен новый клик кнопки «Подключить расширение» (URL открывается заново)                          |
| **Pain Points**       | (1) Developer Mode — UX не для дизайнеров. (2) Нет визуальных скриншотов в инструкциях, только текст. (3) После установки нужно ещё раз кликнуть pair — необычный flow. (4) Если Chrome не default browser — pair URL вообще не дойдёт                                                                                                                       |
| **Opportunities**     | (1) **Chrome Web Store ($5 dev account) — устраняет 90% боли этого шага.** Без Developer Mode, one-click install. (2) Скриншоты или видео внутри инструкции. (3) Auto-detect default browser и проактивно предупредить                                                                                                                                       |
| **Key Metric**        | Drop-off rate из timed-out state, time-on-step, retry rate                                                                                                                                                                                                                                                                                                   |

---

### 6. Paired ✓ Flash

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Понять что связка прошла успешно                                                                                                                                                                                                                                                                                                            |
| **User Action**       | Видит auto-transition: SetupFlow закрывается, окно резайзится в `compact` (320×56), сверху появляется `PairedBanner` с зелёной галочкой и текстом «Расширение связано» (auto-hide через 3 сек)                                                                                                                                              |
| **UI State**          | `AppState: 'checking'` (затем `ready`). Размер `compact` (56 px + ~38 px PairedBanner = ~94 px на 3 сек, потом обратно в 56 px). PairedBanner — thin banner, brand-цвет                                                                                                                                                                     |
| **System Action**     | `onPaired()` callback в `ui.tsx`: `markExtensionInstalled()` (записывает `setup-skipped=true` в clientStorage) + `setPairedFlashVisible(true)` + 3-сек таймер `pairedFlashTimerRef`. SetupFlow unmount-ится потому что `extensionInstalled === true`. Идёт useEffect, который flip-ает `appState` с `setup` на `checking`, потом на `ready` |
| **Emotional Valence** | 5/5 — **первый wow-moment**: «работает!»                                                                                                                                                                                                                                                                                                    |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                                                                                                         |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                         |
| **Error Paths**       | (1) Pair-ack пришёл, но плагин в фоне → пользователь не видит flash (3 сек слишком быстро). (2) `clientStorage.set('setup-skipped')` fail → при следующем запуске SetupFlow покажется снова                                                                                                                                                 |
| **Pain Points**       | (1) 3 секунды для flash — мало для пользователя, который только что переключался в Chrome. (2) Нет звукового сигнала (Figma sandbox sound API ограничен)                                                                                                                                                                                    |
| **Opportunities**     | (1) Увеличить flash до 5 сек на первом запуске. (2) Confetti на pair-ack (отдельный от первого импорта)                                                                                                                                                                                                                                     |
| **Key Metric**        | Time pair-ack-arrived → user-saw-flash, attention rate                                                                                                                                                                                                                                                                                      |

---

### 7. Connection Check + OnboardingTip

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Понять что система готова к работе и узнать что делать дальше                                                                                                                                                                                                                                                                                                                          |
| **User Action**       | Видит `CompactStrip` ready (зелёная точка + «Подключено») + thin banner `OnboardingTip` сверху: «Откройте поисковую выдачу Яндекса в Chrome и нажмите на иконку расширения»                                                                                                                                                                                                            |
| **UI State**          | `AppState: 'ready'`, `compact` strip (56 px) + `OnboardingTip` (~62 px). Общая высота окна ~118 px. Tip имеет кнопку × для dismiss                                                                                                                                                                                                                                                     |
| **System Action**     | `useEffect` ловит `onboardingSeenPersisted === false && appState === 'ready' && extensionInstalled === true && !panels.isPanelOpen` → `setOnboardingTipVisible(true)`. Когда пользователь сделает первый импорт (transition в `confirming`/`processing`/`success`) — tip автоматически скрывается + `mark-onboarding-seen` сохраняется в clientStorage. Поллинг `/status` 1 сек active |
| **Emotional Valence** | 4/5 — облегчение от завершения setup, чёткий next-step                                                                                                                                                                                                                                                                                                                                 |
| **Cognitive Load**    | LOW — tip однозначен                                                                                                                                                                                                                                                                                                                                                                   |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                                                    |
| **Error Paths**       | (1) Cloud relay disconnect (rare, но возможно cold-start) → `CloudUnreachableBanner` вместо OnboardingTip. (2) Пользователь dismiss-ит tip раньше чем понял                                                                                                                                                                                                                            |
| **Pain Points**       | (1) Tip — текст без визуальной составляющей. (2) Нет ссылки на ya.ru в tip'е — пользователь должен сам открыть. (3) Tip dismissable — если случайно закрыл, не вернуть                                                                                                                                                                                                                 |
| **Opportunities**     | (1) Кликабельная ссылка `https://ya.ru/search?text=диван купить` в tip'е (через figma.openExternal). (2) Mock-данные кнопка для тестового импорта без расширения. (3) Анимированный pointer на иконку расширения (но это в Chrome, не в Figma — не реализуемо)                                                                                                                         |
| **Key Metric**        | Time ready → first-import, dismiss-without-action rate                                                                                                                                                                                                                                                                                                                                 |

---

### 8. First Browse + Click Extension

| Аспект                | Описание                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Получить первые данные                                                                                                                                                                                                                |
| **User Action**       | Открывает Chrome → ya.ru → вводит запрос → видит выдачу → кликает иконку Contentify в toolbar                                                                                                                                         |
| **UI State**          | Plugin в `ready` (фоновый). Chrome: иконка Contentify зелёная (на yandex-домене), при клике badge `...` (синий)                                                                                                                       |
| **System Action**     | См. шаг 4 в [CJM_CORE_LOOP.md](CJM_CORE_LOOP.md#4-click-extension-icon-browse-serp). Расширение фирит heads-up `parsing` → `uploading_screenshots K/M` → `uploading_json` → `payload POST` → `finalizing`                             |
| **Emotional Valence** | 3/5                                                                                                                                                                                                                                   |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                   |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                   |
| **Error Paths**       | (1) Не на Yandex-домене → серая иконка → клик показывает badge `✗`. (2) Расширение видит cached session_code, но плагин в этом окне Figma имеет другой → `pair-ack` нужен снова (если пользователь работает в нескольких Figma-окнах) |
| **Pain Points**       | (1) Иконка серая на не-Yandex страницах — но текст подсказки только при hover. (2) Если в другом Chrome-профиле — расширение не видно                                                                                                 |
| **Opportunities**     | См. CJM_CORE_LOOP.md — те же паттерны (auto-trigger, Chrome side panel)                                                                                                                                                               |
| **Key Metric**        | Time tip-shown → first-click-extension                                                                                                                                                                                                |

---

### 9. First Incoming → Confirming → Processing

| Аспект                | Описание                                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Увидеть как первые данные приходят и обрабатываются                                                                                                                                                                                                                                                         |
| **User Action**       | Возвращается в Figma. Видит `incoming` narrative («Грузим скриншоты K/M…») → автоматический переход в `confirming` (`ImportConfirmDialog` 320×280) → выбирает «Новый артборд» (default) → нажимает «Импорт» → видит `processing` strip с прогрессом «Размещаем 23/76…»                                      |
| **UI State**          | Последовательно: `compact incoming` (320×56) → `standard confirming` (320×280) → `compact processing` (320×56). См. CJM_CORE_LOOP.md шаги 5–8 для деталей                                                                                                                                                   |
| **System Action**     | См. CJM_CORE_LOOP.md шаги 5–8                                                                                                                                                                                                                                                                               |
| **Emotional Valence** | 4/5 — каждый переход подтверждает что система работает                                                                                                                                                                                                                                                      |
| **Cognitive Load**    | MEDIUM — в первый раз нужно: (а) понять heads-up narrative; (б) разобраться с режимами «Новый артборд / Все брейкпоинты / Заполнить выделение». В последующих циклах LOW                                                                                                                                    |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                         |
| **Error Paths**       | (1) Sandbox crash при первом import → `error` state с `errorMessage`. Это самый болезненный момент — пользователь только что сделал onboarding и сразу error. (2) Component key mismatch (плагин ожидает определённую дизайн-систему) → fallback canvas rendering, но визуально может быть иначе чем ожидал |
| **Pain Points**       | (1) Три radio в confirm-диалоге — для первого раза пользователь не знает какой выбрать. (2) Без выделения «Заполнить выделение» disabled, но без объяснения почему                                                                                                                                          |
| **Opportunities**     | (1) Подсказка inline при первом confirm: «Не уверены? Выберите «Новый артборд»». (2) Tooltip-объяснение каждого режима                                                                                                                                                                                      |
| **Key Metric**        | Time first-click → first-success, error rate first-import                                                                                                                                                                                                                                                   |

---

### 10. First Success — Confetti

| Аспект                | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User Goal**         | Увидеть результат и понять что пайплайн работает end-to-end                                                                                                                                                                                                                                                                                                                                                                                 |
| **User Action**       | Видит `compact success` strip с зелёной ✓ + «76 элементов · 12.3 сек» + `Confetti` overlay (одноразовый, через `isFirstRun`). Через 3 сек auto-dismiss. На холсте Figma — новый артборд с заполненными сниппетами                                                                                                                                                                                                                           |
| **UI State**          | `AppState: 'success'`, размер `compact`. Confetti поверх iframe. Снизу strip'а — заполняющийся 3-px progress bar                                                                                                                                                                                                                                                                                                                            |
| **System Action**     | `done` или `relay-payload-applied` message от sandbox → `finishProcessing('success')` → `setAppState('success')` + `resizeUI('success')`. `ackData(entryId)` (3-retry с delays [1s, 2s, 4s]) → POST /ack → DELETE из YDB queue. `setConfettiActive(true)`. На complete `Confetti` (animation finish) → `setIsFirstRun(false)`. Auto-dismiss через 3 сек → `completeSuccess()` → `ready`. Логирует `[Timing] Apply total (UI-observed): Xms` |
| **Emotional Valence** | **5/5 — пиковый wow-момент онбординга**                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Cognitive Load**    | LOW                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Drop-off Risk**     | LOW                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Error Paths**       | (1) Confetti не отрендерится если плагин минимизирован. (2) Auto-dismiss слишком быстрый для первого раза — у пользователя нет паузы оценить достижение. (3) `ackData` 3-retry fail → данные останутся в YDB и снова покажутся при следующем /status (повторная обработка → возможна дубликация на холсте)                                                                                                                                  |
| **Pain Points**       | (1) **3 сек auto-dismiss слишком быстро для first-time** — нет «paused success» на длительное время. (2) Нет «Zoom to frame» кнопки → пользователь не знает где найти результат на холсте. (3) Confetti один раз — если плагин потом пересоздаётся (close/open Figma), `isFirstRun` сбрасывается из clientStorage и confetti может показаться снова                                                                                         |
| **Opportunities**     | (1) **Для первого success — увеличить auto-dismiss до 8–10 сек**, с подсказкой «Попробуйте ещё запрос!». (2) «Zoom to frame» quick action. (3) После first success — показать 1-time achievement: «Первый импорт за 12 сек! Среднее время в команде — 15 сек»                                                                                                                                                                               |
| **Key Metric**        | First-success rate (% from install), time-from-install-to-first-success, sec-to-second-import                                                                                                                                                                                                                                                                                                                                               |

---

## Эмоциональная кривая

```
Valence
  5 │                                                              ★ SUCCESS
    │                                            ●Paired✓        ╱
  4 │                                ●Wait?     ╱        ●Confirm
    │                                  ╲       ╱           ╲
  3 │  ●Install   ●Launch  ●Click       ╲     ●Ready+Tip   ●Process
    │         ╲   ╱           ╲          ╲    ╱
  2 │          ╲ ╱             ╲          ╲  ╱
    │                            ╲
  1 │                       ●Timed-out + Install Ext
    │                              ▼▼▼ Valley of Despair
  0 └──────────────────────────────────────────────────── Steps
      1     2     3     4     5     6     7     8     9     10
                          ↓
                    (только если ext не установлено)
```

**Главное отличие от 3.0:** на «golden path» (расширение уже установлено) Valley of Despair исчезает совсем. Кривая ровная: 3→3→3→3→5→4→3→4→5. На «slow path» (нужно установить ext) — сохраняется падение в Valley of Despair на шаге 5.

---

## TTV (Time-to-Value) — два сценария

### Сценарий A — Golden Path (расширение уже установлено)

| Метрика                           | Текущая оценка   | Целевая        |
| --------------------------------- | ---------------- | -------------- |
| Install plugin → Launch           | 30–60 сек        | 30 сек         |
| Launch → SetupFlow visible        | 1–2 сек          | < 1 сек        |
| Click «Подключить» → Pair-ack     | 1–3 сек          | < 2 сек        |
| Paired flash → Ready              | 1 сек            | 1 сек          |
| Ready → First click ext           | 30–60 сек        | 30 сек         |
| First click → Success             | 15–25 сек        | 10–15 сек      |
| **Итого Install → First Success** | **1.5–3 минуты** | **< 1 минуты** |

### Сценарий B — Slow Path (нужно установить расширение)

| Метрика                                         | Текущая оценка | Целевая (с Chrome Web Store) |
| ----------------------------------------------- | -------------- | ---------------------------- |
| Шаги 1–4 (как Golden)                           | ~1 минута      | ~1 минута                    |
| Timeout 15 сек → install instructions           | 15 сек         | 15 сек                       |
| Скачивание CRX + Developer Mode + drag-and-drop | 3–10 минут     | < 1 минуты (one-click)       |
| Retry pair → Success                            | ~1 минута      | ~1 минута                    |
| **Итого Install → First Success**               | **5–15 минут** | **3–4 минуты**               |

**Главный разрыв:** Slow path всё ещё страдает от Developer Mode / CRX install. Перенос в Chrome Web Store закрывает 80% этой боли.

---

## Top-3 критических барьера drop-off

### 1. Extension installation (Step 5) — Slow path users — DROP-OFF ~25%

**Проблема:** Developer Mode + drag-and-drop CRX — UX не для дизайнеров.

**Решение:**

- **Краткосрочное:** Скриншоты/видео внутри SetupFlow `timed-out` state. Auto-detect default browser.
- **Среднесрочное:** **Chrome Web Store ($5 dev account) — устраняет 80% боли.**
- **Долгосрочное:** Без расширения вообще: bookmarklet или встроенный YQL fetch (нужен YC service-side scraping, юридически рискованно).

### 2. SetupFlow Welcome (Step 2) — DROP-OFF ~10%

**Проблема:** SetupFlow сразу просит «Подключить расширение» без объяснения value prop. Пользователь не понимает зачем.

**Решение:**

- **Краткосрочное:** Welcome-экран с одним предложением + видео-превью результата.
- **Среднесрочное:** A/B тест: «Подключить» vs «Попробовать на тестовых данных» как primary CTA.

### 3. First success too short (Step 10) — Underwhelming for first-time

**Проблема:** 3 сек auto-dismiss слишком быстро для пользователя, который только что прошёл онбординг.

**Решение:**

- **Краткосрочное:** Для первого success — 8 сек auto-dismiss с подсказкой «Попробуйте ещё запрос!».
- **Среднесрочное:** Achievement panel: «Первый импорт ✓», «5 импортов за день ✓».

---

## Покрытие AppState переходов в онбординге

| Переход                     | CJM State                      | Trigger                                        | Covered |
| --------------------------- | ------------------------------ | ---------------------------------------------- | ------- |
| `→ setup`                   | 2. First Launch                | React mount, `appState='setup'` default        | ✓       |
| `setup → setup` (waiting)   | 3. Click «Подключить»          | SetupFlow internal state                       | ✓       |
| `setup → setup` (timed-out) | 5. Install Extension           | 15s timeout no pair-ack                        | ✓       |
| `setup → checking`          | 6. Paired flash starts         | `extensionInstalled=true && setupSkipped=true` | ✓       |
| `checking → ready`          | 7. Connection check            | `relay.connected === true`                     | ✓       |
| `ready → confirming`        | 9. First incoming → confirming | `data.hasData=true` → peek                     | ✓       |
| `ready → incoming`          | 9. First incoming              | `data.headsUp != null`                         | ✓       |
| `confirming → processing`   | 9. Click «Импорт»              | `flow.confirm({mode})`                         | ✓       |
| `processing → success`      | 10. First success              | `done` message от sandbox                      | ✓       |
| `success → ready`           | (post-onboarding)              | 3s `AUTO_DISMISS_DELAY`                        | ✓       |

---

## Связанные документы

- [CJM_CORE_LOOP.md](CJM_CORE_LOOP.md) — ежедневный цикл импорта (5–15 раз в день)
- [CJM_FOR_DESIGN_AUDIT.md](CJM_FOR_DESIGN_AUDIT.md) — сводный документ для Claude Design (включает feed/page-builder/HTML-export)
- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура системы
- [FSM_STATES.md](FSM_STATES.md) — состояния и переходы
- Spec auto-pairing: `.claude/specs/done/auto-pairing.md` (если ещё не перемещён)
- Исходники: `packages/plugin/src/ui/components/SetupFlow.tsx`, `packages/plugin/src/ui/components/PairedBanner.tsx`, `packages/plugin/src/ui/components/OnboardingTip.tsx`, `packages/plugin/src/ui/components/SetupSplash.tsx`, `packages/plugin/src/ui/ui.tsx`, `packages/plugin/src/utils/index.ts` (buildPairUrl, generateSessionCode), `packages/extension/src/background.ts` (auto-pair listener)
