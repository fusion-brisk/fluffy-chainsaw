# CJM: Онбординг Contentify — от первого запуска до первого импорта

> **Pivotal Journey** — критический путь пользователя через 10 состояний.
> Каждый drop-off на этом пути = потерянный пользователь навсегда.

---

## Обзор пути

```
1. Install → 2. Launch → 3. Relay → 4. Extension → 5. Check →
6. Browse → 7. Data → 8. Confirm → 9. Process → 10. Success
```

**Компоненты системы:**
```
Browser Extension → POST /push → Relay :3847 → GET /pull → Figma Plugin
  (парсит DOM)        (очередь)                   (schema engine → Figma API)
```

**Текущие AppState:** `checking` → `ready` → `confirming` → `processing` → `success`

**UI размеры (UI_SIZES):**
- `compact`: 320×56 — только `checking`
- `standard`: 400×400 — `ready`, `confirming`, `processing`, `success`
- `extended`: 420×520 — setup panels, logs, inspector

---

## Карта пути (10 колонок)

### 1. Plugin Install

| Аспект | Описание |
|--------|----------|
| **User Goal** | Установить плагин для работы с макетами Яндекса |
| **User Action** | Поиск «Contentify» в Figma Community → Install |
| **UI State** | Figma Community page. Плагин ещё не запущен |
| **System Action** | Figma скачивает и регистрирует плагин. Нет серверной части |
| **Emotional Valence** | 3/5 — нейтрально, стандартный процесс Figma |
| **Cognitive Load** | LOW — привычный UX установки плагинов |
| **Drop-off Risk** | LOW — стандартный Figma flow |
| **Error Paths** | Плагин не найден → нет recovery, только прямая ссылка. Figma offline → retry |
| **Pain Points** | Описание плагина может быть непонятным: что именно он делает, зачем нужны Relay и Extension |
| **Opportunities** | Лучшее описание в Community: скриншоты до/после, видео-превью |
| **Key Metric** | Install rate (Community page → Install click) |

---

### 2. First Launch

| Аспект | Описание |
|--------|----------|
| **User Goal** | Запустить плагин и понять, что делать дальше |
| **User Action** | Plugins → Contentify (или через Quick Actions) |
| **UI State** | `AppState: 'checking'`, размер `compact` (320×56). Показан спиннер + текст «Подключение...». Через 100ms или при relay.connected переход в `ready` |
| **System Action** | `useEffect` отправляет `get-settings`, `get-setup-skipped`, `check-whats-new`. `useRelayConnection` делает `fetch(/status)` + пытается открыть WebSocket на `ws://localhost:3847`. Первый запуск: relay не найден → `connected: false` |
| **Emotional Valence** | 2/5 — растерянность: окно маленькое, быстро переключается, непонятно что происходит |
| **Cognitive Load** | MEDIUM — пользователь должен понять, что плагин требует внешние компоненты |
| **Drop-off Risk** | **HIGH** — если `isFirstRun=true` и `extensionInstalled=false`, показывается SetupFlow вместо ReadyView. Пользователь видит «Шаг 1 из 6» — это пугает |
| **Error Paths** | Окно не открылось → перезапуск Figma. Plugin crash → Figma error dialog |
| **Pain Points** | (1) Переход `checking→ready` за 100ms слишком быстрый — пользователь не успевает прочитать. (2) SetupFlow сразу показывает 6 шагов — нет объяснения зачем. (3) Нет welcome-экрана с описанием принципа работы |
| **Opportunities** | Welcome-экран перед SetupFlow: объяснить архитектуру Extension→Relay→Plugin за 3 предложения. Показать что будет в результате (пример заполненного макета) |
| **Key Metric** | Time checking→ready, bounce rate на SetupFlow |

---

### 3. Relay Setup

