// Чистые функции представления (без DOM): заголовок, статус и состояние кнопок. Покрыты тестами.
import * as G from './game.js';

const TILE_RULES = {
  empty: 'Особого эффекта нет. Здесь можно оставить найденный груз.',
  arrow: 'Пират движется по стрелке. Если выходов несколько, выберите один — ход продолжится.',
  horse: 'Переместитесь как шахматный конь: на две клетки в одну сторону и на одну вбок.',
  spin2: 'Вертушка задерживает пирата на 2 хода; каждый свой ход он продвигается по ней.',
  spin3: 'Вертушка задерживает пирата на 3 хода; каждый свой ход он продвигается по ней.',
  spin4: 'Вертушка задерживает пирата на 4 хода; каждый свой ход он продвигается по ней.',
  spin5: 'Вертушка задерживает пирата на 5 ходов; каждый свой ход он продвигается по ней.',
  ice: 'Пират скользит дальше в том же направлении, пока цепочка перемещения не остановится.',
  trap: 'Запирает пирата. Освободить его может союзник рядом или ром.',
  croc: 'Срывает перемещение: пират и груз возвращаются к месту, откуда начался ход.',
  ogre: 'Съедает пирата и оставляет его груз на клетке. Пятница не боится людоеда.',
  fort: 'Защищает пирата от нападения. Нельзя войти с грузом или вытеснить врага из крепости.',
  abor: 'Сюда нельзя войти с грузом. Если у команды меньше трёх бойцов, здесь можно воскресить бойца.',
  plane: 'Одноразовый перенос: выберите точку на острове или свой корабль. Груз едет вместе с пиратом.',
  balloon: 'Сразу уносит пирата с грузом на его корабль и доставляет добычу.',
  cannon: 'Выстреливает пирата по направлению ствола через остров прямо в море.',
  barrel: 'Пират пропускает один свой ход; другими пиратами команды можно ходить.',
  cave: 'Выберите другой открытый вход без врагов. Если выхода пока нет, пират подождёт внутри.',
  quake: 'Выберите две свободные клетки без пиратов и груза — они поменяются местами.',
  jungle: 'Внутри не дерутся. Войти в джунгли с монетой или сокровищем нельзя.',
  grass: 'На несколько ходов каждый игрок командует пиратами следующей команды по кругу.',
  caramba: 'На правила и положение фигур не влияет.',
  lighthouse: 'Один раз позволяет открыть до четырёх закрытых клеток.',
  bengunn: 'Бен Ганн присоединяется к команде и может сражаться.',
  friday: 'Пятница присоединяется к команде; при встрече с пиратом переходит к нему.',
  missionary: 'Миссионер не носит добычу и защищает стоящих рядом пиратов от боя.',
  galleon: 'Даёт одно сокровище стоимостью три монеты.',
};
export function tileDetails(t) {
  if (!t?.open) return { name: G.tileName(t), rule: 'Клетка закрыта. Её содержимое станет видно, когда пират на неё наступит.' };
  const rule = t.kind === 'plane' && t.used
    ? 'Одноразовый перенос уже выполнен. С этой клетки больше нельзя улететь.'
    : t.kind.startsWith('chest')
      ? `В сундуке ${t.coins} монет. Заберите груз, уходя с клетки, и доставьте его на корабль.`
      : t.kind.startsWith('rum')
        ? 'Даёт команде ром. Его можно использовать, чтобы освободить пирата из капкана или изменить особого персонажа.'
        : TILE_RULES[t.kind] ?? 'Особое действие клетки описано в руководстве игрока.';
  return { name: G.tileName(t), rule };
}

