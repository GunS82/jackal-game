// Клиент онлайн-игры: HTTP-запросы + Server-Sent Events (EventSource сам переподключается).
const KEY = 'jackal-online';
async function post(path, body) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Ошибка сервера'); return j;
}
export const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const forget = () => localStorage.removeItem(KEY);
export async function create(options) { const s = await post('create', { options }); localStorage.setItem(KEY, JSON.stringify(s)); return s; }
export async function join(code) { const s = await post('join', { code }); localStorage.setItem(KEY, JSON.stringify(s)); return s; }
export const move = (sess, m) => post('move', { code: sess.code, token: sess.token, move: m });
export const leave = sess => post('leave', { code: sess.code, token: sess.token }).catch(() => {});
// onState(msg) — новое состояние; onConn(bool) — связь есть/нет.
export function connect(sess, onState, onConn, onGone = () => {}) {
  let es = null, stopped = false;
  const open = () => {
    es = new EventSource(`/api/events?code=${encodeURIComponent(sess.code)}&token=${encodeURIComponent(sess.token)}`);
    es.onopen = () => onConn(true);
    es.onmessage = e => { onConn(true); onState(JSON.parse(e.data)); };
    es.onerror = async () => {
      onConn(false);
      if (es.readyState !== EventSource.CLOSED || stopped) return; // браузер переподключится сам
      try { const r = await fetch(`/api/events?code=${encodeURIComponent(sess.code)}&token=${encodeURIComponent(sess.token)}`, { method: 'HEAD' }); if (r.status === 404 || r.status === 403) return onGone(); } catch {}
      setTimeout(() => !stopped && open(), 3000);
    };
  };
  open();
  return () => { stopped = true; es?.close(); };
}
