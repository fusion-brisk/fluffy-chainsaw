# CJM: Core Loop Contentify — ежедневный цикл импорта («Toothbrush Journey»)

> **Repeating Journey** — цикл, который пользователь повторяет 5-15 раз в день.
> Каждая лишняя секунда friction × 10 повторений = ощутимая потеря продуктивности.

---

## Обзор пути

```
1. Open Plugin → 2. Checking → 3. Ready (waiting) → 4. Browse SERP →
5. Data Received → 6. Configure Import → 7. Processing → 8. Success → 9. Back to Ready
```

**Компоненты системы:**
```
Browser Extension → POST /push → Relay :3847 → GET /pull → Figma Plugin
  (парсит DOM)        (очередь)                   (schema engine → Figma API)
```

**AppState машина:** `checking` → `ready` → `confirming` → `processing` → `success` → `ready`

**UI размеры (UI_SIZES):**
- `compact`: 320×56 — только `checking`
- `standard`: 400×400 — `ready`, `confirming`, `processing`, `success`

**Частота использования:**
- 5-15 импортов в день (типичная сессия: 3-5 импортов подряд)
- Средняя сессия: 10-20 минут активной работы
- Паттерн: batch-импорт 3-5 запросов → работа с макетами → следующий batch

---

## Карта пути (9 колонок)

### 1. Open Plugin

| Аспект | Описание |
|--------|----------|
| **User Goal** | Открыть плагин для начала работы с макетами |
| **User Action** | Plugins → Contentify, Quick Actions, или правый клик → Plugins. Опытные пользователи: запоминают hot-key или pin плагин |
| **UI State** | Figma запускает UI iframe. Мгновенный переход в `checking`. Окно плагина появляется в последней позиции |
| **System Action** | React mount → `useEffect` отправляет `get-settings`, `get-setup-skipped`, `check-whats-new`. Инициализация `useRelayConnection`, `useImportFlow`, `usePanelManager` |
| **Emotional Valence** | 3/5 — привычное действие, нейтрально |
| **Cognitive Load** | LOW — мышечная память, привычный UX Figma |
| **Drop-off Risk** | LOW — пользователь уже знает зачем открывает плагин |
| **Error Paths** | (1) Плагин не в списке → переустановка через Community. (2) Figma sandbox crash → перезапуск плагина |
| **Pain Points** | (1) Нет keyboard shortcut для запуска конкретного плагина в Figma. (2) При каждом открытии — полная реинициализация (нет persistent connection) |
| **Opportunities** | (1) Pin to toolbar. (2) Figma Quick Actions (`Cmd+/` → «contentify»). (3) Напоминание в StatusBar что relay готов и ждёт |
| **Key Metric** | Время от решения до открытого плагина, частота запусков в день |

---

### 2. Checking

| Аспект | Описание |
|--------|----------|
| **User Goal** | Дождаться подключения к Relay |
| **User Action** | Пассивное ожидание. Видит спиннер и текст «Подключение...» |
| **UI State** | `AppState: 'checking'`, размер `compact` (320×56). Спиннер `checking-view-spinner` + текст «Подключение...». Переход в `ready` через 100ms timeout ИЛИ при `relay.connected === true` (что раньше) |
| **System Action** | `useRelayConnection` пытается: (1) HTTP `GET /status` на `localhost:3847` с timeout 2s. (2) WebSocket `ws://localhost:3847`. При успехе: `connected: true` → `useEffect` ловит и делает `setAppState('ready')`. При неудаче: timeout 100ms всё равно переводит в `ready` |
| **Emotional Valence** | 3/5 — мимолётный момент, обычно не замечается (100ms) |
| **Cognitive Load** | LOW — ничего не требуется от пользователя |
| **Drop-off Risk** | LOW — автоматический переход, пользователь не успевает уйти |
| **Error Paths** | (1) Relay не запущен → переход в `ready` всё равно произойдёт через 100ms, StatusBar покажет «⚠ Relay офлайн». (2) WebSocket connection fail → fallback на HTTP polling |
| **Pain Points** | (1) При повторных запусках 100ms ожидания суммируются в ощутимую задержку (10 раз × 100ms = 1 сек). (2) Нет визуальной разницы между «подключаюсь» и «не могу подключиться» |
| **Opportunities** | (1) Instant transition если relay уже был connected в предыдущей сессии (кэш в localStorage). (2) Пропуск checking для повторных запусков в рамках одной Figma-сессии |
| **Key Metric** | Checking→ready latency, relay hit rate при запуске |

