import * as G from './game.js';
import { ASSETS, ARROW_GLYPH, tileImg, pirateImg, shipImg, coinImg } from './assets.js';
const $ = s => document.querySelector(s);
let state = null, sel = null, withCoin = false;
// Кем играет это устройство: 'all' — hot-seat, 0/1 — «я играю за игрока 1/2» (файловый мультиплеер).
let me = localStorage.getItem('jackal-me') ?? 'all';

// <img> с запасным эмодзи, если файла нет.
function pic(src, emoji, cls = '', rot = 0) {
  if (!src) return `<span class="emo">${emoji}</span>`;
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
  if (lab) h += `<small>${lab}</small>`;
  if (t.coins) h += `<b class="coins">${pic(coinImg, '🪙', 'ci')}${t.coins}</b>`;
  return h;
}
const myTurn = () => me === 'all' || G.playerOf(state, state.current) === +me;

function render() {
  const s = state, moves = myTurn() ? G.legalMoves(s) : [];
  const targets = sel == null ? [] : moves.filter(m => (sel === 'ship' ? m.type === 'ship' : m.pid === sel && m.type === 'move') && (sel === 'ship' || !!m.coin === withCoin));
  const b = $('#board'); b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) {
    const c = document.createElement('div'); c.className = 'cell';
    const t = G.tileAt(s, x, y);
    if (t) { c.classList.add(t.open ? 'open' : 'closed', 'k-' + t.kind); c.innerHTML = tileHTML(t); } else c.classList.add('sea');
    const sh = G.shipAt(s, x, y);
    if (sh >= 0) { c.classList.add('ship'); c.style.setProperty('--team', G.TEAMS[sh].color); c.insertAdjacentHTML('afterbegin', pic(shipImg(sh), '⛵', 'tile')); }
    const ps = s.pirates.filter(p => p.alive && p.x === x && p.y === y);
    if (ps.length) { const w = document.createElement('div'); w.className = 'pirates'; for (const p of ps) { const d = document.createElement('i'); d.className = 'pirate' + (p.id === sel ? ' sel' : '') + (p.trapped ? ' trapped' : ''); d.innerHTML = pic(pirateImg(p.team), '●', 'pi') + `<em>${p.id % 3 + 1}${p.spin ? '·' + p.spin : ''}${p.carry ? '$' : ''}</em>`; w.append(d); } c.append(w); }
    if (targets.some(m => m.x === x && m.y === y)) c.classList.add('target');
    c.onclick = () => click(x, y, targets);
    b.append(c);
  }
  const T = G.TEAMS[s.current];
  const who = `игрок ${G.playerOf(s, s.current) + 1}`;
  $('#turn').innerHTML = s.over ? `<b>Игра окончена!</b> Победа: ${G.winner(s).map(k => G.sideName(s, k)).join(', ')}`
    : `Ход: <span class="dot" style="background:${T.color}"></span> ${T.name} (${who}) · №${s.turn + 1}` + (s.pending ? ' · <b>выберите направление</b>' : '') + (myTurn() ? '' : ` · <b>ждём ход соперника — загрузите его файл</b>`);
  const sc = G.sideScores(s);
  $('#score').innerHTML = Object.keys(sc).map(k => `${G.sideName(s, +k)}: <b>${sc[k]}</b>`).join(' · ') + ` · осталось ${G.coinsLeft(s)} · утонуло ${s.lost} · ром: ${G.activeTeams(s.mode).map(t => s.rum[t]).join('/')}`;
  const p = typeof sel === 'number' ? s.pirates[sel] : null;
  const canCoin = p && !s.pending && (G.tileAt(s, p.x, p.y)?.coins > 0 || p.carry) && moves.some(m => m.pid === sel && m.coin) && moves.some(m => m.pid === sel && !m.coin);
  $('#coinBtn').hidden = !canCoin; $('#coinBtn').textContent = withCoin ? '🪙 Несёт монету (снять)' : '🪙 Взять монету';
  $('#shipBtn').hidden = !moves.some(m => m.type === 'ship');
  $('#reviveBtn').hidden = !moves.some(m => m.type === 'revive');
  $('#me').value = me;
  $('#log').textContent = s.log.slice(-6).reverse().join('\n');
  if (s.pending && myTurn() && sel !== s.pending.pid) { sel = s.pending.pid; withCoin = s.pending.coin; return render(); }
  localStorage.setItem('jackal-save', G.serialize(s));
}

function click(x, y, targets) {
  const hit = targets.find(m => m.x === x && m.y === y);
  if (hit) { state = G.applyMove(state, hit); sel = null; withCoin = false; return render(); }
  if (!myTurn() || state.pending) return;
  const mine = state.pirates.filter(p => p.alive && p.x === x && p.y === y && p.team === state.current && G.pirateMoves(state, p).length);
  if (mine.length) { const i = mine.findIndex(p => p.id === sel); sel = mine[(i + 1) % mine.length].id; withCoin = !!state.pirates[sel].carry; }
  else sel = null;
  render();
}

function start(mode) { state = G.newGame({ mode, seed: Date.now() % 1e9 }); sel = null; render(); }
$('#coinBtn').onclick = () => { withCoin = !withCoin; render(); };
$('#shipBtn').onclick = () => { sel = sel === 'ship' ? null : 'ship'; render(); };
$('#reviveBtn').onclick = () => { const m = G.legalMoves(state).find(m => m.type === 'revive'); if (m) { state = G.applyMove(state, m); sel = null; render(); } };
$('#me').onchange = e => { me = e.target.value; localStorage.setItem('jackal-me', me); sel = null; render(); };
$('#newBtn').onclick = () => $('#menu').showModal();
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { start(b.dataset.mode); $('#menu').close(); });
$('#saveBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([G.serialize(state)], { type: 'application/json' })); a.download = `jackal-hod-${state.turn + 1}.json`; a.click(); };
$('#loadBtn').onclick = () => $('#file').click();
$('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { state = G.loadState(await f.text()); sel = null; render(); } catch (err) { alert(err.message); } e.target.value = ''; };
try { const saved = localStorage.getItem('jackal-save'); if (saved) { state = G.loadState(saved); render(); } else start('2p'); } catch { start('2p'); }
