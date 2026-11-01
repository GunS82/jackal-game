// v0.4.4: бледная метка «можно взять монету» у фишки пирата (view.coinMark)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import * as V from '../src/view.js';

test('coinMark: can — стоит на монете своего хода; coin/treasure — несёт; иначе null', () => {
  const s = G.loadState({ mode: '1v1', tiles: { '5,5': { coins: 2 }, '7,7': { treasure: 1 }, '3,3': { coins: 1 } }, pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, x: 7, y: 7 }, { team: 0, x: 9, y: 9 }, { team: 2, x: 3, y: 3 }] });
  const ms = G.legalMoves(s), P = (x, y) => s.pirates.find(p => p.alive && p.x === x && p.y === y);
  assert.equal(V.coinMark(s, P(5, 5), ms), 'can');
  assert.equal(V.coinMark(s, P(7, 7), ms), 'can', 'сокровище тоже можно взять');
  assert.equal(V.coinMark(s, P(9, 9), ms), null, 'монет нет');
  assert.equal(V.coinMark(s, P(3, 3), ms), null, 'пират соперника');
  assert.equal(V.coinMark(s, P(5, 5), ms, { myTurn: false }), null, 'не мой ход');
  assert.equal(V.coinMark(s, P(5, 5), ms, { sel: P(5, 5).id, withCoin: true }), 'coin', 'выбран «С монетой» — яркая метка');
  assert.equal(V.coinMark(s, P(7, 7), ms, { sel: P(7, 7).id, withCoin: 'T' }), 'treasure');
});
test('coinMark: несущий груз (вертушка) — яркая метка; в форте с монетой взять нельзя → null', () => {
  const s = G.loadState({ tiles: { '5,5': { kind: 'spin3' }, '7,7': { kind: 'fort', coins: 1 } }, pirates: [{ team: 0, x: 5, y: 5, spin: 1, carry: 1 }, { team: 0, x: 7, y: 7 }] });
  const ms = G.legalMoves(s);
  assert.equal(V.coinMark(s, s.pirates[0], ms), 'coin');
  const fort = s.pirates.find(p => p.x === 7);
  assert.equal(V.coinMark(s, fort, ms), ms.some(m => m.pid === fort.id && m.coin) ? 'can' : null);
});