---

### 3. Ready (waiting)

| Аспект | Описание |
|--------|----------|
| **User Goal** | Убедиться что система готова, перейти к парсингу в Chrome |
| **User Action** | Смотрит на StatusBar (relay ✓ / extension ✓). Переключается в Chrome для парсинга. Может кликнуть «Повторить» для re-import последнего запроса |
| **UI State** | `AppState: 'ready'`, размер `standard` (400×400). ReadyView: InboxIcon с pulse-анимацией, «Ожидание данных». StatusBar: зелёные/жёлтые индикаторы relay и extension. Если есть `lastQuery`: «Последний: "запрос"» + кнопка «Повторить». Инструкция: «Откройте Яндекс в Chrome с расширением Contentify» |
| **System Action** | WebSocket подключён к `ws://localhost:3847` — слушает `new-data` события. Если WS недоступен: HTTP polling `/status` каждые 1с (active) или 5с (idle, >10с без взаимодействия). `check-selection` проверяет выделение в Figma. Relay enabled: `appState !== 'processing' && appState !== 'confirming'` |
| **Emotional Valence** | 3/5 — спокойное ожидание, привычная фаза рабочего цикла |
| **Cognitive Load** | LOW — опытный пользователь знает что делать: переключиться в Chrome |
| **Drop-off Risk** | LOW — в рабочем цикле пользователь уже мотивирован |
| **Error Paths** | (1) Relay disconnected → StatusBar «⚠ Relay офлайн» + кнопка «Настроить». WS exponential backoff reconnect [1s, 2s, 4s, 8s, 16s]. (2) WebSocket обрыв → автоматический fallback на HTTP polling. (3) `visibilitychange` → ping WS или HTTP check при возврате в Figma |
| **Pain Points** | (1) Pulse-анимация InboxIcon — единственная обратная связь, не передаёт «система работает и ждёт». (2) При batch-работе: фаза ready — wasted time, пользователь хочет сразу к следующему запросу. (3) Нет индикатора «relay жив и слушает» отдельно от StatusBar |
| **Opportunities** | (1) Auto-detect Chrome tab с Яндексом через relay. (2) Кнопка «Повторить» более заметная для batch-workflow. (3) Счётчик импортов за сессию. (4) Queue indicator: «В очереди: 0 запросов» |
| **Key Metric** | Time in ready state, reimport usage rate |

---

### 4. Browse SERP

| Аспект | Описание |
|--------|----------|
| **User Goal** | Найти нужную выдачу Яндекса и отправить данные в плагин |
| **User Action** | Переключается в Chrome → ya.ru → вводит запрос → кликает иконку расширения (или расширение автоматически парсит). Для batch: повторяет с новым запросом, не возвращаясь в Figma |
| **UI State** | Figma plugin остаётся в `ready` (фоновый процесс). Chrome: extension popup с кнопкой отправки, badge с количеством сниппетов. Plugin UI не меняется — пользователь в Chrome |
| **System Action** | Extension `content.js` на yandex.ru: `extractSnippets()` → парсинг DOM → `getSnippetType()`. `background.js` отправляет `POST /push` на Relay `localhost:3847`. Relay сохраняет payload в очередь, отправляет `{ type: 'new-data' }` через WebSocket всем подключённым клиентам |
| **Emotional Valence** | 3/5 — привычный поиск, рутинная часть workflow |
| **Cognitive Load** | LOW — поиск в Яндексе привычен. Единственный нюанс: не забыть кликнуть расширение |
| **Drop-off Risk** | LOW — в рабочем цикле пользователь целенаправлен |
| **Error Paths** | (1) Extension не активируется → content script не загрузился. (2) Relay офлайн → POST /push fail, badge показывает ошибку. (3) Яндекс изменил DOM → 0 спарсенных сниппетов. (4) Повторная отправка того же запроса → duplicate entryId, relay обновляет payload |
| **Pain Points** | (1) Переключение Chrome ↔ Figma — context switch при каждом импорте. (2) Нет обратной связи: данные отправились или нет (только badge). (3) При batch-импорте: нужно ждать подтверждения в Figma перед следующим запросом. (4) Расширение не различает «отправить сейчас» vs «добавить в очередь» |
| **Opportunities** | (1) Авто-отправка при загрузке страницы (без клика). (2) Toast в Chrome: «Отправлено 42 элемента в Figma». (3) Queue mode: отправлять несколько запросов подряд, разбирать в Figma пакетом. (4) Chrome side panel вместо popup для мгновенной обратной связи |
| **Key Metric** | Parse success rate, items per page, time browse→push, batch size |