// Что именно надо выбрать при незавершённом ходе: конь — клетку, стрелка — направление.
export function pendingWhat(s) {
  if (!s.pending) return null;
  if (s.pending.type === 'cave') return 'выход из пещеры';
  if (s.pending.type === 'lighthouse') return `клетку для маяка (осталось ${s.pending.left})`;
  if (s.pending.type === 'quake') return s.pending.first ? 'вторую клетку для землетрясения' : 'первую клетку для землетрясения';
  const p = s.pirates[s.pending.pid];
  return G.tileAt(s, p.x, p.y)?.kind === 'horse' ? 'клетку' : 'направление';
}

// Заголовок частями: постоянный префикс «Ход:» (не мигает при перерисовке) и меняющийся текст.
export function headerParts(s, opts = {}) {
  const t = headerText(s, opts);
  return t.startsWith('Ход: ') ? { prefix: 'Ход:', text: t.slice(5) } : { prefix: '', text: t };
}

export function mobileHeaderText(s, { myTurn = true } = {}) {
  if (s.over) return 'Партия окончена';
  const turn = `Ход ${TURN_GENITIVE[G.TEAMS[s.current].name] ?? G.TEAMS[s.current].name} · №${s.turn + 1}`;
  if (s.pending) return `${turn} · продолжите ход`;
  return myTurn ? turn : `${turn} · соперник`;
}

const SCORE_BADGE = { 'Белые': 'Б', 'Чёрные': 'Ч', 'Жёлтые': 'Ж', 'Красные': 'К' };
const TURN_GENITIVE = { 'Белые': 'Белых', 'Чёрные': 'Чёрных', 'Жёлтые': 'Жёлтых', 'Красные': 'Красных' };
export function mobileScore(s) {
  return G.activeTeams(s.mode).map(team => `${SCORE_BADGE[G.TEAMS[team].name]} ${s.score[team]}`).join(' : ');
}

// Подсказка: выбранный пират без «С монетой» мог бы отвезти монету на корабль.
export function coinHint(classified, { sel = null, withCoin = false } = {}) {
  if (typeof sel !== 'number' || withCoin) return null;
  return classified.some(m => m.pid === sel && m.coin && m.kind === 'coin') ? 'Монету можно отвезти на корабль — включите «С монетой»' : null;
}

// Приоритет слоя подсветки для клетки (несколько ходов на одну клетку).
export function hlKind(here) {
  const has = k => here.some(m => m.kind === k);
  if (here.every(m => m.kind === 'death')) return 'death';
  return has('coin') ? 'coin' : has('coinLost') ? 'coin-lost' : has('death') ? 'death' : 'move';
}

// Итог партии: победитель — у кого больше монет (и при noMoves — «ходов больше нет»); ничья только при равном счёте лидеров (в т.ч. 0:0).
export function resultText(s) {
  const w = G.winner(s), why = `Игра окончена (${G.END_REASONS[s.endReason] ?? ''}).`;
  return w.length === 1 ? `${why} Победа: ${G.sideName(s, w[0])}` : `${why} Ничья`;
}

// Бледная метка «можно отвезти монету» на клетке (x,y) — поверх обычной подсветки.
export function coinHintAt(classified, x, y, { sel = null, withCoin = false } = {}) {
  return typeof sel === 'number' && !withCoin && classified.some(m => m.pid === sel && m.coin && m.kind === 'coin' && m.x === x && m.y === y);
}

export function headerText(s, { myTurn = true, online = false } = {}) {
  if (s.over) return resultText(s);
  const T = G.TEAMS[s.current];
  let t = `Ход: ${T.name} (игрок ${G.controllerOf(s) + 1}${s.grass ? ' — трава' : ''}) · №${s.turn + 1}`;
  const w = pendingWhat(s);
  if (w) t += ` · выберите ${w}`;
  if (!myTurn) t += online ? ' · Ход соперника' : ' · ждём ход соперника — загрузите его файл';
  return t;
}

// Сообщение при клике по другому пирату во время незавершённого хода.
export function blockedNotice(s) { const w = pendingWhat(s); return w ? `Сначала завершите ход: выберите ${w}` + (s.pending.type ? '' : ' для пирата на стрелке/коне') : null; }

