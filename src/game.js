// Логика игры «Шакал» — без DOM. Состояние — простой JSON-сериализуемый объект.
export const N = 13; // 11x11 остров + рамка моря
export const TEAMS = [
  { name: 'Белые', color: '#f4f4f4', ship: [6, 12], axis: 'x', front: [0, -1] },
  { name: 'Жёлтые', color: '#f2c200', ship: [0, 6], axis: 'y', front: [1, 0] },
  { name: 'Чёрные', color: '#222', ship: [6, 0], axis: 'x', front: [0, 1] },
  { name: 'Красные', color: '#d22', ship: [12, 6], axis: 'y', front: [-1, 0] },
];
export const SPIN = { spin2: 2, spin3: 3, spin4: 4, spin5: 5 };
export const ARROWS = {
  arrow1: [[0, -1]], arrow1d: [[1, -1]], arrow2: [[0, -1], [0, 1]], arrow2d: [[1, -1], [-1, 1]],
  arrow3: [[-1, -1], [1, 0], [0, 1]], arrow4: [[0, -1], [1, 0], [0, 1], [-1, 0]], arrow4d: [[1, -1], [1, 1], [-1, 1], [-1, -1]],
};
export const CHEST = { chest1: 1, chest2: 2, chest3: 3, chest4: 4, chest5: 5 };
export const RUM = { rum1: 1, rum2: 2, rum3: 3 };
// Набор 117 клеток. Нереализованные клетки (16 шт.) заменены пустыми — см. README.
export const DECK = {
  empty: 18 + 16, horse: 2, spin2: 5, spin3: 4, spin4: 2, spin5: 1, ice: 6, trap: 3, croc: 4, ogre: 1,
  fort: 2, abor: 1, chest1: 5, chest2: 5, chest3: 3, chest4: 2, chest5: 1, plane: 1, balloon: 2, cannon: 2,
  barrel: 4, rum1: 3, rum2: 2, rum3: 1,
  arrow1: 3, arrow1d: 3, arrow2: 3, arrow2d: 3, arrow3: 3, arrow4: 3, arrow4d: 3,
};
export const KINDS = new Set([...Object.keys(DECK), 'arrow']);
export const MODES = { '2p': '1 на 1, классика (по 2 команды)', '1v1': '1 на 1, по одному кораблю', '2v2': '4 игрока, 2 на 2', '4p': '4 игрока, каждый за себя' };
export const UI_MODES = ['2p', '1v1'];
export const FORMAT_VERSION = 2;
export const activeTeams = mode => mode === '1v1' ? [0, 2] : [0, 1, 2, 3];

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const isIsland = (x, y) => x >= 1 && x <= 11 && y >= 1 && y <= 11 && !((x === 1 || x === 11) && (y === 1 || y === 11));
export const inGrid = (x, y) => x >= 0 && x < N && y >= 0 && y < N;
export const isSea = (x, y) => inGrid(x, y) && !isIsland(x, y);
const key = (x, y) => x + ',' + y;
const rot = ([dx, dy]) => [-dy, dx];
const turn = (ds, k) => { for (let i = 0; i < ((k % 4) + 4) % 4; i++) ds = ds.map(rot); return ds; };
// Поворот (в четвертях по часовой) для отрисовки стрелки/пушки, если dirs совпадают с базовым видом.
export function tileRotation(t) { const base = t.kind === 'cannon' ? [[0, -1]] : ARROWS[t.arrow]; if (!base) return null; const sig = d => d.map(v => v.join()).sort().join(';'); for (let k = 0; k < 4; k++) if (sig(turn(base, k)) === sig(t.dirs)) return k; return null; }
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const NB = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function playerOf(state, team) { return state.mode === '2p' ? team % 2 : state.mode === '1v1' ? team / 2 : team; }
export function playersCount(s) { return s.mode === '2p' || s.mode === '1v1' ? 2 : 4; }
export function teamsOfPlayer(s, pl) { return activeTeams(s.mode).filter(t => playerOf(s, t) === pl); }
export function allied(state, a, b) { return a === b || (state.mode !== '4p' && state.mode !== '1v1' && a % 2 === b % 2); }
export function sideOf(state, team) { return state.mode === '4p' ? team : state.mode === '1v1' ? team / 2 : team % 2; }

