# Figma MCP — Setup & Usage Guide

> **For Cursor AI — READ THIS FIRST**
>
> A team member pasted this file to set up Figma MCP integration for the **Contentify** project. **You are their guide.**
>
> **Language**: Always speak Russian (русский язык). All messages, questions, explanations — in Russian.
>
> **Your job**: Do all technical work yourself. The user is a designer, not a developer. Never ask them to edit files, run terminal commands, or understand JSON. Do it for them.
>
> **Setup flow** — execute steps in order, doing everything you can automatically:
>
> 1. **Check Node.js**: Run `node --version`. If missing or < 18, tell user: *«Нужно установить Node.js. Открой https://nodejs.org и скачай LTS-версию (кнопка слева). Установи и скажи мне когда готово.»*
> 2. **Get Figma token**: Ask user: *«Мне нужен твой Figma-токен. Вот как его получить: открой https://www.figma.com/developers/api#access-tokens → нажми "Generate new token" → назови "Cursor MCP" → скопируй токен (начинается с figd_) и пришли мне. Токен останется только на твоём компьютере, я никуда его не отправлю.»*
> 3. **Edit mcp.json**: Once you have the token, open `.cursor/mcp.json` (create if missing — use `{"mcpServers": {}}` as base). Add the `figma-console` server config with the user's token. Do this silently — don't explain JSON to the user. Just say *«Готово, настроил конфигурацию.»*
> 4. **Restart Cursor**: Tell user: *«Теперь нужно полностью перезапустить Cursor: Cmd+Q (или Alt+F4), потом открой снова. Подожди ~30 секунд и скажи мне.»*
> 5. **Verify MCP**: After restart, tell user: *«Проверь: зайди в Cursor Settings → MCP. Рядом с "figma-console" должна быть зелёная точка и 57 инструментов. Есть?»* If red dot — check output, troubleshoot.
> 6. **Copy Desktop Bridge plugin**: Run the terminal command to copy the plugin to Desktop. Tell user: *«Я скопировал плагин на твой Рабочий стол. Теперь в Figma Desktop (не в браузере!): зайди в Plugins → Development → "Import plugin from manifest…" → найди на Рабочем столе папку figma-desktop-bridge → выбери manifest.json.»*
> 7. **Test connection**: Tell user: *«Открой любой файл в Figma Desktop, запусти плагин: Plugins → Development → Figma Desktop Bridge. Должен появиться зелёный индикатор "MCP". Скажи когда будет готово.»*
> 8. **Run tests**: Once connected, run the 4 test prompts below automatically. Report results to user in Russian.
>
> **If something fails** — troubleshoot using the Troubleshooting table below. Explain errors in simple Russian. Never blame the user.
>
> **After setup is complete**, say: *«Всё готово! Теперь ты можешь описывать что нужно сделать в Figma — я сделаю. Например: "Покажи структуру компонента EShopItem" или "Создай страницу выдачи с 5 сниппетами".»*

## Что это даёт

Два MCP-сервера для работы с Figma из Cursor:

| MCP Server | Инструментов | Тип | Описание |
|------------|-------------|-----|----------|
| **Figma** (официальный) | 10 | Read-only | `get_design_context`, `get_screenshot`, `get_metadata`, `get_variable_defs` — чтение дизайна, скриншоты, переменные |
| **figma-console** | 57 | Read + Write | Создание/редактирование нод, инстанцирование компонентов, управление переменными, выполнение произвольного Figma Plugin API кода |

Официальный MCP уже настроен в проекте. Этот гайд про настройку **figma-console** (запись в Figma).

## Prerequisites

- Cursor IDE
- Node.js 18+ (AI проверит и поможет установить)
- Figma Desktop app (браузерная версия не работает с figma-console)

---

## Step 1: Get Figma Token (~1 min)

