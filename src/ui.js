import * as G from './game.js';
import * as V from './view.js';
import * as Net from './net.js';
import { stateMessage } from './bluetooth-protocol.js';
import { IS_REMOTE, SERVER_CONFIGURED } from './config.js';
import { ASSETS, ARROW_GLYPH, ROLE_BADGE, tileImg, pirateImg, pieceImg, shipImg, coinImg, treasureImg, hlImg } from './assets.js';
import {
  boardGestureMoved, boardZoomLimits, clampBoardTransform, mobileBoardMetrics,
  mobileActionSlots, toggleBoardZoom, zoomBoardAtPoint,
} from './mobile-layout.js';
const $ = s => document.querySelector(s);
let plate = null; // плашка выбора пирата: { x, y, pids }
let state = null, sel = null, withCoin = false, notice = '';
let logExpanded = false, lastCenteredTurn = null, noticeTimer = null;
const boardView = { scale: 1, minScale: 1, maxScale: 3, x: 0, y: 0, mobileLayout: null };
const pointers = new Map();
let gesture = null, longPressTimer = null;
let pendingBoardTap = null, pendingBoardTapTimer = null, suppressPointerClickUntil = 0;
let multiTouchActive = false, centeringTimer = null;
const BOARD_DRAG_THRESHOLD = 8, DOUBLE_TAP_MS = 280, DOUBLE_TAP_DISTANCE = 36;
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
const isHotSeat = () => !net && me === 'all';

