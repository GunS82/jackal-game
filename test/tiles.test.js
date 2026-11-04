// v0.4: клетки второго этапа (jackal.su/rules/all, «Остров сокровищ»)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as G from '../src/game.js';
import * as V from '../src/view.js';
const pos = o => G.loadState(o);
const mv = (s, f) => { const m = G.legalMoves(s).find(f); assert.ok(m, 'ход не найден'); return G.applyMove(s, m); };
const at = (s, p) => [s.pirates[p].x, s.pirates[p].y];
const pass2 = s => mv(s, m => m.type === 'ship' || m.type === 'move'); // ход соперника «чем-нибудь»

test('колода: 117 клеток, состав по правилам, пещеры по одной на четверть', () => {
  const sum = Object.values(G.DECK).reduce((a, b) => a + b, 0); assert.equal(sum, 117);
  const want = { empty: 18, cave: 4, quake: 1, jungle: 3, grass: 2, caramba: 1, lighthouse: 1, bengunn: 1, missionary: 1, friday: 1, galleon: 1, rum1: 3, rum2: 2, rum3: 1, barrel: 4 };
  for (const [k, n] of Object.entries(want)) assert.equal(G.DECK[k], n, k);
  for (let seed = 1; seed <= 30; seed++) {
    const s = G.newGame({ seed }); const kinds = {}; for (const t of Object.values(s.tiles)) { const k = t.kind === 'arrow' ? t.arrow : t.kind; kinds[k] = (kinds[k] || 0) + 1; }
    for (const [k, n] of Object.entries(G.DECK)) assert.equal(kinds[k], n, `seed ${seed} ${k}`);
    const q = new Set(Object.entries(s.tiles).filter(([, t]) => t.kind === 'cave').map(([k]) => { const [x, y] = k.split(',').map(Number); assert.ok(x !== 6 && y !== 6); return (x > 6) + 2 * (y > 6); }));
    assert.equal(q.size, 4);
  }
});

test('пещера: ждёт выхода, открытие второй пещеры меняет местами открывшего и заблудившегося', () => {
  let s = pos({ mode: '1v1', tiles: { '3,3': { kind: 'cave', open: false }, '9,9': { kind: 'cave', open: false } }, pirates: [{ team: 0, x: 3, y: 4 }, { team: 0, x: 9, y: 10 }, { team: 2, onShip: true }] });
  s = mv(s, m => m.pid === 0 && m.x === 3 && m.y === 3);
  assert.equal(s.pirates[0].inCave, true); assert.equal(s.current, 2);
  assert.equal(G.pirateMoves({ ...s, current: 0 }, s.pirates[0]).length, 0, 'выхода нет — ходов нет');
  s = pass2(s);
  s = mv(s, m => m.pid === 1 && m.x === 9 && m.y === 9);
  assert.deepEqual(at(s, 0), [9, 9]); assert.equal(s.pirates[0].inCave, false);
  assert.deepEqual(at(s, 1), [3, 3]); assert.equal(s.pending, null);
});
test('пещера: открытые вход и выход — переход за один ход; выход, занятый врагом, закрыт', () => {
  let s = pos({ mode: '1v1', tiles: { '3,3': { kind: 'cave' }, '9,9': { kind: 'cave' }, '3,4': { coins: 1 } }, pirates: [{ team: 0, x: 3, y: 4 }, { team: 2, onShip: true }] });
  s = mv(s, m => m.x === 3 && m.y === 3 && m.coin);
  assert.equal(s.pending.type, 'cave'); assert.equal(s.current, 0);
  s = mv(s, m => m.via === 'cave' && m.x === 9 && m.y === 9);
  assert.deepEqual(at(s, 0), [9, 9]); assert.equal(s.pirates[0].carry, 1); assert.equal(G.tileAt(s, 9, 9).coins, 0); assert.equal(s.current, 2);
  let b = pos({ mode: '1v1', tiles: { '3,3': { kind: 'cave' }, '9,9': { kind: 'cave' } }, pirates: [{ team: 0, x: 3, y: 4 }, { team: 2, x: 9, y: 9 }] });
  b = mv(b, m => m.x === 3 && m.y === 3); assert.equal(b.pirates[0].inCave, true); assert.equal(b.pending, null);
});

