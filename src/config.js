// GitHub Actions подставляет сюда SERVER_URL для Pages и Android build scripts могут задать его в копии клиента.
export const SERVER_URL_DEFAULT = '';
export function serverUrlFor(loc, { override = null, defaultServer = SERVER_URL_DEFAULT } = {}) {
  const clean = u => String(u).replace(/\/+$/, '');
  if (override) return clean(override);
  if (!loc) return '';
  const remote = loc.protocol === 'file:' || /\.github\.io$/i.test(loc.hostname)
    || loc.protocol === 'capacitor:' || (loc.protocol === 'https:' && loc.hostname === 'localhost');
  if (remote) return clean(defaultServer);
  return ''; // тот же источник
}
const loc = globalThis.location;
let override = null;
try { const q = loc && new URLSearchParams(loc.search).get('server'); if (q) localStorage.setItem('jackal-server', q === 'default' ? '' : q); override = localStorage.getItem('jackal-server') || null; } catch {}
export const SERVER_URL = loc ? serverUrlFor(loc, { override }) : '';
const needsRemoteServer = !!loc && (loc.protocol === 'file:' || /\.github\.io$/i.test(loc.hostname)
  || loc.protocol === 'capacitor:' || (loc.protocol === 'https:' && loc.hostname === 'localhost'));
export const SERVER_CONFIGURED = !needsRemoteServer || !!SERVER_URL;
export const IS_REMOTE = !!SERVER_URL && !(loc && SERVER_URL === loc.origin);
// Проверяем доступность сервера с редким повтором, чтобы не засорять консоль при сетевых сбоях.
export const WAKE_TIMEOUT = 30000, WAKE_POLL = 5000;
