# Relay Self-Healing — Spec

**Status:** in-progress
**Started:** 2026-04-17
**Owner:** valeriy.shch

## Problem

Relay умер после auto-update от 2.5.1 → 2.6.0 и не рестартит. Юзер видит `Relay offline` в плагине и не знает что делать.

Наблюдения из `/tmp/contentify-relay.log` + `launchctl print`:

```
[update] New version available: 2.6.0 (current: 2.5.1)
[update] Binary replaced. Restarting...
[update] launchctl kickstart failed, trying stop/start...
```

`launchctl list` → `-  0  com.contentify.relay` (не работает, last exit 0).
`KeepAlive: SuccessfulExit=false` → на чистый exit не реагирует.

### Root causes

1. **Queue path bug (пакет v2.6.0 сломан сам по себе):**
   `packages/relay/src/queue.ts:6` → `path.join(__dirname, '..', '.relay-queue.json')`. В pkg-бинаре `__dirname = /snapshot/relay/dist` (read-only virtual fs) → save всегда падает.

2. **Self-kill через `launchctl stop`:**
   `update.ts:201` делает `launchctl stop com.contentify.relay` который шлёт **SIGTERM себе**. Handler в `index.ts:92` вызывает `saveQueueImmediate()` + `process.exit(0)`. Следующая строка `launchctl start` не успевает выполниться.

3. **KeepAlive не спасает после clean exit:**
   `SuccessfulExit=false` → restart только при крэше (exit != 0). После `exit(0)` launchd не трогает.

4. **Нет защиты от update-loop:**
   Если update fails silently, проверка запустится снова через 6ч и повторит.

5. **Плагин не умеет помочь юзеру при offline:**
   Индикатор есть, но юзер не знает что делать.

## Out of scope

- Chrome Extension watchdog с Native Messaging — отдельная спека (Phase 2).
- Apple Developer ID signing / notarization.
- `build-hash.ts` \_\_dirname — debug route, fix-as-follow-up.

## Goals

1. Сломанный v2.6.0 релиз починить на уровне исходников → можно выпускать v2.5.2.
2. Auto-update не убивает себя → переходит на новую версию чисто.
3. LaunchAgent безусловно рестартит relay (с throttling).
4. Плагин при `relay offline` показывает actionable UI с командой для копирования.
5. Защита от update-loop.

## Implementation

### A. `packages/relay/src/queue.ts` — fix DATA_FILE path

```ts
// БЫЛО
const DATA_FILE = path.join(__dirname, '..', '.relay-queue.json');

// БУДЕТ
const INSTALL_DIR = path.join(process.env.HOME || '/tmp', '.contentify');
const DATA_FILE = path.join(INSTALL_DIR, 'relay-queue.json');
```

Точка (`.relay-queue.json` → `relay-queue.json`) — убираем скрытый префикс, т.к. папка `.contentify` уже скрыта.
`fs.mkdirSync(INSTALL_DIR, { recursive: true })` при старте (idempotent).

### B. `packages/relay/src/routes/update.ts` — fix self-kill + loop protection

#### B.1 Убрать `launchctl stop` стратегию, использовать detached spawn

```ts
setTimeout(() => {
  const { spawn } = require('child_process');
  const os = require('os');
  const uid = os.userInfo().uid;

  // Detached kickstart — выживет после exit(0)
  try {
    spawn('launchctl', ['kickstart', '-k', `gui/${uid}/com.contentify.relay`], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch (err) {
    console.log('[update] kickstart spawn failed:', err);
  }

  // Clean exit — KeepAlive: true в plist обеспечит рестарт даже если kickstart не сработал
  setTimeout(() => process.exit(0), 500);
}, 2000);
```

Ключевые изменения:

- `spawn` с `detached: true` + `.unref()` → процесс выживает после exit parent
- `os.userInfo().uid` — JS-expansion uid (не зависит от shell)
- Убрали `launchctl stop` — он шлёт SIGTERM сразу
- Exit только после spawn, с доп. 500ms гарантии

#### B.2 Update cooldown — предотвращает loop

```ts
const UPDATE_COOLDOWN_MS = 5 * 60 * 1000; // 5 минут после успешного update
let lastUpdateAt: number = 0;

async function runUpdateCheck(): Promise<void> {
  if (Date.now() - lastUpdateAt < UPDATE_COOLDOWN_MS) {
    console.log('[update] Skipping check (cooldown)');
    return;
  }
  const update = await checkForUpdate();
  if (update) {
    lastUpdateAt = Date.now();
    await downloadAndReplace(update);
  }
}
```

### C. `packages/relay/src/setup.ts` — KeepAlive: true + ThrottleInterval

```xml
<!-- БЫЛО -->
<key>KeepAlive</key>
<dict>
    <key>SuccessfulExit</key>
    <false/>
</dict>

<!-- БУДЕТ -->
<key>KeepAlive</key>
<true/>
<key>ThrottleInterval</key>
<integer>10</integer>
<key>ExitTimeOut</key>
<integer>5</integer>
```

