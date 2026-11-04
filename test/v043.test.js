// v0.4.3: замечания Тестировщика — груз через пещеру, обмен в пещере, подсветка тонущего сокровища
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as G from '../src/game.js';
import * as V from '../src/view.js';
const load = f => G.loadState(JSON.parse(fs.readFileSync(new URL('../test-positions/' + f, import.meta.url))));
const mv = (s, f) => { const m = G.legalMoves(s).find(f); assert.ok(m, 'ход не найден'); return G.applyMove(s, m); };
const pass = s => mv(s, m => m.type === 'ship');

test('пещера: монета проходит с пиратом и несётся дальше (v04-cave)', () => {
  let s = load('v04-cave.json');
  const pid = s.pirates.find(p => p.x === 2 && p.y === 8).id;
  s = mv(s, m => m.pid === pid && m.x === 2 && m.y === 9 && m.coin);
  assert.equal(s.pending.type, 'cave'); assert.equal(s.pending.coin, true);
  s = mv(s, m => m.via === 'cave' && m.x === 9 && m.y === 2 && m.coin);
  assert.deepEqual([s.pirates[pid].x, s.pirates[pid].y], [9, 2]);
  assert.equal(s.pirates[pid].carry, 1); assert.equal(G.tileAt(s, 9, 2).coins, 0); assert.equal(G.tileAt(s, 2, 9).coins, 0); assert.equal(G.tileAt(s, 2, 8).coins, 0);
  s = pass(s);
  s = mv(s, m => m.pid === pid && m.coin && m.x === 9 && m.y === 3);
  assert.equal(s.pirates[pid].carry, 1); assert.equal(G.tileAt(s, 9, 3).coins, 0); assert.equal(G.tileAt(s, 9, 2).coins, 0);
});

test('пещера: заблудившийся выходит (с грузом) на открытую пещеру, открывший — на его вход (v04-cave-swap)', () => {
  let s = load('v04-cave-swap.json');
  const lost = s.pirates.find(p => p.inCave), opener = s.pirates.find(p => p.team === 0 && p.x === 9 && p.y === 10);
  assert.equal(lost.carry, 1); assert.ok(!G.legalMoves(s).some(m => m.pid === lost.id), 'выхода нет — ждёт');
  s = mv(s, m => m.pid === opener.id && m.x === 9 && m.y === 9);
  const L = s.pirates[lost.id], O = s.pirates[opener.id];
  assert.deepEqual([L.x, L.y, !!L.inCave, L.carry], [9, 9, false, 1]); assert.equal(G.tileAt(s, 9, 9).coins, 0);
  assert.deepEqual([O.x, O.y, !!O.inCave], [3, 3, false]); assert.equal(s.current, 2);
});

test('галеон: стрелка в море с сокровищем — coinLost, подсветка hl-coin-lost', () => {
  let s = load('v04-galleon.json');
  const pid = s.pirates.find(p => p.x === 10 && p.y === 9).id;
  s = pass(mv(s, m => m.pid === pid && m.x === 10 && m.y === 10));
  const cl = G.classifyMoves(s).filter(m => m.pid === pid && m.x === 11 && m.y === 10);
  assert.equal(cl.find(m => m.treasure).kind, 'coinLost');
  assert.equal(V.hlKind(V.targets(cl, { s, sel: pid, withCoin: 'T' })), 'coin-lost');
  assert.ok(!V.coinHintAt(G.classifyMoves(s), 11, 10, { sel: pid, withCoin: false }));
  // цепочка из двух стрелок в море — тоже coinLost, сокровище тонет целиком
  const c = G.loadState({ tiles: { '9,10': { treasure: 1 }, '10,10': { kind: 'arrow1', rot: 1 }, '11,10': { kind: 'arrow1', rot: 1 } }, pirates: [{ team: 0, x: 9, y: 10 }] });
  const m = G.classifyMoves(c).find(m => m.x === 10 && m.y === 10 && m.treasure); assert.equal(m.kind, 'coinLost');
  const { kind, ...raw } = m; assert.equal(G.applyMove(c, raw).lost, 3);
});
