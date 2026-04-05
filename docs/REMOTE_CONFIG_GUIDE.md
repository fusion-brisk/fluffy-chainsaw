# Remote Config для правил парсинга

## 📋 Обзор

Плагин **Contentify** поддерживает автоматическое обновление правил парсинга через удалённый конфиг (Remote Config), что позволяет обновлять логику парсинга без перевыпуска плагина.

## 🏗️ Архитектура

### Приоритет загрузки правил:

1. **Remote** (последние с удалённого сервера)
2. **Cached** (сохранённые в `clientStorage`)
3. **Embedded** (вшитые `DEFAULT_PARSING_RULES` как fallback)

### Мягкий merge (Soft Merge)

Удалённые правила **дополняют**, а не заменяют базовые:

- Если поле есть в remote — используется remote версия
- Если поля нет в remote — используется embedded версия
- Новые поля из remote добавляются к существующим

## 🚀 Использование

### 1. Настройка URL для remote config

```typescript
// В clientStorage сохраняется:
contentify_remote_config_url =
  'https://raw.githubusercontent.com/username/repo/main/parsing-rules.json';
```

### 2. Автоматическая проверка обновлений

При каждом запуске плагина:

1. Загружаются правила из кэша (или embedded fallback)
2. В фоне проверяется наличие обновлений по URL
3. Сравнивается hash текущих и удалённых правил
4. Если обнаружены изменения — показывается диалог подтверждения

### 3. Диалог подтверждения обновления

```
🌐 Parsing Rules Update Available

A new version of parsing rules is available. Would you like to update?

Current: v1  →  New: v2

[Not Now]  [Update]
```

Пользователь может:

- **Update** — применить новые правила (сохраняются в кэш)
- **Not Now** — отклонить обновление (можно обновить позже вручную)

### 4. Ручная проверка обновлений

В UI доступна кнопка **🔄** в секции "Parsing Rules":

- Принудительно проверяет наличие обновлений
- Показывает диалог, если обновления найдены

### 5. Сброс к defaults

Кнопка **🗑️** (доступна, если source != 'embedded'):

- Очищает кэш
- Возвращает плагин к встроенным правилам

## 📄 Формат remote config

### Пример JSON-файла:

```json
{
  "version": 2,
  "rules": {
    "#OrganicTitle": {
      "domSelectors": [".OrganicTitle", "[class*='OrganicTitle']", ".NewClass-Title"],
      "jsonKeys": ["title", "name", "headline"],
      "type": "text"
    },
    "#ShopName": {
      "domSelectors": [".EShopName", "[class*='EShopName']"],
      "jsonKeys": ["shopName", "shop"],
      "type": "text"
    },
    "#NewField": {
      "domSelectors": [".NewSelector"],
      "jsonKeys": ["newKey"],
      "type": "text"
    }
  }
}
```

### Схема:

```typescript
interface ParsingSchema {
  version: number;
  rules: Record<string, FieldRule>;
}

interface FieldRule {
  domSelectors: string[];
  jsonKeys: string[];
  type?: 'text' | 'image' | 'price' | 'html' | 'attribute' | 'boolean';
  domAttribute?: string;
}
```

## 🔧 Технические детали

### Хранение в clientStorage

```typescript
contentify_parsing_rules_cache → JSON правил (ParsingSchema)
contentify_parsing_rules_metadata → { lastUpdated, hash, remoteUrl }
contentify_remote_config_url → URL для автообновления
contentify_pending_rules → Временное хранение правил до подтверждения
```

### Hash-проверка

Используется простой hash для быстрого сравнения версий:

```typescript
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return String(hash);
}
```

### Валидация

Remote config должен:

- Быть валидным JSON
- Содержать поле `version` (number)
- Содержать поле `rules` (Record<string, FieldRule>)

При ошибке парсинга или fetch — используются текущие правила (кэш/embedded).

## 📊 UI Индикаторы

### В ParsingRulesViewer отображается:

- **Source**: 🌐 Remote / 💾 Cached / 📦 Embedded
- **Updated**: дата последнего обновления
- **URL**: ссылка на remote config (если настроена)

### Лог-сообщения:

```
📦 Загружены кэшированные правила парсинга
🔍 Проверка обновлений правил с https://...
✨ Найдены обновлённые правила парсинга
✅ Удалённые правила успешно применены
🔄 Сброс правил к значениям по умолчанию
```

## 🔐 Безопасность

1. **Валидация схемы**: все удалённые правила проверяются перед применением
2. **Hash-проверка**: при применении правил сверяется hash для предотвращения подмены
3. **Мягкий merge**: если часть правил невалидна — используются embedded fallback
4. **Подтверждение пользователя**: обновления не применяются автоматически без согласия

## 🌐 Hosting на GitHub

### Рекомендуемая структура репозитория:

```
contentify-config/
├── parsing-rules.json     ← Основной конфиг
├── parsing-rules-v2.json  ← Версии для rollback
├── README.md
└── CHANGELOG.md
```

### Пример URL:

```
https://raw.githubusercontent.com/username/contentify-config/main/parsing-rules.json
```

### Преимущества GitHub:

- ✅ Версионирование (Git history)
- ✅ Публичный доступ через raw.githubusercontent.com
- ✅ Возможность rollback к предыдущим версиям
- ✅ Issues/PR для обсуждения изменений

## 🛠️ API для разработчиков

### ParsingRulesManager

```typescript
class ParsingRulesManager {
  loadRules(): Promise<ParsingRulesMetadata>;
  checkForUpdates(): Promise<{
    hasUpdate: boolean;
    newRules?: ParsingSchema;
    hash?: string;
  } | null>;
  applyRemoteRules(hash: string): Promise<boolean>;
  dismissUpdate(): Promise<void>;
  resetToDefaults(): Promise<ParsingRulesMetadata>;
  setRemoteUrl(url: string): Promise<void>;
  getRemoteUrl(): Promise<string | null>;
  getCurrentMetadata(): ParsingRulesMetadata | null;
  getCurrentRules(): ParsingSchema;
}
```

### Сообщения между UI ↔ Code

#### UI → Code:

- `get-parsing-rules` — запрос текущих правил
- `check-remote-rules-update` — ручная проверка обновлений
- `apply-remote-rules` — применить удалённые правила
- `dismiss-rules-update` — отклонить обновление
- `reset-rules-cache` — сброс к defaults

#### Code → UI:

- `parsing-rules-loaded` — правила загружены (с метаданными)
- `rules-update-available` — доступно обновление (с версиями и hash)

## 📝 TODO (будущие улучшения)

- [ ] Настройка URL через UI (input в Settings)
- [ ] A/B тестирование правил (несколько конфигов)
- [ ] Просмотр changelog перед обновлением
- [ ] Ручное редактирование правил в UI
- [ ] Export/Import правил в JSON
- [ ] Синхронизация правил между устройствами

## 🐛 Troubleshooting

### Правила не обновляются

1. Проверьте URL в clientStorage
2. Проверьте доступность URL (CORS, формат)
3. Проверьте консоль на наличие ошибок fetch

### После обновления плагин работает некорректно

1. Нажмите 🗑️ для сброса к defaults
2. Проверьте формат remote config (валидность JSON)
3. Проверьте, что все обязательные поля присутствуют

### Диалог обновления не появляется

1. Проверьте, что hash различаются
2. Убедитесь, что remote config отличается от текущего
3. Проверьте логи в консоли