// Какой груз выбран тогглом: false — без груза, true — монета, 'T' — сокровище.
export const cargoMatch = (m, withCoin) => !!m.coin === !!withCoin && !!m.treasure === (withCoin === 'T');
// Ходы, которые подсвечиваются на поле при текущем выборе.
export function targets(moves, { s = null, sel = null, withCoin = false } = {}) {
  if (s?.pending?.type === 'lighthouse' || s?.pending?.type === 'quake') return moves.filter(m => m.type === 'reveal' || m.type === 'quake');
  if (sel === 'ship') return moves.filter(m => m.type === 'ship');
  if (sel === 'rum') return moves.filter(m => m.type === 'rum');
  if (typeof sel !== 'number') return [];
  return moves.filter(m => m.pid === sel && m.type === 'move' && cargoMatch(m, withCoin));
}
// Следующее значение тоггла груза среди доступных у выбранного пирата.
export function nextCargo(moves, sel, withCoin) {
  const opts = [false, true, 'T'].filter(c => moves.some(m => m.pid === sel && m.type === 'move' && cargoMatch(m, c)));
  return opts.length ? opts[(opts.indexOf(withCoin) + 1) % opts.length] : false;
}

// Несёт ли пират монету (для метки coin.svg): монета едет через вертушку (carry),
// продолжение хода с монетой (pending.coin) или выбранный пират с включённым тогглом «с монетой».
export function pirateHasCoin(s, p, { sel = null, withCoin = false } = {}) {
  if (p.carry) return true;
  if (s.pending && !s.pending.type && s.pending.pid === p.id || s.pending?.type === 'cave' && s.pending.pid === p.id) return !!s.pending.coin;
  return p.id === sel && withCoin;
}

// Метка груза у фишки пирата: 'treasure' | 'coin' — несёт (яркая метка); 'can' — может взять монету (бледная coin.svg); 'canTreasure' — только сокровище (бледная treasure.svg); null — ничего.
export function coinMark(s, p, moves, { sel = null, withCoin = false, myTurn = true } = {}) {
  if (pirateHasCoin(s, p, { sel, withCoin })) return p.carry === G.TREASURE_VALUE || (p.id === sel && withCoin === 'T') || (s.pending?.pid === p.id && s.pending.treasure) ? 'treasure' : 'coin';
  if (!myTurn || s.over || s.pending || p.team !== s.current) return null;
  const mine = moves.filter(m => m.pid === p.id && m.type === 'move' && m.coin);
  return mine.some(m => !m.treasure) ? 'can' : mine.length ? 'canTreasure' : null; // бледная монета / бледное сокровище
}

// Все кнопки всегда на месте; возвращает {disabled, label, pressed}.
export function buttons(s, moves, { sel = null, withCoin = false, myTurn = true } = {}) {
  const busy = s.over || !myTurn || !!s.pending;
  const pirate = typeof sel === 'number' ? s.pirates[sel] : null;
  const coinChoice = !!pirate && !busy && [false, true, 'T'].filter(c => moves.some(m => m.pid === sel && m.type === 'move' && cargoMatch(m, c))).length > 1;
  return {
    ship: { disabled: busy || !moves.some(m => m.type === 'ship'), label: '⛵ Двигать корабль', pressed: sel === 'ship' },
    coin: { disabled: !coinChoice, label: withCoin === 'T' ? '💰 С сокровищем' : withCoin ? '🪙 С монетой ' : '🪙 Без монеты', pressed: !!withCoin },
    revive: { disabled: busy || !moves.some(m => m.type === 'revive'), label: '❤ Воскресить', pressed: false },
    rum: { disabled: busy || !moves.some(m => m.type === 'rum'), label: '🍾 Дать ром', pressed: sel === 'rum' },
  };
}

