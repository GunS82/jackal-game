// Комнаты онлайн-игры: чистая логика без сети (тестируется напрямую).
import crypto from 'node:crypto';
import * as G from '../src/game.js';
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих 0/O, 1/I
export const ONLINE_MODE = '1v1'; // онлайн: один человек = одна команда (решение Геннадия), режим из запроса игнорируется
export class Rooms {
  // now — часы (для тестов); idleMs — удалять комнату без активности; overMs — законченную партию; sweepMs — период уборки (0 — без таймера)
  constructor({ codeLen = 4, now = Date.now, idleMs = 24 * 3600e3, overMs = 3600e3, sweepMs = 10 * 60e3 } = {}) {
    Object.assign(this, { rooms: new Map(), codeLen, now, idleMs, overMs });
    if (sweepMs) { this.timer = setInterval(() => this.sweep(), sweepMs); this.timer.unref?.(); }
  }
  sweep() {
    const t = this.now(); let n = 0;
    for (const [c, r] of this.rooms) if (t - r.updated > this.idleMs || (r.overAt != null && t - r.overAt > this.overMs)) { for (const sub of r.subs) sub.close?.(); this.rooms.delete(c); n++; }
    return n;
  }
  stop() { clearInterval(this.timer); }
  code() { let c; do { c = Array.from(crypto.randomBytes(this.codeLen), b => ABC[b % ABC.length]).join(''); } while (this.rooms.has(c)); return c; }
  create(options = {}) {
    if (!options || typeof options !== 'object') options = {};
    const opts = {}; for (const k of Object.keys(G.DEFAULT_OPTIONS)) if (typeof options[k] === 'boolean') opts[k] = options[k];
    const code = this.code(), token = crypto.randomUUID();
    const room = { code, state: G.newGame({ mode: ONLINE_MODE, seed: crypto.randomInt(1e9), options: opts }), seats: [{ token, online: false, left: false }, null], subs: new Set(), updated: this.now(), overAt: null };
    this.rooms.set(code, room); return { code, token, player: 0 };
  }
  get(code) { const r = this.rooms.get(String(code || '').toUpperCase().trim()); if (!r) throw httpErr(404, 'Игра с таким кодом не найдена'); return r; }
  join(code) {
    // свободно: второе место ещё не занято или игрок вышел (место освобождено) — входящий продолжает за ту же команду
    const r = this.get(code), i = r.seats.findIndex(s => !s || s.left); if (i < 0) throw httpErr(409, 'В этой игре уже два игрока');
    const token = crypto.randomUUID(); r.seats[i] = { token, online: false, left: false }; this.touch(r); return { code: r.code, token, player: i };
  }
  seat(r, token) { const i = token ? r.seats.findIndex(s => s && s.token === token) : -1; if (i < 0) throw httpErr(403, 'Неверный токен игрока'); return i; }
  move(code, token, move) {
    const r = this.get(code), player = this.seat(r, token);
    if (!move || typeof move !== 'object') throw httpErr(400, 'Нет хода');
    if (!r.seats[1]) throw httpErr(409, 'Соперник ещё не подключился');
    try { r.state = G.applyMove(r.state, move, { asPlayer: player }); } catch (e) { throw httpErr(422, e.message); }
    this.touch(r); return r.state;
  }
  setOnline(r, player, online) { if (r.seats[player]) { r.seats[player].online = online; if (online) r.seats[player].left = false; this.touch(r); } }
  leave(code, token) { const r = this.get(code), p = this.seat(r, token); r.seats[p] = { token: null, online: false, left: true }; this.touch(r); } // место освобождено, старый токен больше не действует
  // Что видит игрок: публичное состояние + статус соперника.
  view(r, player) {
    const o = r.seats[1 - player];
    return { type: 'state', code: r.code, player, state: G.publicState(r.state), opponent: !o ? 'waiting' : o.left ? 'left' : o.online ? 'online' : 'offline' };
  }
  touch(r) { r.updated = this.now(); if (r.state.over && r.overAt == null) r.overAt = r.updated; for (const sub of r.subs) sub.send(this.view(r, sub.player)); }
}
export function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
