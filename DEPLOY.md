# Как выложить «Шакал» бесплатно

Схема: **клиент** (страница игры) — на GitHub Pages, **сервер онлайн-игры** — на Render (тариф Free).
Игра на одном устройстве (hot-seat) и по файлам работает и без сервера; сервер нужен только для «Играть онлайн».

Ограничения бесплатного тарифа Render: сервер засыпает через 15 минут без запросов, просыпается около минуты;
комнаты хранятся в памяти и пропадают при засыпании/перезапуске. Об этом игроков предупреждает плашка «Тестовая версия».

## 1. Репозиторий на GitHub
1. Зарегистрируйтесь на https://github.com (если ещё нет аккаунта).
2. Справа вверху **+ → New repository**. Имя, например, `jackal-game`, видимость **Public** (Pages бесплатно — только для публичных). Без README. **Create repository**.
3. Загрузите файлы проекта. Проще всего из папки `jackal-game` (из архива) в терминале:
   ```
   git init -b main
   git add -A
   git commit -m "Шакал"
   git remote add origin https://github.com/ВАШ_ЛОГИН/jackal-game.git
   git push -u origin main
   ```
   (Если проект уже с историей git — только `git remote add …` и `git push -u origin main`.)

## 2. Сервер на Render
1. Зарегистрируйтесь на https://render.com (удобно — кнопкой «GitHub»). Карта для Free не нужна.
2. **New + → Blueprint**, выберите репозиторий `jackal-game`. Render прочитает `render.yaml` и предложит сервис `jackal-server` (Free). **Apply**.
   - Если «Blueprint» не подходит: **New + → Web Service** → репозиторий → Runtime **Node**, Build Command `npm install`, Start Command `npm run server`, Instance Type **Free**, Health Check Path `/health`.
3. Дождитесь «Live». Адрес будет вида `https://jackal-server.onrender.com` (или с суффиксом, например `https://jackal-server-ab12.onrender.com`) — **скопируйте его**.
4. Проверка: откройте `АДРЕС/health` — должно быть `{"ok":true,...}`. Можно открыть и просто `АДРЕС` — это та же игра прямо с сервера.
5. (Необязательно, после шага 3) В Render → сервис → **Environment** задайте `ALLOWED_ORIGINS` = `https://ВАШ_ЛОГИН.github.io`, чтобы сервер принимал запросы только от вашей страницы. По умолчанию `*` — от любой.

## 3. Адрес сервера для клиента (SERVER_URL)
1. В репозитории на GitHub: **Settings → Secrets and variables → Actions → вкладка Variables → New repository variable**.
2. Name: `SERVER_URL`, Value: адрес из шага 2.3 без слэша в конце, например `https://jackal-server.onrender.com`. **Add variable**.

(Без переменной клиент использует адрес по умолчанию из `src/config.js` — `https://jackal-server.onrender.com`; если Render выдал другой, переменная обязательна.)

## 4. Клиент на GitHub Pages
1. В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions → «Deploy client to GitHub Pages» → Run workflow** (дальше он запускается сам при каждом push в `main`). Workflow прогоняет тесты, подставляет SERVER_URL и публикует сайт.
3. Через 1–2 минуты игра будет по адресу `https://ВАШ_ЛОГИН.github.io/jackal-game/` (ссылка — в Settings → Pages и в итогах workflow).

## 5. Проверка
- Откройте страницу Pages: внизу появится плашка «Тестовая версия… сервер просыпается» с таймером; когда сервер ответит — «Сервер готов».
- «Играть онлайн» → «Создать игру», откройте ту же страницу на другом устройстве и войдите по коду.
- Временно указать другой сервер можно параметром `?server=https://…` (запоминается в браузере; вернуть — `?server=default`).

## Обновления
Изменили код → `git push`. Render и GitHub Pages обновятся сами.