// Плашка онлайн-игры над полем: {kind, title, sub} или null. kind: wait | lost | left | turn | over.
export function onlineBanner(s, { player, connected = true, opponent = 'online', gone = false } = {}) {
  if (gone) return { kind: 'left', title: 'Партия закрыта на сервере', sub: 'Начните новую игру или войдите по другому коду' };
  if (!connected) return { kind: 'lost', title: 'Соединение потеряно', sub: 'Переподключаемся…' };
  if (opponent === 'waiting') return { kind: 'wait', title: 'Ждём соперника…', sub: 'Передайте код другу' };
  if (opponent === 'left') return { kind: 'left', title: 'Соперник вышел из партии', sub: 'Можно начать новую игру' };
  if (opponent === 'offline') return { kind: 'left', title: 'Соперник отключился', sub: 'Ждём, пока он вернётся' };
  if (!s || s.over) return null;
  return G.controllerOf(s) === player ? { kind: 'turn', title: 'Ваш ход!', sub: '' } : { kind: 'wait', title: 'Ход соперника', sub: `${G.TEAMS[s.current].name} думают` };
}

// Нужно ли спрашивать подтверждение, прежде чем покинуть онлайн-партию (и отправить leave).
export function needsLeaveConfirm(net, s) { return !!net && !net.gone && !!s && !s.over; }

// Приоритет аппаратной кнопки Android: закрыть вложенные элементы до выхода из приложения.
export function androidBackAction({ dialog = null, mobileMenu = false, fitMode = false, logExpanded = false, plate = false, online = false, hasGame = false } = {}) {
  if (dialog === 'online') return 'close-online';
  if (dialog === 'menu') return 'close-menu';
  if (mobileMenu) return 'close-mobile-menu';
  if (fitMode) return 'height-fit';
  if (logExpanded) return 'collapse-log';
  if (plate) return 'close-plate';
  if (online) return 'confirm-online-leave';
  if (hasGame) return 'confirm-game-exit';
  return 'minimize';
}

// За кого играет эта вкладка онлайн (1v1: игрок 1 — Белые, игрок 2 — Чёрные).
const GEN = { 'Белые': 'Белых', 'Чёрные': 'Чёрных', 'Жёлтые': 'Жёлтых', 'Красные': 'Красных' };
export function youAreText(s, player) { const t = G.teamsOfPlayer(s, player)[0]; return t == null ? '' : `Вы играете за ${GEN[G.TEAMS[t].name] ?? G.TEAMS[t].name}`; }
// Подсказка про игру по файлам — только в режиме файлов (не онлайн и не hot-seat).
export const showFileHelp = ({ online, me }) => !online && me !== 'all';

// Панель команды: обычные пираты с номерами 1–3 (погибшие — тусклые), за разделителем — персонажи без номера (до 6 фишек).
const CHAR_ROLES = ['bengunn', 'friday', 'missionary', 'exmissionary'];
export function crewPanel(s, team) {
  const mine = s.pirates.filter(p => p.team === team);
  const regular = mine.filter(p => !p.role).slice(0, 3).map((p, i) => ({ pid: p.id, num: i + 1, alive: p.alive, role: null }));
  const chars = mine.filter(p => p.alive && CHAR_ROLES.includes(p.role)).sort((a, b) => CHAR_ROLES.indexOf(a.role) - CHAR_ROLES.indexOf(b.role)).map(p => ({ pid: p.id, num: null, alive: true, role: p.role }));
  return { team, regular, chars };
}

