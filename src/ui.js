import * as G from './game.js';
import * as V from './view.js';
import * as Net from './net.js';
import { stateMessage } from './bluetooth-protocol.js';
import { IS_REMOTE, SERVER_CONFIGURED } from './config.js';
import { ASSETS, ARROW_GLYPH, ROLE_BADGE, tileImg, pirateImg, pieceImg, shipImg, coinImg, treasureImg, hlImg } from './assets.js';
const $ = s => document.querySelector(s);
let plate = null; // плашка выбора пирата: { x, y, pids }
let state = null, sel = null, withCoin = false, notice = '';
const boardView = { scale: 1, minScale: .3, maxScale: 3, x: 0, y: 0 };
const pointers = new Map();
let gesture = null, longPressTimer = null, suppressCellClickUntil = 0;
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
  } else h = pic(tileImg(t), ASSETS[t.kind]?.emoji ?? '', `tile${t.kind === 'plane' && t.used ? ' plane-used' : ''}`);
  const details = V.tileDetails(t);
  h += `<small class="tile-label">${details.name.toLocaleLowerCase('ru-RU')}</small>`;
  if (t.kind === 'plane' && t.used) h += '<b class="plane-used-mark" aria-hidden="true">×</b>';
  if (t.coins) h += `<b class="coins">${pic(coinImg, '🪙', 'ci')}${t.coins}</b>`;
  if (t.treasure) h += `<b class="treasure" title="сокровище">${pic(treasureImg, '💰', 'ti')}${t.treasure > 1 ? t.treasure : ''}</b>`;
  return h;
}
const myTurn = () => net ? !state.over && G.controllerOf(state) === net.sess.player : me === 'all' || G.controllerOf(state) === +me;

function viewportSize() { const v = $('#boardViewport'); return { v, w: v.clientWidth, h: v.clientHeight, bw: $('#board').offsetWidth, bh: $('#board').offsetHeight }; }
function clampBoardView() {
  const { w, h, bw, bh } = viewportSize(); if (!w || !h || !bw || !bh) return;
  boardView.scale = Math.max(boardView.minScale, Math.min(boardView.maxScale, boardView.scale));
  const sw = bw * boardView.scale, sh = bh * boardView.scale;
  boardView.x = sw <= w ? (w - sw) / 2 : Math.max(w - sw, Math.min(0, boardView.x));
  boardView.y = sh <= h ? (h - sh) / 2 : Math.max(h - sh, Math.min(0, boardView.y));
  const b = $('#board'); b.style.transform = `translate3d(${boardView.x}px,${boardView.y}px,0) scale(${boardView.scale})`;
  $('#zoomLevel').value = `${Math.round(boardView.scale * 100)}%`;
  $('#zoomOut').disabled = boardView.scale <= boardView.minScale + .001;
  $('#zoomIn').disabled = boardView.scale >= boardView.maxScale - .001;
}
function fitBoard() {
  const { w, h, bw, bh } = viewportSize(); if (!w || !h || !bw || !bh) return;
  const fit = Math.min(w / bw, h / bh, 1);
  boardView.minScale = Math.max(.2, fit); boardView.scale = fit;
  boardView.x = (w - bw * fit) / 2; boardView.y = (h - bh * fit) / 2;
  clampBoardView();
}
function zoomBoard(scale, focusX, focusY) {
  const { v } = viewportSize(), r = v.getBoundingClientRect();
  const fx = focusX == null ? r.width / 2 : focusX - r.left, fy = focusY == null ? r.height / 2 : focusY - r.top;
  const old = boardView.scale, next = Math.max(boardView.minScale, Math.min(boardView.maxScale, scale));
  boardView.x = fx - ((fx - boardView.x) / old) * next;
  boardView.y = fy - ((fy - boardView.y) / old) * next;
  boardView.scale = next; clampBoardView();
}
function centerBoardCell(x, y) {
  const cell = $(`#board [data-cell="${x},${y}"]`); if (!cell) return;
  const v = $('#boardViewport').getBoundingClientRect(), c = cell.getBoundingClientRect();
  boardView.x += v.left + v.width / 2 - (c.left + c.width / 2);
  boardView.y += v.top + v.height / 2 - (c.top + c.height / 2);
  clampBoardView();
}
function showTileInfoAt(x, y) {
  const info = $('#tileInfo'), tile = state && G.tileAt(state, x, y);
  if (!tile?.open) { info.hidden = true; info.textContent = ''; return; }
  const { name, rule } = V.tileDetails(tile);
  info.textContent = `${name}. ${rule}`; info.hidden = false;
}
function setupBoardNavigation() {
  const v = $('#boardViewport');
  $('#zoomIn').onclick = () => zoomBoard(boardView.scale * 1.25);
  $('#zoomOut').onclick = () => zoomBoard(boardView.scale / 1.25);
  $('#zoomFit').onclick = fitBoard;
  v.addEventListener('wheel', e => { e.preventDefault(); zoomBoard(boardView.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
  v.addEventListener('pointerdown', e => {
    const cell = e.target.closest?.('.cell'), key = cell?.dataset.cell;
    clearTimeout(longPressTimer); longPressTimer = null;
    if (key && state && G.tileAt(state, ...key.split(',').map(Number))?.open) {
      longPressTimer = setTimeout(() => { showTileInfoAt(...key.split(',').map(Number)); suppressCellClickUntil = Date.now() + 400; if (gesture) gesture.longPressed = true; }, 520);
    }
    v.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, x: boardView.x, y: boardView.y, moved: false };
    else if (pointers.size === 2) {
      clearTimeout(longPressTimer); longPressTimer = null;
      const [a, b] = [...pointers.values()], r = v.getBoundingClientRect();
      gesture = { type: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), scale: boardView.scale, x: boardView.x, y: boardView.y, midX: (a.x + b.x) / 2 - r.left, midY: (a.y + b.y) / 2 - r.top, moved: false };
    }
  });
  v.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 8 || gesture.type === 'pinch') { clearTimeout(longPressTimer); longPressTimer = null; }
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const r = v.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, next = Math.max(boardView.minScale, Math.min(boardView.maxScale, gesture.scale * d / Math.max(1, gesture.distance)));
      const ax = (gesture.midX - gesture.x) / gesture.scale, ay = (gesture.midY - gesture.y) / gesture.scale;
      boardView.scale = next; boardView.x = mx - ax * next; boardView.y = my - ay * next; gesture.moved = true; clampBoardView();
    } else if (gesture.type === 'pan' && pointers.size === 1) {
      if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 4) gesture.moved = true;
      if (gesture.moved) { boardView.x = gesture.x + e.clientX - gesture.startX; boardView.y = gesture.y + e.clientY - gesture.startY; clampBoardView(); }
    }
  });
  const pointerEnd = e => {
    clearTimeout(longPressTimer); longPressTimer = null;
    pointers.delete(e.pointerId);
    if (gesture?.moved || gesture?.longPressed) suppressCellClickUntil = Date.now() + 350;
    if (pointers.size === 1) { const [p] = pointers.values(); gesture = { type: 'pan', startX: p.x, startY: p.y, x: boardView.x, y: boardView.y, moved: false }; }
    else gesture = null;
  };
  v.addEventListener('pointerup', pointerEnd); v.addEventListener('pointercancel', pointerEnd);
  const ro = new ResizeObserver(() => fitBoard()); ro.observe(v);
  requestAnimationFrame(fitBoard);
}