| Аспект | Описание |
|--------|----------|
| **User Goal** | Установить Relay-сервер на свой Mac |
| **User Action** | SetupFlow шаги 1-3: (1) Клик «Скачать установщик» → скачивает `Contentify-Installer.zip` с GitHub Releases. (2) Распаковка zip, запуск установщика. (3) Ожидание подключения |
| **UI State** | `AppState: 'ready'` + SetupFlow overlay. Размер `standard` (400×400). Progress bar «Шаг 1/2/3 из 6». Шаг `relay-download`: кнопка «Скачать установщик». Шаг `relay-install`: текст-инструкция. Шаг `relay-verify`: текст «Ожидание подключения Relay...» или «✓ Relay подключён» |
| **System Action** | `EXTENSION_URLS.INSTALLER_DOWNLOAD` открывает GitHub Releases URL. Установщик копирует бинарник `contentify-relay-host-arm64` и регистрирует launchctl plist. Relay стартует на `localhost:3847`. `useRelayConnection` обнаруживает через HTTP polling (`/status`) или WebSocket → `connected: true`. Шаг `relay-verify` имеет `autoSkip: 'relay'` — автопереход при подключении |
| **Emotional Valence** | 1/5 — **фрустрация**: скачивание с GitHub, распаковка zip, запуск .app — это не типичный UX для дизайнера |
| **Cognitive Load** | **HIGH** — (1) GitHub Releases — чуждый интерфейс для дизайнеров. (2) macOS Gatekeeper может заблокировать. (3) Нужно понять что такое «Relay» и зачем он нужен |
| **Drop-off Risk** | **CRITICAL** — главный барьер всего пути. Дизайнер привык к one-click install. Здесь 3 шага с внешним софтом |
| **Error Paths** | (1) GitHub недоступен → нет fallback, кнопка просто не работает. (2) macOS Gatekeeper блокирует → нужно зайти в System Preferences → Security. (3) Установщик не запускается (Apple Silicon vs Intel). (4) Relay не стартует → launchctl error, порт 3847 занят. (5) Firewall блокирует localhost. Recovery: нет UI для диагностики — пользователь застревает на «Ожидание подключения Relay...» |
| **Pain Points** | (1) Нет объяснения что такое Relay и зачем он. (2) Нет индикатора прогресса установки. (3) Нет диагностики если relay не подключился. (4) Шаг «Ожидание подключения» — бесконечный, нет timeout. (5) Скачивание с GitHub пугает — «это вирус?» |
| **Opportunities** | (1) Homebrew install: `brew install contentify-relay`. (2) Inline диагностика: «Порт 3847 занят», «Relay не найден в PATH». (3) Timeout + retry кнопка + ссылка на troubleshooting. (4) Пояснение: «Relay — локальный мост между браузером и Figma. Данные не покидают ваш Mac» |
| **Key Metric** | Relay install success rate, time-on-step, drop-off rate |

---

### 4. Extension Setup

| Аспект | Описание |
|--------|----------|
| **User Goal** | Установить Chrome-расширение для парсинга Яндекса |
| **User Action** | SetupFlow шаги 4-6: (4) Клик «Скачать .zip» → скачивает `contentify.crx`. (5) Копирует `chrome://extensions` → включает Developer Mode → «Загрузить распакованное» → выбирает папку. (6) Ожидание подключения |
| **UI State** | SetupFlow продолжает: «Шаг 4/5/6 из 6». Шаг `ext-download`: кнопка «Скачать .zip». Шаг `ext-install`: кнопка «Скопировать chrome://extensions» + инструкция про Developer Mode. Шаг `ext-verify`: «Ожидание подключения расширения...». Кнопка «Пропустить» доступна если relay подключён (`canSkip = relayConnected && !extensionInstalled`) |
| **System Action** | `EXTENSION_URLS.EXTENSION_DOWNLOAD` скачивает CRX с GitHub. Пользователь вручную загружает в Chrome. Extension регистрирует content script для `yandex.ru`. При первом POST от extension на relay: relay `/status` показывает `extensionVersion`. Plugin определяет `extensionInstalled` через `onDataReceived` callback (первые данные = extension работает). Шаг `ext-verify` имеет `autoSkip: 'extension'` |
| **Emotional Valence** | 1/5 — **фрустрация**: Developer Mode, распаковка — ещё хуже чем Relay |
| **Cognitive Load** | **HIGH** — (1) `chrome://extensions` нельзя открыть ссылкой из Figma. (2) Developer Mode — пугающий для не-разработчиков. (3) «Загрузить распакованное» — неочевидный термин. (4) Нужно найти правильную папку |
| **Drop-off Risk** | **CRITICAL** — второй главный барьер. Многие дизайнеры никогда не открывали `chrome://extensions` |
| **Error Paths** | (1) CRX не скачивается с GitHub. (2) Chrome блокирует CRX — нужна распаковка. (3) Пользователь выбирает не ту папку. (4) Developer Mode не включён. (5) Extension конфликтует с другими расширениями. (6) «Ожидание подключения расширения...» — бесконечное: нет способа подтвердить установку без реального использования. Recovery: пользователь может нажать «Пропустить» |
| **Pain Points** | (1) Нет способа проверить extension без отправки данных. (2) Инструкция «Включите режим разработчика → Загрузить распакованное» — слишком кратко, нужны скриншоты. (3) Clipboard API может не работать для `chrome://extensions`. (4) Нет объяснения что делает расширение и зачем Developer Mode |
| **Opportunities** | (1) Chrome Web Store — убирает Developer Mode. (2) Визуальная инструкция со скриншотами. (3) Deep link для Chrome extensions page (не работает из iframe, но можно открыть в браузере). (4) Тест-кнопка: «Проверить расширение» без необходимости парсить реальную страницу |
| **Key Metric** | Extension install success rate, skip rate, time-on-step |

