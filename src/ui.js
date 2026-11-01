import * as G from './game.js';
import * as V from './view.js';
import * as Net from './net.js';
import { ASSETS, ARROW_GLYPH, ROLE_BADGE, tileImg, pirateImg, pieceImg, shipImg, coinImg, treasureImg, hlImg } from './assets.js';
const tileName = t => !t.open ? 'закрытая клетка' : t.kind === 'arrow' ? 'стрелка ' + t.dirs.map(d => ARROW_GLYPH[d.join(',')]).join('') : (t.kind === 'plane' && t.used ? 'пусто' : ASSETS[t.kind]?.label ?? t.kind) + (t.coins ? `, монет: ${t.coins}` : '') + (t.treasure ? ', сокровище (3 монеты)' : '');
const $ = s => document.querySelector(s);
let plate = null; // плашка выбора пирата: { x, y, pids }
let state = null, sel = null, withCoin = false, notice = '';
// Кем играет это устройство: 'all' — hot-seat, 0/1 — «я играю за игрока 1/2» (файловый мультиплеер).
let me = localStorage.getItem('jackal-me') ?? 'all';
// Онлайн: net = { sess: {code, token, player}, connected, opponent, stop } или null.
let net = null;

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
  if (t.treasure) h += `<b class="treasure" title="сокровище">${pic(treasureImg, '💰', 'ti')}${t.treasure > 1 ? t.treasure : ''}</b>`;
  return h;
}
const myTurn = () => net ? !state.over && G.controllerOf(state) === net.sess.player : me === 'all' || G.controllerOf(state) === +me;