1. Open [Figma Settings → Personal Access Tokens](https://www.figma.com/developers/api#access-tokens)
2. Click **Generate new token**
3. Description: `Cursor MCP`
4. Scopes: leave default (all read/write)
5. Copy the token (starts with `figd_`) — you won't see it again

## Step 2: Add to Cursor MCP Config (~1 min)

> AI does this step automatically — just provide your token.

The AI will add this to `.cursor/mcp.json`:

```json
"figma-console": {
  "command": "npx",
  "args": ["-y", "figma-console-mcp@latest"],
  "env": {
    "FIGMA_ACCESS_TOKEN": "figd_YOUR_TOKEN_HERE",
    "ENABLE_MCP_APPS": "true"
  }
}
```

> This file is gitignored — your token stays local.

## Step 3: Restart Cursor

Quit Cursor completely (Cmd+Q) and reopen. Wait ~30s for the MCP server to download and start.

Verify: **Cursor Settings → MCP** — `figma-console` should show a green dot with 57 tools.

## Step 4: Import Desktop Bridge Plugin (~2 min)

> AI runs the terminal command automatically and tells you what to do in Figma.

The Desktop Bridge plugin connects Figma to the MCP server. **One-time setup.**

Terminal command (AI runs this):
```bash
cp -r $(find ~/.npm/_npx -name "figma-desktop-bridge" -path "*/figma-console-mcp/*" 2>/dev/null | head -1) ~/Desktop/figma-desktop-bridge
```

Then in **Figma Desktop**:
1. Go to Plugins → Development → **Import plugin from manifest...**
2. Navigate to **Desktop → figma-desktop-bridge → manifest.json** and select it
3. The plugin appears in your Development plugins list permanently

## Step 5: Connect & Test (~1 min)

1. Open any Figma file in Figma Desktop
2. Run the plugin: **Plugins → Development → Figma Desktop Bridge**
3. You should see a small green "MCP" indicator in the plugin UI
4. AI will run these tests automatically:

**Test 1 — Connection:**
```
Check Figma status
```
Expected: "Connected to Figma Desktop via WebSocket Bridge"

**Test 2 — Read:**
```
What's selected in Figma?
```
Expected: returns selected nodes (or "nothing selected")

**Test 3 — Write:**
```
Create a blue rectangle 200x100
```
Expected: a blue rectangle appears in your Figma file

**Test 4 — Library component:**
```
Импортируй EShopItem из библиотеки DC Ecom (ключ: a209c6636b3fa7c279731ef02c78065632b535c6)
```
Expected: AI imports the component variant and places an instance on the canvas

---

## Наши библиотеки

| Library | File Key | URL |
|---------|----------|-----|
| DC Cubes | `WtrKhqs65LdhvIjOqnwVmV` | [Open](https://www.figma.com/design/WtrKhqs65LdhvIjOqnwVmV) |
| DC Ecom | `x8INBftMZ21bme9kwZDu1A` | [Open](https://www.figma.com/design/x8INBftMZ21bme9kwZDu1A) |

**DC Ecom** — основная библиотека Contentify. Содержит компоненты сниппетов (EShopItem, EOfferItem, EProductSnippet2, ESnippet) и элементы страницы (Header, Footer, Pager, Title).

**DC Cubes** — базовая UI-библиотека (примитивы, кнопки, инпуты, иконки).

---

## Ключи компонентов Contentify

Проект уже содержит все нужные ключи в `src/page-builder/component-map.ts`. Ниже — выжимка для AI-агента.

### Компоненты сниппетов (DC Ecom)

| Component | Variant Key (Desktop) | Variant Key (Touch) |
|-----------|----------------------|---------------------|
| ESnippet | `9cc1db3b34bdd3cedf0a3a29c86884bc618f4fdf` | `fd4c85bc57a4b46b9587247035a5fd01b5df4a91` |
| EOfferItem | `ad30904f3637a4c14779a366e56b8d6173bbd78b` | `09f5630474c44e6514735edd7202c35adcf27613` |
| EShopItem | `a209c6636b3fa7c279731ef02c78065632b535c6` | `b1c1848c5454036cc48fdfaea06fcc14cd400980` |
| EProductSnippet2 | `f921fc66ed6f56cccf558f7bcacbebcaa97495b7` | — |

### Элементы страницы (DC Ecom)

| Component | Variant Key |
|-----------|-------------|
| Header | `6cea05769f0320a02cce6ce168573daa75395308` |
| Related | `e8b88751731dfbe91a6951472ae0233f07c5c32a` |
| Pager | `074d6f70fff0d97ec766385cf475ae43b70e9356` |
| Title (Size=M) | `b49cc069e0de9428bfa913fd9a504011fafca336` |
| EThumb (Manual) | `931437402c9c36ddf674a5680541f1d6eaf9363c` |

### Переменные цветов (DC Ecom)

Полный список ключей переменных — в `src/page-builder/component-map.ts` (секция `VARIABLE_KEYS`). Наиболее используемые:

| Variable | Key |
|----------|-----|
| Background/Primary | `a4085d6ec026ec8a6ed9e9c92ecd4c9ad719734d` |
| Background/Overflow | `95d13b2ca4b81f42999696c424718703d42de134` |
| Text and Icon/Primary | `4ca8951655d30c2c1132997c7728945d96fb29a0` |
| Accent/Yellow | `347b9c5686cea6dab8bb410ed0c038826c53f82a` |
| Accent/Blue | `a8fd5158c722d04e4682227e01763cc45d065eda` |
| Applied/Link | `6e8c75148d8882c824ff0c6d09e88a5d1604f2dd` |

---

## Использование с Contentify

### Типичные задачи

**Инспекция компонента:**
```
Покажи структуру компонента EShopItem в библиотеке DC Ecom: https://www.figma.com/design/x8INBftMZ21bme9kwZDu1A
```

**Получение ключей новых компонентов:**
```bash
# Все варианты компонента ESnippet
curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/x8INBftMZ21bme9kwZDu1A/components" \
  | jq '.meta.components[] | select(.containing_frame.containingStateGroup.name | contains("ESnippet")) | {name, key}'
```

**Скриншот конкретного артборда (официальный MCP):**
```
Сделай скриншот ноды 22266:253481 в файле x8INBftMZ21bme9kwZDu1A
```

**Чтение переменных дизайн-системы (официальный MCP):**
```
Покажи переменные из файла DC Ecom: https://www.figma.com/design/x8INBftMZ21bme9kwZDu1A
```

**Создание страницы выдачи (figma-console):**
```
Создай фрейм 1920x1080, внутри — vertical auto-layout.
Импортируй Header (ключ: 6cea05769f0320a02cce6ce168573daa75395308),
3 EShopItem (ключ: a209c6636b3fa7c279731ef02c78065632b535c6),
и Pager (ключ: 074d6f70fff0d97ec766385cf475ae43b70e9356).
```

### Как получить ключи для новых компонентов

Ключи компонентов стабильны (переживают переименования и перемещения). Два способа:

**Способ 1 — REST API (рекомендуемый):**
```bash
# Все component sets в библиотеке DC Ecom
curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/x8INBftMZ21bme9kwZDu1A/component_sets" \
  | jq '.meta.component_sets[] | {name, key}'

# Все варианты конкретного component set
curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "https://api.figma.com/v1/files/x8INBftMZ21bme9kwZDu1A/components" \
  | jq '.meta.components[] | select(.containing_frame.containingStateGroup.name | contains("COMPONENT_NAME")) | {name, key}'
```

**Способ 2 — Figma Dev Console:**
```javascript
const sel = figma.currentPage.selection[0];
if (sel && sel.type === 'INSTANCE') {
  const main = sel.mainComponent;
  console.log('Component key:', main.key);
  console.log('Name:', main.name);
  if (main.parent && main.parent.type === 'COMPONENT_SET') {
    console.log('ComponentSet key:', main.parent.key);
  }
}
```

### How Component Keys Work

| Type | Example | Works with `importComponentByKeyAsync`? |
|------|---------|----------------------------------------|
| **Component SET key** | `COMPONENT_NODE_IDS` in component-map.ts | No — identifies the set, not a specific variant |
| **Variant key** | `SNIPPET_COMPONENT_MAP[type].key` | Yes — use these for instantiation |

The project stores variant keys in `SNIPPET_COMPONENT_MAP` and `LAYOUT_COMPONENT_MAP`. SET keys are in `COMPONENT_NODE_IDS` for reference only.

**Best practice: use `figma_execute` for multi-component layouts.** Building a full SERP page with 8+ library components takes a single `figma_execute` call (~2 seconds), versus 8 separate `figma_instantiate_component` calls.

---

## Available Tools

### Official Figma MCP (already configured)

| Tool | What it does |
|------|-------------|
| `get_design_context` | Code + screenshot + metadata for any node (primary tool) |
| `get_screenshot` | Export node as PNG |
| `get_metadata` | XML structure of a node/page (IDs, names, positions) |
| `get_variable_defs` | Design token definitions |
| `get_figjam` | Read FigJam boards |
| `generate_diagram` | Create diagrams in FigJam |
| `get_code_connect_map` | Code Connect mappings |

### figma-console (after setup)

**Most useful:**

| Tool | What it does |
|------|-------------|
| `figma_execute` | Run ANY Figma Plugin API code — the power tool |
| `figma_get_selection` | See what the user has selected |
| `figma_capture_screenshot` | Export node as PNG from live state |
| `figma_search_components` | Find components by name in the open file |
| `figma_instantiate_component` | Create a component instance (needs **variant** key) |
| `figma_set_text` | Set text node content |
| `figma_get_file_data` | Read any file's structure by URL (REST API) |
| `figma_get_variables` | Design tokens with CSS export |
| `figma_get_styles` | Color, text, effect styles |

**Node manipulation:**

| Tool | What it does |
|------|-------------|
| `figma_resize_node` | Resize a node |
| `figma_move_node` | Move a node |
| `figma_set_fills` | Change fill colors |
| `figma_clone_node` | Clone a node |
| `figma_delete_node` | Delete a node |
| `figma_rename_node` | Rename a node |
| `figma_create_child` | Create child node inside parent |

**Variable management:**

| Tool | What it does |
|------|-------------|
| `figma_create_variable` | Create a design token |
| `figma_batch_create_variables` | Create up to 100 tokens at once |
| `figma_setup_design_tokens` | Create collection + modes + variables atomically |

Full reference: [docs.figma-console-mcp.southleft.com/tools](https://docs.figma-console-mcp.southleft.com/tools)

---

## API Gotchas

- `figma.loadFontAsync()` must be called before any text operations — even for component instances
- `DROP_SHADOW` effects require `blendMode: 'NORMAL'` in the effect object
- `layoutSizingHorizontal = 'FILL'` only works on children of auto-layout frames
- Component SET keys silently fail — the error says "not found" but doesn't explain why
- `figma_search_components` only sees the currently open file. For library components, use variant keys from REST API or from `component-map.ts`

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Failed to connect to Figma Desktop" | Run Desktop Bridge plugin in your Figma file first |
| "FIGMA_ACCESS_TOKEN not configured" | Check token in `.cursor/mcp.json` — must start with `figd_` |
| Tools not appearing in Cursor | Restart Cursor completely (Cmd+Q → reopen) |
| Plugin shows "Disconnected" | Re-run the plugin: Plugins → Development → Figma Desktop Bridge |
| `figma-console` shows red dot | Click "Show Output" for error details. Common: Node.js too old |
| Port conflict | Plugin auto-scans ports 9223-9232 |
| "Component not found" on instantiate | You used a component **SET** key. Use a **variant** key from `SNIPPET_COMPONENT_MAP` or REST API |
| `figma_search_components` returns empty | It only sees the open file. Use variant keys for library components |
| "Cannot write to node with unloaded font" | Call `await figma.loadFontAsync(...)` before text operations |
| `FILL` sizing error | `layoutSizingHorizontal = 'FILL'` only works inside auto-layout frames |

---

## Architecture

```
                    ┌─── Official Figma MCP (read-only, REST API)
                    │    └── get_design_context, get_screenshot, etc.
                    │
Cursor ◄────────────┤
                    │
                    └─── figma-console-mcp (read+write, stdio)
                         ├── WebSocket server (localhost:9223-9232)
                         │      ↕
                         │   Desktop Bridge plugin (Figma iframe)
                         │      ↕ postMessage
                         │   Plugin sandbox ←figma.*→ Figma document
                         │      └── importComponentByKeyAsync(key)
                         │           → imports DC Ecom / DC Cubes components
                         │
                         └── Figma REST API (reads any file by URL/key)
                              └── GET /v1/files/:key/components
```

- Official Figma MCP: always available, no Desktop required
- figma-console: requires Desktop Bridge plugin running in Figma Desktop
- Both can be used simultaneously — official for reading, figma-console for writing
- Component keys from `component-map.ts` work with both REST API and `importComponentByKeyAsync`

> **Contentify users:** The Contentify plugin **already embeds** the MCP bridge (`bridge-ui.js`).
> You do NOT need to run the standalone Desktop Bridge plugin.
> Running both causes WebSocket connection flapping — see [PORT_MAP.md](PORT_MAP.md) for details.

---

## Links

- [figma-console-mcp GitHub](https://github.com/southleft/figma-console-mcp) (MIT)
- [Full Docs](https://docs.figma-console-mcp.southleft.com/)
- [Tools Reference](https://docs.figma-console-mcp.southleft.com/tools)
- Project component keys: `src/page-builder/component-map.ts`
- Project config: `src/config.ts`