test('маяк: открыть 4 любые закрытые клетки (старые правила), один раз за игру', () => {
  const closed = { '2,2': { kind: 'chest3', open: false }, '2,3': { kind: 'bengunn', open: false }, '2,4': { kind: 'empty', open: false }, '2,5': { kind: 'empty', open: false }, '2,6': { kind: 'empty', open: false } };
  let s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'lighthouse', open: false }, ...closed }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, onShip: true }] });
  s = mv(s, m => m.x === 6 && m.y === 10);
  assert.equal(s.pending.type, 'lighthouse'); assert.equal(s.pending.left, 4); assert.ok(G.legalMoves(s).every(m => m.type === 'reveal'));
  for (const [x, y] of [[2, 2], [2, 3], [2, 4]]) { s = mv(s, m => m.x === x && m.y === y); assert.equal(s.current, 0); }
  s = mv(s, m => m.x === 2 && m.y === 5);
  assert.equal(s.pending, null); assert.equal(s.current, 2); assert.equal(G.tileAt(s, 2, 2).coins, 3); assert.equal(G.tileAt(s, 2, 6).open, false);
  assert.equal(s.pirates.length, 6, 'Бен Ганн присоединится к первому, кто встанет на клетку');
  assert.equal(G.tileAt(s, 6, 10).used, true);
});

test('землетрясение: поменять местами 2 клетки, где никто не стоит и ничего не лежит', () => {
  let s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'quake', open: false }, '2,2': { kind: 'chest1', open: false }, '3,3': { kind: 'ogre' }, '4,4': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, x: 5, y: 5 }] });
  s = mv(s, m => m.x === 6 && m.y === 10);
  assert.equal(s.pending.type, 'quake');
  const ms = G.legalMoves(s); assert.ok(ms.every(m => m.type === 'quake'));
  for (const [x, y] of [[4, 4], [5, 5], [6, 10]]) assert.ok(!ms.some(m => m.x === x && m.y === y), `${x},${y} занята`);
  s = mv(s, m => m.x === 2 && m.y === 2); assert.equal(s.current, 0);
  s = mv(s, m => m.x === 3 && m.y === 3);
  assert.equal(G.tileAt(s, 2, 2).kind, 'ogre'); assert.equal(G.tileAt(s, 3, 3).kind, 'chest1'); assert.equal(G.tileAt(s, 3, 3).open, false); assert.equal(s.current, 2);
});

test('джунгли: без боя, разные команды вместе, с монетой нельзя', () => {
  const s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'jungle' }, '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, x: 6, y: 10 }] });
  assert.ok(!G.legalMoves(s).some(m => m.x === 6 && m.y === 10 && m.coin));
  const n = mv(s, m => m.x === 6 && m.y === 10 && !m.coin);
  assert.ok(n.pirates.filter(p => p.alive).every(p => p.x === 6 && p.y === 10)); assert.equal(n.pirates.filter(p => p.alive).length, 2);
});

test('трава: круг каждый ходит пиратами соседа, чужим ромом нельзя', () => {
  let s = pos({ mode: '1v1', rum: [1, 0, 1, 0], tiles: { '6,10': { kind: 'grass', open: false }, '6,2': { kind: 'trap' } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, x: 6, y: 2, trapped: true }, { team: 2, onShip: true }] });
  assert.equal(G.controllerOf(s), 0);
  s = mv(s, m => m.x === 6 && m.y === 10);
  assert.equal(s.current, 2); assert.equal(G.controllerOf(s), 0, 'за чёрных ходит игрок 1');
  assert.ok(!G.legalMoves(s).some(m => m.rum), 'ром чёрных недоступен');
  assert.throws(() => G.applyMove(s, G.legalMoves(s)[0], { asPlayer: 1 }), /другого игрока/);
  s = G.applyMove(s, G.legalMoves(s).find(m => m.type === 'ship'), { asPlayer: 0 });
  assert.equal(s.current, 0); assert.equal(G.controllerOf(s), 1, 'за белых ходит игрок 2');
  s = G.applyMove(s, G.legalMoves(s)[0], { asPlayer: 1 });
  assert.equal(s.current, 2); assert.equal(G.controllerOf(s), 1, 'трава потухла'); assert.equal(s.grass, 0);
});