---

### 5. Connection Check

| Аспект | Описание |
|--------|----------|
| **User Goal** | Убедиться что всё работает, перейти к использованию |
| **User Action** | SetupFlow завершён (`onComplete` → `markExtensionInstalled`). Или пользователь нажал «Пропустить». Видит ReadyView |
| **UI State** | `AppState: 'ready'`, `needsSetup: false`. StatusBar вверху показывает статус: «Все ОК ✓» или «⚠ Relay офлайн / Расширение офлайн». ReadyView: иконка InboxIcon с pulse-анимацией, заголовок «Ожидание данных», инструкция «Откройте Яндекс в Chrome с расширением Contentify». Если `isFirstRun` и пропуск не сохранён — OnboardingHint с 3 шагами |
| **System Action** | `useRelayConnection` активен: WebSocket подключён к `ws://localhost:3847` или HTTP polling `/status` каждые 1-5 сек. StatusBar отражает `relayConnected` и `extensionInstalled`. `save-setup-skipped` персистит в Figma clientStorage |
| **Emotional Valence** | 3/5 — облегчение от завершения setup, но неопределённость: «что теперь?» |
| **Cognitive Load** | MEDIUM — нужно понять OnboardingHint (3 шага) или инструкцию в ReadyView |
| **Drop-off Risk** | MEDIUM — пользователь может не понять что делать дальше. «Ожидание данных» — пассивное состояние |
| **Error Paths** | (1) Relay отключился после setup → StatusBar показывает «⚠ Relay офлайн» + кнопка «Настроить». (2) WebSocket обрыв → fallback на HTTP polling с exponential backoff [1s, 2s, 4s, 8s, 16s]. (3) Пользователь закрыл Chrome → extension не активна |
| **Pain Points** | (1) OnboardingHint показывает 3 шага как текст — нет визуального выделения текущего шага. (2) «Откройте Яндекс в Chrome» — не хватает конкретного URL. (3) Нет прогресс-индикатора ожидания. (4) Pulse-анимация InboxIcon может не восприниматься как «жду данные» |
| **Opportunities** | (1) Animated tutorial: стрелка Chrome → Plugin. (2) Quick-test кнопка с mock-данными для проверки пайплайна. (3) URL `ya.ru/search?text=example` как кликабельная ссылка. (4) Прогресс-чеклист: ✓ Relay, ✓ Extension, ○ Первые данные |
| **Key Metric** | Time ready→first_data, abandon rate на ReadyView |

---

### 6. First SERP Browse

