import * as G from './src/game.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const IDLE_MS = 24 * 60 * 60 * 1000;
const OVER_MS = 60 * 60 * 1000;
const encoder = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function randomInt(max) {
  const ceiling = Math.floor(0x100000000 / max) * max;
  const word = new Uint32Array(1);
  do { crypto.getRandomValues(word); } while (word[0] >= ceiling);
  return word[0] % max;
}

function newCode(length = 4) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => CODE_CHARS[byte % CODE_CHARS.length]).join('');
}

function corsHeaders(request, origins) {
  const headers = new Headers();
  const origin = request.headers.get('origin');
  const allowed = String(origins || '*').split(',').map(value => value.trim().replace(/\/+$/, '')).filter(Boolean);
  if (origin && (allowed.includes('*') || allowed.includes(origin))) {
    headers.set('access-control-allow-origin', allowed.includes('*') ? '*' : origin);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type');
    headers.set('access-control-max-age', '600');
  }
  return headers;
}

function withCors(response, request, origins) {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(request, origins)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function roomRequest(request, body = undefined) {
  const url = new URL(request.url);
  const init = { method: request.method, headers: new Headers(request.headers) };
  if (body !== undefined) {
    init.headers.delete('content-length');
    init.headers.set('content-type', 'application/json');
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

async function requestBody(request) {
  let body;
  try { body = await request.json(); }
  catch { throw new HttpError(400, 'Неверный JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Тело запроса должно быть JSON-объектом');
  }
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origins = env.ALLOWED_ORIGINS || '*';
    const respond = response => withCors(response, request, origins);

    try {
      if (request.method === 'OPTIONS') return respond(new Response(null, { status: 204 }));
      if (url.pathname === '/health') {
        if (request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(405, 'Метод не поддерживается');
        return respond(new Response(request.method === 'HEAD' ? null : JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        }));
      }
      if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'Не найдено');

      let body;
      if (request.method === 'POST') body = await requestBody(request);
      if (url.pathname === '/api/create' && request.method === 'POST') {
        for (let attempt = 0; attempt < 20; attempt++) {
          const code = newCode();
          const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
          const response = await stub.fetch(roomRequest(request, { code, options: body.options }));
          if (response.status !== 409) return respond(response);
        }
        throw new HttpError(503, 'Не удалось создать код игры');
      }

      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'POST') {
        throw new HttpError(405, 'Метод не поддерживается');
      }
      const code = String(body?.code ?? url.searchParams.get('code') ?? '').trim().toUpperCase();
      if (!code) throw new HttpError(400, 'Не указан код игры');
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return respond(await stub.fetch(roomRequest(request, request.method === 'POST' ? body : undefined)));
    } catch (error) {
      const status = error.status || 500;
      return respond(request.method === 'HEAD' ? new Response(null, { status }) : json(status, { error: error.message || 'Ошибка сервера' }));
    }
  },
};