- `KeepAlive: true` → всегда рестартит, независимо от exit code
- `ThrottleInterval: 10` → минимум 10 сек между запусками (защита от infinite loop если бинарь падает сразу)
- `ExitTimeOut: 5` → 5 сек grace period на SIGTERM → SIGKILL

Для существующих установок: при следующем update setup перезапишет plist (через `unload` + `load`). Вариант «один раз вручную» описан в разделе Migration.

### D. `packages/plugin/src/ui/components/RelayOfflineBanner.tsx` — новый компонент

Показывается когда `!relayConnected` и `appState ∈ {ready, checking}` (не во время setup, processing, confirming).

```tsx
interface RelayOfflineBannerProps {
  visible: boolean;
  onDismiss: () => void;
  onRetry: () => void;
}
```

Содержимое:

- Заголовок: «Relay offline»
- Текст: «Сервер Contentify Relay не отвечает на `localhost:3847`. Скопируй и выполни в Terminal:»
- Моноширинный блок с командой + кнопка Copy:
  ```
  launchctl kickstart -k gui/$(id -u)/com.contentify.relay
  ```
- Ссылка «Скачать заново» → `EXTENSION_URLS.RELAY_INSTALL_SCRIPT`
- Кнопка «Попробовать снова» → `onRetry()` вызывает `checkNow()` из `useRelayConnection`
- Auto-hide когда connection восстановилось (через `visible` prop в parent)

Состояния: idle / copied (2 сек) / retrying.

Принципы (из `.claude/rules/ui-state.md`):

- `role="dialog"` + `aria-modal="false"` (это баннер, не модалка)
- Кнопки с `aria-label`
- Z-index выше compact strip, ниже confirm dialog

### E. `packages/plugin/src/ui/ui.tsx` — wire банер

Добавить рендер `<RelayOfflineBanner>` рядом с compact strip:

- `visible = !relayConnected && appState === 'ready' && !panels.isPanelOpen`
- `onDismiss` — локальный state (dismissed for this session)
- `onRetry` — `relayConnection.checkNow()`

### F. Tests

| Change               | Test file                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `queue.ts` path      | `packages/relay/tests/queue-path.test.ts` (new)                                                                     |
| `update.ts` cooldown | `packages/relay/tests/update-cooldown.test.ts` (new)                                                                |
| `RelayOfflineBanner` | `packages/plugin/tests/ui/RelayOfflineBanner.test.tsx` (new, если есть UI testing infra) — иначе smoke-тест импорта |

Relay сейчас не имеет vitest setup — либо добавить (лишняя работа для одного файла), либо покрыть через TypeScript + ручную проверку. **Выбираю: ручная проверка** для этой спеки.

### G. Version bump

`2.6.0` (сломанный) → `2.6.1` — новый clean release.

Файлы:

- `package.json` → 2.6.1
- `packages/plugin/src/config.ts` → PLUGIN_VERSION = '2.6.1'
- `packages/extension/manifest.json` → 2.6.1
- `packages/extension/updates.xml` → 2.6.1
- `packages/relay/package.json` → 2.6.1

**Build-time version:** `packages/relay/scripts/generate-version.js` уже читает `package.json`, так что `src/version.ts` обновится автоматически.

### Migration: существующая установка

Один раз руками:

```bash
# 1. Остановить старый процесс (если вдруг живой)
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.contentify.relay.plist 2>/dev/null

# 2. Скачать новый установщик с GitHub Releases v2.6.1 и запустить
~/Downloads/contentify-relay-host-arm64

# 3. Проверить
curl localhost:3847/health
```

После v2.6.1 все следующие auto-updates пойдут чисто.

## Verification

Локально:

1. `npm run verify` в plugin (typecheck + lint + test + build)
2. `npm run build -w packages/relay` (tsc)
3. Проверка plist XML валидности (`plutil -lint`)

Runtime:

1. Остановить relay: `launchctl bootout gui/$(id -u) com.contentify.relay`
2. Перезагрузить плагин → должен показаться `RelayOfflineBanner`
3. Копи-паста команды в Terminal → relay поднимается → баннер исчезает сам
4. Trigger auto-update (если есть dev-версия) → проверить что relay пережил

## Completion criteria

- [x] Спека написана
- [x] `queue.ts` — DATA_FILE в `~/.contentify/` (+ ensure dir on load)
- [x] `update.ts` — detached spawn + cooldown
- [x] `setup.ts` — KeepAlive: true plist (validated via `plutil -lint`)
- [x] `RelayOfflineBanner.tsx` — новый компонент + CSS (+ global hover `:not()` list)
- [x] `ui.tsx` — wire banner с dismissal reset on reconnect
- [x] Version bump в 5 файлах (2.6.0 → 2.6.1, relay 2.5.1 → 2.6.1)
- [x] `npm run verify` зелёный — 465 tests passed
- [x] `npm run build -w packages/relay` зелёный
- [ ] Relay v2.6.1 бинарь собран через `pkg` и залит в GitHub Release
- [ ] Migration проверен руками (kickstart existing broken install)

## Phase 2 (отдельная спека)

- Chrome extension мониторит relay health, показывает badge
- Native Messaging Host для auto-restart без вмешательства юзера
- Apple Developer ID + notarization