export const DEFAULT_OPTIONS = { houseCrocDeath: false }; // houseCrocDeath — домашнее правило: цепочка на открытого крокодила убивает
export function newGame({ mode = '2p', seed = Date.now(), options = {} } = {}) {
  const r = rng(seed);
  const deck = [];
  for (const [k, n] of Object.entries(DECK)) for (let i = 0; i < n; i++) deck.push(k);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const tiles = {};
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isIsland(x, y)) {
    let kind = deck.pop(); const t = { kind, open: false, coins: 0 };
    if (ARROWS[kind]) { let d = ARROWS[kind]; const k = Math.floor(r() * 4); for (let i = 0; i < k; i++) d = d.map(rot); t.kind = 'arrow'; t.arrow = kind; t.rot = k; t.dirs = d; }
    if (kind === 'cannon') { let d = [0, -1]; const k = Math.floor(r() * 4); for (let i = 0; i < k; i++) d = rot(d); t.dirs = [d]; t.rot = k; }
    tiles[key(x, y)] = t;
  }
  const pirates = [];
  TEAMS.forEach((T, team) => { if (activeTeams(mode).includes(team)) for (let i = 0; i < 3; i++) pirates.push({ id: pirates.length, team, x: T.ship[0], y: T.ship[1], alive: true, spin: 0, trapped: false, drunkUntil: 0 }); });
  return { version: FORMAT_VERSION, seed, mode, turn: 0, current: 0, options: { ...DEFAULT_OPTIONS, ...options }, pending: null, endReason: null, moves: [], tiles, ships: TEAMS.map(T => ({ x: T.ship[0], y: T.ship[1] })), pirates, score: [0, 0, 0, 0], rum: [0, 0, 0, 0], lost: 0, over: false, log: [] };
}

export const tileAt = (s, x, y) => s.tiles[key(x, y)];
export const shipAt = (s, x, y) => s.ships.findIndex((sh, i) => sh.x === x && sh.y === y && activeTeams(s.mode).includes(i));
export const cloneState = s => JSON.parse(JSON.stringify(s));
export const onShip = (s, p) => p.alive && s.ships[p.team].x === p.x && s.ships[p.team].y === p.y;
const here = (s, x, y) => s.pirates.filter(p => p.alive && p.x === x && p.y === y);

function landTargets(s, p) {
  const t = tileAt(s, p.x, p.y);
  if (SPIN[t.kind] && p.spin < SPIN[t.kind]) return [[p.x, p.y, 'spin']];
  if (t.kind === 'arrow') return t.dirs.map(([dx, dy]) => [p.x + dx, p.y + dy, 'arrow']);
  if (t.kind === 'horse') return KNIGHT.map(([dx, dy]) => [p.x + dx, p.y + dy, 'horse']).filter(([x, y]) => inGrid(x, y));
  if (t.kind === 'plane' && !t.used) { const out = []; for (const k in s.tiles) { const [x, y] = k.split(',').map(Number); if (x !== p.x || y !== p.y) out.push([x, y, 'plane']); }
    s.ships.forEach((sh, i) => { if (activeTeams(s.mode).includes(i) && allied(s, i, p.team)) out.push([sh.x, sh.y, 'plane']); }); // самолёт может доставить на свой корабль
    return out; }
  return NB.map(([dx, dy]) => [p.x + dx, p.y + dy, 'step']).filter(([x, y]) => inGrid(x, y));
}