test('каррамба: эффекта нет, пират остаётся на клетке', () => {
  const s = mv(pos({ tiles: { '6,10': { kind: 'caramba', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }] }), m => m.x === 6 && m.y === 10);
  assert.deepEqual(at(s, 0), [6, 10]); assert.ok(s.pirates[0].alive); assert.match(s.log.join(), /Каррамба/);
});

test('галеон: сокровище = 3 монеты, переносится как монета', () => {
  let s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'galleon', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, onShip: true }] });
  assert.equal(G.coinsLeft(s), 3);
  s = mv(s, m => m.x === 6 && m.y === 10); assert.equal(G.tileAt(s, 6, 10).treasure, 1); s = pass2(s);
  assert.ok(G.legalMoves(s).some(m => m.pid === 0 && m.treasure && m.x === 6 && m.y === 11));
  s = mv(s, m => m.pid === 0 && m.treasure && m.x === 6 && m.y === 11); assert.equal(s.pirates[0].carry, 3); assert.equal(G.tileAt(s, 6, 11).treasure || 0, 0); s = pass2(s);
  s = mv(s, m => m.pid === 0 && m.treasure && m.y === 12);
  assert.equal(s.score[0], 3); assert.equal(G.coinsLeft(s), 0);
  const w = pos({ tiles: { '6,10': { treasure: 1 }, '7,10': { kind: 'arrow1', rot: 1 } }, pirates: [{ team: 0, x: 6, y: 10 }] });
  void w;
});
test('сокровище тонет целиком (3 монеты)', () => {
  let s = pos({ tiles: { '10,10': { treasure: 1 }, '11,10': { kind: 'arrow1', rot: 1 } }, pirates: [{ team: 0, x: 10, y: 10 }] });
  s = mv(s, m => m.x === 11 && m.y === 10 && m.treasure); assert.equal(s.lost, 3);
});

test('Бен Ганн: +1 пират в команде открывшего, появляется на месте; воскрешается аборигенкой', () => {
  let s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'bengunn', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, onShip: true }] });
  s = mv(s, m => m.x === 6 && m.y === 10);
  const ben = s.pirates.find(p => p.role === 'bengunn'); assert.ok(ben); assert.equal(ben.team, 0); assert.deepEqual([ben.x, ben.y], [6, 10]);
  s = pass2(s); assert.ok(G.legalMoves(s).some(m => m.pid === ben.id));
  const r = pos({ tiles: { '5,5': { kind: 'abor' } }, pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, role: 'bengunn', alive: false }] });
  assert.ok(G.legalMoves(r).some(m => m.type === 'revive'));
  const onlyBen = pos({ tiles: { '5,5': { kind: 'abor' } }, pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, x: 5, y: 5 }, { team: 0, alive: true, x: 9, y: 9 }, { team: 0, role: 'bengunn', alive: false }] });
  assert.ok(!G.legalMoves(onlyBen).some(m => m.type === 'revive'), 'три бойца живы');
  const full = pos({ tiles: { '5,5': { kind: 'abor' } }, pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, x: 5, y: 5 }, { team: 0, role: 'bengunn', x: 5, y: 5 }, { team: 0, alive: false }] });
  assert.ok(!G.legalMoves(full).some(m => m.type === 'revive'), '3 бойца — аборигенка не воскрешает');
});

