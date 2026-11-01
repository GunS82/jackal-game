// Клиент онлайн-игры: HTTP-запросы + Server-Sent Events (EventSource сам переподключается).
// Сессия хранится в sessionStorage: у каждой вкладки своя (вторая вкладка не подхватит чужой токен), переживает перезагрузку.
const KEY = 'jackal-online';
const store = () => globalThis.sessionStorage;
async function post(path, body) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Ошибка сервера'); return j;
}
export const saved = () => { try { return JSON.parse(store().getItem(KEY)); } catch { return null; } };
export const remember = s => { store().setItem(KEY, JSON.stringify(s)); return s; };
export const forget = () => { store().removeItem(KEY); try { globalThis.localStorage?.removeItem(KEY); } catch {} }; // старый ключ v0.5.0/0.5.1
export async function create(options) { return remember(await post('create', { options })); }
export async function join(code) { return remember(await post('join', { code })); }
export const move = (sess, m) => post('move', { code: sess.code, token: sess.token, move: m });
export const leave = sess => post('leave', { code: sess.code, token: sess.token }).catch(() => {});
// onState(msg) — новое состояние; onConn(bool) — связь есть/нет.
export function connect(sess, onState, onConn, onGone = () => {}) {
  let es = null, stopped = false, tries = 0;
  const retry = () => setTimeout(() => !stopped && open(), Math.min(500 * 2 ** tries++, 8000)); // 0.5 с, 1, 2, 4, 8…
  const open = () => {
    es = new EventSource(`/api/events?code=${encodeURIComponent(sess.code)}&token=${encodeURIComponent(sess.token)}`);
    es.onopen = () => { tries = 0; onConn(true); };
    es.onmessage = e => { onConn(true); onState(JSON.parse(e.data)); };
    es.onerror = async () => {
      onConn(false);
      if (es.readyState !== EventSource.CLOSED || stopped) return; // браузер переподключится сам
      try { const r = await fetch(`/api/events?code=${encodeURIComponent(sess.code)}&token=${encodeURIComponent(sess.token)}`, { method: 'HEAD' }); if (r.status === 404 || r.status === 403) return onGone(); } catch {}
      retry();
    };
  };
  open();
  const stop = () => { stopped = true; es?.close(); };
  // Для проверки: оборвать связь вручную — плашка «Соединение потеряно», первая попытка переподключения через 0.5 с.
  stop.drop = () => { es?.close(); onConn(false); retry(); };
  return stop;
}