function viewportSize() { const v = $('#boardViewport'); return { v, w: v.clientWidth, h: v.clientHeight, bw: $('#board').offsetWidth, bh: $('#board').offsetHeight }; }
function compactLayout() { return matchMedia('(max-width: 600px), (orientation: portrait)').matches; }
function clearMobileBoardSizing() {
  const b = $('#board');
  for (const property of ['grid-template-columns', 'grid-template-rows', 'width', 'height', '--cell-size']) b.style.removeProperty(property);
}
function applyMobileBoardLayout({ fit = false } = {}) {
  const root = $('#gameScreen'), v = $('#boardViewport'), b = $('#board');
  const compact = compactLayout();
  root.classList.toggle('mobile-layout', compact);
  root.classList.toggle('log-expanded', compact && logExpanded);
  if (!compact) { clearMobileBoardSizing(); boardView.mobileLayout = null; return; }
  if (!v.clientWidth || !v.clientHeight) return;
  const gap = 1;
  const metrics = mobileBoardMetrics({ viewportWidth: v.clientWidth, viewportHeight: v.clientHeight, gap });
  const size = metrics.cellSize;
  const rowSizes = Array.from({ length: G.N }, () => `${size}px`);
  b.style.gridTemplateColumns = `repeat(${G.N}, ${size}px)`;
  b.style.gridTemplateRows = rowSizes.join(' ');
  b.style.width = `${metrics.boardWidth}px`;
  b.style.height = `${metrics.boardHeight}px`;
  b.style.setProperty('--cell-size', `${size}px`);
  boardView.minScale = 1;
  const limits = boardZoomLimits({ viewportWidth: v.clientWidth, boardWidth: metrics.boardWidth, columns: G.N, minScale: 1, maxScale: 8 });
  boardView.maxScale = limits.maxScale;
  const layout = { width: v.clientWidth, height: v.clientHeight, boardWidth: metrics.boardWidth, boardHeight: metrics.boardHeight };
  const changed = !boardView.mobileLayout || Object.keys(layout).some(key => Math.abs(layout[key] - boardView.mobileLayout[key]) > 0.5);
  boardView.mobileLayout = layout;
  if (fit || changed) {
    boardView.scale = boardView.minScale;
    boardView.x = (v.clientWidth - metrics.boardWidth) / 2;
    boardView.y = (v.clientHeight - metrics.boardHeight) / 2;
  }
  clampBoardView();
}
function clampBoardView() {
  const { w, h, bw, bh } = viewportSize(); if (!w || !h || !bw || !bh) return;
  Object.assign(boardView, clampBoardTransform({
    ...boardView, viewportWidth: w, viewportHeight: h, boardWidth: bw, boardHeight: bh,
  }));
  const b = $('#board'); b.style.transform = `translate3d(${boardView.x}px,${boardView.y}px,0) scale(${boardView.scale})`;
  $('#zoomLevel').value = boardView.scale <= boardView.minScale + .001 ? 'Целиком' : `${Math.round(boardView.scale * 100)}%`;
  $('#zoomOut').disabled = boardView.scale <= boardView.minScale + .001;
  $('#zoomIn').disabled = boardView.scale >= boardView.maxScale - .001;
}
function fitBoard() {
  if (compactLayout()) {
    applyMobileBoardLayout();
    const { w, h, bw, bh } = viewportSize(); if (!w || !h || !bw || !bh) return;
    boardView.scale = boardView.minScale;
    boardView.x = (w - bw * boardView.scale) / 2; boardView.y = (h - bh * boardView.scale) / 2;
    $('#boardViewport').classList.remove('is-centering');
    clampBoardView(); return;
  }
  const { w, h, bw, bh } = viewportSize(); if (!w || !h || !bw || !bh) return;
  const fit = Math.min(w / bw, h / bh, 1);
  boardView.minScale = Math.max(.2, fit);
  boardView.maxScale = boardZoomLimits({ viewportWidth: w, boardWidth: bw, columns: G.N, minScale: boardView.minScale, maxScale: 8 }).maxScale;
  boardView.scale = fit;
  boardView.x = (w - bw * fit) / 2; boardView.y = (h - bh * fit) / 2;
  $('#boardViewport').classList.remove('is-centering');
  clampBoardView();
}
function zoomBoard(scale, focusX, focusY) {
  const { v, w, h, bw, bh } = viewportSize(), r = v.getBoundingClientRect();
  const fx = focusX == null ? w / 2 : focusX - r.left, fy = focusY == null ? h / 2 : focusY - r.top;
  Object.assign(boardView, zoomBoardAtPoint({
    ...boardView, nextScale: scale, focusX: fx, focusY: fy,
    viewportWidth: w, viewportHeight: h, boardWidth: bw, boardHeight: bh,
  }));
  v.classList.remove('is-centering');
  clampBoardView();
}
function centerBoardCell(x, y) {
  if (boardView.scale <= boardView.minScale + .001) return;
  const cell = $(`#board [data-cell="${x},${y}"]`); if (!cell) return;
  const viewport = $('#boardViewport'), v = viewport.getBoundingClientRect(), c = cell.getBoundingClientRect();
  viewport.classList.add('is-centering');
  boardView.x += v.left + v.width / 2 - (c.left + c.width / 2);
  boardView.y += v.top + v.height / 2 - (c.top + c.height / 2);
  clampBoardView();
  clearTimeout(centeringTimer);
  centeringTimer = setTimeout(() => viewport.classList.remove('is-centering'), 220);
}
function showTileInfoAt(x, y) {
  const info = $('#tileInfo'), tile = state && G.tileAt(state, x, y);
  const details = tile ? V.tileDetails(tile) : { name: 'Море', rule: 'Морская клетка. По ней перемещаются пираты и корабли.' };
  const icon = tile ? tileImg(tile) : tileImg({ kind: 'sea', open: true });
  const emoji = tile ? (ASSETS[tile.open ? tile.kind : 'closed']?.emoji ?? '🌴') : '🌊';
  const badgeValue = tile?.coins || tile?.treasure || 0;
  info.innerHTML = `<span class="tile-card-icon">${pic(icon, emoji, 'tile')}</span><span class="tile-card-copy"><strong>${details.name}</strong><small>${details.rule}</small></span>${badgeValue ? `<span class="tile-card-badge">${badgeValue}</span>` : ''}`;
  info.hidden = false;
}
function setupBoardNavigation() {
  const v = $('#boardViewport');
  $('#zoomIn').onclick = () => zoomBoard(boardView.scale * 1.25);
  $('#zoomOut').onclick = () => zoomBoard(boardView.scale / 1.25);
  $('#zoomFit').onclick = fitBoard;
  const clearPendingBoardTap = () => {
    clearTimeout(pendingBoardTapTimer); pendingBoardTapTimer = null; pendingBoardTap = null;
  };
  const performBoardTap = ({ x, y }) => {
    if (!state) return;
    const moves = myTurn() ? G.classifyMoves(G.publicState(state)) : [];
    click(x, y, V.targets(moves, { s: state, sel, withCoin }));
  };
  const flushPendingBoardTap = () => {
    if (!pendingBoardTap) return;
    const tap = pendingBoardTap; clearPendingBoardTap(); performBoardTap(tap);
  };
  document.addEventListener('pointerdown', e => {
    if (pendingBoardTap && !v.contains(e.target)) flushPendingBoardTap();
  }, true);
  const queueBoardTap = (e, cell) => {
    if (!cell) return;
    const [x, y] = cell.dataset.cell.split(',').map(Number), now = Date.now();
    if (pendingBoardTap && now - pendingBoardTap.time <= DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - pendingBoardTap.clientX, e.clientY - pendingBoardTap.clientY) <= DOUBLE_TAP_DISTANCE) {
      clearPendingBoardTap();
      zoomBoard(toggleBoardZoom(boardView.scale, boardView.minScale, boardView.maxScale), e.clientX, e.clientY);
      return;
    }
    if (pendingBoardTap) flushPendingBoardTap();
    pendingBoardTap = { x, y, time: now, clientX: e.clientX, clientY: e.clientY };
    pendingBoardTapTimer = setTimeout(flushPendingBoardTap, DOUBLE_TAP_MS);
  };
  v.addEventListener('click', e => {
    if (e.detail === 0 || Date.now() > suppressPointerClickUntil) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  v.addEventListener('wheel', e => {
    if (compactLayout()) return;
    e.preventDefault();
    zoomBoard(boardView.scale * Math.exp(-e.deltaY * .002), e.clientX, e.clientY);
  }, { passive: false });
  v.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = e.target.closest?.('.cell'), key = cell?.dataset.cell;
    clearTimeout(longPressTimer); longPressTimer = null;
    if (key && state && G.tileAt(state, ...key.split(',').map(Number))?.open) {
      longPressTimer = setTimeout(() => { showTileInfoAt(...key.split(',').map(Number)); if (gesture) gesture.longPressed = true; }, 520);
    }
    v.classList.remove('is-centering');
    try { v.setPointerCapture(e.pointerId); } catch { /* synthetic test pointers do not have an active browser capture */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, x: boardView.x, y: boardView.y, moved: false };
    else if (pointers.size === 2) {
      multiTouchActive = true;
      clearPendingBoardTap();
      clearTimeout(longPressTimer); longPressTimer = null;
      const [a, b] = [...pointers.values()], r = v.getBoundingClientRect();
      gesture = { type: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), scale: boardView.scale, x: boardView.x, y: boardView.y, midX: (a.x + b.x) / 2 - r.left, midY: (a.y + b.y) / 2 - r.top, moved: true };
    }
  });
  v.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.type === 'pan' && boardGestureMoved(gesture.startX, gesture.startY, e.clientX, e.clientY, BOARD_DRAG_THRESHOLD)) {
      if (!gesture.moved) { gesture.moved = true; if (pendingBoardTap) flushPendingBoardTap(); }
      clearTimeout(longPressTimer); longPressTimer = null;
    }
    if (gesture.type === 'pinch') { clearTimeout(longPressTimer); longPressTimer = null; }
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const r = v.getBoundingClientRect(), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, next = Math.max(boardView.minScale, Math.min(boardView.maxScale, gesture.scale * d / Math.max(1, gesture.distance)));
      const ax = (gesture.midX - gesture.x) / gesture.scale, ay = (gesture.midY - gesture.y) / gesture.scale;
      boardView.scale = next; boardView.x = mx - ax * next; boardView.y = my - ay * next; gesture.moved = true; clampBoardView();
    } else if (gesture.type === 'pan' && pointers.size === 1) {
      if (gesture.moved) { boardView.x = gesture.x + e.clientX - gesture.startX; boardView.y = gesture.y + e.clientY - gesture.startY; clampBoardView(); }
    }
  });
  const pointerEnd = e => {
    clearTimeout(longPressTimer); longPressTimer = null;
    const endingGesture = gesture, tap = e.type === 'pointerup' && !multiTouchActive && endingGesture?.type === 'pan' && !endingGesture.moved && !endingGesture.longPressed && pointers.size === 1;
    const tapped = document.elementFromPoint(e.clientX, e.clientY) ?? e.target;
    const cell = tapped.closest?.('.cell') ?? e.target.closest?.('.cell');
    pointers.delete(e.pointerId);
    suppressPointerClickUntil = Date.now() + 800;
    if (tap) {
      if (cell) queueBoardTap(e, cell);
      else tapped.closest?.('#board button:not(.cell)')?.click();
    }
    if (pointers.size === 1) {
      const [p] = pointers.values();
      gesture = { type: 'pan', startX: p.x, startY: p.y, x: boardView.x, y: boardView.y, moved: multiTouchActive };
    } else { gesture = null; multiTouchActive = false; }
  };
  v.addEventListener('pointerup', pointerEnd); v.addEventListener('pointercancel', pointerEnd);
  const resizeLayout = () => {
    if (compactLayout()) applyMobileBoardLayout({ fit: true });
    else { clearMobileBoardSizing(); boardView.mobileLayout = null; fitBoard(); }
  };
  const ro = new ResizeObserver(resizeLayout); ro.observe(v);
  addEventListener('resize', resizeLayout);
  requestAnimationFrame(() => compactLayout() ? applyMobileBoardLayout() : fitBoard());
}

