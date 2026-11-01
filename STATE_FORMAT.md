# Формат позиции (JSON)

Координаты: x — столбец, y — строка, 0..12; остров — 1..11 без четырёх углов, остальное — море.
Корабли: 0 Белые (низ, y=12), 1 Жёлтые (лево, x=0), 2 Чёрные (верх, y=0), 3 Красные (право, x=12). Порядок хода 0→1→2→3.

```json
{
  "version": 3, "seed": 12345,   // версия формата; seed раздачи (информативно)
  "mode": "2p",            // "2p" (1 на 1, по 2 команды) | "1v1" (только команды 0 и 2) | "2v2" | "4p"
  "current": 0,            // чей ход, 0..3
  "turn": 0, "score": [0,0,0,0], "rum": [0,0,0,0], "lost": 0,   // необязательно
  "defaultTile": { "kind": "empty", "open": true },  // чем заполнить неуказанные клетки
  "tiles": {
    "8,8":  { "kind": "arrow3", "rot": 1 },               // rot — поворот на 90° по часовой (вместо dirs)
    "6,10": { "kind": "ice", "open": true },
    "5,10": { "kind": "chest2", "open": true, "coins": 2 },
    "4,9":  { "kind": "arrow1", "dirs": [[1,1]] },      // dirs: направления [dx,dy], -1..1
    "3,3":  { "kind": "cannon", "dirs": [[0,-1]] },
    "7,7":  { "kind": "plane", "used": false }
  },
  "ships": [{"x":6,"y":12},{"x":0,"y":6},{"x":6,"y":0},{"x":12,"y":6}],  // необязательно
  "pirates": [
    { "team": 0, "x": 6, "y": 11 },
    { "team": 0, "onShip": true },
    { "team": 1, "x": 5, "y": 9, "spin": 0, "trapped": false },
    { "team": 2, "alive": false }
  ]
}
```
- `options` — настройки партии: `{ "houseCrocDeath": false, "archipelagoMissionary": false }` (houseCrocDeath: true — домашнее правило: цепочка на открытого крокодила убивает; archipelagoMissionary: true — правило «Архипелага»: враги, кроме Пятницы, не встают на клетку миссионера, вынужденный вход туда — гибель). Необязательно; неизвестные ключи и не-boolean значения отклоняются.
- `over`, `endReason` — конец партии и причина: `majority` | `allCoins` | `noPirates` | `noMoves` (ходов больше нет: побеждает тот, у кого больше монет; ничья при равенстве) | `noShips` (зарезервировано).
- `pending.visits` — счётчик заходов в клетки за текущий ход (защита от циклов).
- `moves` — журнал ходов `[{n, team, type, pid, x, y, via, coin}]`, `log` — текстовый журнал, `pending` — незавершённый ход по стрелке/коню `{pid, coin, origin, visits}` (обычно null).
- `kind`: empty, arrow1, arrow1d, arrow2, arrow2d, arrow3, arrow4, arrow4d (или `arrow` + обязательный `dirs`), horse, spin2..spin5, ice, trap, croc, ogre, fort, abor, chest1..chest5, plane, balloon, cannon, barrel, rum1..rum3.
- `open` по умолчанию `true`; `coins` — монеты, лежащие на клетке (у закрытого сундука монеты появятся при открытии).
- Пиратов не больше 3 на команду; недостающие считаются погибшими. `spin` — текущий шаг на вертушке, `carry: true` — пират несёт монету через вертушку.
- Игра автоматически заканчивается, когда монет на острове не осталось и хотя бы одна монета уже доставлена/утонула.
- При ошибке загрузка выдаёт сообщение вида «Ошибка в позиции: клетка 1,1 не на острове …».

### Формат 3 (v0.4); файлы версии 1–2 читаются как раньше
- Корень: `grass` — сколько ходов ещё действует трава (0 — нет).
- Клетка: `treasure` (1 — сокровище галеона, = 3 монеты), `lit` (разовый эффект ещё не сработал — клетка открыта маяком), `used` (маяк/самолёт использован). Новые kind: cave, bengunn, friday, missionary, lighthouse, quake, jungle, grass, caramba, galleon.
- Пират: `role` — bengunn | friday | missionary | exmissionary (не входят в лимит 3), `inCave: true` — бродит в пещере, `gone: true` — выбыл навсегда, `carry` — 0/1/3 (true из старых файлов = 1).
- `pending.type`: `cave` (выбрать выход), `lighthouse` {left}, `quake` {first}. Ходы: `reveal` {x,y}, `quake` {x,y}, `rum` {pid,target,x,y}; у хода с грузом может быть `treasure: true`.

## Онлайн (v0.5)
Сервер рассылает `{type:'state', code, player, opponent, state}`, где `opponent` — `waiting` | `online` | `offline` | `left`, а `state` — публичное состояние (`G.publicState`): закрытые клетки `{kind:'empty', open:false, coins:0}`, `seed: null`. API: `POST /api/create {options}` → `{code, token, player:0}`, `POST /api/join {code}` → `{token, player:1}`, `POST /api/move {code, token, move}`, `POST /api/leave {code, token}`, `GET /api/events?code&token` (SSE).

- v0.5.1: в публичном состоянии есть `coinsTotalLeft` — общее число неразыгранных монет (считает сервер, без раскладки по клеткам). Комнаты удаляются после 24 ч простоя или через 1 ч после конца партии.

- v0.5.2: сессия хранится в sessionStorage (`jackal-online`, своя у каждой вкладки). Режим комнаты всегда `1v1`, поле mode в запросе игнорируется. `leave` комнату не удаляет — соперник получает `opponent: "left"`.
