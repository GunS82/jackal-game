// Чистые функции представления (без DOM): заголовок, статус и состояние кнопок. Покрыты тестами.
import * as G from './game.js';

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