test('Пятница: носит монеты, не атакует, при атаке переходит к врагу, не боится людоеда, капкана, вертушку за ход', () => {
  let s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'friday', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, onShip: true }] });
  s = mv(s, m => m.x === 6 && m.y === 10); const f = s.pirates.find(p => p.role === 'friday'); assert.equal(f.team, 0);
  const t = pos({ mode: '1v1', tiles: { '5,5': { coins: 1 }, '4,4': { kind: 'ogre' }, '4,5': { kind: 'trap' }, '4,6': { kind: 'spin3' } }, pirates: [{ team: 0, role: 'friday', x: 5, y: 5 }, { team: 2, x: 6, y: 5 }, { team: 2, onShip: true }] });
  const ms = G.legalMoves(t);
  assert.ok(ms.some(m => m.coin && m.x === 5 && m.y === 4), 'носит монету'); assert.ok(!ms.some(m => m.x === 6 && m.y === 5), 'не атакует');
  const F = st => st.pirates.find(p => p.role === 'friday');
  const o = mv(t, m => m.x === 4 && m.y === 4 && !m.coin); assert.ok(F(o).alive, 'людоед не страшен');
  const tr = mv(t, m => m.x === 4 && m.y === 5 && !m.coin); assert.equal(F(tr).trapped, false);
  const sp = mv(t, m => m.x === 4 && m.y === 6 && !m.coin); assert.equal(F(sp).spin, 3);
  let a = pos({ mode: '1v1', current: 2, tiles: { '5,5': { coins: 1 } }, pirates: [{ team: 0, role: 'friday', x: 5, y: 5, carry: 1 }, { team: 2, x: 6, y: 5 }] });
  a = mv(a, m => m.x === 5 && m.y === 5); const fr = a.pirates.find(p => p.role === 'friday');
  assert.equal(fr.team, 2); assert.deepEqual([fr.x, fr.y], [5, 5]); assert.ok(fr.alive);
});
test('ром Пятнице: выходит из игры; миссионеру — становится пиратом (свободное действие)', () => {
  let s = pos({ mode: '1v1', rum: [2, 0, 0, 0], pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, role: 'missionary', x: 4, y: 4 }, { team: 2, role: 'friday', x: 6, y: 6 }] });
  const gives = G.legalMoves(s).filter(m => m.type === 'rum'); assert.equal(gives.length, 2);
  s = mv(s, m => m.type === 'rum' && s.pirates[m.target].role === 'friday');
  assert.equal(s.current, 0, 'ход не закончился'); assert.equal(s.rum[0], 1);
  assert.ok(!s.pirates.find(p => p.role === 'friday').alive);
  s = mv(s, m => m.type === 'rum'); assert.ok(s.pirates.some(p => p.role === 'exmissionary'));
  assert.ok(G.isFighter(s.pirates.find(p => p.role === 'exmissionary')));
});
test('Пятница открывает ром: выпивает бутылку и выходит, остальное — команде', () => {
  const s = mv(pos({ tiles: { '5,4': { kind: 'rum3', open: false } }, pirates: [{ team: 0, role: 'friday', x: 5, y: 5 }, { team: 0, x: 9, y: 9 }] }), m => m.x === 5 && m.y === 4);
  assert.equal(s.rum[0], 2); assert.ok(!s.pirates.find(p => p.role === 'friday').alive);
});

test('Миссионер: не носит груз, не атакует, защищает соседей по клетке; встреча с Пятницей — оба исчезают', () => {
  const s = pos({ mode: '1v1', tiles: { '5,5': { coins: 1 } }, pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 2, x: 6, y: 5 }, { team: 2, onShip: true }] });
  const mid = s.pirates.find(p => p.role === 'missionary').id, ms = G.legalMoves(s).filter(m => m.pid === mid);
  assert.ok(ms.length > 0 && ms.every(m => !m.coin)); assert.ok(!ms.some(m => m.x === 6 && m.y === 5), 'не заходит к врагам');
  const g = pos({ mode: '1v1', current: 2, pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 0, x: 5, y: 5 }, { team: 2, x: 6, y: 5 }] });
  assert.ok(!G.legalMoves(g).some(m => m.x === 5 && m.y === 5), 'пирата рядом с миссионером атаковать нельзя');
  const d = pos({ mode: '1v1', pirates: [{ team: 0, x: 5, y: 5 }, { team: 0, role: 'missionary', x: 5, y: 5 }, { team: 2, x: 6, y: 5 }] });
  assert.ok(!G.legalMoves(d).some(m => m.pid === 0 && m.x === 6 && m.y === 5), 'стоящий с миссионером не атакует');
  let e = pos({ mode: '1v1', pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 2, role: 'friday', x: 6, y: 5 }, { team: 2, onShip: true }] });
  assert.ok(G.legalMoves(e).some(m => m.x === 6 && m.y === 5), 'Пятница — не «враг» для миссионера');
  e = mv(e, m => m.x === 6 && m.y === 5);
  assert.ok(e.pirates.filter(p => p.role).every(p => !p.alive && p.gone));
  const c = mv(pos({ tiles: { '5,4': { kind: 'rum2', open: false } }, pirates: [{ team: 0, role: 'missionary', x: 5, y: 5 }, { team: 0, x: 9, y: 9 }] }), m => m.x === 5 && m.y === 4);
  assert.equal(c.pirates.find(p => p.role === 'exmissionary')?.team, 0); assert.equal(c.rum[0], 1);
});