function render() {
  const s = state, moves = myTurn() ? G.classifyMoves(G.publicState(s)) : []; // подсветка не выдаёт содержимое закрытых клеток
  const targets = V.targets(moves, { s, sel, withCoin });
  const b = $('#board'); b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) {
    const c = document.createElement('div'); c.className = 'cell'; c.style.gridArea = `${y + 1} / ${x + 1}`; // явное место: плашка поверх клеток не сдвигает их
    const t = G.tileAt(s, x, y);
    if (t) { c.classList.add(t.open ? 'open' : 'closed', 'k-' + t.kind); c.innerHTML = tileHTML(t); const name = tileName(t); c.title = name; c.setAttribute('aria-label', name); } else c.classList.add('sea');
    const sh = G.shipAt(s, x, y);
    if (sh >= 0) { c.classList.add('ship'); c.style.setProperty('--team', G.TEAMS[sh].color); c.insertAdjacentHTML('afterbegin', pic(shipImg(sh), '⛵', 'tile')); }
    const ps = s.pirates.filter(p => p.alive && p.x === x && p.y === y);
    ps.forEach((p, i) => {
      const d = document.createElement('i');
      const mark = V.coinMark(s, p, moves, { sel, withCoin, myTurn: myTurn() }), coin = mark === 'coin' || mark === 'treasure', tre = mark === 'treasure';
      d.className = `pirate n${ps.length} i${i}` + (p.id === sel ? ' sel' : '') + (p.trapped ? ' trapped' : '') + (p.inCave ? ' incave' : '');
      d.title = G.pieceName(s, p) + (coin ? (tre ? ', несёт сокровище' : ', несёт монету') : '') + (p.trapped ? ', в капкане' : '') + (p.inCave ? ', в пещере' : '') + (mark === 'can' ? ', может взять монету' : mark === 'canTreasure' ? ', может взять сокровище' : '');
      d.innerHTML = pic(pieceImg(p), '●', 'pi') + (coin ? (tre ? pic(treasureImg, '💰', 'pcoin ptre') : pic(coinImg, '🪙', 'pcoin')) : mark === 'can' ? pic(coinImg, '🪙', 'pcoin can') : mark === 'canTreasure' ? pic(treasureImg, '💰', 'pcoin ptre can') : '') + (p.spin ? `<em>${p.spin}</em>` : '') + (p.role === 'exmissionary' ? `<b class="role">${ROLE_BADGE[p.role]}</b>` : '') + (V.pirateNumber(s, p) ? `<b class="num">${V.pirateNumber(s, p)}</b>` : '');
      c.append(d);
    });
    const here = targets.filter(m => m.x === x && m.y === y);
    if (here.length) { const k = V.hlKind(here); c.classList.add('target', 'hl-' + k); c.insertAdjacentHTML('beforeend', pic(hlImg(k), '', 'hl')); }
    if (V.coinHintAt(moves, x, y, { sel, withCoin })) { c.classList.add('hl-hint'); c.insertAdjacentHTML('beforeend', pic(hlImg('coin'), '', 'hl hint')); }
    c.onclick = () => click(x, y, targets);
    b.append(c);
  }
  const T = G.TEAMS[s.current];
  const hp = V.headerParts(s, { myTurn: myTurn(), online: !!net }), dot = $('#turnDot');
  dot.hidden = !!s.over; dot.style.background = T.color;
  if ($('#turnPrefix').textContent !== hp.prefix) $('#turnPrefix').textContent = hp.prefix;
  if ($('#turnText').textContent !== hp.text) $('#turnText').textContent = hp.text;
  $('#status').textContent = notice || V.coinHint(moves, { sel, withCoin }) || V.selectHint(s, sel, { myTurn: myTurn() }) || ''; notice = '';
  const sc = G.sideScores(s);
  $('#score').innerHTML = Object.keys(sc).map(k => `${G.sideName(s, +k)}: <b>${sc[k]}</b>`).join(' · ') + ` · осталось ${G.coinsLeft(s)} · утонуло ${s.lost} · ром: ${G.activeTeams(s.mode).map(t => s.rum[t]).join('/')}`;
  const bs = V.buttons(s, moves, { sel, withCoin, myTurn: myTurn() });
  for (const [id, b] of [['#shipBtn', bs.ship], ['#coinBtn', bs.coin], ['#reviveBtn', bs.revive], ['#rumBtn', bs.rum]]) { const el = $(id); el.disabled = b.disabled; el.textContent = b.label; el.setAttribute('aria-pressed', b.pressed); el.hidden = false; }
  $('#me').value = me;
  $('#log').textContent = s.log.slice(-6).reverse().join('\n');
  if (s.pending && (!s.pending.type || s.pending.type === 'cave') && myTurn() && sel !== s.pending.pid) { sel = s.pending.pid; withCoin = s.pending.treasure ? 'T' : s.pending.coin; return render(); }
  const ya = $('#youAre'); ya.hidden = !net; if (net) { ya.textContent = V.youAreText(s, net.sess.player); ya.style.borderColor = G.TEAMS[G.teamsOfPlayer(s, net.sess.player)[0]]?.color ?? ''; }
  $('#fileHelp').hidden = !V.showFileHelp({ online: !!net, me });
  if (plate && myTurn()) {
    const pl = V.platePlacement({ x: plate.x, n: plate.pids.length }), d = document.createElement('div');
    d.className = 'plate side-' + pl.side; d.style.gridRow = String(plate.y + 1); d.style.gridColumn = `${pl.start + 1} / span ${pl.span}`;
    d.innerHTML = plate.pids.map(id => { const p = s.pirates[id], n = V.pirateNumber(s, p); return `<button class="tok${id === sel ? ' sel' : ''}" data-pid="${id}" style="--team:${G.TEAMS[p.team].color}" title="${G.pieceName(s, p)}">${pic(pieceImg(p), '●', 'ti')}${n ? `<b>${n}</b>` : ''}</button>`; }).join('');
    d.querySelectorAll('.tok').forEach(btn => btn.onclick = e => { e.stopPropagation(); choose(+btn.dataset.pid); });
    b.append(d);
  } else plate = null;
  renderCrew(s, moves);
  renderBanner();
  if (!net) localStorage.setItem('jackal-save', G.serialize(s));
}
function choose(pid) { sel = pid; const c = state.pirates[pid].carry; withCoin = c === G.TREASURE_VALUE ? 'T' : !!c; plate = null; render(); }
function renderCrew(s, moves) {
  const can = new Set(moves.map(m => m.pid)), el = $('#crew');
  const tok = (t, color) => { const p = s.pirates[t.pid];
    return `<button class="tok${t.alive ? '' : ' dead'}${t.pid === sel ? ' sel' : ''}" data-pid="${t.pid}" style="--team:${color}" title="${G.pieceName(s, p)}${t.alive ? '' : ' — погиб'}"${t.alive && can.has(t.pid) && myTurn() ? '' : ' disabled'}>${pic(pieceImg(p), '●', 'ti')}${t.num ? `<b>${t.num}</b>` : ''}${p.role === 'exmissionary' ? '<i>✝</i>' : ''}</button>`; };
  el.innerHTML = V.crewPanels(s, { player: net ? net.sess.player : me === 'all' ? null : +me }).map(cp => { const color = G.TEAMS[cp.team].color;
    return `<section class="panel${cp.current ? ' current' : ''}" style="--team:${color}"><header><span>${cp.label}</span><span class="sc">${pic(coinImg, '🪙', 'ci')} ${cp.score}</span></header><div class="toks">${cp.regular.map(t => tok(t, color)).join('')}${cp.chars.length ? '<span class="div"></span>' + cp.chars.map(t => tok(t, color)).join('') : ''}</div></section>`; }).join('');
  el.querySelectorAll('.tok:not([disabled])').forEach(b => b.onclick = () => choose(+b.dataset.pid));
}
function renderBanner() {
  const el = $('#banner'), b = net && V.onlineBanner(state, { player: net.sess.player, connected: net.connected, opponent: net.opponent, gone: net.gone });
  el.hidden = !b; if (!b) return;
  el.className = 'banner b-' + b.kind; el.innerHTML = `<b>${b.title}</b><small>${b.sub}</small>`;
  $('#me').closest('label').hidden = true;
}
// Ход: локально применяем, онлайн — отправляем на сервер (он проверит и разошлёт состояние).
async function play(mv) { plate = null;
  sel = null; withCoin = false;
  if (!net) { state = G.applyMove(state, mv); return render(); }
  try { await Net.move(net.sess, mv); } catch (e) { notice = e.message; render(); }
}
function goOnline(sess) {
  net?.stop(); net = { sess, connected: false, opponent: 'waiting', stop: null, gone: false };
  state = null; $('#board').innerHTML = ''; $('#me').closest('label').hidden = true; // не показывать прежнюю локальную партию (2p) до прихода состояния 1v1
  net.stop = Net.connect(sess, msg => {
    state = msg.state; net.opponent = msg.opponent; showCode(msg.code);
    if (msg.opponent !== 'waiting' && $('#online').open) $('#online').close();
    render();
  }, ok => { if (net && net.connected !== ok) { net.connected = ok; if (state) render(); } }, () => { if (!net) return; net.gone = true; net.stop(); Net.forget(); if (state) render(); else renderBanner(); }); // без alert: плашка
  window.jackalDropConnection = () => net?.stop.drop(); // для Тестировщика: имитация обрыва связи
}
// Покинуть онлайн-партию. Пока партия идёт — только с подтверждения; возвращает false, если игрок передумал.
const LEAVE_Q = 'Выйти из онлайн-партии? Соперник увидит, что вы вышли.';
function goLocal(confirmed = false) {
  if (!net) return true;
  if (!confirmed && V.needsLeaveConfirm(net, state) && !confirm(LEAVE_Q)) return false;
  net.stop(); if (!net.gone) Net.leave(net.sess); Net.forget(); net = null; $('#me').closest('label').hidden = false; $('#banner').hidden = true; return true;
}
function showCode(code) { $('#codeBox').innerHTML = [...code].map(c => `<span>${c}</span>`).join(''); $('#codeArea').hidden = false; }