export class Room {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;
    this.subs = new Set();
    this.serial = Promise.resolve();
    this.ready = ctx.blockConcurrencyWhile
      ? ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get('room') ?? null; })
      : ctx.storage.get('room').then(value => { this.room = value ?? null; });
  }

  serialize(action) {
    const result = this.serial.then(action, action);
    this.serial = result.catch(() => {});
    return result;
  }

  getRoom() {
    if (!this.room) throw new HttpError(404, 'Игра с таким кодом не найдена');
    return this.room;
  }

  seat(room, token) {
    const player = token ? room.seats.findIndex(value => value && value.token === token) : -1;
    if (player < 0) throw new HttpError(403, 'Неверный токен игрока');
    return player;
  }

  view(room, player) {
    const opponent = room.seats[1 - player];
    return {
      type: 'state', code: room.code, player, state: G.publicState(room.state),
      opponent: !opponent ? 'waiting' : opponent.left ? 'left' : opponent.online ? 'online' : 'offline',
    };
  }

  send(sub, value) {
    try { sub.controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); }
    catch { this.subs.delete(sub); clearInterval(sub.ping); }
  }

  broadcast(room = this.room) {
    if (!room) return;
    for (const sub of this.subs) this.send(sub, this.view(room, sub.player));
  }

  async touch(room) {
    room.updated = Date.now();
    await this.ctx.storage.put('room', room);
    await this.ctx.storage.setAlarm(room.overAt == null ? room.updated + IDLE_MS : room.overAt + OVER_MS);
  }

  async fetch(request) {
    try {
      await this.ready;
      const url = new URL(request.url);
      if (url.pathname === '/api/events' && request.method === 'HEAD') {
        this.seat(this.getRoom(), url.searchParams.get('token'));
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/api/events' && request.method === 'GET') return this.events(url);
      if (request.method !== 'POST') throw new HttpError(405, 'Метод не поддерживается');

      const body = await requestBody(request);
      const action = url.pathname.slice('/api/'.length);
      if (action === 'create') return await this.create(body);
      if (action === 'join') return await this.join(body.code);
      if (action === 'move') return await this.move(body);
      if (action === 'leave') return await this.leave(body);
      throw new HttpError(404, 'Нет такого запроса');
    } catch (error) {
      return request.method === 'HEAD'
        ? new Response(null, { status: error.status || 500 })
        : json(error.status || 500, { error: error.message || 'Ошибка сервера' });
    }
  }

  async create(body) {
    return this.serialize(async () => {
      if (this.room) throw new HttpError(409, 'Код игры уже занят');
      const options = {};
      for (const key of Object.keys(G.DEFAULT_OPTIONS)) if (typeof body.options?.[key] === 'boolean') options[key] = body.options[key];
      this.room = {
        code: String(body.code).toUpperCase(),
        state: G.newGame({ mode: '1v1', seed: randomInt(1e9), options }),
        seats: [{ token: crypto.randomUUID(), online: false, left: false }, null],
        updated: Date.now(), overAt: null,
      };
      await this.touch(this.room);
      return json(200, { code: this.room.code, token: this.room.seats[0].token, player: 0 });
    });
  }

  async join(code) {
    return this.serialize(async () => {
      const room = this.getRoom();
      const player = room.seats.findIndex(seat => !seat || seat.left);
      if (player < 0) throw new HttpError(409, 'В этой игре уже два игрока');
      const token = crypto.randomUUID();
      room.seats[player] = { token, online: false, left: false };
      await this.touch(room);
      this.broadcast(room);
      return json(200, { code: room.code, token, player });
    });
  }

  async move(body) {
    return this.serialize(async () => {
      const room = this.getRoom(), player = this.seat(room, body.token);
      if (!body.move || typeof body.move !== 'object' || Array.isArray(body.move)) throw new HttpError(400, 'Нет хода');
      if (!room.seats[1]) throw new HttpError(409, 'Соперник ещё не подключился');
      try { room.state = G.applyMove(room.state, body.move, { asPlayer: player }); }
      catch (error) { throw new HttpError(422, error.message); }
      if (room.state.over && room.overAt == null) room.overAt = Date.now();
      await this.touch(room);
      this.broadcast(room);
      return json(200, { ok: true });
    });
  }

  async leave(body) {
    return this.serialize(async () => {
      const room = this.getRoom(), player = this.seat(room, body.token);
      room.seats[player] = { token: null, online: false, left: true };
      await this.touch(room);
      this.broadcast(room);
      return json(200, { ok: true });
    });
  }

  async events(url) {
    const room = this.getRoom(), player = this.seat(room, url.searchParams.get('token'));
    let sub;
    const stream = new ReadableStream({
      start: controller => {
        sub = { player, controller, ping: null };
        controller.enqueue(encoder.encode(`retry: 1000\n: ${' '.repeat(2048)}\n\n`));
      },
      cancel: () => this.serialize(async () => {
        if (!sub || !this.subs.delete(sub)) return;
        clearInterval(sub.ping);
        const current = this.room, seat = current?.seats[player];
        if (!current || !seat || seat.left || [...this.subs].some(value => value.player === player)) return;
        seat.online = false;
        await this.touch(current);
        this.broadcast(current);
      }),
    });

    await this.serialize(async () => {
      const current = this.getRoom();
      this.seat(current, url.searchParams.get('token'));
      current.seats[player].online = true;
      this.subs.add(sub);
      sub.ping = setInterval(() => {
        try { sub.controller.enqueue(encoder.encode(': ping\n\n')); }
        catch { clearInterval(sub.ping); this.subs.delete(sub); }
      }, 20000);
      await this.touch(current);
      this.broadcast(current);
    });

    return new Response(stream, { status: 200, headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    } });
  }

  async alarm() {
    await this.ready;
    return this.serialize(async () => {
      const room = this.room;
      if (!room) return;
      const now = Date.now();
      if (now - room.updated >= IDLE_MS || (room.overAt != null && now - room.overAt >= OVER_MS)) {
        for (const sub of this.subs) {
          clearInterval(sub.ping);
          try { sub.controller.close(); } catch {}
        }
        this.subs.clear();
        this.room = null;
        await this.ctx.storage.delete('room');
        await this.ctx.storage.deleteAlarm();
      } else {
        await this.ctx.storage.setAlarm(room.overAt == null ? room.updated + IDLE_MS : room.overAt + OVER_MS);
      }
    });
  }
}
