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
export const CHARACTERS = { bengunn: 'Бен Ганн', friday: 'Пятница', missionary: 'Миссионер' };
export const TREASURE_VALUE = 3; // сокровище галеона = 3 монеты
// Набор 117 клеток классического «Острова сокровищ» (jackal.su/rules/all). Пещеры (4) раскладываются отдельно — по одной на четверть.
export const DECK = {
  empty: 18, cave: 4, quake: 1, jungle: 3, grass: 2, caramba: 1, lighthouse: 1, bengunn: 1, missionary: 1, friday: 1, galleon: 1, horse: 2, spin2: 5, spin3: 4, spin4: 2, spin5: 1, ice: 6, trap: 3, croc: 4, ogre: 1,
  fort: 2, abor: 1, chest1: 5, chest2: 5, chest3: 3, chest4: 2, chest5: 1, plane: 1, balloon: 2, cannon: 2,
  barrel: 4, rum1: 3, rum2: 2, rum3: 1,
  arrow1: 3, arrow1d: 3, arrow2: 3, arrow2d: 3, arrow3: 3, arrow4: 3, arrow4d: 3,
};
export const KINDS = new Set([...Object.keys(DECK), 'arrow']);
export const MODES = { '2p': '1 на 1, классика (по 2 команды)', '1v1': '1 на 1, по одному кораблю', '2v2': '4 игрока, 2 на 2', '4p': '4 игрока, каждый за себя' };
export const UI_MODES = ['2p', '1v1'];
export const FORMAT_VERSION = 3; // v3: сокровище, персонажи, пещеры, маяк, землетрясение, трава (v2 читается)
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
  for (const [k, n] of Object.entries(DECK)) if (k !== 'cave') for (let i = 0; i < n; i++) deck.push(k);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  // пещеры: по одной в каждой четверти острова (средние ряд и столбец 6 не входят)
  const caves = new Set();
  for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const cells = []; for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) { const cx = x + qx * 6, cy = y + qy * 6; if (isIsland(cx, cy)) cells.push(key(cx, cy)); }
    caves.add(cells[Math.floor(r() * cells.length)]);
  }
  const tiles = {};
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isIsland(x, y)) {
    let kind = caves.has(key(x, y)) ? 'cave' : deck.pop(); const t = { kind, open: false, coins: 0 };
    if (ARROWS[kind]) { let d = ARROWS[kind]; const k = Math.floor(r() * 4); for (let i = 0; i < k; i++) d = d.map(rot); t.kind = 'arrow'; t.arrow = kind; t.rot = k; t.dirs = d; }
    if (kind === 'cannon') { let d = [0, -1]; const k = Math.floor(r() * 4); for (let i = 0; i < k; i++) d = rot(d); t.dirs = [d]; t.rot = k; }
    tiles[key(x, y)] = t;
  }
  const pirates = [];
  TEAMS.forEach((T, team) => { if (activeTeams(mode).includes(team)) for (let i = 0; i < 3; i++) pirates.push({ id: pirates.length, team, x: T.ship[0], y: T.ship[1], alive: true, spin: 0, trapped: false, drunkUntil: 0 }); });
  return { version: FORMAT_VERSION, seed, mode, turn: 0, grass: 0, current: 0, options: { ...DEFAULT_OPTIONS, ...options }, pending: null, endReason: null, moves: [], tiles, ships: TEAMS.map(T => ({ x: T.ship[0], y: T.ship[1] })), pirates, score: [0, 0, 0, 0], rum: [0, 0, 0, 0], lost: 0, over: false, log: [] };
}