function render() {
  const s = state, moves = myTurn() ? G.classifyMoves(G.publicState(s)) : []; // подсветка не выдаёт содержимое закрытых клеток
  const targets = V.plateHidesMoves(plate, sel) ? [] : V.targets(moves, { s, sel, withCoin }); // открыта плашка, пират не выбран — без подсветки
  const b = $('#board'), focusedCell = b.contains(document.activeElement) ? document.activeElement.dataset.cell : null; b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'cell'; c.dataset.cell = `${x},${y}`; c.style.gridArea = `${y + 1} / ${x + 1}`; // явное место: плашка поверх клеток не сдвигает их
    const t = G.tileAt(s, x, y), details = t ? V.tileDetails(t) : null;
    if (t) { c.classList.add(t.open ? 'open' : 'closed', 'k-' + t.kind); if (t.used) c.classList.add('used'); c.innerHTML = tileHTML(t); c.title = `${details.name}. ${details.rule}`; } else c.classList.add('sea');
    const sh = G.shipAt(s, x, y);
    if (sh >= 0) { c.classList.add('ship'); c.style.setProperty('--team', G.TEAMS[sh].color); c.insertAdjacentHTML('afterbegin', pic(shipImg(sh), '⛵', 'tile')); }
    const ps = s.pirates.filter(p => p.alive && p.x === x && p.y === y);
    const st = V.stacks(s, ps, sel);
    st.forEach((k, i) => { const p = k.top, many = k.n > 1;
      const d = document.createElement('i');
      const mark = V.coinMark(s, p, moves, { sel, withCoin, myTurn: myTurn() }), coin = mark === 'coin' || mark === 'treasure', tre = mark === 'treasure';
      d.className = `pirate n${st.length} i${i}` + (many ? ' stack' : '') + (p.id === sel ? ' sel' : '') + (p.trapped ? ' trapped' : '') + (p.inCave ? ' incave' : '');
      d.title = G.pieceName(s, p) + (coin ? (tre ? ', несёт сокровище' : ', несёт монету') : '') + (p.trapped ? ', в капкане' : '') + (p.inCave ? ', в пещере' : '') + (many ? `, на клетке ${k.n} пирата — выбор на плашке` : '') + (k.drunk ? ', пьян — пропускает ход' : '') + (mark === 'can' ? ', может взять монету' : mark === 'canTreasure' ? ', может взять сокровище' : '');
      d.innerHTML = pic(pieceImg(p), '●', 'pi') + (coin ? (tre ? pic(treasureImg, '💰', 'pcoin ptre') : pic(coinImg, '🪙', 'pcoin')) : mark === 'can' ? pic(coinImg, '🪙', 'pcoin can') : mark === 'canTreasure' ? pic(treasureImg, '💰', 'pcoin ptre can') : '') + (p.spin ? `<em>${p.spin}</em>` : '') + (p.role === 'exmissionary' ? `<b class="role">${ROLE_BADGE[p.role]}</b>` : '') + (k.label ? `<b class="num${many ? ' cnt' : ''}">${k.label}</b>` : '') + (k.drunk ? `<img class="drunk" src="${V.DRUNK_ICON}" alt="пьян">` : '');
      c.append(d);
    });
    const here = targets.filter(m => m.x === x && m.y === y);
    if (here.length) { const k = V.hlKind(here); c.classList.add('target', 'hl-' + k); c.insertAdjacentHTML('beforeend', pic(hlImg(k), '', 'hl')); }
    if (targets.length && V.coinHintAt(moves, x, y, { sel, withCoin })) { c.classList.add('hl-hint'); c.insertAdjacentHTML('beforeend', pic(hlImg('coin'), '', 'hl hint')); }
    const tileLabel = t ? `${details.name}${t.open ? `. ${details.rule}` : ''}` : 'Море';
    const cellNames = [tileLabel, sh >= 0 ? `корабль ${G.TEAMS[sh].name.toLowerCase()}` : '', ...ps.map(p => G.pieceName(s, p))].filter(Boolean);
    c.setAttribute('aria-label', `${cellNames.join(', ')}, столбец ${x + 1}, ряд ${y + 1}`);
    c.onclick = () => click(x, y, targets);
    c.onkeydown = e => {
      const delta = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (!delta) return;
      const nx = x + delta[0], ny = y + delta[1];
      if (nx < 0 || nx >= G.N || ny < 0 || ny >= G.N) return;
      e.preventDefault(); b.querySelector(`[data-cell="${nx},${ny}"]`)?.focus();
    };
    b.append(c);
  }
  if (focusedCell) b.querySelector(`[data-cell="${focusedCell}"]`)?.focus();
  const T = G.TEAMS[s.current];
  const hp = V.headerParts(s, { myTurn: myTurn(), online: !!net }), dot = $('#turnDot');
  dot.hidden = !!s.over; dot.style.background = T.color;
  if ($('#turnPrefix').textContent !== hp.prefix) $('#turnPrefix').textContent = hp.prefix;
  if ($('#turnText').textContent !== hp.text) $('#turnText').textContent = hp.text;
  $('#status').textContent = notice || V.plateHint(plate, sel, myTurn()) || (sel == null ? V.skipNotice(s) : null) || V.coinHint(moves, { sel, withCoin }) || V.selectHint(s, sel, { myTurn: myTurn() }) || ''; notice = '';
  const sc = G.sideScores(s);
  $('#score').innerHTML = Object.keys(sc).map(k => `${G.sideName(s, +k)}: <b>${sc[k]}</b>`).join(' · ') + ` · осталось ${G.coinsLeft(s)} · утонуло ${s.lost} · ром: ${G.activeTeams(s.mode).map(t => s.rum[t]).join('/')}`;
  const bs = V.buttons(s, moves, { sel, withCoin, myTurn: myTurn() });
  for (const [id, b] of [['#shipBtn', bs.ship], ['#coinBtn', bs.coin], ['#reviveBtn', bs.revive], ['#rumBtn', bs.rum]]) { const el = $(id); el.disabled = b.disabled; el.textContent = b.label; el.setAttribute('aria-pressed', b.pressed); el.hidden = false; }
  $('#me').value = me;
  { const es = V.logEntries(s, 5), esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); $('#log').hidden = !es.length;
    $('#log').innerHTML = '<h3>Журнал</h3><ol>' + es.map(e => `<li>${e.n ? `<span class="ln">№${e.n}</span>` : ''}${e.team != null ? `<i class="dot" style="--team:${G.TEAMS[e.team].color}"></i>` : ''}<span class="lt">${esc(e.text)}</span></li>`).join('') + '</ol>'; }
  if (s.pending && (!s.pending.type || s.pending.type === 'cave') && myTurn() && sel !== s.pending.pid) { sel = s.pending.pid; withCoin = s.pending.treasure ? 'T' : s.pending.coin; return render(); }
  const ya = $('#youAre'); ya.hidden = !net; if (net) { ya.textContent = V.youAreText(s, net.sess.player); ya.style.borderColor = G.TEAMS[G.teamsOfPlayer(s, net.sess.player)[0]]?.color ?? ''; }
  $('#freeNote').textContent = V.FREE_SHORT;
  $('#fileHelp').hidden = !V.showFileHelp({ online: !!net, me });
  if (plate && myTurn()) {
    const pl = V.platePlacement({ x: plate.x, n: plate.pids.length }), d = document.createElement('div');
    d.className = 'plate side-' + pl.side; d.style.setProperty('--n', plate.pids.length); d.style.gridRow = String(plate.y + 1); d.style.gridColumn = `${pl.start + 1} / span ${pl.span}`;
    d.innerHTML = plate.pids.map(id => { const p = s.pirates[id], n = V.pirateNumber(s, p); return `<button class="tok${id === sel ? ' sel' : ''}" data-pid="${id}" style="--team:${G.TEAMS[p.team].color}" title="${G.pieceName(s, p)}">${pic(pieceImg(p), '●', 'ti')}${n ? `<b>${n}</b>` : ''}</button>`; }).join('');
    d.querySelectorAll('.tok').forEach(btn => btn.onclick = e => { e.stopPropagation(); choose(+btn.dataset.pid); });
    b.append(d);
  } else plate = null;
  renderCrew(s, moves);
  renderBanner();
  if (!net) localStorage.setItem('jackal-save', G.serialize(s));
}
function choose(pid) { sel = pid; const p = state.pirates[pid], c = p.carry; withCoin = c === G.TREASURE_VALUE ? 'T' : !!c; plate = null; render(); requestAnimationFrame(() => centerBoardCell(p.x, p.y)); }
function renderCrew(s, moves) {
  const can = new Set(moves.map(m => m.pid)), el = $('#crew');
  const tok = (t, color) => { const p = s.pirates[t.pid];
    return `<button class="tok${t.alive ? '' : ' dead'}${t.pid === sel ? ' sel' : ''}" data-pid="${t.pid}" style="--team:${color}" title="${G.pieceName(s, p)}${t.alive ? '' : ' — погиб'}"${t.alive && can.has(t.pid) && myTurn() ? '' : ' disabled'}>${pic(pieceImg(p), '●', 'ti')}${t.num ? `<b>${t.num}</b>` : ''}${p.role === 'exmissionary' ? '<i>✝</i>' : ''}${V.isDrunk(s, p) ? `<img class="drunk" src="${V.DRUNK_ICON}" alt="пьян">` : ''}</button>`; };
  el.innerHTML = V.crewPanels(s, { player: net ? net.sess.player : me === 'all' ? null : +me }).map(cp => { const color = G.TEAMS[cp.team].color;
    return `<section class="panel${cp.current ? ' current' : ''}" style="--team:${color}"><header><span>${cp.label}</span><span class="sc">${pic(coinImg, '🪙', 'ci')} ${cp.score}</span></header><div class="toks">${cp.regular.map(t => tok(t, color)).join('')}${cp.chars.length ? '<span class="div"></span>' + cp.chars.map(t => tok(t, color)).join('') : ''}</div></section>`; }).join('');
  el.querySelectorAll('.tok:not([disabled])').forEach(b => b.onclick = () => choose(+b.dataset.pid));
}
function renderBanner() {
  const el = $('#banner');
  const joiningBluetooth = net?.type === 'bluetooth' && net.role === 'guest' && !state;
  const b = joiningBluetooth
    ? { kind: net.everConnected ? 'wait' : 'lost', title: net.everConnected ? 'Подключено к телефону' : 'Подключаемся к телефону…', sub: net.everConnected ? 'Получаем состояние игры от хоста' : 'Подтвердите сопряжение, если Android спросит' }
    : net && V.onlineBanner(state, { player: net.sess.player, connected: net.connected, opponent: net.opponent, gone: net.gone });
  el.hidden = !b; if (!b) return;
  const sub = net.type === 'bluetooth' && net.role === 'host' && net.opponent === 'waiting'
    ? `На втором телефоне выберите «${net.deviceName || 'этот телефон'}» в списке Bluetooth` : b.sub;
  el.className = 'banner b-' + b.kind; el.innerHTML = `<b>${b.title}</b><small>${sub}</small>`;
  $('#me').closest('label').hidden = true;
}
// Ход: локально применяем, онлайн — отправляем на сервер (он проверит и разошлёт состояние).
async function play(mv) { plate = null;
  sel = null; withCoin = false;
  if (!net) { state = G.applyMove(state, mv); return render(); }
  if (net.type === 'bluetooth') {
    try {
      if (net.sess.player === 0) {
        state = G.applyMove(state, mv, { asPlayer: 0 }); render();
        if (net.connected) await sendBluetooth(stateMessage(state));
      } else await sendBluetooth({ type: 'move', move: mv });
    } catch (e) { notice = e.message; render(); }
    return;
  }
  try { await Net.move(net.sess, mv); } catch (e) { notice = e.message; render(); }
}
function updateOnlineDialog() {
  const online = net?.type === 'online', nearby = net?.type === 'bluetooth';
  $('#onlineSetup').hidden = !!net;
  $('#codeArea').hidden = !online;
  $('#btSessionNote').hidden = !nearby;
  if (nearby) $('#btSessionNote').textContent = net.role === 'host' && net.opponent === 'waiting'
    ? 'Игра по Bluetooth. Ждём подключения соперника.' : 'Игра идёт по Bluetooth без интернета.';
  $('#leaveBtn').hidden = !net;
  $('#leaveBtn').textContent = nearby ? 'Выйти из Bluetooth-партии' : 'Выйти из онлайн-партии';
}
function goOnline(sess) {
  net?.stop(); net = { sess, type: 'online', connected: false, opponent: 'waiting', stop: null, gone: false };
  updateOnlineDialog();
  state = null; $('#board').innerHTML = ''; $('#me').closest('label').hidden = true; // не показывать прежнюю локальную партию (2p) до прихода состояния 1v1
  net.stop = Net.connect(sess, msg => {
    state = msg.state; net.opponent = msg.opponent; showCode(msg.code);
    if (msg.opponent !== 'waiting' && $('#online').open) $('#online').close();
    render();
  }, ok => { if (net && net.connected !== ok) { net.connected = ok; if (state) render(); } }, () => { if (!net) return; roomGone(); }); // сервер её не знает (перезапуск/уборка): сессию забыть, открыть меню
  window.jackalDropConnection = () => net?.stop.drop(); // для Тестировщика: имитация обрыва связи
}
// Сервер сообщил, что комнаты нет (перезапуск/уборка): прекратить переподключение, убрать плашку связи и онлайн-окно, оставить только меню с надписью.
function roomGone() {
  net.stop(); Net.forget(); net = null; state = null; sel = null; plate = null;
  const b = $('#banner'); b.hidden = true; b.innerHTML = '';
  if ($('#online').open) $('#online').close();
  sessionStorage.setItem(V.NOTE_KEY, 'Партия больше не существует'); showMenu();
}
// Покинуть онлайн-партию. Пока партия идёт — только с подтверждения; возвращает false, если игрок передумал.
const LEAVE_Q = 'Выйти из партии? Соперник увидит, что вы вышли.';
function goLocal(confirmed = false) {
  if (!net) return true;
  if (!confirmed && V.needsLeaveConfirm(net, state) && !confirm(LEAVE_Q)) return false;
  const wasBluetooth = net.type === 'bluetooth';
  net.stop(); if (!wasBluetooth && !net.gone) Net.leave(net.sess); Net.forget(); net = null; updateOnlineDialog(); $('#me').closest('label').hidden = false; $('#banner').hidden = true; return true;
}
function showCode(code) { $('#codeBox').innerHTML = [...code].map(c => `<span>${c}</span>`).join(''); $('#codeArea').hidden = false; }

