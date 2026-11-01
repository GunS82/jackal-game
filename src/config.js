// Адрес сервера онлайн-игры (v0.5.18).
// RENDER_URL — адрес сервиса на Render; при деплое на GitHub Pages workflow подставляет сюда переменную репозитория SERVER_URL.
export const RENDER_URL = 'https://jackal-server.onrender.com';
// Правило: ?server=… в адресе (запоминается) > клиент на GitHub Pages / открыт файлом → RENDER_URL > иначе тот же сайт (наш сервер отдаёт и клиент).
export function serverUrlFor(loc, { override = null, render = RENDER_URL } = {}) {
  const clean = u => String(u).replace(/\/+$/, '');
  if (override) return clean(override);
  if (loc.protocol === 'file:' || /\.github\.io$/i.test(loc.hostname)) return clean(render);
  return ''; // тот же источник
}
const loc = globalThis.location;
let override = null;
try { const q = loc && new URLSearchParams(loc.search).get('server'); if (q) localStorage.setItem('jackal-server', q === 'default' ? '' : q); override = localStorage.getItem('jackal-server') || null; } catch {}
export const SERVER_URL = loc ? serverUrlFor(loc, { override }) : '';
export const IS_REMOTE = !!SERVER_URL && !(loc && SERVER_URL === loc.origin);
// Сервер на бесплатном тарифе засыпает — ждём его до WAKE_TIMEOUT, опрашивая /health.
export const WAKE_TIMEOUT = 90000, WAKE_POLL = 3000;