export const tileAt = (s, x, y) => s.tiles[key(x, y)];
export const shipAt = (s, x, y) => s.ships.findIndex((sh, i) => sh.x === x && sh.y === y && activeTeams(s.mode).includes(i));
export const cloneState = s => JSON.parse(JSON.stringify(s));
export const onShip = (s, p) => p.alive && s.ships[p.team].x === p.x && s.ships[p.team].y === p.y;
// Кто стоит на поверхности клетки (пираты внутри пещеры не участвуют в бою).
const here = (s, x, y) => s.pirates.filter(p => p.alive && !p.inCave && p.x === x && p.y === y);
export const isFighter = p => !p.role || p.role === 'bengunn' || p.role === 'exmissionary'; // «персонажи, способные сражаться»
const val = (coin, treasure) => treasure ? TREASURE_VALUE : coin ? 1 : 0;
function put(t, v) { if (v === TREASURE_VALUE) t.treasure = (t.treasure || 0) + 1; else if (v) t.coins += v; }
export const openCaves = s => Object.entries(s.tiles).filter(([, t]) => t.kind === 'cave' && t.open).map(([k]) => k.split(',').map(Number));
// Чей игрок командует текущей командой (трава: каждый ходит пиратами своего соседа).
export function controllerOf(s, team = s.current) {
  if (!s.grass) return playerOf(s, team);
  const act = activeTeams(s.mode); return playerOf(s, act[(act.indexOf(team) + 1) % act.length]);
}
const caveExits = (s, p) => openCaves(s).filter(([x, y]) => !(x === p.x && y === p.y) && !here(s, x, y).some(q => !allied(s, q.team, p.team)));
const quakeCells = s => Object.keys(s.tiles).filter(k => { const t = s.tiles[k]; const [x, y] = k.split(',').map(Number); return !t.coins && !t.treasure && !s.pirates.some(p => p.alive && p.x === x && p.y === y); });

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
  if (s.pending?.type && s.pending.type !== 'cave') return [];
  if (!s.pending && s.turn < p.drunkUntil) return [];
  let rum = false;
  if (p.trapped && !s.pending) { if (s.rum[p.team] > 0 && !s.grass) rum = true; else return []; } // чужим ромом командовать нельзя
  const out = [];
  const add = (x, y, via, coin, treasure) => out.push({ type: 'move', pid: p.id, x, y, via, coin, ...(treasure ? { treasure: true } : {}), ...(rum ? { rum: true } : {}) });
  // пещера: выбор выхода (сразу после входа или позже, если пират ждёт внутри)
  if (s.pending?.type === 'cave' || p.inCave) {
    const c = s.pending?.type === 'cave' ? [s.pending.coin, s.pending.treasure] : [!!p.carry, p.carry === TREASURE_VALUE];
    for (const [x, y] of caveExits(s, p)) add(x, y, 'cave', c[0], c[1]);
    return out;
  }
  if (onShip(s, p)) { const f = TEAMS[p.team].front; add(p.x + f[0], p.y + f[1], 'land', false); return out; }
  if (!isIsland(p.x, p.y)) { // плывёт
    for (const [dx, dy] of NB) { const x = p.x + dx, y = p.y + dy; if (!isSea(x, y)) continue; const sh = shipAt(s, x, y); if (sh >= 0 && !allied(s, sh, p.team)) continue; add(x, y, 'swim', false); }
    return out;
  }
  const cell = tileAt(s, p.x, p.y);
  const forced = cell.kind === 'arrow' || cell.kind === 'horse';
  const calm = here(s, p.x, p.y).some(q => q !== p && q.role === 'missionary'); // рядом с миссионером атаковать нельзя
  for (const [x, y, via] of landTargets(s, p)) {
    const list = s.pending ? [[s.pending.coin, !!s.pending.treasure]] : p.carry ? (via === 'spin' ? [[true, p.carry === TREASURE_VALUE]] : [[true, p.carry === TREASURE_VALUE], [false]]) : [[false]];
    if (!s.pending && !p.carry && via !== 'spin' && p.role !== 'missionary') { if (cell.coins > 0) list.push([true, false]); if (cell.treasure > 0) list.push([true, true]); }
    for (const [coin, treasure] of list) {
      if (isSea(x, y)) {
        const sh = shipAt(s, x, y);
        if (sh >= 0) { if (!allied(s, sh, p.team)) continue; }
        else if (!forced) continue;
        add(x, y, via, coin, treasure); continue;
      }
      if (via === 'spin') { const en = here(s, x, y).filter(q => !allied(s, q.team, p.team) && q.spin === p.spin + 1); if (en.length && coin) continue; add(x, y, via, coin, treasure); continue; }
      const t = tileAt(s, x, y);
      const all = here(s, x, y).filter(q => !allied(s, q.team, p.team));
      const jungle = t.open && t.kind === 'jungle';
      const enemies = jungle ? [] : all.filter(q => q.role !== 'missionary'); // в джунглях не сражаются
      if (coin && (!t.open || t.kind === 'fort' || t.kind === 'abor' || t.kind === 'jungle')) continue;
      if (enemies.length && t.open && (t.kind === 'fort' || t.kind === 'abor')) continue;
      if (coin && enemies.length && !(t.open && SPIN[t.kind]) && !s.pending) continue;
      if (!jungle && enemies.length && calm) continue; // рядом с миссионером атаковать нельзя
      if (!jungle && p.role !== 'friday' && all.some(q => q.role === 'missionary')) continue; // «Миссионер… сам не может быть атакован» — на его клетку враги не встают (кроме Пятницы — «встретит Пятницу»)
      if (p.role === 'missionary' && all.some(q => q.role !== 'friday') && !jungle) continue; // миссионер не заходит к врагам (встреча с Пятницей — можно)
      if (p.role === 'friday' && enemies.length) continue; // Пятница никого не атакует
      add(x, y, via, coin, treasure);
    }
  }
  return out;
}

