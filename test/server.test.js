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
    const after = await B.next(m => m.state.turn === 1); assert.equal(after.state.current, 2);
    assert.equal(V.onlineBanner(after.state, { player: 1, opponent: after.opponent }).title, 'Ваш ход!');
    assert.equal(V.onlineBanner((await A.next(m => m.state.turn === 1)).state, { player: 0 }).title, 'Ход соперника');
    // соперник ушёл (обрыв) → offline; вернулся по коду+токену → online и то же состояние
    B.close(); await A.next(m => m.opponent === 'offline');
    const B2 = listen(base, b); const back = await B2.next(m => m.opponent === 'online'); assert.equal(back.state.turn, 1);
    await A.next(m => m.opponent === 'online' && m.state.turn === 1);
    // явный выход → left
    await post(base, 'leave', { code: a.code, token: b.token }); B2.close();
    assert.equal(V.onlineBanner(null, { player: 0, opponent: (await A.next(m => m.opponent === 'left')).opponent }).title, 'Соперник вышел');
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
  assert.equal(V.onlineBanner(s, { player: 0, opponent: 'offline' }).title, 'Соперник вышел');
  assert.equal(V.onlineBanner({ ...s, over: true }, { player: 0 }), null);
});
