import * as G from './game.js';
import * as V from './view.js';
import { ASSETS, ARROW_GLYPH, ROLE_BADGE, tileImg, pirateImg, shipImg, coinImg, hlImg } from './assets.js';
const tileName = t => !t.open ? 'закрытая клетка' : t.kind === 'arrow' ? 'стрелка ' + t.dirs.map(d => ARROW_GLYPH[d.join(',')]).join('') : (t.kind === 'plane' && t.used ? 'пусто' : ASSETS[t.kind]?.label ?? t.kind) + (t.coins ? `, монет: ${t.coins}` : '') + (t.treasure ? ', сокровище (3 монеты)' : '');
const $ = s => document.querySelector(s);
let state = null, sel = null, withCoin = false, notice = '';
// Кем играет это устройство: 'all' — hot-seat, 0/1 — «я играю за игрока 1/2» (файловый мультиплеер).
let me = localStorage.getItem('jackal-me') ?? 'all';

// <img> с запасным эмодзи, если файла нет.
function pic(src, emoji, cls = '', rot = 0) {
  if (!src) return `<span class="emo">${emoji}</span>`;
  if (!rot) return `<img class="${cls}" src="${src}" alt="" onerror="this.outerHTML='<span class=emo>${emoji}</span>'">`;
  return `<img class="${cls}" src="${src}" alt="" style="transform:rotate(${rot * 90}deg)" onerror="this.outerHTML='<span class=emo>${emoji}</span>'">`;
}
function tileHTML(t) {
  if (!t.open) return pic(tileImg(t), ASSETS.closed.emoji, 'tile');
  let h;
  if (t.kind === 'arrow' || t.kind === 'cannon') {
    const r = G.tileRotation(t), glyph = t.dirs.map(d => ARROW_GLYPH[d.join(',')]).join('');
    h = r == null ? `<span class="arrows">${glyph}</span>` : pic(tileImg(t), glyph, 'tile', r);
  } else h = pic(tileImg(t), ASSETS[t.kind]?.emoji ?? '', 'tile');
  const lab = t.kind === 'arrow' ? '' : (t.kind === 'plane' && t.used ? 'пусто' : ASSETS[t.kind]?.label ?? t.kind);
  if (lab && !tileImg(t)) h += `<small>${lab}</small>`; // подпись только без картинки
  if (t.coins) h += `<b class="coins">${pic(coinImg, '🪙', 'ci')}${t.coins}</b>`;
  if (t.treasure) h += `<b class="treasure" title="сокровище">💰${t.treasure > 1 ? t.treasure : ''}</b>`;
  return h;
}
const myTurn = () => me === 'all' || G.controllerOf(state) === +me;

