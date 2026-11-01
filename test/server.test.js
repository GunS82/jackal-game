// v0.5: сервер онлайн-игры — комнаты, проверка ходов, рассылка, переподключение (два клиента)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import * as V from '../src/view.js';
import { createServer } from '../server/server.js';
import { Rooms } from '../server/rooms.js';

async function start() { const rooms = new Rooms(); const srv = createServer({ rooms }); await new Promise(r => srv.listen(0, r)); return { rooms, srv, base: `http://127.0.0.1:${srv.address().port}` }; }
const post = async (base, path, body) => { const r = await fetch(base + '/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
// Клиент SSE: копит сообщения, next(pred) ждёт подходящее.
function listen(base, sess) {
  const ac = new AbortController(), msgs = [], waiters = [];
  const ready = fetch(`${base}/api/events?code=${sess.code}&token=${sess.token}`, { signal: ac.signal }).then(async r => {
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    try { for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (!chunk.startsWith('data: ')) continue; const m = JSON.parse(chunk.slice(6)); msgs.push(m); waiters.splice(0).forEach(w => w()); } } } catch {}
  });
  const next = async (pred, ms = 8000) => { const t0 = Date.now(); for (;;) { const m = msgs.findLast(pred); if (m) return m; if (Date.now() - t0 > ms) throw new Error('нет сообщения'); await new Promise(r => { waiters.push(r); setTimeout(r, 50); }); } };
  return { msgs, next, close: () => ac.abort(), ready };
}

test('сервер: создать/войти по коду, ходы проверяются, состояние рассылается обоим, скрытое не уходит', async () => {
  const { srv, base, rooms } = await start();
  try {
    const a = (await post(base, 'create', {})).body; assert.match(a.code, /^[A-Z2-9]{4}$/); assert.equal(a.player, 0);
    const A = listen(base, a);
    assert.equal((await A.next(m => m.opponent === 'waiting')).player, 0);
    assert.equal((await post(base, 'join', { code: 'zzzz' })).status, 404);
    const b = (await post(base, 'join', { code: a.code.toLowerCase() })).body; assert.equal(b.player, 1);
    assert.equal((await post(base, 'join', { code: a.code })).status, 409, 'третий не входит');
    const B = listen(base, b);
    await A.next(m => m.opponent === 'online'); const sb = await B.next(m => m.opponent === 'online');
    // скрытое содержимое закрытых клеток и seed не передаются
    assert.equal(sb.state.seed, null); assert.equal(sb.state.mode, '1v1');
    assert.ok(Object.values(sb.state.tiles).filter(t => !t.open).every(t => t.kind === 'empty' && !t.coins));
    const real = rooms.get(a.code).state; assert.ok(Object.values(real.tiles).some(t => !t.open && t.kind !== 'empty'));
    // ходы: чужой, неверный токен, недопустимый — отклоняются
    const mv = G.legalMoves(sb.state).find(m => m.type === 'ship');
    assert.equal((await post(base, 'move', { code: a.code, token: b.token, move: mv })).status, 422, 'не его ход');
    assert.equal((await post(base, 'move', { code: a.code, token: 'x', move: mv })).status, 403);
    assert.equal((await post(base, 'move', { code: a.code, token: a.token, move: { type: 'ship', dir: 5, x: 1, y: 1 } })).status, 422);
    // ход из публичного состояния клиента принимается сервером
    const step = G.legalMoves(sb.state).find(m => m.type === 'move');
    assert.equal((await post(base, 'move', { code: a.code, token: a.token, move: step })).status, 200);
    const before = JSON.stringify(sb.state.pirates); const after = await B.next(m => JSON.stringify(m.state.pirates) !== before); // клетка может дать доп. действие (стрелка, лёд…) — тогда turn ещё 0
    if (after.state.turn === 1) assert.equal(after.state.current, 2);
    assert.equal(V.onlineBanner(after.state, { player: 1, opponent: after.opponent }).title, G.controllerOf(after.state) === 1 ? 'Ваш ход!' : 'Ход соперника'); // трава может отдать ход соседу
    assert.equal(V.onlineBanner((await A.next(m => JSON.stringify(m.state.pirates) !== before)).state, { player: 0 }).title, G.controllerOf(after.state) === 1 ? 'Ход соперника' : 'Ваш ход!');
    // соперник ушёл (обрыв) → offline; вернулся по коду+токену → online и то же состояние
    B.close(); await A.next(m => m.opponent === 'offline');
    const B2 = listen(base, b); const back = await B2.next(m => m.opponent === 'online'); assert.deepEqual(back.state, after.state);
    await A.next(m => m.opponent === 'online' && JSON.stringify(m.state) === JSON.stringify(after.state));
    // явный выход → left
    await post(base, 'leave', { code: a.code, token: b.token }); B2.close();
    assert.equal(V.onlineBanner(null, { player: 0, opponent: (await A.next(m => m.opponent === 'left')).opponent }).title, 'Соперник вышел из партии');
    A.close();
    // статика отдаётся, лишние файлы — нет
    assert.equal((await fetch(base + '/')).status, 200); assert.equal((await fetch(base + '/src/game.js')).status, 200);
    assert.equal((await fetch(base + '/server/rooms.js')).status, 404); assert.equal((await fetch(base + '/%2e%2e/etc/passwd')).status, 404);
  } finally { srv.closeAllConnections(); srv.close(); }
});