export function pirateMoves(s, p) {
  if (!p.alive || p.team !== s.current || s.over) return [];
  if (s.pending && s.pending.pid !== p.id) return [];
  if (!s.pending && s.turn < p.drunkUntil) return [];
  let rum = false;
  if (p.trapped && !s.pending) { if (s.rum[p.team] > 0) rum = true; else return []; }
  const out = [];
  const add = (x, y, via, coin) => out.push({ type: 'move', pid: p.id, x, y, via, coin, ...(rum ? { rum: true } : {}) });
  if (onShip(s, p)) { const f = TEAMS[p.team].front; add(p.x + f[0], p.y + f[1], 'land', false); return out; }
  if (!isIsland(p.x, p.y)) { // плывёт
    for (const [dx, dy] of NB) { const x = p.x + dx, y = p.y + dy; if (!isSea(x, y)) continue; const sh = shipAt(s, x, y); if (sh >= 0 && !allied(s, sh, p.team)) continue; add(x, y, 'swim', false); }
    return out;
  }
  const cell = tileAt(s, p.x, p.y);
  const forced = cell.kind === 'arrow' || cell.kind === 'horse';
  for (const [x, y, via] of landTargets(s, p)) {
    for (const coin of s.pending ? [s.pending.coin] : p.carry ? (via === 'spin' ? [true] : [true, false]) : cell.coins > 0 && via !== 'spin' ? [false, true] : [false]) {
      if (isSea(x, y)) {
        const sh = shipAt(s, x, y);
        if (sh >= 0) { if (!allied(s, sh, p.team)) continue; }
        else if (!forced) continue;
        add(x, y, via, coin); continue;
      }
      if (via === 'spin') { const en = here(s, x, y).filter(q => !allied(s, q.team, p.team) && q.spin === p.spin + 1); if (en.length && coin) continue; add(x, y, via, coin); continue; }
      const t = tileAt(s, x, y);
      const enemies = here(s, x, y).filter(q => !allied(s, q.team, p.team));
      if (coin && (!t.open || t.kind === 'fort' || t.kind === 'abor')) continue;
      if (enemies.length && t.open && (t.kind === 'fort' || t.kind === 'abor')) continue;
      if (coin && enemies.length && !(t.open && SPIN[t.kind]) && !s.pending) continue;
      add(x, y, via, coin);
    }
  }
  return out;
}

export function legalMoves(s) {
  if (s.over) return [];
  const team = s.current, out = [];
  for (const p of s.pirates) if (p.team === team) out.push(...pirateMoves(s, p));
  const sh = s.ships[team], T = TEAMS[team];
  if (!s.pending && here(s, sh.x, sh.y).some(p => p.team === team)) for (const d of [-1, 1]) {
    const x = sh.x + (T.axis === 'x' ? d : 0), y = sh.y + (T.axis === 'y' ? d : 0);
    const v = T.axis === 'x' ? x : y; if (v >= 2 && v <= 10) out.push({ type: 'ship', dir: d, x, y });
  }
  if (s.pending) return out;
  const dead = s.pirates.filter(p => p.team === team && !p.alive);
  const alive = s.pirates.filter(p => p.team === team && p.alive);
  if (dead.length && alive.length < 3) { const healer = alive.find(p => isIsland(p.x, p.y) && tileAt(s, p.x, p.y).kind === 'abor'); if (healer) out.push({ type: 'revive', pid: dead[0].id, x: healer.x, y: healer.y }); }
  return out;
}

function msg(s, text) { s.log.push(text); if (s.log.length > 200) s.log.shift(); }
const pname = p => `${TEAMS[p.team].name[0]}${p.id % 3 + 1}`;
function dropCarry(s, p) { if (!p.carry) return; p.carry = false; if (p.x != null && isIsland(p.x, p.y)) tileAt(s, p.x, p.y).coins++; else s.lost++; }
function die(s, p, why) { dropCarry(s, p); p.alive = false; p.x = p.y = null; p.spin = 0; p.trapped = false; msg(s, `☠ ${pname(p)}: ${why}`); }
function toShip(s, p) { dropCarry(s, p); const sh = s.ships[p.team]; p.x = sh.x; p.y = sh.y; p.spin = 0; p.trapped = false; }
function reveal(s, t, p) {
  if (t.open) return; t.open = true;
  if (CHEST[t.kind]) t.coins += CHEST[t.kind];
  if (RUM[t.kind]) { s.rum[p.team] += RUM[t.kind]; msg(s, `🍾 ${TEAMS[p.team].name}: +${RUM[t.kind]} рома`); }
}
function deliver(s, team, coin) { if (coin) { s.score[team]++; msg(s, `💰 ${TEAMS[team].name}: монета на корабле`); } }

