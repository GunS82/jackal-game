# Руководство разработчика

«Шакал» — браузерная игра по правилам [jackal.su](https://jackal.su/rules/all). Клиент написан на чистом JavaScript с ES-модулями; для Cloudflare Worker используется Wrangler, Android-клиент собран на Capacitor. Нужен Node.js 22+.

## Запуск

```sh
git clone https://github.com/GunS82/jackal-game.git
cd jackal-game
npm ci
npm run server
```

Откройте `http://localhost:8090`. `npm run server` раздаёт статические файлы и запускает локальный HTTP/SSE-сервер с комнатами в памяти. В меню выберите «Новая игра» → «1 на 1 — Белые против Чёрных», чтобы играть hot-seat на одном устройстве. Если нужен только локальный клиент, выполните `python3 -m http.server 8080` и откройте `http://localhost:8080`.

Для локальной онлайн-партии оставьте `npm run server` запущенным. В браузере A откройте «Новая игра» → «Играть онлайн» → «Создать игру» и передайте код игроку B. Игрок B открывает `http://localhost:8090` в другом браузере или приватном окне и вводит код. Оба клиента используют тот же локальный сервер.

Открывать `index.html` напрямую через `file://` нельзя: браузер не загружает ES-модули из локального файла.

## Проверки

```sh
npm test
npm run sim
```

`npm test` запускает `node --test test/*.test.js`. Тесты покрывают движок, позиции, чистые функции интерфейса, локальный сервер и Cloudflare Worker. `npm run sim` запускает случайные партии в поддерживаемых режимах.

Тестовые позиции для регрессии находятся в `test-positions/`; не изменяйте их без обновления связанных тестов. Позиции для ручной проверки интерфейса находятся в `positions/`.

## Структура

| Файл или каталог | Назначение |
| --- | --- |
| `src/game.js` | Движок без DOM: состояние, допустимые ходы, применение хода, сохранение, `publicState` |
| `src/view.js` | Чистые функции текстов, подсказок, статусов и отображения |
| `src/ui.js` | DOM: поле, меню, диалоги, локальная и онлайн-игра |
| `src/net.js` | HTTP-запросы и SSE-подключение клиента |
| `src/config.js` | `SERVER_URL`, адрес сборки и доступность сервера |
| `src/assets.js` | Карта игровых изображений и иконок |
| `server/` | Node HTTP/SSE-сервер для локального запуска |
| `worker.js` | Cloudflare Worker и SQLite Durable Object для публичных комнат |
| `test/` | Тесты движка, интерфейсных функций и серверов |
| `positions/` | Позиции для ручной проверки |
| `test-positions/` | Стабильные тестовые фикстуры |

## Правила изменения

- Движок должен оставаться независимым от DOM и Node.js, чтобы запускаться в браузере, WebView и Cloudflare Workers.
- Сервер проверяет ходы через `applyMove(..., { asPlayer })` и отправляет клиентам только `publicState`; закрытые клетки и seed не должны попадать в интерфейс соперника.
- `assets/` и `design/` принадлежат дизайнеру. Не изменяйте их без согласования.
- Сохраняемые позиции должны оставаться JSON-совместимыми. Формат описан в `STATE_FORMAT.md`.
- Тексты интерфейса и документации — на русском.
- Решения по известным спорным вопросам собраны в [DECISIONS.md](DECISIONS.md); не переписывайте историю коммитов без отдельной причины.

## Онлайн-сервер Cloudflare

Публичный backend задаётся в `wrangler.toml`. Локальная разработка и публикация:

```sh
npm run dev:cf
npm run deploy:cf
```

Текущий Worker опубликован по адресу `https://jackal-game-server.telmanhans5.workers.dev`; GitHub repository variable `SERVER_URL` уже настроена, а Pages опубликован. При смене адреса обновите переменную и повторно запустите workflow **Deploy client to GitHub Pages**. Подробные шаги и лимиты тарифа описаны в [DEPLOY.md](DEPLOY.md).

Для локального Node-сервера используйте `npm run server`. Адрес для ручной проверки можно переопределить в клиенте через `?server=https://…`; `?server=default` удаляет это переопределение.

## Android

Нужны Android Studio/SDK и JDK 21. Минимальная версия приложения — Android 8 (API 26). Скопировать файлы клиента в Capacitor и собрать debug APK:

```sh
SERVER_URL=https://jackal-game-server.<ваш-subdomain>.workers.dev npm run build:android
```

В Windows PowerShell: `$env:SERVER_URL="https://…"; npm run build:android`. APK появится в `android/app/build/outputs/apk/debug/app-debug.apk`. Чтобы только обновить Android-проект без Gradle-сборки, используйте `npm run android:sync`.

Workflow **Android debug APK** собирает APK и публикует его как артефакт GitHub Actions. Он использует repository variable `SERVER_URL`; если переменная не задана, локальная игра работает, а онлайн показывает сообщение о ненастроенном сервере.
