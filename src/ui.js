import * as G from './game.js';
import { ASSETS, ARROW_GLYPH } from './assets.js';
const $ = s => document.querySelector(s);
let state = null, sel = null, withCoin = false;

function art(k) { const a = ASSETS[k] || ASSETS.empty; return a.img ? `<img src="${a.img}" alt="">` : `<span class="emo">${a.emoji}</span>`; }
function tileHTML(t) {
  if (!t.open) return art('closed');
  let h = '';
  if (t.kind === 'arrow' || t.kind === 'cannon') h += `<span class="arrows">${t.kind === 'cannon' ? art('cannon') : ''}${t.dirs.map(d => ARROW_GLYPH[d.join(',')]).join('')}</span>`;
  else h += art(t.kind === 'plane' && t.used ? 'empty' : t.kind);
  const lab = t.kind === 'arrow' ? '' : (t.kind === 'plane' && t.used ? 'пусто' : ASSETS[t.kind]?.label ?? t.kind);
  if (lab) h += `<small>${lab}</small>`;
  if (t.coins) h += `<b class="coins">${ASSETS.coin.emoji}${t.coins}</b>`;
  return h;
}

function render() {
  const s = state, moves = G.legalMoves(s);
  const targets = sel == null ? [] : moves.filter(m => (sel === 'ship' ? m.type === 'ship' : m.pid === sel && m.type === 'move') && (sel === 'ship' || !!m.coin === withCoin));
  const b = $('#board'); b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) {
    const c = document.createElement('div'); c.className = 'cell';
    const t = G.tileAt(s, x, y);
    if (t) { c.classList.add(t.open ? 'open' : 'closed', 'k-' + t.kind); c.innerHTML = tileHTML(t); } else c.classList.add('sea');
    const sh = G.shipAt(s, x, y);
    if (sh >= 0) { c.classList.add('ship'); c.style.setProperty('--team', G.TEAMS[sh].color); c.insertAdjacentHTML('afterbegin', art('ship')); }
    const ps = s.pirates.filter(p => p.alive && p.x === x && p.y === y);
    if (ps.length) { const w = document.createElement('div'); w.className = 'pirates'; for (const p of ps) { const d = document.createElement('i'); d.className = 'pirate' + (p.id === sel ? ' sel' : '') + (p.trapped ? ' trapped' : ''); d.style.background = G.TEAMS[p.team].color; d.textContent = (p.id % 3 + 1) + (p.spin ? '·' + p.spin : ''); w.append(d); } c.append(w); }
    if (targets.some(m => m.x === x && m.y === y)) c.classList.add('target');
    c.onclick = () => click(x, y, targets);
    b.append(c);
  }
  const T = G.TEAMS[s.current];
  $('#turn').innerHTML = s.over ? `<b>Игра окончена!</b> Победа: ${G.winner(s).map(k => G.sideName(s, k)).join(', ')}` : `Ход: <span class="dot" style="background:${T.color}"></span> ${T.name} (${G.MODES[s.mode].startsWith('Два') ? 'игрок ' + (G.playerOf(s, s.current) + 1) : 'игрок ' + (G.playerOf(s, s.current) + 1)}) · ход №${s.turn + 1}`;
  const sc = G.sideScores(s);
  $('#score').innerHTML = Object.keys(sc).map(k => `${G.sideName(s, +k)}: <b>${sc[k]}</b>`).join(' · ') + ` · осталось ${G.coinsLeft(s)} · утонуло ${s.lost} · ром: ${s.rum.join('/')}`;
  const p = typeof sel === 'number' ? s.pirates[sel] : null;
  const canCoin = p && G.tileAt(s, p.x, p.y)?.coins > 0 && moves.some(m => m.pid === sel && m.coin);
  $('#coinBtn').hidden = !canCoin; $('#coinBtn').textContent = withCoin ? '🪙 Несёт монету (снять)' : '🪙 Взять монету';
  const shipBtns = moves.filter(m => m.type === 'ship');
  $('#shipBtn').hidden = !shipBtns.length;
  const rv = moves.find(m => m.type === 'revive'); $('#reviveBtn').hidden = !rv;
  $('#log').textContent = s.log.slice(-6).reverse().join('\n');
  localStorage.setItem('jackal-save', G.serialize(s));
}

function click(x, y, targets) {
  const hit = targets.find(m => m.x === x && m.y === y);
  if (hit) { G.applyMove(state, hit); sel = null; withCoin = false; return render(); }
  const mine = state.pirates.filter(p => p.alive && p.x === x && p.y === y && p.team === state.current && G.pirateMoves(state, p).length);
  if (mine.length) { const i = mine.findIndex(p => p.id === sel); sel = mine[(i + 1) % mine.length].id; withCoin = false; }
  else sel = null;
  render();
}

function start(mode) { state = G.newGame({ mode, seed: Date.now() }); sel = null; render(); $('#menu').close?.(); }
$('#coinBtn').onclick = () => { withCoin = !withCoin; render(); };
$('#shipBtn').onclick = () => { sel = sel === 'ship' ? null : 'ship'; render(); };
$('#reviveBtn').onclick = () => { const m = G.legalMoves(state).find(m => m.type === 'revive'); if (m) { G.applyMove(state, m); sel = null; render(); } };
$('#newBtn').onclick = () => $('#menu').showModal();
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { start(b.dataset.mode); $('#menu').close(); });
$('#saveBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([G.serialize(state)], { type: 'application/json' })); a.download = 'jackal-position.json'; a.click(); };
$('#loadBtn').onclick = () => $('#file').click();
$('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { state = G.loadState(await f.text()); sel = null; render(); } catch (err) { alert(err.message); } e.target.value = ''; };
try { const saved = localStorage.getItem('jackal-save'); if (saved) { state = G.loadState(saved); render(); } else start('2p'); } catch { start('2p'); }