export function legalMoves(s) {
  if (s.over) return [];
  const team = s.current, out = [];
  if (s.pending?.type === 'lighthouse') { for (const [k, t] of Object.entries(s.tiles)) if (!t.open) { const [x, y] = k.split(',').map(Number); out.push({ type: 'reveal', x, y }); } return out; }
  if (s.pending?.type === 'quake') { for (const k of quakeCells(s)) { if (k === s.pending.first) continue; const [x, y] = k.split(',').map(Number); out.push({ type: 'quake', x, y }); } return out; }
  for (const p of s.pirates) if (p.team === team) out.push(...pirateMoves(s, p));
  const sh = s.ships[team], T = TEAMS[team];
  if (!s.pending && here(s, sh.x, sh.y).some(p => p.team === team)) for (const d of [-1, 1]) {
    const x = sh.x + (T.axis === 'x' ? d : 0), y = sh.y + (T.axis === 'y' ? d : 0);
    const v = T.axis === 'x' ? x : y; if (v >= 2 && v <= 10) out.push({ type: 'ship', dir: d, x, y });
  }
  if (s.pending) return out;
  const dead = s.pirates.filter(p => p.team === team && !p.alive && !p.gone && isFighter(p));
  const alive = s.pirates.filter(p => p.team === team && p.alive);
  // аборигенка не воскрешает, если у вас 3 или более персонажей, способных сражаться
  if (dead.length && alive.filter(isFighter).length < 3) { const healer = alive.find(p => !p.inCave && isIsland(p.x, p.y) && tileAt(s, p.x, p.y).kind === 'abor'); if (healer) out.push({ type: 'revive', pid: dead[0].id, x: healer.x, y: healer.y }); }
  // ром местным жителям с соседней клетки (свободное действие, не тратит ход; чужим ромом при траве нельзя)
  if (s.rum[team] > 0 && !s.grass) for (const g of alive) { if (g.inCave || g.x == null) continue;
    for (const n of s.pirates) if (n.alive && !n.inCave && (n.role === 'friday' || n.role === 'missionary') && n !== g && Math.max(Math.abs(n.x - g.x), Math.abs(n.y - g.y)) <= 1 && !out.some(m => m.type === 'rum' && m.target === n.id)) out.push({ type: 'rum', pid: g.id, target: n.id, x: n.x, y: n.y }); }
  return out;
}

