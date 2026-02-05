# Contentify Relay — Native Messaging Host (macOS)

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
launchctl stop com.contentify.relay

# Запустить relay
launchctl start com.contentify.relay

# Перезапустить
launchctl stop com.contentify.relay && launchctl start com.contentify.relay
```

## Удаление

```bash
./uninstall-macos.sh
```

## Логи

```bash
# Вывод
cat /tmp/contentify-relay.log

# Ошибки
cat /tmp/contentify-relay.err
```

## Для разработчиков

### Сборка бинарников

Бинарники собираются из `relay/server.js`:

```bash
cd ../relay
npm install
npm run build
```

### Сборка .app bundle

```bash
./build-app.sh
```

Скрипт автоматически соберёт бинарники и скопирует их в `.app/Contents/Resources/`.

### Ручной запуск (для отладки)

```bash
# Из relay/
node ../relay/server.js

# Или бинарник из .app
./Contentify\ Relay.app/Contents/Resources/contentify-relay-host-arm64
```

## Troubleshooting

### Relay не запускается

```bash
# Проверить статус
launchctl list | grep contentify

# Посмотреть ошибки
cat /tmp/contentify-relay.err
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
