// Чистые функции представления (без DOM): заголовок, статус и состояние кнопок. Покрыты тестами.
import * as G from './game.js';

// Что именно надо выбрать при незавершённом ходе: конь — клетку, стрелка — направление.
export function pendingWhat(s) {
  if (!s.pending) return null;
  const p = s.pirates[s.pending.pid];
  return G.tileAt(s, p.x, p.y)?.kind === 'horse' ? 'клетку' : 'направление';
}

// Заголовок частями: постоянный префикс «Ход:» (не мигает при перерисовке) и меняющийся текст.
export function headerParts(s, opts = {}) {
  const t = headerText(s, opts);
  return t.startsWith('Ход: ') ? { prefix: 'Ход:', text: t.slice(5) } : { prefix: '', text: t };
}

// Подсказка: выбранный пират без «С монетой» мог бы отвезти монету на корабль.
export function coinHint(classified, { sel = null, withCoin = false } = {}) {
  if (typeof sel !== 'number' || withCoin) return null;
  return classified.some(m => m.pid === sel && m.coin && m.kind === 'coin') ? 'Монету можно отвезти на корабль — включите «С монетой»' : null;
}

// Приоритет слоя подсветки для клетки (несколько ходов на одну клетку).
export function hlKind(here) {
  const has = k => here.some(m => m.kind === k);
  if (here.every(m => m.kind === 'death')) return 'death';
  return has('coin') ? 'coin' : has('coinLost') ? 'coin-lost' : has('death') ? 'death' : 'move';
}

export function headerText(s, { myTurn = true } = {}) {
  if (s.over) return `Игра окончена (${G.END_REASONS[s.endReason] ?? ''}). ${s.endReason === 'noMoves' ? 'Ничья' : 'Победа'}: ${G.winner(s).map(k => G.sideName(s, k)).join(', ')}`;
  const T = G.TEAMS[s.current];
  let t = `Ход: ${T.name} (игрок ${G.playerOf(s, s.current) + 1}) · №${s.turn + 1}`;
  const w = pendingWhat(s);
  if (w) t += ` · выберите ${w}`;
  if (!myTurn) t += ' · ждём ход соперника — загрузите его файл';
  return t;
}

// Сообщение при клике по другому пирату во время незавершённого хода.
export function blockedNotice(s) { const w = pendingWhat(s); return w ? `Сначала завершите ход: выберите ${w} для пирата на стрелке/коне` : null; }

// Несёт ли пират монету (для метки coin.svg): монета едет через вертушку (carry),
// продолжение хода с монетой (pending.coin) или выбранный пират с включённым тогглом «с монетой».
export function pirateHasCoin(s, p, { sel = null, withCoin = false } = {}) {
  if (p.carry) return true;
  if (s.pending && s.pending.pid === p.id) return !!s.pending.coin;
  return p.id === sel && withCoin;
}

// Все кнопки всегда на месте; возвращает {disabled, label, pressed}.
export function buttons(s, moves, { sel = null, withCoin = false, myTurn = true } = {}) {
  const busy = s.over || !myTurn || !!s.pending;
  const pirate = typeof sel === 'number' ? s.pirates[sel] : null;
  const coinChoice = !!pirate && !busy && moves.some(m => m.pid === sel && m.coin) && moves.some(m => m.pid === sel && !m.coin);
  return {
    ship: { disabled: busy || !moves.some(m => m.type === 'ship'), label: '⛵ Двигать корабль', pressed: sel === 'ship' },
    coin: { disabled: !coinChoice, label: withCoin ? '🪙 С монетой ' : '🪙 Без монеты', pressed: !!withCoin },
    revive: { disabled: busy || !moves.some(m => m.type === 'revive'), label: '❤ Воскресить', pressed: false },
  };
}
