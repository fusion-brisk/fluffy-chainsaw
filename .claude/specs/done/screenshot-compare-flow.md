# Screenshot Compare Flow — full feed screenshot side-by-side with imported frame

> Goal: после импорта фида ya.ru плагин кладёт **рядом с отрисованным фреймом** полноразмерный скриншот реального фида (склейка всех scrolled-сегментов), чтобы дизайнер визуально сверял компоненты с production.
> Дополнительно (только debug-режим): тащим эталонный узел из Figma (`Ew8YjZHHTluWur2tyMFpEh / 1651:17100`) и кладём третьей колонкой.

## Context

- Сейчас extension уже умеет captureFullPage: длинный фид → N JPEG-сегментов 80% (`packages/extension/src/background.ts:363`).
- Но скриншоты **не доезжают до плагина** — на пути cloud relay (Yandex Cloud Function за API Gateway) тело > 3.5 МБ режется. В `background.ts:670-675` стоит явный комментарий «Phase 2, never wired up», скриншоты намеренно дропаются на push.
- `host_permissions` уже включают `<all_urls>` (фикс от 28 апр) — capture больше не падает по permission.
- Cloud relay структура: маршруты в `packages/cloud-relay/src/routes/{ack,clear,health,peek,push,reject,status}.ts`, dispatch — `handler.ts`. Сессии лежат в YDB (`src/ydb.ts`, `src/session.ts`). Object Storage (S3 API) пока не используется.
- Plugin умеет `figma.createImageAsync(url)` для HTTPS-картинок (CORS-friendly), масштабировать через `figma.createRectangle()` + `fills`.

## User decisions (28 апр)

1. Capture: **весь фид** (нужны цены/детали в зум-копии).
2. Layout: **рядом с фреймом** (одна колонка справа).
3. Reference из Figma: **только в debug-режиме**, в production-сборке отключаем.

## Architecture — Variant B (chosen)

```
[Extension]                          [Cloud Relay + Object Storage]            [Figma Plugin]
  capture N segments                          POST /upload-screenshot
       │                                          │  body: multipart, ≤5MB
       ├─ for each segment ─►   PUT to Object Storage (signed URL or direct)
       │                                          ├─ returns {key, url}
       │                                          ▼
       └─ collect keys[] ───►   POST /push
                                  body: { ..., screenshotKeys: string[],
                                          screenshotMeta: { totalHeight,
                                          viewportHeight, viewportWidth, dpr } }
                                          │
                                          ▼
                                   YDB session row stores keys+meta
                                          │
                                                                 GET /peek ───►
                                                                  parses keys
                                                                  ▼
                                          for each url: figma.createImageAsync(url)
                                          place rectangle column right of frame
                                          (target: same total height as the imported frame)
```

## Object Storage choice

- **Yandex Object Storage** (S3-совместимый). Создать bucket `contentify-screenshots` с public-read доступом по ключу.
- Каждая загрузка получает ключ `<sessionId>/<timestamp>-<segIdx>.jpg`. TTL 24h через bucket lifecycle policy → не платим за долгое хранение.
- Альтернатива: temporary signed URLs (presigned PUT). Но это лишний RTT — extension сначала просит /upload-presign, потом PUT. Простой POST через relay, который сам кладёт в Object Storage, **дешевле по latency**.

## Changes

### 1. Cloud Relay (Yandex Cloud Function)

- Новый маршрут `POST /upload-screenshot` (`packages/cloud-relay/src/routes/upload-screenshot.ts`):
  - body: `multipart/form-data` (field `segment` — JPEG bytes; query `?segIdx=N`)
  - валидируем: `Content-Length` ≤ 5 МБ (per Yandex Cloud Function inbound), `Content-Type: image/jpeg`
  - кладём в Object Storage через AWS SDK v3 (`@aws-sdk/client-s3`) с YC endpoint `https://storage.yandexcloud.net`
  - возвращает `{ key: "<sessionId>/<ts>-<segIdx>.jpg", url: "https://storage.yandexcloud.net/contentify-screenshots/<key>" }`