const bluetooth = () => globalThis.jackalBluetooth;
function addBluetoothDevice(device) {
  if (!device?.address || $(`#btDevices [data-address="${device.address}"]`)) return;
  const li = document.createElement('li'), button = document.createElement('button');
  button.type = 'button'; button.dataset.address = device.address; button.textContent = device.name || 'Телефон рядом';
  button.onclick = () => joinBluetooth(device.address);
  li.append(button); $('#btDevices').append(li);
}
async function sendBluetooth(message) {
  const plugin = bluetooth();
  if (!plugin) throw new Error('Bluetooth доступен только в Android-приложении.');
  await plugin.send({ data: JSON.stringify(message) });
}
function scheduleBluetoothReconnect(session) {
  if (net !== session || session.role !== 'guest' || !session.everConnected || session.left || session.retryTimer) return;
  const delay = Math.min(500 * 2 ** session.retryCount++, 8000);
  session.retryTimer = setTimeout(() => {
    session.retryTimer = null;
    if (net !== session) return;
    bluetooth().connect({ address: session.address }).catch(scheduleBluetoothReconnect.bind(null, session));
  }, delay);
}
async function beginBluetooth(role, address = null) {
  const plugin = bluetooth();
  if (!plugin) throw new Error('Bluetooth-игра доступна только в Android-приложении.');
  net?.stop();
  const session = { type: 'bluetooth', role, sess: { player: role === 'host' ? 0 : 1 }, connected: role === 'host', opponent: 'waiting', gone: false, deviceName: '', address, retryCount: 0, retryTimer: null, everConnected: false, stop: () => {} };
  net = session;
  updateOnlineDialog();
  const messageHandle = await plugin.addListener('message', async event => {
    if (net !== session) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (session.role === 'host' && message.type === 'hello') {
      session.connected = true; session.opponent = 'online';
      try { await sendBluetooth(stateMessage(state)); } catch (e) { notice = e.message; }
      render();
    } else if (session.role === 'host' && message.type === 'move') {
      try {
        if (!state || G.controllerOf(state) !== 1) throw new Error('Сейчас ход другого игрока.');
        state = G.applyMove(state, message.move, { asPlayer: 1 });
        session.opponent = 'online'; render();
        await sendBluetooth(stateMessage(state));
      } catch (e) { try { await sendBluetooth({ type: 'error', message: e.message }); } catch {} }
    } else if (message.type === 'leave') {
      session.left = true; session.opponent = 'left'; session.connected = true;
      clearTimeout(session.retryTimer); session.retryTimer = null; render();
    } else if (session.role === 'guest' && message.type === 'state') {
      state = message.state; session.connected = true; session.opponent = message.opponent || 'online'; render();
    } else if (session.role === 'guest' && message.type === 'error') {
      notice = message.message || 'Сервер отклонил ход.'; render();
    }
  });
  const connectionHandle = await plugin.addListener('connection', async event => {
    if (net !== session) return;
    session.connected = !!event.connected;
    if (event.connected) {
      session.everConnected = true; session.retryCount = 0; session.opponent = 'online';
      clearTimeout(session.retryTimer); session.retryTimer = null;
      if (session.role === 'guest') { try { await sendBluetooth({ type: 'hello' }); } catch (e) { notice = e.message; } }
      else { try { await sendBluetooth(stateMessage(state)); } catch {} }
    } else if (session.left) {
      session.connected = true; session.opponent = 'left';
    } else {
      session.opponent = 'offline';
      scheduleBluetoothReconnect(session);
    }
    if (state) render(); else renderBanner();
  });
  session.stop = () => {
    clearTimeout(session.retryTimer); session.stopped = true;
    messageHandle.remove(); connectionHandle.remove();
    plugin.stopDiscovery?.().catch(() => {}); plugin.close().catch(() => {});
  };
  state = role === 'host' ? G.newGame({ mode: '1v1', seed: Date.now() % 1e9, options: { houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked } }) : null;
  $('#me').closest('label').hidden = true;
  sel = null; plate = null; withCoin = false;
  $('#crew').hidden = false; $('#turnDot').hidden = false; $('#menu').close();
  if (role === 'guest') { $('#board').innerHTML = ''; renderBanner(); }
  else render();
  return session;
}
async function hostBluetooth() {
  try {
    if (!goLocal()) return;
    await bluetooth().requestDiscoverable();
    const session = await beginBluetooth('host');
    const result = await bluetooth().startHost();
    session.deviceName = result.deviceName || 'этот телефон'; render(); $('#nearby').close();
  } catch (e) {
    if (net?.type === 'bluetooth') { net.stop(); net = null; state = null; }
    $('#btErr').textContent = e.message;
  }
}
async function joinBluetooth(address) {
  try {
    if (!goLocal()) return;
    const session = await beginBluetooth('guest', address);
    await bluetooth().connect({ address });
    $('#nearby').close();
  } catch (e) {
    if (net?.type === 'bluetooth' && net.role === 'guest') { net.stop(); net = null; state = null; }
    $('#btErr').textContent = e.message;
  }
}