| Аспект | Описание |
|--------|----------|
| **User Goal** | Открыть Яндекс, найти нужную выдачу для макета |
| **User Action** | Открывает Chrome → ya.ru → вводит поисковый запрос → просматривает результаты → кликает иконку расширения Contentify в toolbar |
| **UI State** | Figma plugin по-прежнему в `ready` state. Chrome: расширение показывает popup с кнопкой отправки или автоматически парсит страницу |
| **System Action** | Extension `content.js` активируется на yandex.ru: `extractSnippets()` → парсит DOM → определяет `getSnippetType()` для каждого сниппета. `background.js` отправляет `POST /push` на Relay с `{ payload: { items, source, capturedAt } }`. Badge показывает количество найденных сниппетов |
| **Emotional Valence** | 3/5 — нейтрально, привычный поиск в Яндексе |
| **Cognitive Load** | LOW — поиск в Яндексе привычен. Единственное новое: клик по расширению |
| **Drop-off Risk** | MEDIUM — пользователь может забыть кликнуть расширение. Или расширение не активируется на странице |
| **Error Paths** | (1) Расширение не видит страницу Яндекса → content script не загрузился (неверный URL pattern). (2) POST /push на relay не доходит → relay не запущен. (3) CORS ошибка. (4) Extension парсит 0 сниппетов → пустой payload. (5) Яндекс изменил DOM → парсинг ломается (решается Remote Config) |
| **Pain Points** | (1) Пользователь не знает когда кликать расширение — до или после загрузки страницы. (2) Нет обратной связи в extension popup — данные отправлены или нет. (3) Badge расширения может быть не заметен |
| **Opportunities** | (1) Автоматическая отправка при загрузке страницы (без клика). (2) Toast/notification в Chrome при успешной отправке. (3) Extension popup с превью данных перед отправкой |
| **Key Metric** | Parse success rate, items per page, time browse→push |

---

### 7. First Data Received

| Аспект | Описание |
|--------|----------|
| **User Goal** | Увидеть что данные дошли до плагина |
| **User Action** | Возвращается в Figma (переключает окно). Видит что плагин изменил состояние |
| **UI State** | Автоматический переход: WebSocket получает `{ type: 'new-data' }` от relay → вызывает `peekRelayData()` → `extractRowsFromPayload(payload)` → `onDataReceived` callback → `importFlow.showConfirmation()` → `AppState: 'confirming'` |
| **System Action** | WebSocket message `new-data` → `peekRelayData()` → `GET /peek` (non-destructive). Парсинг payload: `extractRowsFromPayload()` → CSVRow[]. Подсчёт: `rows.length + wizardCount`. Формирование summary через `buildImportSummary()`. Если первые данные: `markExtensionInstalled()` → сохраняет `setup-skipped` в clientStorage. Если WS не подключён: HTTP polling `/status` обнаружит `hasData: true` → `/peek` |
| **Emotional Valence** | 4/5 — **приятный сюрприз**: «О, оно работает!» |
| **Cognitive Load** | LOW — переход автоматический, не требует действий |
| **Drop-off Risk** | LOW — если данные дошли, пользователь уже вовлечён |
| **Error Paths** | (1) WebSocket обрыв при передаче → HTTP polling подхватит с задержкой 1-5 сек. (2) Payload пустой (0 rows) → `peekRelayData` возвращает без вызова callback. (3) Duplicate entryId → `pendingEntryIdRef` предотвращает повторную обработку. (4) Plugin UI в фоне → `visibilitychange` listener пингует WS или делает HTTP check при возврате |
| **Pain Points** | (1) Если пользователь не в Figma — он не видит что данные пришли. Нет push-notification. (2) Нет звукового/визуального сигнала в Figma. (3) Переход `ready→confirming` может быть незамечен если окно плагина маленькое |
| **Opportunities** | (1) Figma notification API (если доступно). (2) Звуковой сигнал при получении данных. (3) Badge/counter на иконке плагина. (4) Анимация перехода ready→confirming должна быть яркой |
| **Key Metric** | Push-to-peek latency, data loss rate |

---

### 8. First Confirm