function msg(s, text) { s.log.push(text); if (s.log.length > 200) s.log.shift(); }
export function pieceName(s, p) {
  if (p.role === 'exmissionary') return `${TEAMS[p.team].name[0]}-экс-миссионер`;
  if (p.role) return `${CHARACTERS[p.role]} (${TEAMS[p.team].name})`;
  return `${TEAMS[p.team].name[0]}${s.pirates.filter(q => q.team === p.team && !q.role).indexOf(p) + 1}`;
}
const pname = (s, p) => pieceName(s, p);
function dropCarry(s, p) { if (!p.carry) return; const v = p.carry === true ? 1 : p.carry; p.carry = 0; if (p.x != null && isIsland(p.x, p.y)) put(tileAt(s, p.x, p.y), v); else s.lost += v; }
function die(s, p, why) { dropCarry(s, p); p.alive = false; p.x = p.y = null; p.spin = 0; p.trapped = false; p.inCave = false; if (!isFighter(p)) p.gone = true; msg(s, `☠ ${pname(s, p)}: ${why}`); }
function vanish(s, p, why) { dropCarry(s, p); p.alive = false; p.gone = true; p.x = p.y = null; p.spin = 0; p.trapped = false; p.inCave = false; msg(s, `✝ ${pname(s, p)}: ${why}`); }
function toShip(s, p) { dropCarry(s, p); const sh = s.ships[p.team]; p.x = sh.x; p.y = sh.y; p.spin = 0; p.trapped = false; p.inCave = false; }
// Переворот клетки: кладутся монеты/сокровище. Разовые эффекты (ром, персонажи, землетрясение, трава) — в effect().
function reveal(s, t) {
  if (t.open) return false; t.open = true;
  if (CHEST[t.kind]) t.coins += CHEST[t.kind];
  if (t.kind === 'galleon') t.treasure = (t.treasure || 0) + 1;
  return true;
}
function addPiece(s, role, team, x, y) { const q = { id: s.pirates.length, team, x, y, alive: true, spin: 0, trapped: false, drunkUntil: 0, carry: 0, role }; s.pirates.push(q); msg(s, `${role === 'bengunn' ? '🧔' : role === 'friday' ? '🧑' : '🙏'} ${CHARACTERS[role]} присоединился к команде ${TEAMS[team].name}`); return q; }
// Разовый эффект клетки для пирата, который её открыл (или первым встал на открытую маяком).
function effect(s, t, p, x, y) {
  if (RUM[t.kind]) {
    let n = RUM[t.kind];
    if (p.role === 'friday') { n--; s.rum[p.team] += n; vanish(s, p, 'выпил ром и вышел из игры'); return 'gone'; }
    if (p.role === 'missionary') { n--; p.role = 'exmissionary'; msg(s, '🍾 Миссионер выпил ром и стал пиратом'); }
    s.rum[p.team] += n; if (n) msg(s, `🍾 ${TEAMS[p.team].name}: +${n} рома`);
  }
  if (CHARACTERS[t.kind]) addPiece(s, t.kind, p.team, x, y);
  if (t.kind === 'grass') { s.grass = activeTeams(s.mode).length + 1; msg(s, '🔥 Трава горит: круг каждый ходит пиратами соседа'); }
  if (t.kind === 'caramba') msg(s, `🤬 ${pname(s, p)}: «Каррамба!»`);
  if (t.kind === 'quake' && quakeCells(s).length >= 2) { msg(s, '🌋 Землетрясение: поменяйте местами 2 пустые клетки'); return 'quake'; }
  return null;
}
function deliver(s, team, v) { if (v) { s.score[team] += v; msg(s, `💰 ${TEAMS[team].name}: ${v === TREASURE_VALUE ? 'сокровище (3 монеты)' : 'монета'} на корабле`); } }