- Регистрация в `handler.ts`: `'POST /upload-screenshot': uploadScreenshot`
- Расширить `Session` (в `src/types.ts`): добавить `screenshotKeys?: string[]`, `screenshotMeta?: ScreenshotMeta`.
- `routes/push.ts`: принять `meta.screenshotKeys` + `meta.screenshotMeta` в payload и сохранить в session row.
- `routes/peek.ts`: вернуть в ответе.
- ENV: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET=contentify-screenshots`. Service Account под Cloud Function должен иметь `storage.editor` на bucket.

### 2. Extension

- `packages/extension/src/background.ts`:
  - В `captureFullPage` уже формируется `screenshots: string[]` (data URLs). После сборки — **последовательный upload**:
    ```ts
    const screenshotKeys: string[] = [];
    for (let i = 0; i < screenshots.length; i++) {
      const blob = dataUrlToBlob(screenshots[i]); // helper
      const fd = new FormData();
      fd.append('segment', blob, `seg-${i}.jpg`);
      const res = await fetch(`${RELAY_BASE}/upload-screenshot?sessionId=${sid}&segIdx=${i}`, {
        method: 'POST',
        body: fd,
      });
      const { key } = await res.json();
      screenshotKeys.push(key);
      sendHeadsUp('uploading_screenshots', { current: i + 1, total: screenshots.length });
    }
    ```
  - В `meta` добавить `screenshotKeys` + `screenshotMeta` (уже считается).
  - Убрать комментарий «never wired up» в push payload секции.

### 3. Figma plugin

- `packages/plugin/src/sandbox/page-builder/apply-relay-payload.ts` (или там, где plugin рисует фрейм результата):
  - После того как `result.frame` создан, прочитать из payload `meta.screenshotKeys` + `meta.screenshotMeta`.
  - Если есть keys: построить URL `https://storage.yandexcloud.net/contentify-screenshots/<key>` (или возвращать full URL из relay).
  - Создать новую колонку справа от `result.frame`:
    - `compareFrame = figma.createFrame()` с `layoutMode='VERTICAL'`, gap=0
    - `compareFrame.x = result.frame.x + result.frame.width + 32`, `y = result.frame.y`
    - target height = `result.frame.height`. Scale = `result.frame.height / screenshotMeta.totalHeight`
    - per segment: `figma.createImageAsync(url)` → `rect = figma.createRectangle()` с `fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: img.hash }]`, размеры из меты × scale.
  - Имя фрейма: `Скриншот-эталон` или `Production-фид`.
- Тип `RelayPayloadMeta` (в `src/types/`) — добавить поля.

### 4. Debug reference из Figma (опционально, флагом)

- В `apply-relay-payload.ts`:
  ```ts
  if (debugConfig.designReferenceNodeId) {
    const node = await figma.getNodeByIdAsync(debugConfig.designReferenceNodeId);
    // clone or reference — для debug просто X coordinate offset в третью колонку
  }
  ```
- Конфиг в `packages/plugin/src/config.ts`: `DEBUG_REFERENCE_NODE = '1651:17100'` (только для local dev).

## Open questions

- [ ] Кто провижит Object Storage bucket? Нужен YC service account с правами `storage.editor`. Терраформ или ручная команда `yc storage bucket create`?
- [ ] Multipart upload в Yandex Cloud Function — поддерживается ли через API Gateway? Если нет — base64 + JSON чанки до 5 МБ каждый (но это +33% по размеру).
- [ ] Какой `RELAY_BASE` использует extension сейчас (apigw.yandexcloud.net)? Подтвердить, что новый маршрут будет за тем же gateway.
- [ ] Plugin должен **ждать** загрузки скриншотов или рисовать их фоново после `result.done`? Скорее всего фоново, чтобы не блокировать «Готово!» UX.

## Order of work

1. **Provision Object Storage** (out-of-band, 1 команда `yc storage`).
2. **Relay route `/upload-screenshot`** + изменения в `push.ts` / `peek.ts` / `types.ts`. Локальные тесты в `packages/cloud-relay/tests/` (можно мокировать S3-клиент).
3. **Extension upload loop** + `screenshotKeys` в `meta`. Reload extension, проверить `chrome://extensions` console → segments uploaded.
4. **Plugin column rendering** — использовать `figma.createImageAsync` (см. https://www.figma.com/plugin-docs/api/figma-createImageAsync/) и `LayoutMode='VERTICAL'`.
5. **Debug reference** — отдельным PR/коммитом, скрыто за флагом.

## Verification

- `npm run verify` (typecheck + lint + test + build)
- Live-тест на ya.ru: импорт фида включает чекбокс «Захватывать скриншоты» → background console показывает `[Screenshot] Uploaded N/N segments` → Figma plugin рисует и фрейм фида, и справа скриншот, обе колонки одинаковой высоты, без сжатия по горизонтали.
- Регресс: старая flow (без чекбокса) работает как раньше, payload без `screenshotKeys` не падает.
- Cloud cost sanity: после 3-5 импортов посмотреть в YC console → Object Storage usage <50 МБ; lifecycle 24h должен очищать.

## Out of scope

- Side-by-side diff overlay (semantic image diff) — позже.
- Сравнение с эталонным Figma-узлом без debug-флага — позже.
- Загрузка скриншотов с touch/mobile — текущий capture только desktop.