function render() {
  const s = state, moves = myTurn() ? G.classifyMoves(G.publicState(s)) : []; // подсветка не выдаёт содержимое закрытых клеток
  const targets = V.plateHidesMoves(plate, sel) ? [] : V.targets(moves, { s, sel, withCoin }); // открыта плашка, пират не выбран — без подсветки
  const compact = compactLayout();
  if (compact) placeWakeBanner();
  const b = $('#board'), focusedCell = b.contains(document.activeElement) ? document.activeElement.dataset.cell : null; b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'cell';
    c.dataset.cell = `${x},${y}`;
    c.style.gridArea = `${y + 1} / ${x + 1}`; // плашка поверх поля не должна сдвигать соседние клетки при auto-placement
    const t = G.tileAt(s, x, y), details = t ? V.tileDetails(t) : null;
    if (t) { c.classList.add(t.open ? 'open' : 'closed', 'k-' + t.kind); if (t.used) c.classList.add('used'); c.innerHTML = tileHTML(t); c.title = `${details.name}. ${details.rule}`; } else c.classList.add('sea');
    const sh = G.shipAt(s, x, y);
    if (sh >= 0) { c.classList.add('ship'); c.style.setProperty('--team', G.TEAMS[sh].color); c.insertAdjacentHTML('afterbegin', pic(shipImg(sh), '⛵', 'tile ship-image')); }
    if (t?.coins || t?.treasure) c.classList.add('has-badge');
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
  $('#turn').style.borderColor = compact ? '#e3b23c' : '';
  $('#turnPrefix').textContent = compact ? '' : hp.prefix;
  $('#turnText').textContent = compact ? V.mobileHeaderText(s, { myTurn: myTurn() }) : hp.text;
  const statusText = notice || V.plateHint(plate, sel, myTurn()) || (sel == null ? V.skipNotice(s) : null) || V.coinHint(moves, { sel, withCoin }) || V.selectHint(s, sel, { myTurn: myTurn() }) || '';
  $('#status').textContent = statusText;
  $('#mobileStatus').textContent = statusText;
  $('#mobileStatus').hidden = !statusText;
  $('#logPreview').hidden = !!statusText;
  notice = '';
  if (compact && $('#status').textContent) {
    clearTimeout(noticeTimer); const message = $('#status').textContent;
    noticeTimer = setTimeout(() => { if ($('#status').textContent === message) { $('#status').textContent = ''; $('#mobileStatus').textContent = ''; $('#mobileStatus').hidden = true; $('#logPreview').hidden = false; } }, 3000);
  }
  const sc = G.sideScores(s);
  $('#score').innerHTML = Object.keys(sc).map(k => `${G.sideName(s, +k)}: <b>${sc[k]}</b>`).join(' · ') + ` · осталось ${G.coinsLeft(s)} · утонуло ${s.lost} · ром: ${G.activeTeams(s.mode).map(t => s.rum[t]).join('/')}`;
  const scoreSides = Object.entries(sc);
  const scoreHtml = scoreSides.map(([side, value], i) => {
    const team = G.activeTeams(s.mode).find(t => G.sideOf(s, t) === +side);
    return `${i ? '<b class="score-separator">:</b>' : ''}<span class="score-group"><i style="background:${G.TEAMS[team]?.color ?? '#fff'}"></i><b>${value}</b></span>`;
  }).join('');
  $('#topScore').innerHTML = scoreHtml;
  $('#topScore').setAttribute('aria-label', `Счёт: ${V.mobileScore(s)}`);
  $('#topScore').style.flexBasis = scoreSides.length > 2 ? '150px' : compact && window.innerWidth <= 380 ? '100px' : '124px';
  $('#mobileScore').textContent = $('#score').textContent;
  $('#mobileScale').disabled = false;
  $('#mobileScale').textContent = 'Вписать поле';
  $('#mobileContinue').hidden = false;
  const bs = V.buttons(s, moves, { sel, withCoin, myTurn: myTurn() });
  const actions = { ship: ['#shipBtn', '⛵ Корабль'], coin: ['#coinBtn', '🪙 Монета'], rum: ['#rumBtn', '🍾 Ром'], revive: ['#reviveBtn', '❤ Возродить'] };
  for (const slot of mobileActionSlots(bs)) {
    if (slot.id === 'pass') continue;
    const [id, shortLabel] = actions[slot.id], button = bs[slot.id], el = $(id);
    el.disabled = slot.disabled;
    el.textContent = compact ? shortLabel : button.label;
    el.title = button.label;
    el.setAttribute('aria-label', button.label);
    el.setAttribute('aria-pressed', String(button.pressed));
    el.hidden = false;
  }
  $('#passBtn').hidden = !compact;
  $('#passBtn').disabled = true;
  $('#passBtn').setAttribute('aria-label', 'Пропуск хода выполняется автоматически, если ходов нет');
  $('#mobileLogToggle').setAttribute('aria-expanded', String(compact && logExpanded));
  $('#me').value = me;
  $('#mobileMe').value = me;
  {
    const es = V.logEntries(s, 5), esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    $('#log').hidden = !es.length && !compact;
    const preview = es[0];
    $('#logPreview').textContent = preview ? `${preview.n ? `№${preview.n} · ` : ''}${preview.text}` : 'Журнал партии — коснитесь, чтобы открыть';
    const lines = es.map(e => `<li>${e.n ? `<span class="ln">№${e.n}</span>` : ''}${e.team != null ? `<i class="dot" style="--team:${G.TEAMS[e.team].color}"></i>` : ''}<span class="lt">${esc(e.text)}</span></li>`).join('');
    $('#log').innerHTML = '<h3>Журнал</h3><ol>' + (lines || (compact ? '<li><span class="lt">Пока нет записей</span></li>' : '')) + '</ol>';
  }
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
  renderMobilePirates(s, moves);
  renderBanner();
  applyMobileBoardLayout();
  const turnKey = `${s.turn}:${s.current}`;
  if (turnKey !== lastCenteredTurn) {
    lastCenteredTurn = turnKey;
    const first = moves.find(m => m.type === 'move' && m.pid != null) ?? moves.find(m => m.type === 'ship') ?? moves[0];
    const p = first?.pid != null ? s.pirates[first.pid] : null;
    if (first && compact && !isHotSeat()) requestAnimationFrame(() => centerBoardCell(p?.x ?? first.x, p?.y ?? first.y));
  }
  if (!net) localStorage.setItem('jackal-save', G.serialize(s));
}
function renderMobilePirates(s, moves) {
  const el = $('#mobilePirates'), available = new Set(moves.map(m => m.pid));
  const team = V.crewPanel(s, s.current);
  const slots = team.regular.map(p => {
    const piece = s.pirates[p.pid], selected = sel === p.pid;
    const label = `П${p.num}`;
    return `<button type="button" class="mobile-pirate${selected ? ' sel' : ''}" data-pid="${p.pid}" aria-pressed="${selected}" aria-label="${label}${selected ? ', выбран' : ''}" title="${G.pieceName(s, piece)}${p.alive ? '' : ' — погиб'}"${!myTurn() || !p.alive || !available.has(p.pid) ? ' disabled' : ''}>${pic(pieceImg(piece), '●', 'ti')}<span class="pirate-choice"><b>${label}</b>${selected ? '<small>▲ выбран</small>' : ''}</span></button>`;
  });
  while (slots.length < 3) slots.push(`<button type="button" class="mobile-pirate" disabled aria-label="Нет пирата">—</button>`);
  slots.push(`<button id="mobileCancel" type="button" aria-label="Отменить выбор"${!myTurn() || sel == null && !plate ? ' disabled' : ''}>Отмена</button>`);
  el.innerHTML = slots.join('');
  el.querySelectorAll('.mobile-pirate:not([disabled])').forEach(button => button.onclick = () => choose(+button.dataset.pid));
  $('#mobileCancel').onclick = () => { sel = null; plate = null; withCoin = false; render(); };
}
function choose(pid) { sel = pid; const p = state.pirates[pid], c = p.carry; withCoin = c === G.TREASURE_VALUE ? 'T' : !!c; plate = null; render(); if (!isHotSeat()) requestAnimationFrame(() => centerBoardCell(p.x, p.y)); }
function renderCrew(s, moves) {
  const can = new Set(moves.map(m => m.pid)), el = $('#crew');
  const tok = (t, color) => { const p = s.pirates[t.pid];
    return `<button class="tok${t.alive ? '' : ' dead'}${t.pid === sel ? ' sel' : ''}" data-pid="${t.pid}" style="--team:${color}" title="${G.pieceName(s, p)}${t.alive ? '' : ' — погиб'}"${t.alive && can.has(t.pid) && myTurn() ? '' : ' disabled'}>${pic(pieceImg(p), '●', 'ti')}${t.num ? `<b>${t.num}</b>` : ''}${p.role === 'exmissionary' ? '<i>✝</i>' : ''}${V.isDrunk(s, p) ? `<img class="drunk" src="${V.DRUNK_ICON}" alt="пьян">` : ''}</button>`; };
  el.innerHTML = V.crewPanels(s, { player: net ? net.sess.player : me === 'all' ? null : +me }).map(cp => { const color = G.TEAMS[cp.team].color;
    return `<section class="panel${cp.current ? ' current' : ''}" style="--team:${color}"><header><span>${cp.label}</span><span class="sc">${pic(coinImg, '🪙', 'ci')} ${cp.score}</span></header><div class="toks">${cp.regular.map(t => tok(t, color)).join('')}${cp.chars.length ? '<span class="div"></span>' + cp.chars.map(t => tok(t, color)).join('') : ''}</div></section>`; }).join('');
  el.querySelectorAll('.tok:not([disabled])').forEach(b => b.onclick = () => choose(+b.dataset.pid));
  el.onscroll = updateCrewScrollButtons;
  requestAnimationFrame(updateCrewScrollButtons);
}
function updateCrewScrollButtons() {
  const el = $('#crew'), overflow = el.scrollWidth > el.clientWidth + 1;
  $('#crewLeft').hidden = !overflow || el.scrollLeft < 2;
  $('#crewRight').hidden = !overflow || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
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
  $('#mobileLeave').hidden = !net;
  $('#mobileLeave').textContent = net?.type === 'bluetooth' ? 'Выйти из Bluetooth-партии' : 'Выйти из онлайн-игры';
}
function goOnline(sess) {
  net?.stop(); net = { sess, type: 'online', connected: false, opponent: 'waiting', stop: null, gone: false };
  updateOnlineDialog();
  state = null; lastCenteredTurn = null; $('#board').innerHTML = ''; $('#me').closest('label').hidden = true; // не показывать прежнюю локальную партию (2p) до прихода состояния 1v1
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
let btScanListeners = [], btScanGeneration = 0;
function addBluetoothDevice(device) {
  if (!device?.address || $(`#btDevices [data-address="${device.address}"]`)) return;
  const li = document.createElement('li'), button = document.createElement('button');
  button.type = 'button'; button.dataset.address = device.address; button.textContent = device.name || 'Телефон рядом';
  button.onclick = () => joinBluetooth(device.address);
  li.append(button); $('#btDevices').append(li);
}
async function clearBluetoothScanListeners() {
  const listeners = btScanListeners;
  btScanListeners = [];
  await Promise.all(listeners.map(listener => listener.remove()));
}
function setBluetoothScanStatus(scanning) {
  const status = $('#btErr'), button = $('#btScanBtn'), devices = $('#btDevices');
  status.classList.toggle('searching', scanning);
  status.textContent = scanning ? 'Идёт поиск телефонов рядом…' : devices.children.length ? '' : 'Телефоны рядом не найдены.';
  devices.setAttribute('aria-busy', String(scanning));
  button.disabled = scanning;
}
$('#nearby').addEventListener('close', () => {
  btScanGeneration++;
  void clearBluetoothScanListeners();
});
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
  const hit = targets.find(m => m.x === x && m.y === y);
  if (hit) { const { kind, ...mv } = hit; return play(mv); }
  showTileInfoAt(x, y);
  if (sel === 'rum') { sel = null; return render(); }
  if (!myTurn()) { const n = V.turnNotice(state, x, y); if (n) { notice = n; render(); } return; }
  if (state.pending) { const p = state.pirates[state.pending.pid]; if (state.pending.type === 'lighthouse' || state.pending.type === 'quake' || !(p.x === x && p.y === y)) { notice = V.blockedNotice(state); render(); } return; }
  const mine = state.pirates.filter(p => p.alive && p.x === x && p.y === y && p.team === state.current && G.pirateMoves(state, p).length);
  if (mine.length > 1) { plate = { x, y, pids: mine.map(p => p.id) }; if (!mine.some(p => p.id === sel)) sel = null; } // несколько своих — плашка выбора
  else if (mine.length) { plate = null; return choose(mine[0].id); }
  else if (G.shipAt(state, x, y) === state.current && G.legalMoves(G.publicState(state)).some(m => m.type === 'ship')) { sel = 'ship'; plate = null; }
  else { sel = null; plate = null; notice = V.drunkNotice(state, x, y) || V.turnNotice(state, x, y) || ''; }
  render();
}

