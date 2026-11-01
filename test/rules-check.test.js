// v0.4.1: проверка 6 мест, присланных Тестировщиком (сверено с jackal.su/rules/all)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
const pos = o => G.loadState(o);
const mv = (s, f) => { const m = G.legalMoves(s).find(f); assert.ok(m, 'ход не найден'); return G.applyMove(s, m); };
const role = (s, r) => s.pirates.find(p => p.role === r);

test('1) Пятница: вертушка за ход, капкан, людоед, ром, встреча с миссионером', () => {
  const t = pos({ mode: '1v1', tiles: { '4,4': { kind: 'ogre' }, '4,5': { kind: 'trap' }, '4,6': { kind: 'spin5' } }, pirates: [{ team: 0, role: 'friday', x: 5, y: 5 }, { team: 0, x: 9, y: 9 }, { team: 2, onShip: true }] });
  let sp = mv(t, m => m.x === 4 && m.y === 6);
  sp = mv(sp, m => m.type === 'ship'); // ход соперника
  assert.ok(G.legalMoves(sp).some(m => m.pid === role(sp, 'friday').id && m.x === 3 && m.y === 6), 'со вертушки 5 уходит следующим ходом');
  assert.equal(role(mv(t, m => m.x === 4 && m.y === 5), 'friday').trapped, false);
  assert.ok(role(mv(t, m => m.x === 4 && m.y === 4), 'friday').alive);
  const r = mv(pos({ rum: [1, 0, 0, 0], pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, role: 'friday', x: 6, y: 5 }] }), m => m.type === 'rum');
  assert.ok(role(r, 'friday').gone);
  const meet = mv(pos({ mode: '1v1', pirates: [{ team: 0, role: 'friday', x: 5, y: 5 }, { team: 2, role: 'missionary', x: 6, y: 5 }, { team: 2, onShip: true }] }), m => m.x === 6 && m.y === 5);
  assert.ok(role(meet, 'friday').gone && role(meet, 'missionary').gone);
});

test('2) миссионер: защищает и обезоруживает; на клетку одинокого миссионера встать можно (классика)', () => {
  const lone = pos({ mode: '1v1', current: 2, pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 2, x: 6, y: 5 }] });
  const ln = mv(lone, m => m.x === 5 && m.y === 5); // классика: встать можно (запрет — правило «Архипелага»), боя нет
  assert.ok(ln.pirates.filter(p => p.alive).every(p => p.x === 5 && p.y === 5)); assert.deepEqual([role(ln, 'missionary').x, role(ln, 'missionary').team], [5, 0]);
  const pair = pos({ mode: '1v1', current: 2, pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 0, x: 5, y: 5 }, { team: 2, x: 6, y: 5 }] });
  assert.ok(!G.legalMoves(pair).some(m => m.x === 5 && m.y === 5));
  const calm = pos({ mode: '1v1', pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, role: 'missionary', x: 5, y: 5 }, { team: 2, x: 6, y: 5 }] });
  assert.ok(!G.legalMoves(calm).some(m => m.pid === 0 && m.x === 6 && m.y === 5));
  // стрелка на клетку одинокого миссионера — можно; на клетку с пиратом под защитой — невозможное действие, гибель
  const arr = (extra) => mv(pos({ mode: '1v1', current: 2, tiles: { '6,6': { kind: 'arrow1', rot: 3 } }, pirates: [{ team: 0, role: 'missionary', x: 5, y: 6 }, ...extra, { team: 2, x: 7, y: 6 }, { team: 2, x: 9, y: 9 }] }), m => m.x === 6 && m.y === 6);
  const ok = arr([]); assert.equal(ok.pirates.filter(p => p.team === 2 && p.alive).length, 2); assert.ok(ok.pirates.some(p => p.team === 2 && p.x === 5 && p.y === 6));
  const ko = arr([{ team: 0, x: 5, y: 6 }]); assert.equal(ko.pirates.filter(p => p.team === 2 && p.alive).length, 1); assert.ok(ko.pirates.filter(p => p.team === 0 && p.alive).length === 2);
});