---

### 5. Data Received (confirming)

| Аспект | Описание |
|--------|----------|
| **User Goal** | Увидеть что данные дошли, подтвердить импорт |
| **User Action** | Возвращается в Figma (или видит автоматическую смену состояния если окно плагина видно). Видит ImportConfirmDialog с summary данных |
| **UI State** | Автоматический переход `ready → confirming`. WebSocket получает `{ type: 'new-data' }` → `peekRelayData()` → `extractRowsFromPayload()` → `importFlow.showConfirmation()`. ImportConfirmDialog: CheckCircle icon, «Данные получены», карточка с запросом, summary (количество + типы элементов). Размер `standard` (400×400) |
| **System Action** | `peekRelayData()` → `GET /peek` (non-destructive read). Парсинг: `extractRowsFromPayload()` → CSVRow[]. `buildImportSummary()` формирует текст summary. Если `!extensionInstalled` → `markExtensionInstalled()`. `pendingEntryIdRef` предотвращает повторную обработку того же entryId. `importFlow.setRelayPayload()` сохраняет raw payload. Relay polling приостановлен: `enabled = appState !== 'confirming'` |
| **Emotional Valence** | 4/5 — подтверждение что система работает, данные на месте |
| **Cognitive Load** | LOW — в рабочем цикле пользователь уже знает что ожидать |
| **Drop-off Risk** | LOW — данные пришли, пользователь инвестирован в процесс |
| **Error Paths** | (1) Payload пустой (0 rows) → `peekRelayData` не вызывает callback. (2) WebSocket обрыв при передаче → HTTP polling подхватит через 1-5 сек. (3) Пользователь в Chrome, не видит Figma → данные ждут в `confirming`, relay polling приостановлен. (4) Duplicate entryId → `lastProcessedEntryIdRef` блокирует повторную обработку |
| **Pain Points** | (1) Нет push-notification в Figma — если пользователь в Chrome, он не знает что данные пришли. (2) При batch-workflow: нужно переключаться в Figma после каждой отправки. (3) Summary может быть непонятен: «42 сниппета, фильтры (5), сайдбар (8 офферов)» — технические термины |
| **Opportunities** | (1) Figma notification при получении данных. (2) Auto-confirm mode для batch-workflow: импорт без подтверждения. (3) Sound notification. (4) Chrome extension popup показывает «Данные доставлены в Figma» |
| **Key Metric** | Push-to-peek latency, confirmation screen dwell time |

---

### 6. Configure Import (confirming)