// Перемещение пирата с цепочкой эффектов клеток. v — ценность груза: 0, 1 (монета) или 3 (сокровище).
function walk(s, p, x, y, via, v) {
  const origin = s.pending ? s.pending.origin : [p.x, p.y];
  const visits = s.pending ? { ...s.pending.visits } : {};
  const origSpin = p.spin; p.spin = 0;
  const calm = here(s, p.x, p.y).some(q => q !== p && q.role === 'missionary');
  const wasInCave = p.inCave; p.inCave = false;
  s.pending = null;
  let from = [p.x, p.y], delta = [x - p.x, y - p.y];
  const cycleDeath = () => { s.lost += v; die(s, p, 'попал в цикл'); };
  // остановка на клетке (бой, капкан, бочонок, монета, разовые эффекты)
  const stand = (x, y, t, fresh) => {
    const spinStep = via === 'spin' ? origSpin + 1 : (SPIN[t.kind] ? (p.role === 'friday' ? SPIN[t.kind] : 1) : 0); // Пятница проходит вертушку за один ход
    p.x = x; p.y = y; p.spin = spinStep;
    const others = here(s, x, y).filter(q => q !== p);
    const meet = p.role === 'friday' ? others.find(q => q.role === 'missionary') : p.role === 'missionary' ? others.find(q => q.role === 'friday') : null;
    if (meet) { put(t, v); vanish(s, meet, 'встретил ' + (p.role === 'friday' ? 'миссионера' : 'Пятницу') + ' и просветлился'); vanish(s, p, 'просветлился'); return; }
    if (t.kind !== 'jungle' && isFighter(p)) {
      const enemies = others.filter(q => !allied(s, q.team, p.team) && (!SPIN[t.kind] || q.spin === spinStep));
      if (!calm && !enemies.some(q => q.role === 'missionary')) for (const q of enemies) {
        if (q.role === 'friday') { dropCarry(s, q); q.team = p.team; msg(s, `🧑 Пятница перешёл к команде ${TEAMS[p.team].name}`); }
        else { toShip(s, q); msg(s, `⚔ ${pname(s, p)} отправил ${pname(s, q)} на корабль`); }
      }
    }
    const friends = here(s, x, y).filter(q => q !== p && allied(s, q.team, p.team));
    friends.forEach(q => q.trapped = false);
    if (t.kind === 'trap') p.trapped = friends.length === 0 && via !== 'spin' && p.role !== 'friday'; // Пятница не падает в ямы
    if (t.kind === 'barrel') p.drunkUntil = s.turn + 4 + 1;
    if (v) { if (SPIN[t.kind]) p.carry = v; else put(t, v); } // на вертушке груз едет «в руках»
    let ev = null;
    if (fresh || t.lit) { delete t.lit; ev = effect(s, t, p, x, y); }
    if (ev === 'quake') s.pending = { type: 'quake', pid: p.id, first: null };
    if (t.kind === 'lighthouse' && !t.used && p.alive) { t.used = true; const closed = Object.values(s.tiles).filter(c => !c.open).length; if (closed) { s.pending = { type: 'lighthouse', pid: p.id, left: Math.min(4, closed) }; msg(s, `🗼 ${pname(s, p)} на маяке: откройте ${s.pending.left} клетки`); } }
  };
  for (let step = 0; ; step++) {
    if (!inGrid(x, y)) { x = Math.max(0, Math.min(N - 1, x)); y = Math.max(0, Math.min(N - 1, y)); }
    // защита от циклов: больше двух заходов в одну клетку за ход — гибель
    const vk = key(x, y); visits[vk] = (visits[vk] || 0) + 1;
    if (visits[vk] > 2) return cycleDeath();
    const inChain = step > 0 || Object.keys(visits).length > 1;
    if (isSea(x, y)) {
      const sh = shipAt(s, x, y);
      if (sh >= 0) { if (allied(s, sh, p.team)) { p.x = x; p.y = y; p.spin = 0; deliver(s, sh, v); } else { s.lost += v; die(s, p, 'вражеский корабль'); } return; }
      for (const q of here(s, x, y)) if (!allied(s, q.team, p.team)) die(s, q, 'убит в воде');
      if (v) { s.lost += v; msg(s, v === TREASURE_VALUE ? '🌊 сокровище утонуло' : '🌊 монета утонула'); }
      p.x = x; p.y = y; p.spin = 0; return;
    }
    const t = tileAt(s, x, y);
    if (t.kind === 'croc' && t.open && inChain && s.options?.houseCrocDeath) { s.lost += v; die(s, p, 'цепочка привела на открытого крокодила'); return; }
    const fresh = reveal(s, t);
    const next = (nx, ny) => { delta = [nx - x, ny - y]; from = [x, y]; x = nx; y = ny; };
    if (t.kind === 'arrow' && t.dirs.length === 1) { next(x + t.dirs[0][0], y + t.dirs[0][1]); continue; }
    if (t.kind === 'ice') { next(x + delta[0], y + delta[1]); continue; }
    if (t.kind === 'cannon') { const [dx, dy] = t.dirs[0]; let nx = x, ny = y; do { nx += dx; ny += dy; } while (isIsland(nx, ny)); next(nx, ny); continue; }
    if (t.kind === 'croc') {
      [x, y] = origin; p.x = x; p.y = y; if (isIsland(x, y) && SPIN[tileAt(s, x, y).kind]) p.spin = origSpin; msg(s, `🐊 ${pname(s, p)} вернулся назад`);
      if (isIsland(x, y)) { if (v && SPIN[tileAt(s, x, y).kind] && origSpin) p.carry = v; else if (v && wasInCave) p.carry = v, p.inCave = true; else put(tileAt(s, x, y), v); } else if (v) { const sh = shipAt(s, x, y); if (sh >= 0) deliver(s, sh, v); else s.lost += v; }
      if (wasInCave && !v) p.inCave = true;
      return;
    }
    if (t.kind === 'ogre' && p.role !== 'friday') { put(t, v); die(s, p, 'съеден людоедом'); return; } // Пятница не боится папу-людоеда
    if ((t.kind === 'arrow' && t.dirs.length > 1) || t.kind === 'horse') {
      p.x = x; p.y = y; p.spin = 0;
      s.pending = { pid: p.id, coin: v > 0, treasure: v === TREASURE_VALUE, origin, visits }; return; // выбор направления в этот же ход
    }
    if (t.kind === 'balloon') { toShip(s, p); deliver(s, p.team, v); msg(s, `🎈 ${pname(s, p)} улетел на корабль`); return; }
    if (t.kind === 'cave' && !(via === 'cave' && step === 0)) {
      // вход в пещеру: сначала бой с теми, кто стоит на входе
      p.x = x; p.y = y;
      if (isFighter(p)) for (const q of here(s, x, y)) if (q !== p && !allied(s, q.team, p.team) && q.role !== 'missionary') { if (q.role === 'friday') { dropCarry(s, q); q.team = p.team; } else toShip(s, q); }
      const waiters = s.pirates.filter(q => q !== p && q.alive && q.inCave);
      if (fresh && waiters.length) { // открыт второй ход: заблудившиеся выходят здесь, открывший переносится на их вход
        const [wx, wy] = [waiters[0].x, waiters[0].y];
        for (const q of waiters) { q.x = x; q.y = y; q.inCave = false; if (q.carry) { put(t, q.carry); q.carry = 0; } msg(s, `🕳 ${pname(s, q)} выбрался из пещеры`); }
        return stand(wx, wy, tileAt(s, wx, wy), false);
      }
      if (caveExits(s, p).length) { s.pending = { type: 'cave', pid: p.id, coin: v > 0, treasure: v === TREASURE_VALUE, origin, visits }; return; }
      p.inCave = true; p.carry = v; msg(s, `🕳 ${pname(s, p)} бродит в пещере`); return;
    }
    // «Любое невозможное действие приводит к смерти пирата. Монета остаётся там, где пират начинал ход.»
    const why = impossible(s, p, x, y, t, v, calm);
    if (why) { p.x = x; p.y = y; if (v) { if (isIsland(origin[0], origin[1])) put(tileAt(s, origin[0], origin[1]), v); else s.lost += v; } die(s, p, why); return; }
    return stand(x, y, t, fresh);
  }
}
function impossible(s, p, x, y, t, v, calm) {
  if (SPIN[t.kind]) return null;
  const all = here(s, x, y).filter(q => q !== p && !allied(s, q.team, p.team));
  if (t.kind === 'jungle') return v ? 'в джунгли нельзя с грузом' : null;
  if (v && (t.kind === 'fort' || t.kind === 'abor')) return 'в крепость нельзя с грузом';
  if (p.role === 'friday') return all.some(q => q.role !== 'missionary') ? 'Пятница не может атаковать' : null;
  if (p.role === 'missionary') return all.some(q => q.role !== 'friday') ? 'миссионер не заходит к врагам' : null;
  if (all.some(q => q.role === 'missionary')) return 'миссионера и пиратов рядом с ним атаковать нельзя';
  if (!all.length) return null;
  if (t.kind === 'fort' || t.kind === 'abor') return 'крепость занята врагом';
  if (calm) return 'рядом с миссионером атаковать нельзя';
  return null;
}