| Аспект | Описание |
|--------|----------|
| **User Goal** | Понять что пришло и решить как импортировать |
| **User Action** | Видит ImportConfirmDialog. Выбирает: «Создать артборд» (Enter) или «Заполнить выделение» (если выделены контейнеры). Опционально: чекбокс «Добавить скриншоты страницы». Или «Отмена» (Escape) |
| **UI State** | `AppState: 'confirming'`. ImportConfirmDialog: иконка CheckCircle, заголовок «Данные получены», карточка с поисковым запросом, количество элементов (summary), чекбокс скриншотов, 2-3 кнопки действий, подсказка `Enter — создать артборд`. Размер `standard` (400×400) |
| **System Action** | `importFlow.showConfirmation()` сохраняет rows, query, entryId в pending state. `check-selection` проверяет выделение в Figma → `hasSelection`. UI ожидает пользовательского решения. При Escape: `importFlow.cancel()` → `relay.blockEntry(entryId, 10000)` → возврат в `ready` |
| **Emotional Valence** | 4/5 — уверенность, понятный выбор |
| **Cognitive Load** | MEDIUM — нужно понять разницу «Создать артборд» vs «Заполнить выделение». Summary может содержать технические термины |
| **Drop-off Risk** | LOW — пользователь уже инвестировал время в setup |
| **Error Paths** | (1) Summary непонятен → пользователь не уверен что импортировать. (2) «Заполнить выделение» неактивно → не выделены контейнеры, видна подсказка «Выделите контейнеры для заполнения». (3) Отмена → данные блокируются на 10 сек через `blockEntry` |
| **Pain Points** | (1) Нет preview данных — пользователь не видит что именно будет импортировано. (2) Термин «артборд» vs «выделение» может быть непонятен новичку. (3) Summary вроде «42 сниппета, фильтры (5), сайдбар (8 офферов)» — слишком технический. (4) Чекбокс скриншотов — неясно что это за скриншоты |
| **Opportunities** | (1) Preview-карточки: показать 2-3 сниппета как они будут выглядеть. (2) Пояснения: «Артборд — новый фрейм с полной выдачей». (3) Визуальная разница режимов. (4) Объяснение скриншотов (скриншоты реальной страницы Яндекса для сравнения) |
| **Key Metric** | Confirm rate, mode split (artboard vs selection), time-to-confirm |

---

### 9. First Processing

| Аспект | Описание |
|--------|----------|
| **User Goal** | Дождаться завершения импорта |
| **User Action** | Ожидание. Может нажать «Отменить» если процесс завис. После 15 сек без прогресса появляется stuck-hint |
| **UI State** | `AppState: 'processing'`. ProcessingView: спиннер, заголовок «Обработка...», этап (stage label), карточка с запросом + summary marquee. Через 15 сек: «Если процесс завис, нажмите Отменить». Кнопка «Отменить». Размер `standard` (400×400) |
| **System Action** | `apply-relay-payload` → postMessage → sandbox code: `createSerpPage()` или `processImportCSV()`. Этапы: searching → resetting → grouping → components → text → images → cleanup. Каждый этап отправляет `progress` message. Schema engine: `applySchema()` для каждого контейнера. Handler registry: executeAll по приоритетам. Загрузка изображений через CORS-proxy параллельно. По завершении: `done` message → `relay-payload-applied` |
| **Emotional Valence** | 3/5 — напряжённое ожидание. Stage labels дают ощущение прогресса |
| **Cognitive Load** | LOW — ничего не нужно делать, просто ждать |
| **Drop-off Risk** | MEDIUM — долгий процесс (10-30 сек для больших страниц) может казаться зависшим |
| **Error Paths** | (1) Sandbox crash → `onError` → `finishProcessing('error')`. (2) Timeout на загрузке изображений → частичный success (failedImages в stats). (3) Font loading failure → текст не заполнен. (4) Component key не найден → fallback на canvas rendering. (5) Процесс завис → stuck hint через 15 сек → пользователь отменяет → `import-cancelled` |
| **Pain Points** | (1) Нет процентного прогресса — только текстовые этапы. (2) Stage labels технические: «Компонентная логика», «Группировка». (3) Marquee с summary может раздражать. (4) 15 сек до stuck hint — слишком долго для первого раза. (5) При ошибке непонятно что пошло не так |
| **Opportunities** | (1) Процентный progress bar. (2) Человечные stage labels: «Расставляю карточки», «Загружаю картинки». (3) Estimated time: «~10 сек». (4) Фоновая обработка с уведомлением по завершении |
| **Key Metric** | Processing time, cancel rate, error rate by stage |

