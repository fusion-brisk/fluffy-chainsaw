# Screenshots для Claude Design аудита

> **Текущее состояние:** 12 скриншотов уже собраны и закоммичены в репозиторий. Capture-ились автоматически через `python3 -m http.server` + Chrome DevTools Protocol против собранного `packages/plugin/dist/ui-embedded.html` с моканым `fetch` и mock pluginMessage events для каждого AppState.

## Как пересобрать скриншоты (если нужно)

1. `npm run build -w packages/plugin` — собрать актуальный `ui-embedded.html`
2. `python3 -m http.server 5174 --directory packages/plugin/dist` — поднять статический сервер
3. Открыть `http://localhost:5174/ui-embedded.html` в Chrome
4. В DevTools console выполнить mock-скрипты для каждого state'а (см. PR #28 / git log на feature/heads-up-progress-indication для готовых snippet'ов)
5. `Cmd+Shift+4 + Space` для capture

Альтернатива (быстрее) — реальная Figma-сессия с задеплоенным cloud-relay:

## Подготовка к captures (live Figma)

1. Убедиться что cloud-relay развёрнут и работает (https://<your>.apigw.yandexcloud.net/health → 200)
2. Открыть Figma desktop client (для удобства скриншотов macOS — `Cmd+Shift+4 + Space` → клик по окну плагина)
3. В новом Figma-файле открыть Plugins → Contentify (или dev-сборку)
4. Если уже спарен — открыть `chrome://extensions` и временно выключить расширение, чтобы воспроизвести onboarding

## Список скриншотов (10 ключевых)

| #   | Имя файла                               | Стейт                     | Как воспроизвести                                                                                                       |
| --- | --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `01-onboarding-splash.png`              | `setup` SetupSplash       | Открыть плагин в новом Figma-аккаунте (или очистить clientStorage). Захватить кадр до того, как async-чтения завершатся |
| 2   | `02-onboarding-idle.png`                | `setup` SetupFlow idle    | После SetupSplash → идёт SetupFlow с primary «Подключить расширение»                                                    |
| 3   | `03-onboarding-waiting.png`             | `setup` SetupFlow waiting | После клика «Подключить» → spinner + «Ждём подтверждение от расширения…»                                                |
| 4   | `04-onboarding-timed-out.png`           | `setup` SetupFlow timeout | Ждать 15 сек без расширения. Должны появиться install instructions + warning                                            |
| 5   | `05-paired-flash.png`                   | `checking` + PairedBanner | Сразу после успешного pair-ack (3 сек window — снимать быстро)                                                          |
| 6   | `06-ready-with-tip.png`                 | `ready` + OnboardingTip   | После онбординга, до первого импорта — должен быть `OnboardingTip` баннер сверху                                        |
| 7   | `07-incoming-uploading-screenshots.png` | `incoming` (NEW)          | Кликнуть extension icon на `yandex.ru/search?text=диван`. Снимать пока strip показывает «Грузим скриншоты K/M…»         |
| 8   | `08-confirming-dialog.png`              | `confirming`              | После того как payload пришёл — `ImportConfirmDialog` 320×280 с тремя radio                                             |
| 9   | `09-processing-narrative.png`           | `processing`              | После клика «Импорт» — strip с «Размещаем 23/76…» + 3-px progress bar снизу                                             |
| 10  | `10-success-confetti.png`               | `success` + Confetti      | По окончании первого импорта в сессии — confetti + ✓ + «N элементов · X.X сек»                                          |

## Дополнительные (опционально, для полноты)

| #   | Имя файла                  | Стейт               | Зачем                                                         |
| --- | -------------------------- | ------------------- | ------------------------------------------------------------- |
| 11  | `11-cloud-unreachable.png` | `ready` + banner    | Выключить интернет → поймать `CloudUnreachableBanner`         |
| 12  | `12-error-state.png`       | `error`             | Спровоцировать sandbox-ошибку или `phase: 'error'` heads-up   |
| 13  | `13-menu-open.png`         | `ready` + menu open | Кликнуть ⋮ — выпадающее меню со всеми пунктами                |
| 14  | `14-logs-panel.png`        | extended LogViewer  | ⋮ → Логи                                                      |
| 15  | `15-inspector-panel.png`   | extended Inspector  | Выделить компонент в Figma → ⋮ → Инспектор                    |
| 16  | `16-feed-confirming.png`   | confirming feed     | Импорт с `ya.ru` (rhythm feed) — другой набор полей в summary |

## Технические требования

- **Формат:** PNG, 2x retina (около 640×112 для compact, 640×560 для standard, 840×1040 для extended)
- **Тема:** скриншотить и в **light**, и в **dark** теме Figma — обе важны для аудита (если позволяет время — приложить обе версии в `dark/` подпапке)
- **Платформа:** desktop. Touch (iPad / mobile Figma) — отдельно в `touch/` если есть устройство
- **Анонимизация:** замазать любые user-specific данные (email в whatsNew, реальные queries если содержат personal info)

## Альтернатива: видео walkthrough

Вместо 10–16 PNG можно записать одно видео (~2 мин) которое проходит онбординг + один core-loop импорт. Имя: `walkthrough.mp4`. Claude Design сможет работать как со скриншотами, так и с видео.

## После сборки

Положить файлы в `docs/screenshots/` (этот каталог), убедиться что они попали в git (PNG не в `.gitignore`), и упомянуть в `CLAUDE_DESIGN_PROMPT.md` что screenshots приложены.