| Аспект | Описание |
|--------|----------|
| **User Goal** | Выбрать режим импорта и запустить обработку |
| **User Action** | Выбирает: (1) «Создать артборд» (`Enter`) — новый фрейм с полной выдачей. (2) «Заполнить выделение» — заполнить выделенные контейнеры данными. Опционально: чекбокс «Добавить скриншоты страницы». Или «Отмена» (`Escape`) — отклонить данные |
| **UI State** | `AppState: 'confirming'`, ImportConfirmDialog. Кнопки: «Создать артборд» (primary, autoFocus), «Заполнить выделение» (secondary, если `hasSelection`), «Отмена» (text). Чекбокс скриншотов (default: checked). Hint: `Enter — создать артборд`. Если нет выделения: подсказка «Выделите контейнеры для заполнения» вместо кнопки |
| **System Action** | `check-selection` опрашивает Figma → `hasSelection`. При confirm: `importFlow.confirm({ mode, includeScreenshots })` → сохраняет `pendingEntryIdRef`, запускает safety timeout (30s), отправляет `apply-relay-payload` в sandbox. При cancel: `importFlow.cancel()` → `relay.blockEntry(entryId)` на 10 сек → возврат в `ready`. При clearQueue: `relay.clearQueue()` → удаляет все данные из relay |
| **Emotional Valence** | 4/5 — уверенный выбор, привычный диалог |
| **Cognitive Load** | LOW (повторный цикл) — пользователь знает разницу между режимами. MEDIUM (первые разы) — нужно освоить два режима |
| **Drop-off Risk** | LOW — пользователь уже в процессе работы |
| **Error Paths** | (1) Cancel → `blockEntry(entryId)` на 10 сек предотвращает re-show. (2) «Заполнить выделение» недоступно → пользователь забыл выделить контейнеры. (3) При быстром batch: Escape случайно → данные заблокированы на 10 сек |
| **Pain Points** | (1) 10 секунд block после cancel — если отменил случайно, нужно ждать. (2) «Заполнить выделение» требует предварительного выделения в Figma — прерывает flow. (3) Чекбокс скриншотов — непонятно при первом использовании. (4) Нет preview данных перед импортом. (5) Keyboard shortcut только для artboard (`Enter`), нет shortcut для selection mode |
| **Opportunities** | (1) Запоминание последнего режима (artboard vs selection). (2) Keyboard shortcut для selection mode (`Shift+Enter`). (3) Undo cancel: «Отменено. Вернуть?» вместо silent block. (4) Preview: 2-3 карточки как будет выглядеть. (5) Auto-select контейнеров на текущем артборде |
| **Key Metric** | Confirm rate, mode split (artboard vs selection), time-to-confirm, cancel rate |

---

### 7. Processing

| Аспект | Описание |
|--------|----------|
| **User Goal** | Дождаться обработки данных |
| **User Action** | Пассивное ожидание. Наблюдает за сменой этапов. Может нажать «Отменить» если процесс завис (stuck hint через 15 сек) |
| **UI State** | `AppState: 'processing'`, ProcessingView. Спиннер, «Обработка...», stage label, карточка с запросом + marquee summary. Через 15 сек (`STUCK_HINT_DELAY`): «Если процесс завис, нажмите Отменить». Кнопка «Отменить». Размер `standard` (400×400) |
| **System Action** | `apply-relay-payload` → postMessage → sandbox. `MIN_PROCESSING_TIME = 800ms` — минимальное время отображения для плавного UX. Этапы: searching → resetting → grouping → components → text → images → cleanup. Каждый этап → `progress` message → `importFlow.updateStage()`. Schema engine: `applySchema()` для каждого контейнера. Handler registry: executeAll по приоритетам. Изображения загружаются параллельно через CORS-proxy. Завершение: `done` или `relay-payload-applied` message |
| **Emotional Valence** | 3/5 — привычное ожидание, stage labels дают ощущение прогресса |
| **Cognitive Load** | LOW — ничего не требуется |
| **Drop-off Risk** | LOW (типичный импорт 5-15 сек). MEDIUM (большие страницы 20-30 сек) — может показаться зависшим |
| **Error Paths** | (1) Sandbox crash → `onError` → `finishProcessing('error')` → возврат в `ready`. (2) Image loading timeout → partial success (failedImages в stats). (3) Component key не найден → fallback на canvas rendering. (4) Font loading failure → текст не заполнен. (5) Stuck >15 сек → hint + cancel. (6) Safety timeout 30 сек → auto-ack entryId чтобы не потерять данные в relay |
| **Pain Points** | (1) Нет процентного прогресса — только текстовые этапы. (2) Stage labels технические: «Компонентная логика», «Группировка». (3) MIN_PROCESSING_TIME = 800ms может ощущаться как лаг при быстрых импортах. (4) Cancel — no-op для relay imports (`handleCancel` пуст), только `import-cancelled` от sandbox. (5) При batch: 15 сек × 5 импортов = >1 мин только на processing |
| **Opportunities** | (1) Процентный progress bar вместо этапов. (2) Человечные labels: «Расставляю карточки», «Загружаю картинки». (3) Estimated time based на количестве items. (4) Background processing: пользователь может работать, notification по завершении. (5) Убрать MIN_PROCESSING_TIME для повторных импортов (не первый раз) |
| **Key Metric** | Processing time (p50, p95), cancel rate, error rate by stage |

---

### 8. Success

