// Минимальный сервер «Шакала»: статика + комнаты (HTTP + Server-Sent Events, без зависимостей).
// Запуск: npm run server  (PORT=8090 по умолчанию, слушает 0.0.0.0; ALLOWED_ORIGINS — через запятую, по умолчанию * — для клиента на GitHub Pages)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rooms, httpErr } from './rooms.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const STATIC = ['index.html', 'style.css', 'favicon.svg', 'favicon.ico', 'src/', 'assets/', 'test-positions/', 'positions/', 'design/']; // test-positions/ и design/ — для Тестировщика (раньше здесь работал python http.server)

export function createServer({ rooms = new Rooms(), origins = process.env.ALLOWED_ORIGINS || '*' } = {}) {
  const allowed = String(origins).split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
  const cors = (req, res) => { const o = req.headers.origin; if (!o) return; const ok = allowed.includes('*') || allowed.includes(o); if (!ok) return;
    res.setHeader('access-control-allow-origin', allowed.includes('*') ? '*' : o); res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS'); res.setHeader('access-control-allow-headers', 'content-type'); res.setHeader('access-control-max-age', '600'); };
  const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const body = req => new Promise((ok, bad) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { bad(httpErr(400, 'Неверный JSON')); } }); });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    cors(req, res);
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); } // CORS preflight
      if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, rooms: rooms.rooms?.size ?? 0 })); }
      if (url.pathname === '/api/events' && req.method === 'HEAD') { rooms.seat(rooms.get(url.searchParams.get('code')), url.searchParams.get('token')); res.writeHead(204); return res.end(); }
      if (url.pathname === '/api/events' && req.method === 'GET') {
        const r = rooms.get(url.searchParams.get('code')), player = rooms.seat(r, url.searchParams.get('token'));
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`retry: 1000\n: ${' '.repeat(2048)}\n\n`); // сразу: браузер переподключается через 1 с; паддинг пробивает буферизацию прокси (иначе первые данные приходили только с пингом через 20 с)
        const sub = { player, send: v => res.write(`data: ${JSON.stringify(v)}\n\n`), close: () => res.end() };
        r.subs.add(sub); rooms.setOnline(r, player, true);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); r.subs.delete(sub); if (![...r.subs].some(s => s.player === player)) rooms.setOnline(r, player, false); });
        return;
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        const b = await body(req);
        if (!b || typeof b !== 'object' || Array.isArray(b)) throw httpErr(400, 'Тело запроса должно быть JSON-объектом');
        const act = url.pathname.slice(5);
        if (act === 'create') return json(res, 200, rooms.create(b.options));
        if (act === 'join') return json(res, 200, rooms.join(b.code));
        if (act === 'move') { rooms.move(b.code, b.token, b.move); return json(res, 200, { ok: true }); }
        if (act === 'leave') { rooms.leave(b.code, b.token); return json(res, 200, { ok: true }); }
        throw httpErr(404, 'Нет такого запроса');
      }
      if (req.method !== 'GET') throw httpErr(405, 'Метод не поддерживается');
      const rel = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (rel.includes('..') || !STATIC.some(p => p.endsWith('/') ? rel.startsWith(p) : rel === p)) throw httpErr(404, 'Не найдено');
      const file = path.join(ROOT, rel);
      fs.readFile(file, (err, data) => { if (err) return json(res, 404, { error: 'Не найдено' }); res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
    } catch (e) { if (req.method === 'HEAD') { res.writeHead(e.status || 500); return res.end(); } json(res, e.status || 500, { error: e.message }); }
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = +process.env.PORT || 8090;
  createServer().listen(port, '0.0.0.0', () => console.log(`Шакал: http://localhost:${port} (0.0.0.0:${port})`));
}