function click(x, y, targets) {
  const hit = targets.find(m => m.x === x && m.y === y);
  if (hit) { const { kind, ...mv } = hit; return play(mv); }
  if (sel === 'rum') { sel = null; return render(); }
  if (!myTurn()) return;
  if (state.pending) { const p = state.pirates[state.pending.pid]; if (state.pending.type === 'lighthouse' || state.pending.type === 'quake' || !(p.x === x && p.y === y)) { notice = V.blockedNotice(state); render(); } return; }
  const mine = state.pirates.filter(p => p.alive && p.x === x && p.y === y && p.team === state.current && G.pirateMoves(state, p).length);
  if (mine.length > 1) { plate = { x, y, pids: mine.map(p => p.id) }; if (!mine.some(p => p.id === sel)) sel = null; } // несколько своих — плашка выбора
  else if (mine.length) { plate = null; return choose(mine[0].id); }
  else { sel = null; plate = null; }
  render();
}

function start(mode) { if (!goLocal()) return; state = G.newGame({ mode, seed: Date.now() % 1e9, options: { houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked } }); sel = null; render(); }
$('#coinBtn').onclick = () => { withCoin = V.nextCargo(G.legalMoves(state), sel, withCoin); render(); };
$('#rumBtn').onclick = () => { sel = sel === 'rum' ? null : 'rum'; render(); };
$('#shipBtn').onclick = () => { sel = sel === 'ship' ? null : 'ship'; render(); };
$('#reviveBtn').onclick = () => { const m = G.legalMoves(G.publicState(state)).find(m => m.type === 'revive'); if (m) play(m); };
$('#me').onchange = e => { me = e.target.value; localStorage.setItem('jackal-me', me); sel = null; render(); };
$('#newBtn').onclick = () => $('#menu').showModal();
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { start(b.dataset.mode); $('#menu').close(); });
$('#saveBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([G.serialize(state)], { type: 'application/json' })); a.download = `jackal-hod-${state.turn + 1}.json`; a.click(); };
// онлайн: спросить ДО выбора файла; сам выход — после того как файл выбран
let fileConfirmed = false;
$('#loadBtn').onclick = () => { fileConfirmed = !V.needsLeaveConfirm(net, state) || confirm(LEAVE_Q); if (fileConfirmed) $('#file').click(); };
$('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (!goLocal(fileConfirmed)) return; state = G.loadState(await f.text()); sel = null; render(); } catch (err) { alert(err.message); } e.target.value = ''; };
// Онлайн-меню
$('#onlineBtn').onclick = () => { $('#menu').close(); $('#onlineErr').textContent = ''; $('#codeArea').hidden = !net; $('#online').showModal(); };
$('#createBtn').onclick = async () => { try { if (!goLocal()) return; const sess = await Net.create({ houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked }); showCode(sess.code); goOnline(sess); } catch (e) { $('#onlineErr').textContent = e.message; } };
$('#shareBtn').onclick = async () => { const code = net?.sess.code; if (!code) return; const text = `Сыграем в «Шакал»? Код игры: ${code} — ${location.origin}`; try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(code); $('#onlineErr').textContent = 'Код скопирован'; } } catch {} };
$('#joinBtn').onclick = async () => { const code = $('#codeIn').value.trim().toUpperCase(); if (!code) return; try { if (!goLocal()) return; const sess = await Net.join(code); goOnline(sess); $('#online').close(); } catch (e) { $('#onlineErr').textContent = e.message; } };
$('#codeIn').onkeydown = e => { if (e.key === 'Enter') $('#joinBtn').click(); };
$('#leaveBtn').onclick = () => { if (!goLocal()) return; $('#online').close(); try { state = G.loadState(localStorage.getItem('jackal-save')); } catch { return start('2p'); } render(); };
const sess = Net.saved();
if (sess && location.protocol.startsWith('http')) goOnline(sess);
else try { const saved = localStorage.getItem('jackal-save'); if (saved) { state = G.loadState(saved); render(); } else start('2p'); } catch { start('2p'); }