// Перемещение пирата с цепочкой эффектов клеток.
function walk(s, p, x, y, via, coin) {
  const origin = s.pending ? s.pending.origin : [p.x, p.y];
  const visits = s.pending ? { ...s.pending.visits } : {};
  const origSpin = p.spin; p.spin = 0;
  s.pending = null;
  let from = [p.x, p.y], delta = [x - p.x, y - p.y];
  const cycleDeath = () => { if (coin) s.lost++; die(s, p, 'попал в цикл'); };
  for (let step = 0; ; step++) {
    if (!inGrid(x, y)) { x = Math.max(0, Math.min(N - 1, x)); y = Math.max(0, Math.min(N - 1, y)); }
    // защита от циклов: больше двух заходов в одну клетку за ход — гибель
    const vk = key(x, y); visits[vk] = (visits[vk] || 0) + 1;
    if (visits[vk] > 2) return cycleDeath();
    const inChain = step > 0 || Object.keys(visits).length > 1;
    if (isSea(x, y)) {
      const sh = shipAt(s, x, y);
      if (sh >= 0) { if (allied(s, sh, p.team)) { p.x = x; p.y = y; p.spin = 0; deliver(s, sh, coin); } else { if (coin) s.lost++; die(s, p, 'вражеский корабль'); } return; }
      for (const q of here(s, x, y)) if (!allied(s, q.team, p.team)) die(s, q, 'убит в воде');
      if (coin) { s.lost++; msg(s, '🌊 монета утонула'); }
      p.x = x; p.y = y; p.spin = 0; return;
    }
    const t = tileAt(s, x, y);
    if (t.kind === 'croc' && t.open && inChain && s.options?.houseCrocDeath) { if (coin) s.lost++; die(s, p, 'цепочка привела на открытого крокодила'); return; }
    reveal(s, t, p);
    const next = (nx, ny) => { delta = [nx - x, ny - y]; from = [x, y]; x = nx; y = ny; };
    if (t.kind === 'arrow' && t.dirs.length === 1) { next(x + t.dirs[0][0], y + t.dirs[0][1]); continue; }
    if (t.kind === 'ice') { next(x + delta[0], y + delta[1]); continue; }
    if (t.kind === 'cannon') { const [dx, dy] = t.dirs[0]; let nx = x, ny = y; do { nx += dx; ny += dy; } while (isIsland(nx, ny)); next(nx, ny); continue; }
    if (t.kind === 'croc') {
      [x, y] = origin; p.x = x; p.y = y; if (isIsland(x, y) && SPIN[tileAt(s, x, y).kind]) p.spin = origSpin; msg(s, `🐊 ${pname(p)} вернулся назад`);
      if (isIsland(x, y)) { if (coin && SPIN[tileAt(s, x, y).kind] && origSpin) p.carry = true; else if (coin) tileAt(s, x, y).coins++; } else if (coin) { const sh = shipAt(s, x, y); if (sh >= 0) deliver(s, sh, true); else s.lost++; }
      return;
    }
    if (t.kind === 'ogre') { if (coin) t.coins++; die(s, p, 'съеден людоедом'); return; }
    if ((t.kind === 'arrow' && t.dirs.length > 1) || t.kind === 'horse') {
      p.x = x; p.y = y; p.spin = 0;
      s.pending = { pid: p.id, coin, origin, visits }; return; // выбор направления в этот же ход
    }
    if (t.kind === 'balloon') { toShip(s, p); deliver(s, p.team, coin); msg(s, `🎈 ${pname(p)} улетел на корабль`); return; }
    // остановка на клетке
    const spinStep = via === 'spin' ? origSpin + 1 : (SPIN[t.kind] ? 1 : 0);
    p.x = x; p.y = y; p.spin = spinStep;
    for (const q of here(s, x, y)) if (q !== p && !allied(s, q.team, p.team) && (!SPIN[t.kind] || q.spin === spinStep)) { toShip(s, q); msg(s, `⚔ ${pname(p)} отправил ${pname(q)} на корабль`); }
    const friends = here(s, x, y).filter(q => q !== p && allied(s, q.team, p.team));
    friends.forEach(q => q.trapped = false);
    if (t.kind === 'trap') p.trapped = friends.length === 0 && via !== 'spin';
    if (t.kind === 'barrel') p.drunkUntil = s.turn + 4 + 1;
    if (coin) { if (SPIN[t.kind]) p.carry = true; else t.coins++; } // на вертушке монета едет «в руках»
    return;
  }
}