// Чистая функция: возвращает новое состояние, исходное не меняется.
export function applyMove(s0, m, { asPlayer = null } = {}) {
  if (s0.over) throw new Error('Игра окончена');
  if (asPlayer != null && controllerOf(s0) !== asPlayer) throw new Error('Сейчас ход другого игрока');
  const s = cloneState(s0);
  const ok = legalMoves(s).some(l => JSON.stringify(l) === JSON.stringify(m));
  if (!ok) throw new Error('Недопустимый ход');
  const team = s.current;
  s.moves.push({ n: s.moves.length + 1, team, ...m });
  if (m.type === 'rum') { // свободное действие: ход не заканчивается
    const n = s.pirates[m.target]; s.rum[team]--;
    if (n.role === 'friday') vanish(s, n, 'выпил ром и вышел из игры'); else { n.role = 'exmissionary'; msg(s, '🍾 Миссионер выпил ром и стал пиратом'); }
    if (!legalMoves(s).length) endTurn(s);
    return s;
  }
  if (m.type === 'reveal') {
    const t = tileAt(s, m.x, m.y); reveal(s, t); if (['bengunn', 'friday', 'missionary', 'quake', 'grass', 'caramba'].includes(t.kind) || RUM[t.kind]) t.lit = true;
    msg(s, `🗼 открыта клетка ${m.x},${m.y}`);
    if (--s.pending.left <= 0 || !Object.values(s.tiles).some(c => !c.open)) s.pending = null;
    endTurn(s); return s;
  }
  if (m.type === 'quake') {
    const k = key(m.x, m.y);
    if (!s.pending.first) { s.pending.first = k; return s; } // первая клетка выбрана, ход продолжается
    const a = s.pending.first; [s.tiles[a], s.tiles[k]] = [s.tiles[k], s.tiles[a]]; msg(s, `🌋 клетки ${a} и ${k} поменялись местами`);
    s.pending = null; endTurn(s); return s;
  }
  if (m.type === 'ship') {
    const sh = s.ships[team], ox = sh.x, oy = sh.y;
    for (const q of here(s, m.x, m.y)) if (!allied(s, q.team, team)) die(s, q, 'раздавлен кораблём'); // свои/союзные пловцы просто оказываются на корабле
    for (const q of here(s, ox, oy)) if (q.team === team) { q.x = m.x; q.y = m.y; }
    sh.x = m.x; sh.y = m.y;
  } else if (m.type === 'revive') {
    const p = s.pirates[m.pid]; p.alive = true; p.x = m.x; p.y = m.y; p.spin = 0; p.trapped = false; p.drunkUntil = 0; msg(s, `❤ ${pname(s, p)} воскрес`);
  } else {
    const p = s.pirates[m.pid];
    if (m.rum) { s.rum[team]--; p.trapped = false; msg(s, `🍾 ${pname(s, p)} выпил ром и выбрался`); }
    const cont = !!s.pending;
    let v = val(m.coin, m.treasure);
    if (isIsland(p.x, p.y) && !cont) { const t = tileAt(s, p.x, p.y); if (t.kind === 'plane' && !t.used && m.via === 'plane') t.used = true;
      if (p.carry) { const c = p.carry === true ? 1 : p.carry; p.carry = 0; if (!m.coin) put(t, c); else v = c; }
      else if (m.treasure) t.treasure--; else if (m.coin) t.coins--; }
    if (m.via === 'spin') walk(s, p, p.x, p.y, 'spin', v);
    else walk(s, p, m.x, m.y, m.via, v);
  }
  endTurn(s);
  return s;
}