test('формат: файл версии 2 читается, carry:true = 1 монета', () => {
  const s = pos({ version: 2, tiles: { '6,9': { kind: 'spin2' } }, pirates: [{ team: 0, x: 6, y: 9, spin: 1, carry: true }] });
  assert.equal(s.version, G.FORMAT_VERSION); assert.equal(s.pirates[0].carry, 1); assert.equal(G.coinsLeft(s), 1);
  assert.throws(() => pos({ pirates: [{ team: 0, role: 'pope', x: 5, y: 5 }] }), /role/);
  assert.throws(() => pos({ pirates: [{ team: 0, x: 5, y: 5, inCave: true }] }), /inCave/);
});

test('новые позиции для Тестировщика загружаются', () => {
  for (const f of fs.readdirSync('test-positions').filter(f => f.startsWith('v04-'))) { const s = G.loadState(fs.readFileSync('test-positions/' + f, 'utf8')); assert.ok(G.legalMoves(s).length, f); }
});

test('интерфейс: маяк/землетрясение/пещера — заголовок и цели; тоггл груза с сокровищем; кнопка рома', () => {
  let s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'lighthouse', open: false }, '2,2': { open: false } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, onShip: true }] });
  s = mv(s, m => m.x === 6 && m.y === 10);
  assert.match(V.headerText(s), /выберите клетку для маяка \(осталось 1\)/);
  assert.equal(V.targets(G.classifyMoves(s), { s }).length, 1); assert.match(V.blockedNotice(s), /^Сначала завершите ход: выберите клетку для маяка/);
  let q = pos({ mode: '1v1', tiles: { '6,10': { kind: 'quake', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, onShip: true }] });
  q = mv(q, m => m.x === 6 && m.y === 10); assert.match(V.headerText(q), /первую клетку для землетрясения/);
  q = mv(q, m => m.type === 'quake'); assert.match(V.headerText(q), /вторую клетку/);
  let c = pos({ mode: '1v1', tiles: { '3,3': { kind: 'cave' }, '9,9': { kind: 'cave' } }, pirates: [{ team: 0, x: 3, y: 4 }, { team: 2, onShip: true }] });
  c = mv(c, m => m.x === 3 && m.y === 3); assert.match(V.headerText(c), /выход из пещеры/);
  assert.deepEqual(V.targets(G.classifyMoves(c), { s: c, sel: 0 }).map(m => [m.x, m.y]), [[9, 9]]);
  const g = pos({ tiles: { '6,10': { coins: 1, treasure: 1 } }, pirates: [{ team: 0, x: 6, y: 10 }] }), ms = G.legalMoves(g);
  assert.equal(V.nextCargo(ms, 0, false), true); assert.equal(V.nextCargo(ms, 0, true), 'T'); assert.equal(V.nextCargo(ms, 0, 'T'), false);
  assert.equal(V.buttons(g, ms, { sel: 0, withCoin: 'T' }).coin.label, '💰 С сокровищем');
  assert.ok(V.targets(ms, { sel: 0, withCoin: 'T' }).every(m => m.treasure));
  const r = pos({ rum: [1, 0, 0, 0], pirates: [{ team: 0, x: 5, y: 5 }, { team: 2, role: 'friday', x: 6, y: 6 }] });
  const rm = G.legalMoves(r); assert.equal(V.buttons(r, rm, {}).rum.disabled, false); assert.deepEqual(V.targets(rm, { sel: 'rum' }).map(m => [m.x, m.y]), [[6, 6]]);
  const gr = pos({ mode: '1v1', grass: 2, pirates: [{ team: 0, x: 5, y: 5 }, { team: 2, onShip: true }] });
  assert.match(V.headerText(gr), /игрок 2 — трава/);
});