// Чистая функция: возвращает новое состояние, исходное не меняется.
export function applyMove(s0, m, { asPlayer = null } = {}) {
  if (s0.over) throw new Error('Игра окончена');
  if (asPlayer != null && playerOf(s0, s0.current) !== asPlayer) throw new Error('Сейчас ход другого игрока');
  const s = cloneState(s0);
  const ok = legalMoves(s).some(l => JSON.stringify(l) === JSON.stringify(m));
  if (!ok) throw new Error('Недопустимый ход');
  const team = s.current;
  if (m.type === 'ship') {
    const sh = s.ships[team], ox = sh.x, oy = sh.y;
    for (const q of here(s, m.x, m.y)) if (!allied(s, q.team, team)) die(s, q, 'раздавлен кораблём'); // свои/союзные пловцы просто оказываются на корабле
    for (const q of here(s, ox, oy)) if (q.team === team) { q.x = m.x; q.y = m.y; }
    sh.x = m.x; sh.y = m.y;
  } else if (m.type === 'revive') {
    const p = s.pirates[m.pid]; p.alive = true; p.x = m.x; p.y = m.y; p.spin = 0; p.trapped = false; p.drunkUntil = 0; msg(s, `❤ ${pname(p)} воскрес`);
  } else {
    const p = s.pirates[m.pid];
    if (m.rum) { s.rum[team]--; p.trapped = false; msg(s, `🍾 ${pname(p)} выпил ром и выбрался`); }
    const cont = !!s.pending;
    if (isIsland(p.x, p.y) && !cont) { const t = tileAt(s, p.x, p.y); if (t.kind === 'plane' && !t.used && m.via === 'plane') t.used = true; if (p.carry) { p.carry = false; if (!m.coin) t.coins++; } else if (m.coin) t.coins--; }
    if (m.via === 'spin') { const t = tileAt(s, p.x, p.y); walk(s, p, p.x, p.y, 'spin', m.coin); void t; }
    else walk(s, p, m.x, m.y, m.via, m.coin);
  }
  s.moves.push({ n: s.moves.length + 1, team, ...m });
  endTurn(s);
  return s;
}

export function coinsLeft(s) { let n = (s.pending?.coin ? 1 : 0) + s.pirates.filter(p => p.alive && p.carry).length; for (const t of Object.values(s.tiles)) n += t.coins + (!t.open && CHEST[t.kind] ? CHEST[t.kind] : 0); return n; }

export const END_REASONS = { majority: 'больше половины всех монет', allCoins: 'все монеты разыграны', noPirates: 'не осталось живых пиратов', noMoves: 'ни у кого нет ходов — ничья', noShips: 'не осталось кораблей' };
export const TOTAL_COINS = 37;
function finish(s, reason) { s.over = true; s.endReason = reason; s.pending = null; msg(s, '🏁 ' + END_REASONS[reason]); }
// Пират временно пропускает ход (бочонок), значит позже у него появятся ходы.
const waiting = s => s.pirates.some(p => p.alive && activeTeams(s.mode).includes(p.team) && p.drunkUntil >= s.turn);

function endTurn(s) {
  if (s.pending) {
    const p = s.pirates[s.pending.pid];
    if (!legalMoves(s).length && s.pending.coin) { s.pending.coin = false; tileAt(s, p.x, p.y).coins++; }
    if (legalMoves(s).length) return; // тот же игрок доигрывает ход
    s.pending = null; die(s, p, 'некуда идти');
  }
  s.turn++;
  const sc = sideScores(s);
  if (Object.values(sc).some(v => v * 2 > TOTAL_COINS)) return finish(s, 'majority');
  if (coinsLeft(s) === 0 && (s.score.some(v => v > 0) || s.lost > 0)) return finish(s, 'allCoins');
  const act = activeTeams(s.mode);
  if (!s.pirates.some(p => p.alive && act.includes(p.team))) return finish(s, 'noPirates');
  let passes = 0;
  for (let i = 0; i < 400; i++) {
    s.current = act[(act.indexOf(s.current) + 1) % act.length];
    if (legalMoves(s).length) return;
    if (++passes >= act.length && !waiting(s)) return finish(s, 'noMoves'); // полный круг без ходов
    s.turn++; // команда без ходов пропускает ход
  }
  finish(s, 'noMoves');
}