export function coinsLeft(s) {
  let n = s.pending?.treasure ? TREASURE_VALUE : s.pending?.coin ? 1 : 0;
  for (const p of s.pirates) if (p.alive && p.carry) n += p.carry === true ? 1 : p.carry;
  for (const t of Object.values(s.tiles)) n += t.coins + (t.treasure || 0) * TREASURE_VALUE + (!t.open && CHEST[t.kind] ? CHEST[t.kind] : 0) + (!t.open && t.kind === 'galleon' ? TREASURE_VALUE : 0);
  return n;
}

export const END_REASONS = { majority: 'больше половины всех монет', allCoins: 'все монеты разыграны', noPirates: 'не осталось живых пиратов', noMoves: 'ни у кого нет ходов — ничья', noShips: 'не осталось кораблей' };
export const TOTAL_COINS = 37 + TREASURE_VALUE; // 37 монет в сундуках + сокровище галеона (3)
function finish(s, reason) { s.over = true; s.endReason = reason; s.pending = null; msg(s, '🏁 ' + END_REASONS[reason]); }
// Пират временно пропускает ход (бочонок), значит позже у него появятся ходы.
const waiting = s => s.pirates.some(p => p.alive && activeTeams(s.mode).includes(p.team) && p.drunkUntil >= s.turn);
const nextTurn = s => { s.turn++; if (s.grass) s.grass--; };

