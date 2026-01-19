# EProductSnippet Relay — Native Messaging Host (macOS)

Автоматически запускает relay сервер для связи Chrome Extension с Figma Plugin.

## Установка

```bash
cd native-host
./install-macos.sh
```

Установщик:
- ✅ Регистрирует Native Messaging Host для Chrome
- ✅ Добавляет автозапуск при входе в систему
- ✅ Запускает relay сервер сразу

**Перезапустите Chrome** после установки.

## Как это работает

```
Chrome Extension  ←→  Relay Server (localhost:3847)  ←→  Figma Plugin
```

1. Relay запускается автоматически при входе в macOS
2. При клике на иконку расширения — данные отправляются на relay
3. Figma плагин получает данные через polling

## Проверка

```bash
# Проверить что relay работает
curl http://localhost:3847/health
```

Должен ответить: `{"status":"ok","queueSize":0}`

## Управление

```bash
# Остановить relay
launchctl stop com.eproductsnippet.relay

# Запустить relay
launchctl start com.eproductsnippet.relay

# Перезапустить
launchctl stop com.eproductsnippet.relay && launchctl start com.eproductsnippet.relay
```

## Удаление

```bash
./uninstall-macos.sh
```

## Логи

```bash
# Вывод
cat /tmp/eproductsnippet-relay.log

# Ошибки
cat /tmp/eproductsnippet-relay.err
```

## Для разработчиков

### Сборка бинарников

```bash
npm install
npm run build
```

### Ручной запуск (для отладки)

```bash
./dist/eproductsnippet-relay-host-arm64  # Apple Silicon
./dist/eproductsnippet-relay-host-x64    # Intel
```

## Troubleshooting

### Relay не запускается

```bash
# Проверить статус
launchctl list | grep eproductsnippet

# Посмотреть ошибки
cat /tmp/eproductsnippet-relay.err
```

### Порт занят

```bash
lsof -i :3847
```

### Переустановка

```bash
./uninstall-macos.sh
./install-macos.sh
```