// v0.5.5 (design/fan.png). Номер обычного пирата (1–3) для кружка на фишке; у персонажей номера нет.
export function pirateNumber(s, p) { if (p.role) return null; const i = s.pirates.filter(q => q.team === p.team && !q.role).indexOf(p); return i >= 0 && i < 3 ? i + 1 : null; }
// Плашка выбора пирата на клетке: выезжает в сторону, где больше свободных клеток, у края — переворачивается.
// x — столбец клетки, n — сколько пиратов, N — ширина поля. Возвращает side, start (первый столбец), span (столбцов).
export function platePlacement({ x, n, N = G.N }) {
  const span = Math.min(Math.max(n, 2), N - 1), left = x, right = N - 1 - x;
  let side = right >= left ? 'right' : 'left';
  if (side === 'right' && right < span && left > right) side = 'left';
  if (side === 'left' && left < span && right > left) side = 'right';
  const start = Math.max(0, Math.min(N - span, side === 'right' ? x + 1 : x - span));
  return { side, start, span };
}
// Панели обеих сторон (или всех команд в 4p): своя — «Вы» (онлайн/файлы), текущая обведена золотом.
export function crewPanels(s, { player = null } = {}) {
  return G.activeTeams(s.mode).map(t => {
    const pl = G.playerOf(s, t), mine = player != null && pl === player;
    const label = player == null ? G.TEAMS[t].name : mine ? 'Вы' : 'Соперник';
    return { team: t, label, score: s.score[t], current: !s.over && t === s.current, mine, ...crewPanel(s, t) };
  });
}
// Строка-подсказка под полем при выбранном пирате.
export function selectHint(s, pid, { myTurn = true } = {}) {
  if (typeof pid !== 'number' || !myTurn) return null; const p = s.pirates[pid]; if (!p) return null;
  const n = pirateNumber(s, p);
  return `Ваш ход: выбран ${n ? 'пират ' + n : G.CHARACTERS[p.role] ?? G.pieceName(s, p)}, выберите клетку`;
}

// v0.5.5: локальная партия по умолчанию — 1 на 1 (Белые против Чёрных); идёт ли она (сделан хотя бы один ход).
export const DEFAULT_MODE = '1v1';
export const LOSE_LOCAL_Q = 'Текущая партия будет потеряна. Загрузить позицию?';
export const localInProgress = s => !!s && !s.over && (s.turn > 0 || (s.moves?.length ?? 0) > 0);

// v0.5.6: пока открыта плашка выбора и ни один пират с этой клетки не выбран — ходы не подсвечиваются.
export const plateHidesMoves = (plate, sel) => !!plate && !plate.pids.includes(sel);

// v0.5.7: клетка суши (13×13 без моря по краю и угловых клеток) — для пустого поля.
export const isLandCell = (x, y) => { const N = G.N; if (x <= 0 || y <= 0 || x >= N - 1 || y >= N - 1) return false; return !((x === 1 || x === N - 2) && (y === 1 || y === N - 2)); };
// Что предложить кнопкой «Продолжить»: только читаемая и не законченная сохранённая партия.
// подписи совпадают с пунктами меню; для старых режимов — названия из G.MODES
const MODE_LABEL = { '1v1': '1 на 1 — Белые против Чёрных', '2p': '1 на 1 — классика (по 2 команды, общий счёт)', '2v2': '4 игрока — 2 на 2', '4p': '4 игрока — каждый за себя' };
export function resumeInfo(raw) {
  if (!raw) return null; let s; try { s = G.loadState(raw); } catch { return null; }
  if (s.over) return null; return { mode: s.mode, label: `${MODE_LABEL[s.mode] ?? s.mode}, ход №${s.turn + 1}` };
}