| Аспект | Описание |
|--------|----------|
| **User Goal** | Увидеть результат и перейти к следующему запросу или работе с макетом |
| **User Action** | Видит SuccessView с анимацией. Hover на окно → пауза auto-close (для чтения статистики). Клик «Закрыть» или ожидание auto-close. При ошибках: «Показать подробности» → LogViewer. После close → автоматический возврат в `ready` |
| **UI State** | `AppState: 'success'`. SuccessView: CheckCircle с bounce-анимацией, «Готово!», «Макет для "запрос" добавлен на холст». Статистика: «✓ N свойств», «✗ N не удалось», «✗ N изобр. не загружено». Progress bar auto-close: 3 сек (clean) или 8 сек (с ошибками, `DELAY_WITH_FAILURES`). Confetti анимация. Hover → пауза таймера с resume при mouse leave |
| **System Action** | `finishProcessing('success')` → `setAppState('success')` → `resizeUI('success')`. `ackData(entryId)` подтверждает relay → удаляет из очереди (retry: 3 попытки, delays [1s, 2s, 4s]). Confetti trigger: `setConfettiActive(true)`. Auto-close timer: `setTimeout(onComplete, remainingRef.current)`. `onComplete` = `importFlow.completeSuccess()` → `setAppState('ready')` |
| **Emotional Valence** | 5/5 — результат на холсте, confetti, пиковый момент цикла |
| **Cognitive Load** | LOW — результат понятен визуально |
| **Drop-off Risk** | LOW — цикл завершён успешно |
| **Error Paths** | (1) Ack не доходит до relay → retry 3 раза. При полном fail: данные останутся в очереди, будут показаны повторно. (2) Stats с ошибками → пользователь может не понять причину. (3) Auto-close слишком быстрый → hover для паузы. (4) Confetti может не отобразиться если UI minimized |
| **Pain Points** | (1) 3 сек auto-close — мало для чтения статистики при ошибках. (2) «✗ 5 не удалось» без детализации: какие именно свойства? (3) При batch-workflow: confetti на каждый импорт может раздражать. (4) Нет кнопки «Zoom to frame» для навигации к созданному артборду. (5) Переход ready→confirming может произойти во время auto-close если данные уже в очереди |
| **Opportunities** | (1) «Zoom to frame» кнопка. (2) Batch mode: тихий success без confetti для серийных импортов. (3) Детализация ошибок inline. (4) Счётчик сессии: «Импорт #3 за сегодня». (5) Quick action: «Ещё один запрос» → фокус на Chrome |
| **Key Metric** | Success rate, stats quality ratio, auto-close vs manual close, time-to-next-import |

---

### 9. Back to Ready

| Аспект | Описание |
|--------|----------|
| **User Goal** | Начать следующий импорт или перейти к работе с макетом |
| **User Action** | Два сценария: (A) Batch — сразу переключается в Chrome для следующего запроса. (B) Work — начинает работу с импортированным макетом, плагин остаётся в фоне |
| **UI State** | `AppState: 'ready'` (после `completeSuccess()`). ReadyView с `lastQuery` = последний запрос. Кнопка «Повторить» (re-import). Если данные уже в очереди relay → мгновенный переход в `confirming`. StatusBar отражает текущий статус relay/extension |
| **System Action** | `completeSuccess()` → `setAppState('ready')` + `resizeUI('ready')`. WebSocket и HTTP polling возобновляются (`enabled = true`). Если relay имеет pending data → WebSocket `new-data` → немедленный `showConfirmation()`. `lastQuery` сохранён для «Повторить». Relay polling активен: 1с интервал |
| **Emotional Valence** | 4/5 — удовлетворение от завершённой работы, готовность к следующему |
| **Cognitive Load** | LOW — состояние привычное, пользователь знает свой следующий шаг |
| **Drop-off Risk** | LOW — пользователь либо продолжает цикл, либо переходит к работе с макетами |
| **Error Paths** | (1) Relay disconnect за время processing → reconnect при возврате в ready. (2) Pending data в relay → мгновенный переход в confirming может быть неожиданным. (3) Chrome закрыт → extension не активна, нужно открыть заново |
| **Pain Points** | (1) При batch: переход success→ready→confirming занимает 3+ сек (auto-close delay). (2) «Повторить» (reimport) не всегда понятно: те же данные или новый парсинг? (3) Нет визуального перехода между циклами — каждый раз как будто «с нуля». (4) Если данные прилетели во время success → переход в confirming может быть дезориентирующим |
| **Opportunities** | (1) Queue preview: «В очереди ещё 2 запроса — продолжить?». (2) Session progress: «3 из 5 запросов импортировано». (3) Instant transition при pending data: skip success auto-close. (4) «Повторить» с пояснением: «Перепарсить "запрос" из кэша relay» |
| **Key Metric** | Time success→next_action, reimport rate, queue throughput |