test('сервер: партия из 200 случайных ходов двумя клиентами по публичному состоянию — все ходы принимаются', () => {
  const rooms = new Rooms(), a = rooms.create(), b = rooms.join(a.code), r = rooms.get(a.code);
  let x = 1; const rnd = () => (x = (x * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 200 && !r.state.over; i++) {
    const pub = rooms.view(r, G.controllerOf(r.state)).state, ms = G.legalMoves(pub);
    const m = ms[Math.floor(rnd() * ms.length)]; rooms.move(a.code, G.controllerOf(r.state) === 0 ? a.token : b.token, m);
  }
});

test('publicState: подсветка не выдаёт закрытого людоеда; плашки онлайна', () => {
  const s = G.loadState({ tiles: { '6,10': { kind: 'ogre', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  assert.equal(G.classifyMoves(s).find(m => m.x === 6 && m.y === 10).kind, 'death');
  assert.equal(G.classifyMoves(G.publicState(s)).find(m => m.x === 6 && m.y === 10).kind, 'move');
  assert.equal(G.publicState(s).tiles['6,10'].kind, 'empty'); assert.equal(s.tiles['6,10'].kind, 'ogre', 'исходное не меняется');
  assert.equal(V.onlineBanner(s, { player: 0, connected: false }).title, 'Соединение потеряно');
  assert.match(V.onlineBanner(s, { player: 0, connected: false }).sub, /Переподключаемся/);
  assert.equal(V.onlineBanner(s, { player: 0, opponent: 'waiting' }).title, 'Ждём соперника…');
  assert.equal(V.onlineBanner(s, { player: 0, opponent: 'offline' }).title, 'Соперник отключился');
  assert.equal(V.onlineBanner({ ...s, over: true }, { player: 0 }), null);
});

test('v0.5.1: тело запроса null/не объект → 400, а не 500', async () => {
  const { srv, base } = await start();
  try {
    for (const raw of ['null', '5', '"x"', '[1]', 'true', '{bad'])
      for (const act of ['create', 'join', 'move', 'leave']) {
        const r = await fetch(base + '/api/' + act, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
        assert.equal(r.status, 400, act + ' ' + raw); assert.ok((await r.json()).error);
      }
    assert.equal((await fetch(base + '/api/create', { method: 'POST', body: '{}' })).status, 200);
  } finally { srv.closeAllConnections(); srv.close(); }
});

test('v0.5.1: уборка комнат — простой >24 ч и законченные партии через 1 ч (подставные часы)', () => {
  let t = 1e6; const rooms = new Rooms({ now: () => t, sweepMs: 0 });
  const idle = rooms.create(), live = rooms.create(), done = rooms.create(); rooms.join(done.code);
  let closed = 0; rooms.get(idle.code).subs.add({ player: 0, send() {}, close: () => closed++ });
  t += 23 * 3600e3; rooms.touch(rooms.get(live.code));
  const d = rooms.get(done.code); d.state.over = true; rooms.touch(d);
  assert.equal(rooms.sweep(), 0);
  t += 3600e3 + 1; assert.equal(rooms.sweep(), 2); // idle: 24ч+1, done: 1ч+1
  assert.equal(closed, 1); assert.throws(() => rooms.get(idle.code), /не найдена/); assert.throws(() => rooms.get(done.code));
  assert.ok(rooms.get(live.code));
  t += 22 * 3600e3; assert.equal(rooms.sweep(), 0); t += 2 * 3600e3; assert.equal(rooms.sweep(), 1); assert.equal(rooms.rooms.size, 0);
  const r2 = new Rooms({ sweepMs: 50 }); assert.equal(r2.timer.hasRef(), false); r2.stop();
});

test('v0.5.1: publicState несёт coinsTotalLeft, клиентский coinsLeft его использует, раскладки нет', () => {
  const s = G.newGame({ mode: '1v1', seed: 7 }), p = G.publicState(s);
  assert.equal(p.coinsTotalLeft, G.coinsLeft(s)); assert.equal(G.coinsLeft(p), G.TOTAL_COINS);
  assert.ok(Object.values(p.tiles).filter(t => !t.open).every(t => t.kind === 'empty' && t.coins === 0 && !t.treasure));
  delete p.coinsTotalLeft; assert.equal(G.coinsLeft(p), 0); // без поля скрытые монеты не видны — поэтому оно и нужно
  const rooms = new Rooms({ sweepMs: 0 }), a = rooms.create(); rooms.join(a.code);
  assert.equal(rooms.view(rooms.get(a.code), 1).state.coinsTotalLeft, G.TOTAL_COINS);
});

test('v0.5.2: онлайн всегда 1v1 — каждый игрок управляет ровно одной командой (даже если просят 2p)', async () => {
  const { rooms, srv, base } = await start();
  try {
    for (const body of [{}, { mode: '2p' }, { mode: '4p', options: { mode: '2p' } }]) {
      const a = (await post(base, 'create', body)).body, s = rooms.get(a.code).state;
      assert.equal(s.mode, '1v1');
      assert.deepEqual(G.teamsOfPlayer(s, 0), [0]); assert.deepEqual(G.teamsOfPlayer(s, 1), [2]);
      assert.match(G.sideName(s, 0), /^Игрок 1 \(Белые\)$/); assert.doesNotMatch(G.sideName(s, 0), /\+/);
    }
  } finally { srv.closeAllConnections(); srv.close(); }
});

test('v0.5.2: выход — комната остаётся, сопернику плашка «Соперник вышел из партии»; заголовок онлайн без «загрузите файл»', async () => {
  const rooms = new Rooms({ sweepMs: 0 }), a = rooms.create(), b = rooms.join(a.code);
  rooms.leave(a.code, b.token);
  const r = rooms.get(a.code), v = rooms.view(r, 0); // комната не удалена
  assert.equal(v.opponent, 'left'); assert.equal(rooms.seat(r, b.token), 1);
  assert.deepEqual(V.onlineBanner(v.state, { player: 0, opponent: v.opponent }), { kind: 'left', title: 'Соперник вышел из партии', sub: 'Можно начать новую игру' });
  assert.equal(V.onlineBanner(v.state, { player: 0, gone: true }).title, 'Партия закрыта на сервере');
  assert.equal(V.onlineBanner(v.state, { player: 0, connected: false }).title, 'Соединение потеряно');
  const h = V.headerText(v.state, { myTurn: false, online: true });
  assert.match(h, /Ход соперника/); assert.doesNotMatch(h, /файл/);
  assert.match(V.headerText(v.state, { myTurn: false }), /загрузите его файл/);
});

test('v0.5.2: сессия онлайн во вкладке (sessionStorage), не в общем localStorage; выход только с подтверждением', async () => {
  const mk = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
  const tab1 = mk(), tab2 = mk(), shared = mk(); shared.setItem('jackal-online', JSON.stringify({ code: 'OLD1', token: 't', player: 1 }));
  globalThis.localStorage = shared;
  const Net = await import('../src/net.js');
  globalThis.sessionStorage = tab1; Net.remember({ code: 'AAAA', token: 'x', player: 0 });
  globalThis.sessionStorage = tab2; assert.equal(Net.saved(), null, 'вторая вкладка не видит сессию первой (и старый общий ключ)');
  globalThis.sessionStorage = tab1; assert.equal(Net.saved().code, 'AAAA', 'после перезагрузки вкладки сессия на месте');
  Net.forget(); assert.equal(Net.saved(), null); assert.equal(shared.getItem('jackal-online'), null);
  const s = G.newGame({ mode: '1v1', seed: 1 });
  assert.equal(V.needsLeaveConfirm(null, s), false); assert.equal(V.needsLeaveConfirm({ gone: false }, s), true);
  assert.equal(V.needsLeaveConfirm({ gone: true }, s), false); assert.equal(V.needsLeaveConfirm({ gone: false }, { ...s, over: true }), false);
  delete globalThis.localStorage; delete globalThis.sessionStorage;
});