// v0.5.8: свои пираты на клетке не могут ходить, потому что пьяны (ром) — подсказка вместо «ничего не произошло».
// Открыта плашка, пират ещё не выбран — подсказать, что делать дальше (иначе кажется, что клик «ничего не сделал»).
export function plateHint(plate, sel, myTurn) {
  if (!plate || !myTurn || plate.pids.includes(sel)) return null;
  const pl = platePlacement({ x: plate.x, n: plate.pids.length });
  return `На клетке ${plate.pids.length} ${plate.pids.length < 5 ? 'пирата' : 'пиратов'} — выберите одного на плашке ${pl.side === 'right' ? 'справа' : 'слева'}`;
}
// Ход только что пропущен автоматически (все пьяны / нет ходов) — показать это над полем.
export function skipNotice(s) { return s?.skipNote || null; } // ставит passStuck, стирает следующий applyMove; журнал не трогаем
// Нажали на чужих пиратов (например, на корабль чёрных в ход белых) — объяснить, почему ничего не выбрано.
export function turnNotice(s, x, y) {
  if (!s || s.over || s.pending) return null;
  const here = s.pirates.filter(p => p.alive && p.x === x && p.y === y);
  if (!here.length || here.some(p => p.team === s.current)) return null;
  return `Сейчас ход: ${G.TEAMS[s.current].name}`;
}
export function drunkNotice(s, x, y) {
  if (!s || s.over || s.pending) return null;
  const own = s.pirates.filter(p => p.alive && p.x === x && p.y === y && p.team === s.current);
  if (!own.length || own.some(p => G.pirateMoves(s, p).length)) return null;
  const drunk = own.filter(p => s.turn < p.drunkUntil); if (drunk.length !== own.length) return null;
  return drunk.length === 1 ? 'Пират пьян и пропускает ход' : 'Пираты пьяны и пропускают ход';
}
// Заметка меню переживает перезагрузку (sessionStorage) и снимается первым нажатием.
export const NOTE_KEY = 'jackal-menu-note';

// v0.5.8: пират пьян (ром) — значок assets/ui/drunk.svg справа снизу на фишке; снимается, когда протрезвеет.
export const isDrunk = (s, p) => !!p && p.alive && s.turn < (p.drunkUntil || 0);
export const DRUNK_ICON = 'assets/ui/drunk.svg';

// v0.5.14: стопка — 2+ пирата одной команды на клетке рисуются одной верхней фишкой со значком «×N» вместо номера;
// номера — только на плашке. Верхняя — выбранная (если она в стопке), иначе первая. Пьяная стопка — если пьян хотя бы один.
export function stacks(s, ps, sel = null) {
  const by = new Map(); for (const p of ps) { if (!by.has(p.team)) by.set(p.team, []); by.get(p.team).push(p); }
  return [...by.values()].flatMap(g => g.length < 2 || g.some(p => p.role) ? g.map(p => ({ top: p, pids: [p.id], n: 1, label: pirateNumber(s, p), drunk: isDrunk(s, p) }))
    : [{ top: g.find(p => p.id === sel) || g[0], pids: g.map(p => p.id), n: g.length, label: '×' + g.length, drunk: g.some(p => isDrunk(s, p)) }]);
}

// v0.5.16: журнал — история: последние k записей, новые сверху; номер хода, команда (для цветной точки), текст без эмодзи.
export function logEntries(s, k = 5) {
  const log = s?.log || [], meta = s?.logMeta || [], off = log.length - meta.length;
  return log.map((l, i) => ({ l, m: meta[i - off] })).slice(-k).reverse().map(({ l, m }) => ({
    n: m?.t ?? null, team: m?.team ?? null,
    text: l.replace(/^[^\p{L}\p{N}«(]+/u, '').replace(/ ход №\d+:/, ' ход:').trim(),
  }));
}

// v0.5.19: бесплатный Cloudflare Worker — статус сервера и сроки очистки комнат.
export const FREE_NOTE = 'Тестовая версия на Cloudflare Workers. Неактивные комнаты удаляются через 24 часа, законченные партии — через час.';
export const FREE_SHORT = 'Тестовая версия на бесплатном Cloudflare Workers. Неактивные комнаты удаляются через 24 часа, законченные партии — через час.';
export function wakeStatus(phase, sec = 0) {
  const t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  return phase === 'wait' ? `Проверяем сервер… ${t}` : phase === 'ok' ? 'Сервер готов — можно играть онлайн' : phase === 'fail' ? 'Сервер не ответил. Попробуйте ещё раз позже.' : '';
}