---

## Эмоциональная кривая (один цикл)

```
Valence
  5 │                                              ★ SUCCESS
    │                                             ╱ ╲
  4 │                    ●Data Received ●Confirm  ╱   ╲ ●Back
    │                                    ╲      ╱     ╲╱to Ready
  3 │  ●Open  ●Check  ●Ready   ●Browse    ╲   ╱ ●Process
    │      ╲  ╱    ╲  ╱     ╲  ╱            ╲╱
  2 │       ╲╱      ╲╱       ╲╱
    │
  1 │
    │
  0 └──────────────────────────────────────────────────── Steps
      1     2     3      4       5       6      7     8     9
                                                    PEAK
```

**Стабильная кривая** — в отличие от онбординга, нет Valley of Despair. Эмоциональный пик на Success (confetti + результат). Минимальный уровень — Processing (ожидание). Цикл начинается и заканчивается на 3-4/5.

---

## Паттерны последовательного импорта (Batch Workflow)

### Типичный batch-сценарий

```
Цикл 1: Ready → Chrome → SERP → Data → Confirm → Process → Success
  ↓ (auto-close 3s)
Цикл 2: Ready → Chrome → SERP → Data → Confirm → Process → Success
  ↓ (auto-close 3s)
Цикл 3: Ready → Chrome → SERP → Data → Confirm → Process → Success
  ↓
Работа с макетами
```

### Временная раскладка batch-цикла

| Фаза | Время | % от цикла |
|------|-------|-----------|
| Ready → Chrome switch | 1-2 сек | 5% |
| SERP browse + parse | 5-15 сек | 35% |
| Chrome → Figma switch | 1-2 сек | 5% |
| Confirm dialog | 1-3 сек | 8% |
| Processing | 5-15 сек | 35% |
| Success (auto-close) | 3 сек | 12% |
| **Итого один цикл** | **16-40 сек** | **100%** |

### Friction points в повторяющемся цикле

| Friction | Время за цикл | За 5 циклов | Решение |
|----------|--------------|-------------|---------|
| Chrome ↔ Figma switching | 2-4 сек | 10-20 сек | Auto-confirm mode, Chrome side panel |
| Success auto-close wait | 3 сек | 15 сек | Skip delay для batch, instant transition |
| Confirm dialog (if always artboard) | 1-2 сек | 5-10 сек | Remember last choice, auto-confirm |
| Processing min delay (800ms) | 0.8 сек | 4 сек | Skip для повторных импортов |
| Ready pulse animation (idle) | 1-2 сек | 5-10 сек | Instant data detection |
| **Суммарный overhead** | **~10 сек** | **~50 сек** | — |

### Queue Pipeline (идеальный batch)

```
Текущий:    [Browse]→[Switch]→[Confirm]→[Process]→[Wait]→[Browse]→...
                                                    ↑ wasted time

Идеальный:  [Browse][Browse][Browse]→[Switch]→[Queue: 3 запроса]→[Process×3]→[Done]
                                                ↑ одно подтверждение на все
```

---

## Покрытие AppState переходов

| Переход | CJM State | Trigger | Covered |
|---------|-----------|---------|---------|
| `→ checking` | 1. Open Plugin | React mount, initial state | ✓ |
| `checking → ready` | 2. Checking | 100ms timeout OR relay.connected | ✓ |
| `ready → confirming` | 5. Data Received | WebSocket `new-data` → peekRelayData | ✓ |
| `confirming → processing` | 6→7. Confirm | importFlow.confirm() | ✓ |
| `confirming → ready` | 6. Cancel | importFlow.cancel() + blockEntry | ✓ |
| `processing → success` | 7→8. Done | finishProcessing('success') + MIN_PROCESSING_TIME | ✓ |
| `processing → ready` | 7. Error/Cancel | finishProcessing('error'/'cancel') | ✓ |
| `success → ready` | 8→9. Complete | completeSuccess() via auto-close or click | ✓ |