function render() {
  const s = state, moves = myTurn() ? G.classifyMoves(s) : [];
  const targets = V.targets(moves, { s, sel, withCoin });
  const b = $('#board'); b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) {
    const c = document.createElement('div'); c.className = 'cell';
    const t = G.tileAt(s, x, y);
    if (t) { c.classList.add(t.open ? 'open' : 'closed', 'k-' + t.kind); c.innerHTML = tileHTML(t); const name = tileName(t); c.title = name; c.setAttribute('aria-label', name); } else c.classList.add('sea');
    const sh = G.shipAt(s, x, y);
    if (sh >= 0) { c.classList.add('ship'); c.style.setProperty('--team', G.TEAMS[sh].color); c.insertAdjacentHTML('afterbegin', pic(shipImg(sh), '⛵', 'tile')); }
    const ps = s.pirates.filter(p => p.alive && p.x === x && p.y === y);
    ps.forEach((p, i) => {
      const d = document.createElement('i');
      const coin = V.pirateHasCoin(s, p, { sel, withCoin }), tre = p.carry === G.TREASURE_VALUE || (p.id === sel && withCoin === 'T') || (s.pending?.pid === p.id && s.pending.treasure);
      d.className = `pirate n${ps.length} i${i}` + (p.id === sel ? ' sel' : '') + (p.trapped ? ' trapped' : '') + (p.inCave ? ' incave' : '');
      d.title = G.pieceName(s, p) + (coin ? (tre ? ', несёт сокровище' : ', несёт монету') : '') + (p.trapped ? ', в капкане' : '') + (p.inCave ? ', в пещере' : '');
      d.innerHTML = pic(pirateImg(p.team), '●', 'pi') + (coin ? (tre ? '<b class="pcoin ptre">💰</b>' : pic(coinImg, '🪙', 'pcoin')) : '') + (p.spin ? `<em>${p.spin}</em>` : '') + (p.role ? `<b class="role">${ROLE_BADGE[p.role]}</b>` : '');
      c.append(d);
    });
    const here = targets.filter(m => m.x === x && m.y === y);
    if (here.length) { const k = V.hlKind(here); c.classList.add('target', 'hl-' + k); c.insertAdjacentHTML('beforeend', pic(hlImg(k), '', 'hl')); }
    if (V.coinHintAt(moves, x, y, { sel, withCoin })) { c.classList.add('hl-hint'); c.insertAdjacentHTML('beforeend', pic(hlImg('coin'), '', 'hl hint')); }
    c.onclick = () => click(x, y, targets);
    b.append(c);
  }
  const T = G.TEAMS[s.current];
  const hp = V.headerParts(s, { myTurn: myTurn() }), dot = $('#turnDot');
  dot.hidden = !!s.over; dot.style.background = T.color;
  if ($('#turnPrefix').textContent !== hp.prefix) $('#turnPrefix').textContent = hp.prefix;
  if ($('#turnText').textContent !== hp.text) $('#turnText').textContent = hp.text;
  $('#status').textContent = notice || V.coinHint(moves, { sel, withCoin }) || ''; notice = '';
  const sc = G.sideScores(s);
  $('#score').innerHTML = Object.keys(sc).map(k => `${G.sideName(s, +k)}: <b>${sc[k]}</b>`).join(' · ') + ` · осталось ${G.coinsLeft(s)} · утонуло ${s.lost} · ром: ${G.activeTeams(s.mode).map(t => s.rum[t]).join('/')}`;
  const bs = V.buttons(s, moves, { sel, withCoin, myTurn: myTurn() });
  for (const [id, b] of [['#shipBtn', bs.ship], ['#coinBtn', bs.coin], ['#reviveBtn', bs.revive], ['#rumBtn', bs.rum]]) { const el = $(id); el.disabled = b.disabled; el.textContent = b.label; el.setAttribute('aria-pressed', b.pressed); el.hidden = false; }
  $('#me').value = me;
  $('#log').textContent = s.log.slice(-6).reverse().join('\n');
  if (s.pending && (!s.pending.type || s.pending.type === 'cave') && myTurn() && sel !== s.pending.pid) { sel = s.pending.pid; withCoin = s.pending.treasure ? 'T' : s.pending.coin; return render(); }
  localStorage.setItem('jackal-save', G.serialize(s));
}

function click(x, y, targets) {
  const hit = targets.find(m => m.x === x && m.y === y);
  if (hit) { const { kind, ...mv } = hit; state = G.applyMove(state, mv); sel = null; withCoin = false; return render(); }
  if (sel === 'rum') { sel = null; return render(); }
  if (!myTurn()) return;
  if (state.pending) { const p = state.pirates[state.pending.pid]; if (state.pending.type === 'lighthouse' || state.pending.type === 'quake' || !(p.x === x && p.y === y)) { notice = V.blockedNotice(state); render(); } return; }
  const mine = state.pirates.filter(p => p.alive && p.x === x && p.y === y && p.team === state.current && G.pirateMoves(state, p).length);
  if (mine.length) { const i = mine.findIndex(p => p.id === sel); sel = mine[(i + 1) % mine.length].id; const c = state.pirates[sel].carry; withCoin = c === G.TREASURE_VALUE ? 'T' : !!c; }
  else sel = null;
  render();
}

function start(mode) { state = G.newGame({ mode, seed: Date.now() % 1e9, options: { houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked } }); sel = null; render(); }
$('#coinBtn').onclick = () => { withCoin = V.nextCargo(G.legalMoves(state), sel, withCoin); render(); };
$('#rumBtn').onclick = () => { sel = sel === 'rum' ? null : 'rum'; render(); };
$('#shipBtn').onclick = () => { sel = sel === 'ship' ? null : 'ship'; render(); };
$('#reviveBtn').onclick = () => { const m = G.legalMoves(state).find(m => m.type === 'revive'); if (m) { state = G.applyMove(state, m); sel = null; render(); } };
$('#me').onchange = e => { me = e.target.value; localStorage.setItem('jackal-me', me); sel = null; render(); };
$('#newBtn').onclick = () => $('#menu').showModal();
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { start(b.dataset.mode); $('#menu').close(); });
$('#saveBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([G.serialize(state)], { type: 'application/json' })); a.download = `jackal-hod-${state.turn + 1}.json`; a.click(); };
$('#loadBtn').onclick = () => $('#file').click();
$('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { state = G.loadState(await f.text()); sel = null; render(); } catch (err) { alert(err.message); } e.target.value = ''; };
try { const saved = localStorage.getItem('jackal-save'); if (saved) { state = G.loadState(saved); render(); } else start('2p'); } catch { start('2p'); }
