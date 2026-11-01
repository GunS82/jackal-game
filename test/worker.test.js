import test from 'node:test';
import assert from 'node:assert/strict';
import Worker, { Room } from '../worker.js';
import * as G from '../src/game.js';

class MemoryStorage {
  values = new Map();
  alarmAt = null;
  async get(key) { const value = this.values.get(key); return value == null ? undefined : structuredClone(value); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async setAlarm(at) { this.alarmAt = at; }
  async deleteAlarm() { this.alarmAt = null; }
}

class RoomNamespace {
  rooms = new Map();
  idFromName(name) { return name; }
  get(name) {
    if (!this.rooms.has(name)) {
      const storage = new MemoryStorage();
      const ctx = { storage, blockConcurrencyWhile: action => Promise.resolve().then(action) };
      this.rooms.set(name, { object: new Room(ctx), storage });
    }
    return { fetch: request => this.rooms.get(name).object.fetch(request) };
  }
}

function environment() { return { ROOMS: new RoomNamespace(), ALLOWED_ORIGINS: 'https://guns82.github.io' }; }

async function call(env, path, { method = 'GET', body, origin = 'https://guns82.github.io' } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (origin) headers.set('origin', origin);
  return Worker.fetch(new Request(`https://jackal.test${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env);
}

async function jsonResponse(response) { return response.json(); }

test('Cloudflare Worker: health, CORS, room auth, public state, moves, and leave', async () => {
  const env = environment();
  const health = await call(env, '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await jsonResponse(health), { ok: true });
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://guns82.github.io');

  const preflight = await call(env, '/api/create', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, HEAD, POST, OPTIONS');

  const created = await jsonResponse(await call(env, '/api/create', { method: 'POST', body: { options: {} } }));
  assert.match(created.code, /^[A-HJ-NP-Z2-9]{4}$/);
  const joined = await jsonResponse(await call(env, '/api/join', { method: 'POST', body: { code: created.code } }));
  assert.equal(joined.player, 1);

  const invalidHead = await call(env, `/api/events?code=${created.code}&token=invalid`, { method: 'HEAD' });
  assert.equal(invalidHead.status, 403);

  const events = await call(env, `/api/events?code=${created.code}&token=${created.token}`);
  assert.equal(events.status, 200);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  assert.match(decoder.decode((await reader.read()).value), /retry: 1000/);
  const firstStateChunk = decoder.decode((await reader.read()).value);
  const firstState = JSON.parse(firstStateChunk.match(/data: (.+)\n\n/)[1]);
  assert.equal(firstState.opponent, 'offline');
  assert.equal(firstState.state.seed, null);
  assert.ok(Object.values(firstState.state.tiles).some(tile => !tile.open));
  for (const tile of Object.values(firstState.state.tiles)) {
    if (!tile.open) assert.deepEqual(tile, { kind: 'empty', open: false, coins: 0 });
  }

  const room = env.ROOMS.rooms.get(created.code).object.room;
  const move = G.legalMoves(room.state)[0];
  const outOfTurn = await call(env, '/api/move', { method: 'POST', body: { code: created.code, token: joined.token, move } });
  assert.equal(outOfTurn.status, 422);
  const moved = await call(env, '/api/move', { method: 'POST', body: { code: created.code, token: created.token, move } });
  assert.equal(moved.status, 200);
  assert.deepEqual(await jsonResponse(moved), { ok: true });
  const afterMove = decoder.decode((await reader.read()).value);
  const movedState = JSON.parse(afterMove.match(/data: (.+)\n\n/)[1]);
  assert.equal(movedState.state.moves.length, 1);

  const left = await call(env, '/api/leave', { method: 'POST', body: { code: created.code, token: joined.token } });
  assert.equal(left.status, 200);
  assert.match(decoder.decode((await reader.read()).value), /"opponent":"left"/);
  await reader.cancel();
});

test('Cloudflare Worker: rejects non-object JSON and removes expired rooms on alarm', async () => {
  const env = environment();
  const nullBody = await call(env, '/api/create', { method: 'POST', body: null });
  assert.equal(nullBody.status, 400);

  const created = await jsonResponse(await call(env, '/api/create', { method: 'POST', body: {} }));
  const roomEntry = env.ROOMS.rooms.get(created.code);
  roomEntry.object.room.updated = Date.now() - 25 * 60 * 60 * 1000;
  await roomEntry.storage.put('room', roomEntry.object.room);
  await roomEntry.object.alarm();
  assert.equal(await roomEntry.storage.get('room'), undefined);
  assert.equal(roomEntry.storage.alarmAt, null);
});
