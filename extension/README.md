# Contentify Chrome Extension

Chrome Extension для отправки данных страницы в Figma Plugin через Relay сервер.

## Установка

1. Откройте `chrome://extensions/`
2. Включите **Developer mode** (правый верхний угол)
3. Нажмите **Load unpacked**
4. Выберите папку `extension`

## Использование

1. Убедитесь, что Relay сервер запущен (`cd relay && npm start`)
2. Откройте страницу с товарами (Яндекс Маркет, WB, OZON и др.)
3. Нажмите на иконку расширения
4. Настройте Relay URL (по умолчанию `http://localhost:3847`)
5. Опционально: укажите URL Figma файла для автоматического открытия
6. Нажмите **Send to Figma**
7. Token автоматически скопируется в буфер обмена
8. Откройте Figma и запустите плагин Contentify
9. Вставьте token в секцию "Connect from Browser" и нажмите **Fetch**

## Иконки

Для production замените placeholder-иконки в папке `icons/` на реальные PNG файлы:
- `icon16.png` — 16x16
- `icon48.png` — 48x48
- `icon128.png` — 128x128

## Поддерживаемые сайты

Extension пытается автоматически распознать товары на странице с помощью различных селекторов:
- Яндекс Маркет
- Wildberries
- OZON
- Любые сайты с Product schema (itemprop="Product")
- Общие товарные карточки (.product-card, .goods-card и т.д.)

Если товары не найдены — используются тестовые (mock) данные для проверки транспорта.

## Permissions

- `activeTab` — доступ к текущей вкладке для сбора данных
- `scripting` — выполнение скрипта на странице
- `storage` — сохранение настроек
- `clipboardWrite` — копирование token в буфер