---

### 10. First Success

| Аспект | Описание |
|--------|----------|
| **User Goal** | Увидеть результат и начать работу с заполненным макетом |
| **User Action** | Видит SuccessView с анимацией. Может навести мышь для паузы auto-close. Может кликнуть «Показать подробности» (если были ошибки) или «Закрыть». Auto-close через 3 сек (или 8 сек при ошибках) |
| **UI State** | `AppState: 'success'`. SuccessView: CheckCircle с bounce-анимацией, «Готово!», текст «Макет для "запрос" добавлен на холст», статистика (✓ N свойств, ✗ N не удалось), progress bar auto-close. Confetti анимация! Размер `standard` (400×400). После auto-close → возврат в `ready` |
| **System Action** | `importFlow.finishProcessing('success')` → `setAppState('success')`. `ackData(entryId)` подтверждает relay → удаляет из очереди (с retry: 3 попытки, delays [1s, 2s, 4s]). Confetti trigger. Stats из sandbox: `fieldsSet`, `fieldsFailed`, `failedImages`. Auto-close timer с pause/resume на hover |
| **Emotional Valence** | **5/5** — **восторг!** Confetti + результат на холсте. Пиковый момент |
| **Cognitive Load** | LOW — результат виден, статистика краткая |
| **Drop-off Risk** | LOW — пользователь видит ценность. Цель достигнута |
| **Error Paths** | (1) Ack не доходит до relay → retry 3 раза. При полном fail: данные останутся в очереди, будут показаны повторно. (2) Stats показывают ошибки → пользователь не понимает почему часть не заполнилась. (3) Auto-close слишком быстрый — пользователь не успел прочитать |
| **Pain Points** | (1) 3 сек auto-close слишком быстро для первого раза — пользователь хочет рассмотреть результат. (2) Статистика «✗ 5 не удалось» без объяснения — что именно? (3) Переход в ready после close — нет подсказки «попробуйте другой запрос». (4) Confetti только один раз — можно было бы делать для каждого успеха |
| **Opportunities** | (1) Первый success: увеличить auto-close до 10 сек + подсказка «Попробуйте ещё запрос!». (2) Детализация ошибок inline (не только через Logs). (3) Кнопка «Zoom to frame» — перейти к созданному артборду. (4) Share achievement: количество заполненных макетов |
| **Key Metric** | Success rate, stats quality (fieldsSet/fieldsFailed ratio), repeat usage rate |

---

## Эмоциональная кривая

```
Valence
  5 │                                                          ★ SUCCESS
    │                                                         ╱
  4 │                                    ●Data    ●Confirm   ╱
    │                                     ╲      ╱         ╱
  3 │  ●Install   ●Launch     ●Check  ●Browse  ╱    ●Process
    │         ╲   ╱               ╲  ╱        ╱
  2 │          ╲╱Launch            ╲╱        ╱
    │          ╱                            ╱
  1 │    ●Relay ●Extension                ╱
    │     ▼▼▼   ▼▼▼
  0 └──────────────────────────────────────────────── Steps
      1    2    3    4    5    6    7    8    9   10
              VALLEY OF DESPAIR
              (setup steps 3-4)
```

**Valley of Despair** — шаги 3-4 (Relay + Extension setup) — критическое дно эмоциональной кривой. Пользователь-дизайнер вынужден работать с GitHub Releases, Terminal, Developer Mode.

---

## TTV (Time-to-Value)

| Метрика | Текущая оценка | Целевая |
|---------|---------------|---------|
| Install → First Success | **15-25 минут** | **< 5 минут** |
| Plugin Launch → Ready | 100ms-3 sec | < 1 sec |
| Relay Setup (steps 1-3) | **5-15 минут** | **< 1 минуты** (Homebrew / bundled) |
| Extension Setup (steps 4-6) | **3-10 минут** | **< 30 сек** (Chrome Web Store) |
| Connection Check → First Data | 1-5 минут (manual browse) | 30 сек (mock data / test button) |
| Data Received → Success | 15-30 сек | 10-15 сек |

