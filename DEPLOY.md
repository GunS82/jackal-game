# Деплой «Шакала»

Клиент публикуется на GitHub Pages. Сервер онлайн-игры — Cloudflare Worker, по одной SQLite Durable Object на комнату. Hot-seat и игра по файлам работают и без сервера.

Нужны Node.js 22+ и npm. Durable Objects на бесплатном тарифе Cloudflare используют SQLite storage; квоты и условия приведены в [документации Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/#durable-objects).

## Локальный запуск

```sh
npm install
npm run server
```

Откройте `http://localhost:8090`. Сервер раздаёт игру и обслуживает онлайн-комнаты в памяти. Для клиента без онлайна можно запустить `python3 -m http.server 8080`.

Клиент нельзя открывать напрямую через `file://`: ES-модулям нужен HTTP-сервер. Команды проекта:

```sh
npm test
npm run sim
```

## Cloudflare Worker

1. Создайте аккаунт Cloudflare и войдите локально:

   ```sh
   npx wrangler login
   ```

2. Запустите Worker локально:

   ```sh
   npm run dev:cf
   ```

   Wrangler использует `wrangler.toml`, SQLite Durable Object `Room` и CORS для GitHub Pages и Android WebView.

3. Опубликуйте Worker:

   ```sh
   npm run deploy:cf
   ```

   Скопируйте выданный адрес вида `https://jackal-game-server.<ваш-subdomain>.workers.dev`.

4. В GitHub откройте **Settings → Secrets and variables → Actions → Variables** и добавьте переменную `SERVER_URL` со скопированным адресом без завершающего `/`.

5. Запустите workflow **Actions → Deploy client to GitHub Pages → Run workflow**. Workflow подставит `SERVER_URL` в копию `src/config.js` и опубликует клиента. После каждого изменения адреса Worker повторите запуск workflow.

## Android APK

В проекте есть Capacitor-обёртка Android 8+ (API 26+). Для локальной сборки нужны Android Studio/SDK, JDK 17 и Node.js 22+:

```sh
SERVER_URL=https://jackal-game-server.<ваш-subdomain>.workers.dev npm run build:android
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Команда `npm run android:aab` готовит release AAB без подписи; для публикации добавьте собственный ключ подписи и настройки Google Play. В GitHub Actions workflow **Android debug APK** создаёт неподписанный debug APK и загружает его как артефакт. Веб и Android используют repository variable `SERVER_URL`; без неё локальная игра работает, а онлайн сообщает, что сервер не настроен.

Кнопка «Назад» сначала закрывает окно или плашку выбора, затем запрашивает подтверждение перед выходом из онлайн-партии. Локальная позиция сохраняется в `localStorage` после каждого действия.

Для временного подключения к другому серверу используйте `?server=https://…`. Значение сохраняется в браузере; `?server=default` сбрасывает его к адресу, встроенному при сборке.

## Хранение комнат и лимиты

Состояние партии и токены хранятся в SQLite Durable Object. Alarm удаляет незаконченные комнаты после 24 часов без активности и законченные — через час. Игрокам отправляется только `publicState`: содержимое закрытых клеток скрыто.

Тариф Cloudflare Free ограничивает число запросов, объём SQLite storage и вычислительное время Durable Objects. SSE-соединения остаются открытыми, пока игроки подключены, и расходуют квоту вычислительного времени. Смотрите актуальные лимиты в [тарифах Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/#durable-objects). Переход на платный тариф для штатного небольшого использования не требуется; не включайте его без отдельного решения.

## Старый вариант Render

`render.yaml` оставлен для тех, у кого уже есть рабочий Render-аккаунт. Основной сценарий проекта — Cloudflare Workers + Durable Objects; Render больше не используется для публичного сайта.