## Покрытие useImportFlow lifecycle

| Action | CJM State | Covered |
|--------|-----------|---------|
| `showConfirmation()` | 5. Data Received | ✓ |
| `confirm({ mode, includeScreenshots })` | 6. Configure Import | ✓ |
| `cancel()` + `blockEntry()` | 6. Cancel | ✓ |
| `clearQueue()` | 6. Clear Queue | ✓ |
| `finishProcessing('success')` | 7→8. Processing done | ✓ |
| `finishProcessing('error')` | 7. Error path | ✓ |
| `finishProcessing('cancel')` | 7. Cancel path | ✓ |
| `completeSuccess()` | 8→9. Auto-close/click | ✓ |
| `updateStage()` | 7. Progress updates | ✓ |
| `setStats()` | 7→8. Stats collection | ✓ |
| `ackPendingEntry()` | 8. Relay acknowledgment | ✓ |
| MIN_PROCESSING_TIME (800ms) | 7. Smooth UX guard | ✓ |
| Safety timeout (30s) | 7. Stuck protection | ✓ |

---

## Метрики эффективности цикла

| Метрика | Текущая оценка | Целевая |
|---------|---------------|---------|
| Один полный цикл (ready→ready) | **16-40 сек** | **8-15 сек** |
| Overhead на повторный цикл | ~10 сек | ~3 сек |
| Batch 5 импортов | **2-3 мин** | **< 1 мин** |
| Confirm decision time | 1-3 сек | < 0.5 сек (auto-confirm) |
| Processing time (p50) | 8-12 сек | 5-8 сек |
| Success auto-close | 3 сек | 0 сек (batch mode) |
| Context switches (Chrome ↔ Figma) per import | 2 | 0 (queue mode) |

---

## Top-3 friction points для оптимизации

### 1. Context Switching Chrome ↔ Figma — 2-4 сек × N импортов

**Проблема:** Каждый цикл требует: Figma→Chrome (найти запрос), Chrome→Figma (подтвердить). При 5 импортах — 10-20 сек только на переключения.

**Текущий UX:** Ручное переключение окон + ожидание confirming dialog.

**Решение:**
- **Краткосрочное:** Chrome extension показывает статус доставки inline, не нужно проверять Figma.
- **Среднесрочное:** Queue mode — отправить 5 запросов подряд из Chrome, подтвердить пакетом в Figma.
- **Долгосрочное:** Auto-confirm mode для доверенных source (настраивается в Settings).

### 2. Success Wait + Confirm Overhead — 4-5 сек × N импортов

**Проблема:** Auto-close 3 сек + confirm dialog 1-2 сек = 4-5 сек overhead на каждом цикле. При batch — это суммируется.

**Текущий UX:** Success view с confetti → 3 сек → ready → новые данные → confirming → ручной выбор.

**Решение:**
- **Краткосрочное:** «Пропустить» кнопка на Success для мгновенного перехода в ready.
- **Среднесрочное:** Batch mode: если в relay есть pending data, skip success → confirming напрямую.
- **Долгосрочное:** Pipeline mode: данные обрабатываются в фоне, результат отображается в queue panel.

### 3. Отсутствие прогресса в Processing — psychological friction

**Проблема:** Stage labels технические и не показывают процент. 15 сек ожидания без прогресс-бара ощущаются дольше.

**Текущий UX:** Текстовые этапы: «Компонентная логика», «Группировка», «Загрузка изображений».

**Решение:**
- **Краткосрочное:** Человечные labels + estimated time.
- **Среднесрочное:** Процентный progress bar (каждый этап = % от общего).
- **Долгосрочное:** Streaming render: элементы появляются на холсте по мере обработки.

---

## Связанные документы

- [CJM_ONBOARDING.md](CJM_ONBOARDING.md) — онбординг нового пользователя
- [ARCHITECTURE.md](ARCHITECTURE.md) — архитектура системы
- [STRUCTURE.md](STRUCTURE.md) — структура модулей
- Исходники: `src/ui/ui.tsx`, `src/ui/hooks/useImportFlow.ts`, `src/ui/components/ImportConfirmDialog.tsx`, `src/ui/components/ProcessingView.tsx`, `src/ui/components/SuccessView.tsx`