function start(mode) { if (!goLocal()) return; $('#crew').hidden = false; $('#turnDot').hidden = false; state = G.newGame({ mode, seed: Date.now() % 1e9, options: { houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked } }); sel = null; logExpanded = false; lastCenteredTurn = null; render(); }
$('#coinBtn').onclick = () => { withCoin = V.nextCargo(G.legalMoves(state), sel, withCoin); render(); };
$('#rumBtn').onclick = () => { sel = sel === 'rum' ? null : 'rum'; render(); };
$('#shipBtn').onclick = () => { sel = sel === 'ship' ? null : 'ship'; render(); };
$('#reviveBtn').onclick = () => { const m = G.legalMoves(G.publicState(state)).find(m => m.type === 'revive'); if (m) play(m); };
$('#crewLeft').onclick = () => $('#crew').scrollBy({ left: -120, behavior: 'smooth' });
$('#crewRight').onclick = () => $('#crew').scrollBy({ left: 120, behavior: 'smooth' });
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
$('#file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (!goLocal(fileConfirmed)) return; state = G.loadState(await f.text()); sel = null; lastCenteredTurn = null; render(); } catch (err) { alert(err.message); } e.target.value = ''; };
// v0.5.19: плашка статуса сервера — до ответа /health.
let awake = null, waking = null;
function placeWakeBanner() {
  const el = $('#wake'), dialog = [$('#online'), $('#nearby'), $('#menu')].find(d => d.open);
  if (dialog) {
    const heading = dialog.querySelector('h2');
    if (el.parentElement !== dialog) dialog.insertBefore(el, heading?.nextSibling ?? dialog.firstChild);
  } else if (state && compactLayout()) {
    el.hidden = true;
    if (el.parentElement !== document.body) document.body.append(el);
  } else if (el.parentElement !== document.body) document.body.append(el);
}
function wakeServer() {
  if (!SERVER_CONFIGURED) return Promise.resolve(false);
  if (awake) return Promise.resolve(true); if (waking) return waking;
  const el = $('#wake'), st = $('#wakeStatus'), again = $('#wakeRetry'); let t0 = Date.now(), tick = null;
  const show = phase => { st.textContent = V.wakeStatus(phase, Math.round((Date.now() - t0) / 1000)); again.hidden = phase !== 'fail'; el.dataset.phase = phase; };
  waking = Net.wake({ onWait: () => {
    if (state && compactLayout() && !document.querySelector('dialog[open]')) return;
    el.hidden = false; show('wait'); tick = setInterval(() => show('wait'), 1000);
  } }).then(ok => {
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
$('#nearbyBtn').onclick = () => { $('#menu').close(); $('#btErr').textContent = ''; $('#btErr').classList.remove('searching'); $('#btDevices').innerHTML = ''; $('#btDevices').setAttribute('aria-busy', 'false'); $('#btScanBtn').disabled = false; $('#nearby').showModal(); placeWakeBanner(); };
$('#btHostBtn').onclick = hostBluetooth;
$('#btScanBtn').onclick = async () => {
  const plugin = bluetooth();
  if (!plugin) { $('#btErr').textContent = 'Bluetooth-игра доступна только в Android-приложении.'; return; }
  const generation = ++btScanGeneration;
  $('#btErr').textContent = ''; $('#btErr').classList.remove('searching'); $('#btDevices').innerHTML = '';
  $('#btDevices').setAttribute('aria-busy', 'true'); $('#btScanBtn').disabled = true;
  try {
    await clearBluetoothScanListeners();
    if (generation !== btScanGeneration) return;
    let finished = false;
    const stateListener = await plugin.addListener('scanState', event => {
      if (generation !== btScanGeneration || event?.scanning !== false) return;
      finished = true;
      setBluetoothScanStatus(false);
    });
    btScanListeners = [stateListener];
    const found = await plugin.addListener('deviceFound', addBluetoothDevice);
    btScanListeners.push(found);
    const scan = await plugin.discoverDevices();
    if (!scan.scanning) {
      finished = true;
      $('#btErr').classList.remove('searching');
      $('#btErr').textContent = 'Не удалось начать поиск. Проверьте разрешения Bluetooth.';
      $('#btDevices').setAttribute('aria-busy', 'false'); $('#btScanBtn').disabled = false;
      await clearBluetoothScanListeners();
    } else if (!finished && generation === btScanGeneration) setBluetoothScanStatus(true);
  } catch (e) {
    await clearBluetoothScanListeners();
    if (generation === btScanGeneration) {
      $('#btErr').classList.remove('searching'); $('#btErr').textContent = e.message;
      $('#btDevices').setAttribute('aria-busy', 'false'); $('#btScanBtn').disabled = false;
    }
  }
};
$('#createBtn').onclick = async () => { try { await needServer(); if (!goLocal()) return; const sess = await Net.create({ houseCrocDeath: $('#optCroc').checked, archipelagoMissionary: $('#optArch').checked }); showCode(sess.code); goOnline(sess); } catch (e) { $('#onlineErr').textContent = e.message; } };
$('#shareBtn').onclick = async () => { const code = net?.sess.code; if (!code) return; const text = `Сыграем в «Шакал»? Код игры: ${code} — ${location.origin}`; try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(code); $('#onlineErr').textContent = 'Код скопирован'; } } catch {} };
$('#joinBtn').onclick = async () => { const code = $('#codeIn').value.trim().toUpperCase(); if (!code) return; try { await needServer(); if (!goLocal()) return; const sess = await Net.join(code); goOnline(sess); $('#online').close(); } catch (e) { $('#onlineErr').textContent = e.message; } };
$('#codeIn').onkeydown = e => { if (e.key === 'Enter') $('#joinBtn').click(); };
$('#leaveBtn').onclick = () => { if (!goLocal()) return; $('#online').close(); try { state = G.loadState(localStorage.getItem('jackal-save')); } catch { return start(V.DEFAULT_MODE); } render(); };
addEventListener('jackal:backbutton', () => {
  const dialog = $('#online').open ? 'online' : $('#menu').open ? 'menu' : null;
  switch (V.androidBackAction({ dialog, mobileMenu: !$('#mobileMenu').hidden, logExpanded: compactLayout() && logExpanded, plate: !!plate, online: !!net, hasGame: !!state })) {
    case 'close-online': $('#online').close(); break;
    case 'close-menu': $('#menu').close(); break;
    case 'close-mobile-menu': setMobileMenu(false); break;
    case 'collapse-log': logExpanded = false; applyMobileBoardLayout(); $('#mobileLogToggle').setAttribute('aria-expanded', 'false'); break;
    case 'close-plate': plate = null; render(); break;
    case 'confirm-online-leave': if (confirm(LEAVE_Q)) $('#leaveBtn').click(); break;
    case 'confirm-game-exit': if (confirm('Выйти из партии?')) dispatchEvent(new Event('jackal:minimize')); break;
    case 'minimize': dispatchEvent(new Event('jackal:minimize')); break;
  }
});
// Нейтральное поле без фигур (за меню в новой вкладке).
function renderEmpty() {
  state = null; sel = null; plate = null; const b = $('#board'); b.innerHTML = '';
  for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) { const c = document.createElement('button'); c.type = 'button'; c.tabIndex = -1; c.disabled = true; c.className = 'cell ' + (V.isLandCell(x, y) ? 'closed' : 'sea'); c.style.gridArea = `${y + 1} / ${x + 1}`; c.setAttribute('aria-label', `${V.isLandCell(x, y) ? 'Закрытая клетка' : 'Море'}, столбец ${x + 1}, ряд ${y + 1}`); b.append(c); }
  $('#mobilePirates').innerHTML = '<button disabled>П1</button><button disabled>П2</button><button disabled>П3</button><button id="mobileCancel" disabled>Отмена</button>';
  for (const id of ['#crew', '#banner', '#youAre']) $(id).hidden = true;
  for (const id of ['#shipBtn', '#coinBtn', '#reviveBtn', '#rumBtn', '#passBtn']) { $(id).hidden = true; $(id).disabled = true; }
  $('#mobileScale').disabled = true;
  $('#score').textContent = ''; $('#status').textContent = ''; $('#mobileStatus').textContent = ''; $('#mobileStatus').hidden = true; $('#logPreview').textContent = 'Журнал партии — коснитесь, чтобы открыть'; $('#logPreview').hidden = false; $('#mobileLogToggle').setAttribute('aria-expanded', 'false');
  $('#tileInfo').hidden = true; $('#tileInfo').textContent = ''; $('#turnText').textContent = ''; $('#turnPrefix').textContent = ''; $('#turnDot').hidden = true; $('#log').textContent = ''; $('#log').hidden = true;
  $('#topScore').textContent = ''; $('#mobileScore').textContent = '';
  $('#mobileContinue').hidden = !V.resumeInfo(localStorage.getItem('jackal-save'));
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
function setMobileMenu(open) {
  const menu = $('#mobileMenu');
  menu.hidden = !open;
  $('#mobileMenuToggle').setAttribute('aria-expanded', String(open));
  if (open) $('#mobileMenuClose').focus(); else $('#mobileMenuToggle').focus();
}
function fitMobileBoard() {
  if (!state) return;
  $('#mobileScale').textContent = 'Вписать поле';
  if (compactLayout()) applyMobileBoardLayout();
  else fitBoard();
}
$('#mobileMenuToggle').onclick = () => setMobileMenu(true);
$('#mobileMenuClose').onclick = () => setMobileMenu(false);
$('#mobileMenuBackdrop').onclick = () => setMobileMenu(false);
let drawerSwipeStart = null;
$('.mobile-drawer').addEventListener('pointerdown', e => { drawerSwipeStart = [e.clientX, e.clientY]; });
$('.mobile-drawer').addEventListener('pointerup', e => {
  if (!drawerSwipeStart) return;
  const dx = e.clientX - drawerSwipeStart[0], dy = e.clientY - drawerSwipeStart[1]; drawerSwipeStart = null;
  if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.3) setMobileMenu(false);
});
$('.mobile-drawer').addEventListener('pointercancel', () => { drawerSwipeStart = null; });
$('#mobileContinue').onclick = () => {
  setMobileMenu(false);
  if (!state && V.resumeInfo(localStorage.getItem('jackal-save'))) $('#continueBtn').click();
};
$('#mobileNew').onclick = () => { setMobileMenu(false); $('#newBtn').click(); };
$('#mobileSave').onclick = () => { setMobileMenu(false); $('#saveBtn').click(); };
$('#mobileLoad').onclick = () => { setMobileMenu(false); $('#loadBtn').click(); };
$('#mobileScale').onclick = () => { setMobileMenu(false); fitMobileBoard(); };
$('#mobileLeave').onclick = () => { setMobileMenu(false); $('#leaveBtn').click(); };
$('#mobileMe').onchange = e => { $('#me').value = e.target.value; $('#me').dispatchEvent(new Event('change')); };
$('#mobileLogToggle').onclick = () => {
  if (!compactLayout()) return;
  logExpanded = !logExpanded;
  applyMobileBoardLayout();
  $('#mobileLogToggle').setAttribute('aria-expanded', String(logExpanded));
};
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#mobileMenu').hidden) setMobileMenu(false); });
// первое нажатие где угодно снимает заметку (и после перезагрузки она видна до него)
addEventListener('pointerdown', () => { if (!sessionStorage.getItem(V.NOTE_KEY)) return; sessionStorage.removeItem(V.NOTE_KEY); const n = $('#menuNote'); n.hidden = true; n.textContent = ''; }, true); // текст убрать, чтобы скринридер не читал
$('#continueBtn').onclick = () => { if (!goLocal()) return; try { state = G.loadState(localStorage.getItem('jackal-save')); sel = null; plate = null; lastCenteredTurn = null; $('#crew').hidden = false; $('#menu').close(); render(); } catch (e) { alert(e.message); } };
$('#menu').addEventListener('close', () => { placeWakeBanner(); if (!state && !net && !$('#online').open && !$('#nearby').open) start(V.DEFAULT_MODE); });
$('#online').addEventListener('close', () => { placeWakeBanner(); if (!state && !net) showMenu(); }); // «Отмена» на пустом поле — новая 1v1
$('#nearby').addEventListener('close', () => { placeWakeBanner(); if (!state && !net && !$('#online').open) showMenu(); });
$('#nearbyBtn').hidden = !bluetooth();
const sess = Net.saved();
if (IS_REMOTE || sess) wakeServer(); // клиент на GitHub Pages — сразу будим сервер, плашка видна с первого экрана
setupBoardNavigation();
if (sess && location.protocol.startsWith('http')) goOnline(sess);
else showMenu(); // новая вкладка: меню над пустым полем, старую партию не восстанавливаем сами