function endTurn(s) {
  if (s.pending?.type) { if (legalMoves(s).length) return; s.pending = null; }
  if (s.pending) {
    const p = s.pirates[s.pending.pid];
    if (!legalMoves(s).length && s.pending.coin) { put(tileAt(s, p.x, p.y), s.pending.treasure ? TREASURE_VALUE : 1); s.pending.coin = false; s.pending.treasure = false; }
    if (legalMoves(s).length) return; // тот же игрок доигрывает ход
    s.pending = null; die(s, p, 'некуда идти');
  }
  nextTurn(s);
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
    nextTurn(s); // команда без ходов пропускает ход
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
  const s = { version: FORMAT_VERSION, seed: raw.seed ?? null, pending: raw.pending ?? null, moves: Array.isArray(raw.moves) ? raw.moves : [], log: Array.isArray(raw.log) ? raw.log : [], mode, turn: raw.turn ?? 0, current: raw.current ?? 0, tiles: {}, ships: [], pirates: [], score: raw.score ?? [0, 0, 0, 0], rum: raw.rum ?? [0, 0, 0, 0], lost: raw.lost ?? 0, over: !!raw.over, endReason: raw.endReason ?? null, grass: raw.grass ?? 0, options: { ...DEFAULT_OPTIONS } };
  if (!Number.isInteger(s.grass) || s.grass < 0) err('grass — неотрицательное целое (ходов под действием травы)');
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
    if (t.lit) tile.lit = true;
    if (t.treasure != null) { if (!Number.isInteger(t.treasure) || t.treasure < 0) err(`клетка ${k}: treasure — неотрицательное целое`); if (t.treasure) tile.treasure = t.treasure; }
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
    if (p.role != null && !CHARACTERS[p.role] && p.role !== 'exmissionary') err(`пират #${i}: role — одно из ${[...Object.keys(CHARACTERS), 'exmissionary'].join(', ')}`);
    if (!p.role && ++count[p.team] > 3) err(`у команды ${TEAMS[p.team].name} больше 3 пиратов`);
    if (p.carry != null && ![true, false, 0, 1, TREASURE_VALUE].includes(p.carry)) err(`пират #${i}: carry — 0, 1 (монета) или 3 (сокровище)`);
    const alive = p.alive ?? true;
    let x = p.x, y = p.y;
    if (p.onShip) { x = s.ships[p.team].x; y = s.ships[p.team].y; }
    if (!activeTeams(mode).includes(p.team)) err(`пират #${i}: команда ${TEAMS[p.team].name} не участвует в режиме ${mode}`);
    if (alive && !(Number.isInteger(x) && Number.isInteger(y) && inGrid(x, y))) err(`пират #${i}: координаты x,y 0..12 (или onShip: true)`);
    if (alive && isSea(x, y)) { const sh = shipAt(s, x, y); if (sh >= 0 && !allied(s, sh, p.team)) err(`пират #${i} стоит на вражеском корабле`); }
    if (p.inCave && !(alive && isIsland(x, y) && s.tiles[key(x, y)].kind === 'cave' && s.tiles[key(x, y)].open)) err(`пират #${i}: inCave только на открытой пещере`);
    const q = { id: 0, team: p.team, x: alive ? x : null, y: alive ? y : null, alive, spin: p.spin ?? 0, trapped: !!p.trapped, drunkUntil: p.drunkUntil ?? 0, carry: p.carry === true ? 1 : p.carry || 0 };
    if (p.role) q.role = p.role; if (p.inCave) q.inCave = true; if (p.gone) q.gone = true;
    s.pirates.push(q);
  });
  for (const t of activeTeams(mode)) while (count[t]++ < 3) s.pirates.push({ id: 0, team: t, x: null, y: null, alive: false, spin: 0, trapped: false, drunkUntil: 0 });
  s.pirates.sort((a, b) => a.team - b.team || !!a.role - !!b.role); s.pirates.forEach((p, i) => p.id = i);
  if (s.pending && s.pending.pid != null && !s.pirates[s.pending.pid]) err('pending.pid: нет такого пирата');
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