export function sideScores(s) {
  const out = {}; s.score.forEach((v, t) => { if (!activeTeams(s.mode).includes(t)) return; const k = sideOf(s, t); out[k] = (out[k] || 0) + v; }); return out;
}
export function winner(s) {
  if (!s.over) return null;
  if (s.endReason === 'noMoves') return Object.keys(sideScores(s)).map(Number); // ничья
  const sc = sideScores(s); const best = Math.max(...Object.values(sc));
  return Object.keys(sc).filter(k => sc[k] === best).map(Number);
}
export function sideName(s, side) { return s.mode === '4p' ? TEAMS[side].name : s.mode === '1v1' ? `Игрок ${side + 1} (${TEAMS[side * 2].name})` : side === 0 ? (s.mode === '2p' ? 'Игрок 1 (Белые+Чёрные)' : 'Белые+Чёрные') : (s.mode === '2p' ? 'Игрок 2 (Жёлтые+Красные)' : 'Жёлтые+Красные'); }

// ---------- сохранение / загрузка ----------
export function serialize(s) { return JSON.stringify(s, null, 1); }

export function loadState(text) {
  let raw;
  try { raw = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { throw new Error('Файл не является корректным JSON: ' + e.message); }
  const err = m => { throw new Error('Ошибка в позиции: ' + m); };
  if (!raw || typeof raw !== 'object') err('ожидался объект');
  const mode = raw.mode ?? '2p'; if (!MODES[mode]) err(`mode должен быть одним из ${Object.keys(MODES).join(', ')}`);
  if (raw.version != null && raw.version > FORMAT_VERSION) err(`версия формата ${raw.version} новее поддерживаемой (${FORMAT_VERSION})`);
  const s = { version: FORMAT_VERSION, seed: raw.seed ?? null, pending: raw.pending ?? null, moves: Array.isArray(raw.moves) ? raw.moves : [], log: Array.isArray(raw.log) ? raw.log : [], mode, turn: raw.turn ?? 0, current: raw.current ?? 0, tiles: {}, ships: [], pirates: [], score: raw.score ?? [0, 0, 0, 0], rum: raw.rum ?? [0, 0, 0, 0], lost: raw.lost ?? 0, over: !!raw.over, endReason: raw.endReason ?? null, options: { ...DEFAULT_OPTIONS } };
  if (raw.options != null) { if (typeof raw.options !== 'object') err('options — объект'); for (const [k, v] of Object.entries(raw.options)) { if (!(k in DEFAULT_OPTIONS)) err(`неизвестная опция "${k}"`); if (typeof v !== 'boolean') err(`опция ${k} должна быть true/false`); s.options[k] = v; } }
  if (!activeTeams(mode).includes(s.current)) err('current: эта команда не участвует в режиме');
  if (![0, 1, 2, 3].includes(s.current)) err('current должен быть 0..3');
  for (const f of ['score', 'rum']) if (!Array.isArray(s[f]) || s[f].length !== 4 || s[f].some(v => !Number.isInteger(v) || v < 0)) err(`${f} — массив из 4 неотрицательных целых`);
  const def = raw.defaultTile ?? { kind: 'empty', open: true };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isIsland(x, y)) s.tiles[key(x, y)] = { kind: def.kind, open: def.open ?? true, coins: 0 };
  for (const [k, t] of Object.entries(raw.tiles ?? {})) {
    const m = /^(\d+),(\d+)$/.exec(k); if (!m) err(`ключ клетки "${k}" должен быть вида "x,y"`);
    const x = +m[1], y = +m[2]; if (!isIsland(x, y)) err(`клетка ${k} не на острове (x,y от 1 до 11, без углов)`);
    if (!t || typeof t !== 'object') err(`клетка ${k}: ожидался объект`);
    const kind = t.kind ?? 'empty';
    if (!KINDS.has(kind)) err(`клетка ${k}: неизвестный kind "${kind}"`);
    const tile = { kind, open: t.open ?? true, coins: t.coins ?? 0 };
    if (!Number.isInteger(tile.coins) || tile.coins < 0) err(`клетка ${k}: coins — неотрицательное целое`);
    if (ARROWS[kind]) { tile.kind = 'arrow'; tile.arrow = kind; tile.rot = t.rot ?? 0; tile.dirs = t.dirs ?? turn(ARROWS[kind], tile.rot); }
    if (kind === 'arrow') { tile.arrow = t.arrow ?? 'custom'; tile.rot = t.rot ?? 0; tile.dirs = t.dirs ?? (ARROWS[tile.arrow] && turn(ARROWS[tile.arrow], tile.rot)); }
    if (kind === 'cannon') tile.rot = t.rot ?? 0;
    if (kind === 'cannon') tile.dirs = t.dirs ?? turn([[0, -1]], tile.rot);
    if (tile.dirs && (!Array.isArray(tile.dirs) || !tile.dirs.length || tile.dirs.some(d => !Array.isArray(d) || d.length !== 2 || d.some(v => ![-1, 0, 1].includes(v)) || (d[0] === 0 && d[1] === 0)))) err(`клетка ${k}: dirs — массив направлений [dx,dy] из -1/0/1`);
    if (t.used) tile.used = true;
    s.tiles[k] = tile;
  }
  const ships = raw.ships ?? TEAMS.map(T => ({ x: T.ship[0], y: T.ship[1] }));
  if (!Array.isArray(ships) || ships.length !== 4) err('ships — массив из 4 кораблей');
  ships.forEach((sh, i) => {
    const T = TEAMS[i]; const fixed = T.axis === 'x' ? 'y' : 'x', mov = T.axis;
    if (sh?.[fixed] !== T.ship[fixed === 'x' ? 0 : 1] || !(sh[mov] >= 2 && sh[mov] <= 10)) err(`корабль ${T.name}: должен стоять на своей стороне, ${mov} от 2 до 10`);
    s.ships.push({ x: sh.x, y: sh.y });
  });
  if (!Array.isArray(raw.pirates)) err('pirates — обязательный массив');
  const count = [0, 0, 0, 0];
  raw.pirates.forEach((p, i) => {
    if (![0, 1, 2, 3].includes(p?.team)) err(`пират #${i}: team 0..3`);
    if (++count[p.team] > 3) err(`у команды ${TEAMS[p.team].name} больше 3 пиратов`);
    const alive = p.alive ?? true;
    let x = p.x, y = p.y;
    if (p.onShip) { x = s.ships[p.team].x; y = s.ships[p.team].y; }
    if (!activeTeams(mode).includes(p.team)) err(`пират #${i}: команда ${TEAMS[p.team].name} не участвует в режиме ${mode}`);
    if (alive && !(Number.isInteger(x) && Number.isInteger(y) && inGrid(x, y))) err(`пират #${i}: координаты x,y 0..12 (или onShip: true)`);
    if (alive && isSea(x, y)) { const sh = shipAt(s, x, y); if (sh >= 0 && !allied(s, sh, p.team)) err(`пират #${i} стоит на вражеском корабле`); }
    s.pirates.push({ id: 0, team: p.team, x: alive ? x : null, y: alive ? y : null, alive, spin: p.spin ?? 0, trapped: !!p.trapped, drunkUntil: p.drunkUntil ?? 0, carry: !!p.carry });
  });
  for (const t of activeTeams(mode)) while (count[t]++ < 3) s.pirates.push({ id: 0, team: t, x: null, y: null, alive: false, spin: 0, trapped: false, drunkUntil: 0 });
  s.pirates.sort((a, b) => a.team - b.team); s.pirates.forEach((p, i) => p.id = i);
  return s;
}

// Классификация легальных ходов для подсветки: 'death' — ход (с учётом цепочки) убивает пирата,
// 'coin' — монета попадает на корабль, иначе 'move'. Считается пробным применением хода к копии.
export function classifyMoves(s) {
  return legalMoves(s).map(m => {
    let kind = 'move';
    try {
      const n = applyMove(s, m);
      if (m.pid != null && !n.pirates[m.pid].alive) kind = 'death';
      else if (n.score.reduce((a, b) => a + b, 0) > s.score.reduce((a, b) => a + b, 0)) kind = 'coin';
      else if (n.lost > s.lost) kind = 'coinLost'; // пират плывёт, монета тонет (jackal.su: «Если пират попал в море с монетой, она тонет. Пират остаётся на плаву.»)
    } catch { kind = 'death'; }
    return { ...m, kind };
  });
}