test('3) джунгли: с грузом нельзя (и по стрелке — гибель, монета на старте), драться нельзя', () => {
  const s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'jungle' }, '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, x: 6, y: 10 }] });
  assert.ok(!G.legalMoves(s).some(m => m.x === 6 && m.y === 10 && m.coin));
  const n = mv(s, m => m.x === 6 && m.y === 10); const al = n.pirates.filter(p => p.alive); assert.equal(al.length, 2); assert.ok(al.every(p => p.x === 6 && p.y === 10));
  const a = mv(pos({ tiles: { '5,9': { kind: 'arrow1' }, '5,8': { kind: 'jungle' }, '5,10': { coins: 1 } }, pirates: [{ team: 0, x: 5, y: 10 }] }), m => m.x === 5 && m.y === 9 && m.coin);
  assert.equal(a.pirates[0].alive, false); assert.equal(G.tileAt(a, 5, 10).coins, 1);
});

test('4) пещера: выход с врагом закрыт, переход — только в свободный', () => {
  let s = pos({ mode: '1v1', tiles: { '3,3': { kind: 'cave' }, '9,9': { kind: 'cave' }, '3,9': { kind: 'cave' } }, pirates: [{ team: 0, x: 3, y: 4 }, { team: 2, x: 9, y: 9 }] });
  s = mv(s, m => m.x === 3 && m.y === 3);
  assert.deepEqual(G.legalMoves(s).filter(m => m.via === 'cave').map(m => [m.x, m.y]), [[3, 9]]);
});

test('5) невозможное вынужденное действие: лёд в крепость с врагом — гибель, монета там, где начал', () => {
  const s = mv(pos({ mode: '1v1', tiles: { '5,7': { coins: 1 }, '5,6': { kind: 'ice' }, '5,5': { kind: 'fort' } }, pirates: [{ team: 0, x: 5, y: 7 }, { team: 0, x: 9, y: 9 }, { team: 2, x: 5, y: 5 }] }), m => m.pid === 0 && m.x === 5 && m.y === 6 && m.coin);
  assert.equal(s.pirates[0].alive, false); assert.equal(G.tileAt(s, 5, 7).coins, 1); assert.equal(G.tileAt(s, 5, 5).coins, 0);
  const e = s.pirates.find(p => p.team === 2 && p.alive); assert.deepEqual([e.x, e.y], [5, 5]); assert.equal(G.coinsLeft(s), 1);
});

test('6) трава в 1 на 1 (по 2 команды): круг ходов за соперника, ром нельзя', () => {
  let s = pos({ mode: '2p', rum: [1, 1, 1, 1], tiles: { '6,10': { kind: 'grass', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 1, onShip: true }, { team: 2, onShip: true }, { team: 3, onShip: true }] });
  s = mv(s, m => m.x === 6 && m.y === 10);
  const who = []; for (let i = 0; i < 4; i++) { who.push([s.current, G.controllerOf(s)]); assert.ok(!G.legalMoves(s).some(m => m.type === 'rum' || m.rum)); s = mv(s, () => true); }
  assert.deepEqual(who, [[1, 0], [2, 1], [3, 0], [0, 1]]);
  assert.equal(s.current, 1); assert.equal(G.controllerOf(s), 1); assert.equal(s.grass, 0);
});

test('2а) опция archipelagoMissionary: к миссионеру врагам нельзя, вынужденный вход — гибель; сохраняется и проверяется', () => {
  const o = { archipelagoMissionary: true };
  const lone = pos({ mode: '1v1', current: 2, options: o, pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 2, x: 6, y: 5 }] });
  assert.ok(!G.legalMoves(lone).some(m => m.x === 5 && m.y === 5));
  const fr = pos({ mode: '1v1', current: 2, options: o, pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 2, role: 'friday', x: 6, y: 5 }, { team: 2, x: 9, y: 9 }] });
  assert.ok(G.legalMoves(fr).some(m => m.x === 5 && m.y === 5), 'Пятнице можно');
  const ch = mv(pos({ mode: '1v1', current: 2, options: o, tiles: { '6,6': { kind: 'arrow1', rot: 3 } }, pirates: [{ team: 0, role: 'missionary', x: 5, y: 6 }, { team: 2, x: 7, y: 6 }, { team: 2, x: 9, y: 9 }] }), m => m.x === 6 && m.y === 6);
  assert.equal(ch.pirates.filter(p => p.team === 2 && p.alive).length, 1);
  const re = G.loadState(JSON.parse(JSON.stringify(ch))); assert.equal(re.options.archipelagoMissionary, true);
  assert.equal(G.newGame({ seed: 1 }).options.archipelagoMissionary, false);
  assert.throws(() => pos({ options: { archipelagoMissionary: 'да' }, pirates: [{ team: 0, x: 5, y: 5 }] }), /true\/false/);
});