function click(x, y, targets) {
  if (Date.now() < suppressCellClickUntil) return;
  const hit = targets.find(m => m.x === x && m.y === y);
  if (hit) { const { kind, ...mv } = hit; return play(mv); }
  showTileInfoAt(x, y);
  if (sel === 'rum') { sel = null; return render(); }
  if (!myTurn()) { const n = V.turnNotice(state, x, y); if (n) { notice = n; render(); } return; }
  if (state.pending) { const p = state.pirates[state.pending.pid]; if (state.pending.type === 'lighthouse' || state.pending.type === 'quake' || !(p.x === x && p.y === y)) { notice = V.blockedNotice(state); render(); } return; }
  const mine = state.pirates.filter(p => p.alive && p.x === x && p.y === y && p.team === state.current && G.pirateMoves(state, p).length);
  if (mine.length > 1) { plate = { x, y, pids: mine.map(p => p.id) }; if (!mine.some(p => p.id === sel)) sel = null; } // несколько своих — плашка выбора
  else if (mine.length) { plate = null; return choose(mine[0].id); }
  else { sel = null; plate = null; notice = V.drunkNotice(state, x, y) || V.turnNotice(state, x, y) || ''; }
  render();
}

function start(mode) { if (!goLocal()) return; $('#crew').hidden = false; $('#turnDot').hidden = false; state = G.newGame({ mode, seed: Date.now() % 1e9, options: { houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked } }); sel = null; render(); }
$('#coinBtn').onclick = () => { withCoin = V.nextCargo(G.legalMoves(state), sel, withCoin); render(); };
$('#rumBtn').onclick = () => { sel = sel === 'rum' ? null : 'rum'; render(); };
$('#shipBtn').onclick = () => { sel = sel === 'ship' ? null : 'ship'; render(); };
$('#reviveBtn').onclick = () => { const m = G.legalMoves(G.publicState(state)).find(m => m.type === 'revive'); if (m) play(m); };
$('#me').onchange = e => { me = e.target.value; localStorage.setItem('jackal-me', me); sel = null; render(); };
$('#newBtn').onclick = () => showMenu();
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { start(b.dataset.mode); $('#menu').close(); });
$('#saveBtn').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([G.serialize(state)], { type: 'application/json' })); a.download = `jackal-hod-${state.turn + 1}.json`; a.click(); };
// онлайн: спросить ДО выбора файла; сам выход — после того как файл выбран
let fileConfirmed = false;
$('#loadBtn').onclick = () => {
  if (net) fileConfirmed = !V.needsLeaveConfirm(net, state) || confirm(LEAVE_Q);
  else fileConfirmed = !V.localInProgress(state) || confirm(V.LOSE_LOCAL_Q); // локально: спросить ДО окна выбора файла
  if (fileConfirmed) $('#file').click();
};
$('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (!goLocal(fileConfirmed)) return; state = G.loadState(await f.text()); sel = null; render(); } catch (err) { alert(err.message); } e.target.value = ''; };
// v0.5.19: плашка статуса сервера — до ответа /health.
let awake = null, waking = null;
function placeWakeBanner() {
  const el = $('#wake'), dialog = [$('#online'), $('#nearby'), $('#menu')].find(d => d.open);
  if (dialog) {
    const heading = dialog.querySelector('h2');
    if (el.parentElement !== dialog) dialog.insertBefore(el, heading?.nextSibling ?? dialog.firstChild);
  } else if (el.parentElement !== document.body) document.body.append(el);
}
function wakeServer() {
  if (!SERVER_CONFIGURED) return Promise.resolve(false);
  if (awake) return Promise.resolve(true); if (waking) return waking;
  const el = $('#wake'), st = $('#wakeStatus'), again = $('#wakeRetry'); let t0 = Date.now(), tick = null;
  const show = phase => { st.textContent = V.wakeStatus(phase, Math.round((Date.now() - t0) / 1000)); again.hidden = phase !== 'fail'; el.dataset.phase = phase; };
  waking = Net.wake({ onWait: () => { el.hidden = false; show('wait'); tick = setInterval(() => show('wait'), 1000); } }).then(ok => {
    clearInterval(tick); waking = null; awake = ok;
    if (!el.hidden) { show(ok ? 'ok' : 'fail'); if (ok) setTimeout(() => { el.hidden = true; }, 2500); }
    return ok;
  });
  return waking;
}
$('#wakeRetry').onclick = () => { awake = null; wakeServer(); };
$('#wakeClose').onclick = () => { $('#wake').hidden = true; };
async function needServer() {
  if (!SERVER_CONFIGURED) throw new Error('Онлайн-сервер не настроен. Задайте SERVER_URL при сборке клиента.');
  if (await wakeServer()) return;
  throw new Error('Сервер не ответил. Попробуйте ещё раз позже.');
}
// Онлайн-меню
$('#onlineBtn').onclick = () => { $('#menu').close(); $('#onlineErr').textContent = ''; updateOnlineDialog(); $('#online').showModal(); placeWakeBanner(); if (!net) wakeServer(); };
$('#nearbyBtn').onclick = () => { $('#menu').close(); $('#btErr').textContent = ''; $('#btDevices').innerHTML = ''; $('#nearby').showModal(); placeWakeBanner(); };
$('#btHostBtn').onclick = hostBluetooth;
$('#btScanBtn').onclick = async () => {
  const plugin = bluetooth();
  if (!plugin) { $('#btErr').textContent = 'Bluetooth-игра доступна только в Android-приложении.'; return; }
  $('#btErr').textContent = ''; $('#btDevices').innerHTML = '';
  try {
    const found = await plugin.addListener('deviceFound', addBluetoothDevice);
    const scan = await plugin.discoverDevices();
    for (const device of scan.devices || []) addBluetoothDevice(device);
    if (!scan.scanning) $('#btErr').textContent = 'Не удалось начать поиск. Проверьте разрешения Bluetooth.';
    $('#nearby').addEventListener('close', () => found.remove(), { once: true });
  } catch (e) { $('#btErr').textContent = e.message; }
};
$('#createBtn').onclick = async () => { try { await needServer(); if (!goLocal()) return; const sess = await Net.create({ houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked }); showCode(sess.code); goOnline(sess); } catch (e) { $('#onlineErr').textContent = e.message; } };
$('#shareBtn').onclick = async () => { const code = net?.sess.code; if (!code) return; const text = `Сыграем в «Шакал»? Код игры: ${code} — ${location.origin}`; try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(code); $('#onlineErr').textContent = 'Код скопирован'; } } catch {} };
$('#joinBtn').onclick = async () => { const code = $('#codeIn').value.trim().toUpperCase(); if (!code) return; try { await needServer(); if (!goLocal()) return; const sess = await Net.join(code); goOnline(sess); $('#online').close(); } catch (e) { $('#onlineErr').textContent = e.message; } };
$('#codeIn').onkeydown = e => { if (e.key === 'Enter') $('#joinBtn').click(); };
$('#leaveBtn').onclick = () => { if (!goLocal()) return; $('#online').close(); try { state = G.loadState(localStorage.getItem('jackal-save')); } catch { return start(V.DEFAULT_MODE); } render(); };
addEventListener('jackal:backbutton', () => {
  const dialog = $('#online').open ? 'online' : $('#menu').open ? 'menu' : null;
  switch (V.androidBackAction({ dialog, plate: !!plate, online: !!net })) {
    case 'close-online': $('#online').close(); break;
    case 'close-menu': $('#menu').close(); break;
    case 'close-plate': plate = null; render(); break;
    case 'confirm-online-leave': if (confirm(LEAVE_Q)) $('#leaveBtn').click(); break;
    case 'minimize': dispatchEvent(new Event('jackal:minimize')); break;
  }
});
// Нейтральное поле без фигур (за меню в новой вкладке).
function renderEmpty() {
  state = null; sel = null; plate = null; const b = $('#board'); b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) { const c = document.createElement('button'); c.type = 'button'; c.tabIndex = -1; c.disabled = true; c.className = 'cell ' + (V.isLandCell(x, y) ? 'closed' : 'sea'); c.style.gridArea = `${y + 1} / ${x + 1}`; c.setAttribute('aria-label', `${V.isLandCell(x, y) ? 'Закрытая клетка' : 'Море'}, столбец ${x + 1}, ряд ${y + 1}`); b.append(c); }
  for (const id of ['#crew', '#banner', '#youAre']) $(id).hidden = true;
  $('#score').textContent = ''; $('#status').textContent = ''; $('#tileInfo').hidden = true; $('#tileInfo').textContent = ''; $('#turnText').textContent = ''; $('#turnPrefix').textContent = ''; $('#turnDot').hidden = true; $('#log').textContent = '';
  $('#me').closest('label').hidden = false; $('#banner').hidden = true;
}
// Главное меню; сохранённая локальная партия — только по кнопке «Продолжить».
function showMenu(note = sessionStorage.getItem(V.NOTE_KEY) || '') {
  if (!state) renderEmpty();
  const info = V.resumeInfo(localStorage.getItem('jackal-save')), cb = $('#continueBtn');
  cb.hidden = !info; if (info) cb.querySelector('small').textContent = info.label;
  $('#menuNote').textContent = note; $('#menuNote').hidden = !note;
  if (!$('#menu').open) $('#menu').showModal();
  placeWakeBanner();
}
// первое нажатие где угодно снимает заметку (и после перезагрузки она видна до него)
addEventListener('pointerdown', () => { if (!sessionStorage.getItem(V.NOTE_KEY)) return; sessionStorage.removeItem(V.NOTE_KEY); const n = $('#menuNote'); n.hidden = true; n.textContent = ''; }, true); // текст убрать, чтобы скринридер не читал
$('#continueBtn').onclick = () => { if (!goLocal()) return; try { state = G.loadState(localStorage.getItem('jackal-save')); sel = null; plate = null; $('#crew').hidden = false; $('#menu').close(); render(); } catch (e) { alert(e.message); } };
$('#menu').addEventListener('close', () => { placeWakeBanner(); if (!state && !net && !$('#online').open && !$('#nearby').open) start(V.DEFAULT_MODE); });
$('#online').addEventListener('close', () => { placeWakeBanner(); if (!state && !net) showMenu(); }); // «Отмена» на пустом поле — новая 1v1
$('#nearby').addEventListener('close', () => { placeWakeBanner(); if (!state && !net && !$('#online').open) showMenu(); });
$('#nearbyBtn').hidden = !bluetooth();
const sess = Net.saved();
if (IS_REMOTE || sess) wakeServer(); // клиент на GitHub Pages — сразу будим сервер, плашка видна с первого экрана
setupBoardNavigation();
if (sess && location.protocol.startsWith('http')) goOnline(sess);
else showMenu(); // новая вкладка: меню над пустым полем, старую партию не восстанавливаем сами