test('v0.5.20: names and short rules cover revealed tiles and used airplane', () => {
  const empty = V.tileDetails({ kind: 'empty', open: true, coins: 0 });
  assert.equal(empty.name, 'Пустая клетка'); assert.match(empty.rule, /Особого эффекта нет/);
  const plane = V.tileDetails({ kind: 'plane', open: true, used: false, coins: 0 });
  assert.equal(plane.name, 'Самолёт'); assert.match(plane.rule, /Одноразовый перенос/);
  const used = V.tileDetails({ kind: 'plane', open: true, used: true, coins: 0 });
  assert.equal(used.name, 'Самолёт использован'); assert.match(used.rule, /больше нельзя улететь/);
  assert.deepEqual(V.tileDetails({ kind: 'plane', open: false }), { name: 'Закрытая клетка', rule: 'Клетка закрыта. Её содержимое станет видно, когда пират на неё наступит.' });
});

test('v0.5.20: every deck kind has a readable hint and used plane remains visible to both players', async () => {
  const A = await import('../src/assets.js');
  for (const kind of G.KINDS) {
    const runtimeKind = G.ARROWS[kind] ? 'arrow' : kind;
    const details = V.tileDetails({ kind: runtimeKind, open: true, coins: kind.startsWith('chest') ? 1 : 0 });
    assert.ok(details.name && details.name !== runtimeKind, `${kind} has a player-facing name`);
    assert.ok(details.rule.length > 20, `${kind} has a concise rule`);
  }
  const state = pos({ tiles: { '3,3': { kind: 'plane', open: true, used: true } }, pirates: [{ team: 0, x: 3, y: 3 }] });
  assert.equal(A.tileImg(G.tileAt(state, 3, 3)), 'assets/tiles/plane.svg');
  assert.equal(G.publicState(state).tiles['3,3'].used, true);
});

test('v0.5.20: opening a tile and using a plane are recorded in the log; the plane is one-use', () => {
  let s = pos({ tiles: { '6,10': { kind: 'empty', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  s = mv(s, m => m.x === 6 && m.y === 10);
  assert.ok(s.log.some(line => line === 'Открыта клетка: Пустая клетка'));

  s = pos({ tiles: { '3,3': { kind: 'plane', open: true } }, pirates: [{ team: 0, x: 3, y: 3 }] });
  s = mv(s, m => m.via === 'plane' && m.x === 6 && m.y === 12);
  assert.equal(G.tileAt(s, 3, 3).used, true);
  assert.ok(s.log.some(line => line.startsWith('Самолёт использован:')));
  const usedPlane = pos({ tiles: { '3,3': { kind: 'plane', open: true, used: true } }, pirates: [{ team: 0, x: 3, y: 3 }] });
  assert.ok(G.legalMoves(usedPlane).every(m => m.via !== 'plane'));
});

test('v0.5.20: board UI includes built-in zoom, pan, and mobile tile help', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(html, /id="boardViewport"/); assert.match(html, /id="zoomIn"/); assert.match(html, /id="zoomOut"/); assert.match(html, /id="zoomFit"/); assert.match(html, /id="tileInfo"/);
  assert.match(ui, /addEventListener\('wheel'/); assert.match(ui, /addEventListener\('pointermove'/); assert.match(ui, /centerBoardCell/); assert.match(ui, /showTileInfoAt/);
  assert.match(ui, /details\.name.*details\.rule/);
  assert.match(css, /grid-template-columns:repeat\(13,42px\)/); assert.match(css, /touch-action:none/); assert.match(css, /\.cell\.used\.k-plane/);
  assert.ok(fs.existsSync(new URL('../rules.html', import.meta.url)), 'player rules page is included in the source tree');
});