**Главный разрыв:** 15-25 минут текущий TTV vs 5 минут целевой. 80% времени — setup внешних компонентов (Relay + Extension).

---

## Top-3 критических барьера drop-off

### 1. Relay Installation (Step 3) — DROP-OFF ~40%

**Проблема:** Скачивание бинарника с GitHub Releases + ручная установка через macOS installer. Gatekeeper блокирует, пользователь пугается.

**Текущий UX:** Кнопка → GitHub → скачать zip → распаковать → запустить installer → ждать.

**Решение:**
- **Краткосрочное:** Inline-инструкция с GIF-анимацией прохождения Gatekeeper. Диагностика в UI: «Порт 3847 занят», «Relay не найден».
- **Среднесрочное:** Homebrew formula: `brew install contentify-relay`.
- **Долгосрочное:** Bundled relay в плагин (WASM) или cloud relay (устраняет шаг полностью).

### 2. Extension Installation (Step 4) — DROP-OFF ~30%

**Проблема:** Developer Mode в Chrome — чуждый UX для дизайнеров. Загрузка распакованного расширения — многошаговый процесс.

**Текущий UX:** Скачать CRX → скопировать `chrome://extensions` → Developer Mode → Загрузить распакованное.

**Решение:**
- **Краткосрочное:** Пошаговая инструкция со скриншотами внутри SetupFlow.
- **Среднесрочное:** Chrome Web Store ($5 dev account) — one-click install.
- **Долгосрочное:** Без расширения: bookmarklet или встроенный браузер в relay.

### 3. «Что делать дальше?» после Setup (Step 5) — DROP-OFF ~20%

**Проблема:** ReadyView показывает «Ожидание данных» с иконкой InboxIcon — пассивное состояние без clear next action. OnboardingHint содержит 3 текстовых шага без визуального контекста.

**Текущий UX:** Текст «Откройте Яндекс в Chrome с расширением Contentify» — и всё.

**Решение:**
- **Краткосрочное:** Кнопка «Попробовать с тестовыми данными» — mock import для проверки пайплайна. Кликабельная ссылка на ya.ru.
- **Среднесрочное:** Animated tutorial overlay: визуально показать поток данных Chrome → Relay → Figma.
- **Долгосрочное:** Guided first run: плагин сам открывает Chrome с нужным URL и проводит пользователя через первый импорт.

---

## Покрытие SetupFlow Steps

| SetupFlow Step | CJM State | Covered |
|----------------|-----------|---------|
| `relay-download` | 3. Relay Setup | ✓ |
| `relay-install` | 3. Relay Setup | ✓ |
| `relay-verify` (autoSkip: relay) | 3. Relay Setup | ✓ |
| `ext-download` | 4. Extension Setup | ✓ |
| `ext-install` | 4. Extension Setup | ✓ |
| `ext-verify` (autoSkip: extension) | 4. Extension Setup | ✓ |

## Покрытие useRelayConnection Error Paths

| Error Path | CJM State | Covered |
|------------|-----------|---------|
| WebSocket connection fail | 3, 5, 7 | ✓ |
| Exponential backoff reconnect [1s..16s] | 5, 7 | ✓ |
| HTTP polling fallback (1s active / 5s idle) | 5, 7 | ✓ |
| Visibility change handler (ping/check) | 7 | ✓ |
| Duplicate entry prevention (entryId tracking) | 7 | ✓ |
| Ack retry (3 attempts, [1s, 2s, 4s]) | 10 | ✓ |
| Block entry after cancel (10s cooldown) | 8 | ✓ |
| Fetch timeout (2s for /status) | 3, 5 | ✓ |
| Relay /peek empty payload | 7 | ✓ |
| Extension version detection via meta | 7 | ✓ |

---

## Связанные документы

- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура системы
- [GLOSSARY.md](GLOSSARY.md) — термины проекта
- [STRUCTURE.md](STRUCTURE.md) — структура модулей
- Исходники: `src/ui/components/SetupFlow.tsx`, `src/ui/hooks/useRelayConnection.ts`, `src/ui/ui.tsx`
