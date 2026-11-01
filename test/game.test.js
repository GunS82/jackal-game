import test from 'node:test'; import assert from 'node:assert/strict';
import * as G from '../src/game.js'; import { simulate } from './sim.js';
import fs from 'node:fs';
const pos = (o) => G.loadState(o);
const mv = (s, f) => { const m = G.legalMoves(s).find(f); assert.ok(m, 'ход не найден'); return G.applyMove(s, m); };

test('набор из 117 клеток: 37 монет + сокровище (3), 4 пещеры по четвертям', () => { let s = G.newGame({ seed: 3 }); assert.equal(Object.keys(s.tiles).length, 117); assert.equal(G.coinsLeft(s), 40); assert.equal(s.pirates.length, 12); });
test('первый ход: высадка или сдвиг корабля', () => { let s = G.newGame({ seed: 3 }); const ms = G.legalMoves(s); assert.ok(ms.some(m => m.type === 'move' && m.x === 6 && m.y === 11)); assert.equal(ms.filter(m => m.type === 'ship').length, 2); });
test('лёд повторяет ход', () => { let s = pos({ tiles: { '6,10': { kind: 'ice' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); s = mv(s, m => m.x === 6 && m.y === 10); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [6, 9]); });
test('крокодил возвращает назад', () => { let s = pos({ tiles: { '6,10': { kind: 'croc' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); s = mv(s, m => m.x === 6 && m.y === 10); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [6, 11]); });
test('людоед убивает, аборигенка воскрешает', () => { let s = pos({ tiles: { '5,10': { kind: 'ogre' }, '7,10': { kind: 'abor' } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 0, x: 7, y: 10 }] }); s = mv(s, m => m.x === 5 && m.y === 10); assert.equal(s.pirates[0].alive, false); s.current = 0; assert.ok(G.legalMoves(s).some(m => m.type === 'revive')); });
test('удар отправляет врага на корабль; с монетой бить нельзя', () => { let s = pos({ tiles: { '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 1, x: 6, y: 10 }] }); const ms = G.legalMoves(s).filter(m => m.x === 6 && m.y === 10); assert.ok(ms.length && ms.every(m => !m.coin)); s = G.applyMove(s, ms[0]); const e = s.pirates.find(p => p.team === 1); assert.deepEqual([e.x, e.y], [0, 6]); });
test('монета доставляется на корабль', () => { let s = pos({ tiles: { '6,11': { coins: 2 } }, pirates: [{ team: 0, x: 6, y: 11 }] }); s = mv(s, m => m.x === 6 && m.y === 12 && m.coin); assert.equal(s.score[0], 1); assert.equal(G.tileAt(s, 6, 11).coins, 1); });
test('с монетой нельзя на закрытую клетку', () => { let s = pos({ defaultTile: { kind: 'empty', open: false }, tiles: { '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }] }); assert.ok(G.legalMoves(s).filter(m => m.coin).every(m => m.y === 12)); });
test('вертушка 2 хода', () => { let s = pos({ tiles: { '6,10': { kind: 'spin2' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); s = s = mv(s, m => m.x === 6 && m.y === 10); s.current = 0; const ms = G.legalMoves(s).filter(m => m.pid === 0); assert.equal(ms.length, 1); assert.equal(ms[0].via, 'spin'); });
test('неверный файл даёт понятную ошибку', () => { assert.throws(() => G.loadState('{oops'), /JSON/); assert.throws(() => G.loadState({ pirates: [], tiles: { '1,1': {} } }), /не на острове/); assert.throws(() => G.loadState({ pirates: [{ team: 5 }] }), /team/); });
test('примеры test-positions загружаются', () => { for (const f of fs.readdirSync('test-positions')) { const s = G.loadState(fs.readFileSync('test-positions/' + f, 'utf8')); assert.ok(G.legalMoves(s).length > 0, f); } });
test('случайные партии без ошибок (сотни ходов)', () => { for (const mode of ['2p', '1v1', '2v2', '4p']) for (let seed = 1; seed <= 10; seed++) { const { n } = simulate(seed, mode, 800); assert.ok(n > 0); } });

test('applyMove — чистая функция, ведёт журнал ходов', () => { const s = G.newGame({ seed: 5 }); const before = JSON.stringify(s); const s2 = G.applyMove(s, G.legalMoves(s).find(m => m.type === 'ship')); assert.equal(JSON.stringify(s), before); assert.equal(s2.moves.length, 1); assert.equal(s2.version, G.FORMAT_VERSION); assert.equal(s2.seed, 5); assert.notEqual(s2.current, s.current); });
test('нельзя ходить за чужого игрока', () => { const s = G.newGame({ seed: 5 }); assert.throws(() => G.applyMove(s, G.legalMoves(s)[0], { asPlayer: 1 }), /другого игрока/); G.applyMove(s, G.legalMoves(s)[0], { asPlayer: 0 }); });
test('сохранение/загрузка сохраняет всё', () => { let s = G.newGame({ seed: 9 }); for (let i = 0; i < 20; i++) s = G.applyMove(s, G.legalMoves(s)[0]); const l = G.loadState(G.serialize(s)); assert.deepEqual(G.legalMoves(l), G.legalMoves(s)); assert.equal(l.moves.length, 20); assert.equal(l.turn, s.turn); });
test('режим 1v1: два корабля, ходы чередуются 0 → 2', () => { let s = G.newGame({ seed: 2, mode: '1v1' }); assert.equal(s.pirates.length, 6); s = G.applyMove(s, G.legalMoves(s)[0]); assert.equal(s.current, 2); assert.equal(G.shipAt(s, 0, 6), -1); });
test('стрелка с двумя направлениями: выбор в тот же ход', () => { let s = pos({ tiles: { '6,10': { kind: 'arrow2', dirs: [[-1, 0], [1, 0]] } }, pirates: [{ team: 0, x: 6, y: 11 }] }); s = mv(s, m => m.x === 6 && m.y === 10); assert.equal(s.current, 0); assert.ok(s.pending); const ms = G.legalMoves(s); assert.deepEqual(ms.map(m => m.x).sort(), [5, 7]); s = mv(s, m => m.x === 7); assert.equal(s.pending, null); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [7, 10]); });
test('конь: ход буквой Г в тот же ход', () => { let s = pos({ tiles: { '6,10': { kind: 'horse' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); s = mv(s, m => m.x === 6 && m.y === 10); assert.ok(s.pending); s = mv(s, m => m.x === 7 && m.y === 8); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [7, 8]); });
test('spin-croc.json: крокодил возвращает на вертушку с тем же шагом', () => { let s = G.loadState(fs.readFileSync('test-positions/spin-croc.json', 'utf8')); s = mv(s, m => m.x === 6 && m.y === 8); assert.deepEqual([s.pirates[0].x, s.pirates[0].y, s.pirates[0].spin], [6, 9, 3]); assert.equal(s.current, 0); assert.ok(G.legalMoves(s).some(m => m.via === 'step' && m.y === 8 && m.x === 5)); });
test('картинки стрелок совпадают с логикой (поворот 0) и поворачиваются на rot', () => {
  const sig = ds => ds.map(d => d.join()).sort().join(';');
  for (const [kind, dirs] of Object.entries(G.ARROWS)) {
    const svg = fs.readFileSync(`assets/tiles/${kind}.svg`, 'utf8');
    const drawn = [...svg.matchAll(/rotate\((-?[\d.]+) 50 50\)/g)].map(m => { const a = +m[1] * Math.PI / 180; return [Math.round(Math.sin(a)), Math.round(-Math.cos(a))]; });
    assert.equal(sig(drawn), sig(dirs), kind);
    for (let rot = 0; rot < 4; rot++) { const s = pos({ tiles: { '3,3': { kind, rot } }, pirates: [{ team: 0, onShip: true }] }); const t = G.tileAt(s, 3, 3); assert.equal(G.tileRotation(t), dirs.length === 4 || (kind.startsWith('arrow2') && rot >= 2) ? G.tileRotation(t) : rot); const r = drawn.map(([dx, dy]) => { let d = [dx, dy]; for (let i = 0; i < rot; i++) d = [-d[1], d[0]]; return d; }); assert.equal(sig(r), sig(t.dirs), kind + ' rot ' + rot); }
  }
});
test('spin-coin.json: монета едет с пиратом через вертушку', () => {
  let s = G.loadState(fs.readFileSync('test-positions/spin-coin.json', 'utf8'));
  s = mv(s, m => m.x === 6 && m.y === 9 && m.coin);
  assert.equal(G.tileAt(s, 6, 10).coins, 0); assert.equal(s.pirates[0].carry, 1);
  s = mv(s, m => m.via === 'spin' && m.coin); s = mv(s, m => m.via === 'spin' && m.coin); assert.equal(s.pirates[0].spin, 3); assert.equal(G.tileAt(s, 6, 9).coins, 0);
  s = mv(s, m => m.x === 6 && m.y === 8 && m.coin);
  assert.deepEqual([s.pirates[0].x, s.pirates[0].y, s.pirates[0].carry], [6, 8, 0]); assert.equal(G.tileAt(s, 6, 8).coins, 1); assert.equal(G.coinsLeft(s), 1);
});
test('файл неверной версии', () => { assert.throws(() => G.loadState({ version: 99, pirates: [] }), /версия/); });

test('самолёт доставляет пирата с монетой на свой корабль', () => {
  let s = pos({ tiles: { '3,3': { kind: 'plane', coins: 1 } }, pirates: [{ team: 0, x: 3, y: 3 }] });
  s = mv(s, m => m.via === 'plane' && m.coin && m.x === 6 && m.y === 12);
  assert.equal(s.score[0], 1); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [6, 12]); assert.equal(G.tileAt(s, 3, 3).used, true); assert.equal(G.tileAt(s, 3, 3).coins, 0);
});
test('корабль везёт своих пиратов и подбирает своего пловца', () => {
  let s = pos({ pirates: [{ team: 0, onShip: true }, { team: 0, onShip: true }, { team: 0, x: 7, y: 12 }, { team: 2, x: 5, y: 12 }] });
  s = mv(s, m => m.type === 'ship' && m.x === 7);
  assert.deepEqual(s.ships[0], { x: 7, y: 12 });
  for (const p of s.pirates.filter(p => p.team === 0)) { assert.ok(p.alive); assert.deepEqual([p.x, p.y], [7, 12]); assert.ok(G.onShip(s, p)); }
});
test('корабль давит вражеского пловца', () => {
  let s = pos({ mode: '1v1', pirates: [{ team: 0, onShip: true }, { team: 2, x: 7, y: 12 }] });
  s = mv(s, m => m.type === 'ship' && m.x === 7); assert.equal(s.pirates.find(p => p.team === 2).alive, false);
});

// ---- v0.3 ----
test('цикл: третий заход в одну клетку за ход — гибель, монета теряется', () => {
  let s = pos({ tiles: { '6,10': { kind: 'arrow1', dirs: [[0, -1]] }, '6,9': { kind: 'arrow1', dirs: [[0, 1]] } , '5,11': { coins: 1 }}, pirates: [{ team: 0, x: 5, y: 11 }, { team: 0, onShip: true }] });
  s = mv(s, m => m.pid === 0 && m.x === 6 && m.y === 10 && m.coin);
  assert.equal(s.pirates[0].alive, false); assert.equal(s.lost, 1); assert.match(s.log.join(), /цикл/);
});
test('цикл через выбор направления (pending) тоже считается', () => {
  let s = pos({ tiles: { '6,10': { kind: 'arrow2', dirs: [[0, -1], [0, 1]] }, '6,9': { kind: 'arrow1', dirs: [[0, 1]] } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  s = mv(s, m => m.x === 6 && m.y === 10); assert.ok(s.pending); s = mv(s, m => m.x === 6 && m.y === 9);
  assert.ok(s.pending); s = mv(s, m => m.x === 6 && m.y === 9); assert.equal(s.pirates[0].alive, false);
});
test('по правилам (по умолчанию): цепочка на открытого крокодила отбрасывает назад', () => {
  let s = pos({ tiles: { '6,10': { kind: 'ice' }, '6,9': { kind: 'croc', open: true } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  assert.equal(s.options.houseCrocDeath, false); assert.equal(G.newGame({ seed: 1 }).options.houseCrocDeath, false);
  s = mv(s, m => m.x === 6 && m.y === 10); assert.deepEqual([s.pirates[0].x, s.pirates[0].y, s.pirates[0].alive], [6, 11, true]);
});
test('по правилам: петля стрелка → крокодил ловится защитой от циклов, а не зависанием', () => {
  let s = pos({ tiles: { '6,10': { kind: 'arrow1', dirs: [[0, -1]] }, '6,9': { kind: 'croc' } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  s = mv(s, m => m.x === 6 && m.y === 10); assert.ok(s.pirates[0].alive); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [6, 11]);
});
test('опция houseCrocDeath сохраняется в файле и проверяется', () => {
  const s = G.newGame({ seed: 2, options: { houseCrocDeath: true } }); assert.equal(G.loadState(G.serialize(s)).options.houseCrocDeath, true);
  assert.throws(() => G.loadState({ options: { foo: true }, pirates: [] }), /неизвестная опция/);
  assert.throws(() => G.loadState({ options: { houseCrocDeath: 'да' }, pirates: [] }), /true\/false/);
});
test('домашнее правило: цепочка на открытого крокодила — гибель; закрытый — отбрасывает', () => {
  let s = pos({ options: { houseCrocDeath: true }, tiles: { '6,10': { kind: 'ice' }, '6,9': { kind: 'croc', open: true } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  s = mv(s, m => m.x === 6 && m.y === 10); assert.equal(s.pirates[0].alive, false);
  let s2 = pos({ options: { houseCrocDeath: true }, tiles: { '6,10': { kind: 'ice' }, '6,9': { kind: 'croc', open: false } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  s2 = mv(s2, m => m.x === 6 && m.y === 10); assert.deepEqual([s2.pirates[0].x, s2.pirates[0].y, s2.pirates[0].alive], [6, 11, true]);
});
test('конец: majority — больше половины монет у игрока (команды игрока вместе)', () => {
  let s = pos({ mode: '2p', score: [12, 0, 8, 0], tiles: { '6,11': { coins: 5 } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 1, onShip: true }] });
  s = mv(s, m => m.coin && m.y === 12); assert.equal(s.over, true); assert.equal(s.endReason, 'majority'); assert.deepEqual(G.winner(s), [0]);
});
test('конец: allCoins и noPirates', () => {
  let s = pos({ score: [1, 0, 0, 0], tiles: { '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  s = mv(s, m => m.coin && m.y === 12); assert.equal(s.endReason, 'allCoins');
  let s2 = pos({ tiles: { '6,10': { kind: 'ogre' }, '3,3': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  s2 = mv(s2, m => m.x === 6 && m.y === 10); assert.equal(s2.endReason, 'noPirates');
});
test('пьяный пират не даёт закончить партию (1v1 seed 1 больше не 0:0 на 207 ходу)', () => {
  // все пираты: один пьяный, второй в капкане — ход передаётся, пока пьяный не протрезвеет
  let s = pos({ mode: '1v1', tiles: { '6,10': { kind: 'barrel' }, '3,3': { kind: 'trap' }, '8,8': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 2, x: 3, y: 3, trapped: true }] });
  s = mv(s, m => m.x === 6 && m.y === 10); assert.equal(s.over, false); assert.equal(s.current, 0); assert.equal(s.pirates[0].x, 6);
  const { s: g, n } = simulate(1, '1v1', 3000); assert.ok(n > 207 || g.endReason !== 'noMoves');
});
test('noMoves: ходов нет ни у кого и никто не пьян; при 0:0 — ничья', () => {
  let s = pos({ mode: '1v1', options: { houseCrocDeath: true }, tiles: { '3,3': { kind: 'trap' }, '8,8': { kind: 'trap' }, '5,5': { coins: 1 }, '6,10': { kind: 'ice' }, '6,9': { kind: 'croc' } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 0, x: 8, y: 8, trapped: true }, { team: 2, x: 3, y: 3, trapped: true }] });
  s = mv(s, m => m.x === 6 && m.y === 10); assert.equal(s.endReason, 'noMoves'); assert.deepEqual(G.winner(s), [0, 1]);
});
test('второй пират той же команды на капкане освобождает первого', () => {
  let s = pos({ tiles: { '6,10': { kind: 'trap' } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 0, x: 6, y: 10, trapped: true }] });
  s = mv(s, m => m.pid === 0 && m.x === 6 && m.y === 10); assert.equal(s.pirates[0].trapped, false); assert.equal(s.pirates[1].trapped, false);
  for (const seed of [14, 36]) { let g = G.newGame({ seed, mode: '2p' }); const r = G.rng(seed + 7);
    for (let n = 0; n < 3000 && !g.over; n++) { const ms = G.legalMoves(g); g = G.applyMove(g, ms[Math.floor(r() * ms.length)]);
      const tr = g.pirates.filter(p => p.alive && p.trapped); assert.ok(!tr.some(p => tr.some(q => q !== p && allyOn(g, p, q))), `seed ${seed}, ход ${n}`); } }
});
const allyOn = (g, p, q) => p.x === q.x && p.y === q.y && G.allied(g, p.team, q.team);
test('классификация ходов: death / coin / move', () => {
  const s = pos({ tiles: { '6,10': { kind: 'ogre', open: true }, '5,11': { coins: 1 }, '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  const c = G.classifyMoves(s);
  assert.equal(c.find(m => m.x === 6 && m.y === 10).kind, 'death');
  assert.equal(c.find(m => m.y === 12 && m.coin).kind, 'coin');
  assert.equal(c.find(m => m.x === 5 && m.y === 11 && !m.coin).kind, 'move');
  assert.equal(c.length, G.legalMoves(s).length);
});
test('колода: 117 клеток, по 3 стрелки каждого из 7 видов, прямые arrow1/arrow1d есть', () => {
  const total = Object.values(G.DECK).reduce((a, b) => a + b, 0); assert.equal(total, 117);
  for (const k of Object.keys(G.ARROWS)) assert.equal(G.DECK[k], 3, k);
  const s = G.newGame({ seed: 4 }); const kinds = Object.values(s.tiles).map(t => t.arrow ?? t.kind);
  assert.equal(kinds.filter(k => k === 'arrow1').length, 3); assert.equal(kinds.filter(k => k === 'arrow1d').length, 3);
  const coins = Object.values(s.tiles).reduce((a, t) => a + (G.CHEST[t.kind] ?? 0), 0); assert.equal(coins, 37);
});

// ---- v0.3.2: представление ----
import * as V from '../src/view.js';
test('заголовок: конь — «выберите клетку», стрелка — «выберите направление»', () => {
  let s = pos({ tiles: { '6,10': { kind: 'horse' } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  assert.doesNotMatch(V.headerText(s), /выберите/);
  s = mv(s, m => m.x === 6 && m.y === 10); assert.match(V.headerText(s), /выберите клетку/); assert.match(V.blockedNotice(s), /^Сначала завершите ход: выберите клетку/);
  let a = pos({ tiles: { '6,10': { kind: 'arrow2', dirs: [[-1, 0], [1, 0]] } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  a = mv(a, m => m.x === 6 && m.y === 10); assert.match(V.headerText(a), /выберите направление/); assert.match(V.blockedNotice(a), /выберите направление/);
  assert.equal(V.blockedNotice(G.newGame({ seed: 1 })), null);
  assert.match(V.headerText(G.newGame({ seed: 1 }), { myTurn: false }), /ждём ход соперника/);
});
test('кнопки всегда есть, недоступные — disabled; монета — один тоггл', () => {
  const s = G.loadState(fs.readFileSync('test-positions/hl-coin.json', 'utf8')); const moves = G.legalMoves(s);
  let b = V.buttons(s, moves, {}); assert.deepEqual(Object.keys(b), ['ship', 'coin', 'revive', 'rum']);
  assert.equal(b.ship.disabled, true); assert.equal(b.coin.disabled, true); assert.equal(b.revive.disabled, true);
  b = V.buttons(s, moves, { sel: 0 }); assert.equal(b.coin.disabled, false); assert.equal(b.coin.pressed, false);
  const b2 = V.buttons(s, moves, { sel: 0, withCoin: true }); assert.equal(b2.coin.pressed, true); assert.equal(b2.coin.label.length, b.coin.label.length);
  b = V.buttons(s, moves, { myTurn: false }); assert.ok(b.ship.disabled && b.coin.disabled && b.revive.disabled);
});
test('метка монеты у пирата: тоггл, продолжение хода с монетой, вертушка', () => {
  const s = G.loadState(fs.readFileSync('test-positions/hl-coin.json', 'utf8'));
  assert.equal(V.pirateHasCoin(s, s.pirates[0], { sel: 0, withCoin: true }), true);
  assert.equal(V.pirateHasCoin(s, s.pirates[0], { sel: 0, withCoin: false }), false);
  let a = pos({ tiles: { '6,11': { coins: 1 }, '6,10': { kind: 'arrow2', dirs: [[-1, 0], [1, 0]] } }, pirates: [{ team: 0, x: 6, y: 11 }] });
  a = mv(a, m => m.x === 6 && m.y === 10 && m.coin); assert.equal(V.pirateHasCoin(a, a.pirates[0]), true);
  let c = G.loadState(fs.readFileSync('test-positions/spin-coin.json', 'utf8')); c = mv(c, m => m.x === 6 && m.y === 9 && m.coin); assert.equal(V.pirateHasCoin(c, c.pirates[0]), true);
});
test('позиции для тестировщика: hl-death и hl-coin', () => {
  const d = G.classifyMoves(G.loadState(fs.readFileSync('test-positions/hl-death.json', 'utf8')));
  assert.equal(d.find(m => m.pid === 0 && m.x === 5 && m.y === 10).kind, 'death'); assert.ok(d.some(m => m.kind === 'move'));
  const c = G.classifyMoves(G.loadState(fs.readFileSync('test-positions/hl-coin.json', 'utf8')));
  assert.equal(c.find(m => m.pid === 0 && m.x === 6 && m.y === 12 && m.coin).kind, 'coin'); assert.equal(c.find(m => m.pid === 0 && m.x === 6 && m.y === 12 && !m.coin).kind, 'move');
});

// ---- v0.3.4 ----
test('конь в море: пират плывёт, с монетой — coinLost, без — move', () => {
  for (const coin of [true, false]) {
    let s = pos({ tiles: { '6,10': { coins: 1 }, '5,11': { kind: 'horse' } }, pirates: [{ team: 0, x: 6, y: 10 }] });
    s = mv(s, m => m.x === 5 && m.y === 11 && !!m.coin === coin);
    const c = G.classifyMoves(s).find(m => m.x === 7 && m.y === 12);
    assert.ok(c, 'есть ход в море'); assert.equal(c.kind, coin ? 'coinLost' : 'move');
    const { kind, ...raw } = c; const n = G.applyMove(s, raw); assert.ok(n.pirates[0].alive); assert.equal(n.lost, coin ? 1 : 0);
  }
  assert.equal(V.hlKind([{ kind: 'coinLost' }, { kind: 'move' }]), 'coin-lost');
  assert.equal(V.hlKind([{ kind: 'coin' }, { kind: 'coinLost' }]), 'coin');
  assert.equal(V.hlKind([{ kind: 'death' }]), 'death');
});
test('подсказка «Монету можно отвезти на корабль»', () => {
  const s = G.loadState(fs.readFileSync('test-positions/hl-coin.json', 'utf8')), c = G.classifyMoves(s);
  assert.match(V.coinHint(c, { sel: 0 }), /включите «С монетой»/);
  assert.equal(V.coinHint(c, { sel: 0, withCoin: true }), null);
  assert.equal(V.coinHint(c, { sel: 1 }), null);
});
test('заголовок: префикс «Ход:» постоянен', () => {
  let s = G.loadState(fs.readFileSync('test-positions/hl-coin.json', 'utf8'));
  assert.equal(V.headerParts(s).prefix, 'Ход:');
  s = pos({ tiles: { '6,10': { kind: 'horse' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); s = mv(s, m => m.x === 6 && m.y === 10);
  const h = V.headerParts(s); assert.equal(h.prefix, 'Ход:'); assert.match(h.text, /выберите клетку/);
});

// ---- v0.3.5 ----
test('бледная метка монеты на корабле поверх обычного хода', () => {
  const s = G.loadState(fs.readFileSync('test-positions/hl-coin.json', 'utf8')), c = G.classifyMoves(s);
  assert.ok(c.some(m => m.pid === 0 && m.x === 6 && m.y === 12 && !m.coin && m.kind === 'move'), 'корабль доступен и без монеты');
  assert.equal(V.coinHintAt(c, 6, 12, { sel: 0 }), true);
  assert.equal(V.coinHintAt(c, 6, 12, { sel: 0, withCoin: true }), false);
  assert.equal(V.coinHintAt(c, 6, 10, { sel: 0 }), false);
});
test('итог партии: ничья только при равном счёте; noMoves — побеждает тот, у кого больше монет', () => {
  const end = (score, endReason) => ({ ...G.newGame({ seed: 1 }), over: true, score, endReason });
  assert.match(V.resultText(end([0, 0, 0, 0], 'allCoins')), /Ничья$/);
  assert.doesNotMatch(V.resultText(end([0, 0, 0, 0], 'allCoins')), /Победа/);
  assert.match(V.resultText(end([3, 0, 0, 0], 'noMoves')), /\(ходов больше нет\)\. Победа: Игрок 1/);
  const e1 = { ...G.newGame({ seed: 1, mode: '1v1' }), over: true, score: [0, 0, 13, 0], endReason: 'noMoves' };
  assert.deepEqual(G.winner(e1), [1]); assert.match(V.resultText(e1), /ходов больше нет\)\. Победа: Игрок 2 \(Чёрные\)$/);
  const e2 = { ...e1, score: [5, 0, 5, 0] }; assert.deepEqual(G.winner(e2), [0, 1]); assert.match(V.resultText(e2), /ходов больше нет\)\. Ничья$/);
  assert.match(V.resultText(end([3, 1, 2, 0], 'majority')), /Победа: Игрок 1/);
  assert.match(V.headerText(end([0, 0, 0, 0], 'noShips')), /Ничья/);
});

test('v0.5.4: панель команды — пираты 1–3, за разделителем персонажи без номера; фишки персонажей', async () => {
  const A = await import('../src/assets.js');
  const s = G.newGame({ mode: '1v1', seed: 5 });
  s.pirates.push({ id: s.pirates.length, team: 0, x: 5, y: 5, alive: true, spin: 0, trapped: false, drunkUntil: 0, carry: 0, role: 'friday' });
  s.pirates.push({ id: s.pirates.length, team: 0, x: 5, y: 5, alive: true, spin: 0, trapped: false, drunkUntil: 0, carry: 0, role: 'bengunn' });
  s.pirates.push({ id: s.pirates.length, team: 0, x: 5, y: 5, alive: true, spin: 0, trapped: false, drunkUntil: 0, carry: 0, role: 'missionary' });
  s.pirates[1].alive = false;
  const cp = V.crewPanel(s, 0);
  assert.deepEqual(cp.regular.map(t => [t.num, t.alive]), [[1, true], [2, false], [3, true]]);
  assert.deepEqual(cp.chars.map(t => [t.role, t.num]), [['bengunn', null], ['friday', null], ['missionary', null]]);
  assert.ok(cp.regular.length + cp.chars.length <= 6);
  const fr = s.pirates.find(p => p.role === 'friday');
  assert.equal(A.pieceImg(fr), 'assets/pieces/friday-white.svg');
  fr.team = 2; assert.equal(A.pieceImg(fr), 'assets/pieces/friday-black.svg'); // Пятница перешёл — другая рамка
  assert.deepEqual(V.crewPanel(s, 2).chars.map(t => t.role), ['friday']); assert.equal(V.crewPanel(s, 0).chars.length, 2);
  assert.equal(A.pieceImg(s.pirates[0]), 'assets/pieces/pirate-white.svg');
  assert.equal(A.pieceImg({ team: 2, role: 'exmissionary' }), 'assets/pieces/pirate-black.svg');
  const fs = await import('node:fs');
  for (const r of A.CHAR_TOKENS) for (const c of A.TEAM_COLOR) assert.ok(fs.existsSync(new URL(`../assets/pieces/${r}-${c}.svg`, import.meta.url)), r + c);
});

test('v0.5.5: плашка выбора выезжает в сторону свободного места, у края переворачивается', () => {
  const N = 13;
  assert.deepEqual(V.platePlacement({ x: 2, n: 3, N }), { side: 'right', start: 3, span: 3 });
  assert.deepEqual(V.platePlacement({ x: 10, n: 3, N }), { side: 'left', start: 7, span: 3 });
  assert.deepEqual(V.platePlacement({ x: 0, n: 3, N }), { side: 'right', start: 1, span: 3 }); // левый край
  assert.deepEqual(V.platePlacement({ x: 12, n: 3, N }), { side: 'left', start: 9, span: 3 }); // правый край
  assert.deepEqual(V.platePlacement({ x: 6, n: 2, N }), { side: 'right', start: 7, span: 2 }); // середина — вправо
  assert.equal(V.platePlacement({ x: 4, n: 3, N: 7 }).side, 'left'); // как в макете: справа места мало
  assert.equal(V.platePlacement({ x: 2, n: 3, N: 5 }).side, 'right');
  for (let x = 0; x < N; x++) for (let n = 2; n <= 6; n++) { const p = V.platePlacement({ x, n, N }); assert.ok(p.start >= 0 && p.start + p.span <= N); assert.ok(x < p.start || x >= p.start + p.span, `x=${x} n=${n}: плашка не закрывает клетку`); }
});

test('v0.5.5: номер пирата на фишке, две панели (текущая отмечена), подсказка выбора', () => {
  const s = G.newGame({ mode: '1v1', seed: 2 });
  const w = s.pirates.filter(p => p.team === 0), b = s.pirates.filter(p => p.team === 2);
  assert.deepEqual(w.map(p => V.pirateNumber(s, p)), [1, 2, 3]); assert.deepEqual(b.map(p => V.pirateNumber(s, p)), [1, 2, 3]);
  assert.equal(V.pirateNumber(s, { ...w[0], role: 'friday' }), null);
  const ps = V.crewPanels(s, { player: 1 });
  assert.deepEqual(ps.map(p => [p.team, p.label, p.current]), [[0, 'Соперник', true], [2, 'Вы', false]]);
  assert.deepEqual(V.crewPanels(s).map(p => p.label), ['Белые', 'Чёрные']);
  assert.equal(V.crewPanels({ ...s, over: true }).some(p => p.current), false);
  assert.equal(V.selectHint(s, w[1].id), 'Ваш ход: выбран пират 2, выберите клетку');
  assert.equal(V.selectHint(s, w[1].id, { myTurn: false }), null); assert.equal(V.selectHint(s, null), null);
});

test('v0.5.5: по умолчанию 1v1; меню первым предлагает 1v1; подтверждение перед загрузкой, если партия идёт; новая вкладка — меню', () => {
  assert.equal(V.DEFAULT_MODE, '1v1');
  const s = G.newGame({ mode: V.DEFAULT_MODE, seed: 1 });
  assert.deepEqual(G.activeTeams(s.mode), [0, 2]); // Белые против Чёрных
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const modes = [...html.matchAll(/data-mode="(\w+)"/g)].map(m => m[1]); assert.equal(modes[0], '1v1'); assert.ok(!modes.includes('4p'));
  assert.equal(V.localInProgress(s), false, 'новая партия — без вопроса');
  const m = G.legalMoves(s)[0]; const s2 = G.applyMove(s, m);
  assert.equal(V.localInProgress(s2), true); assert.equal(V.localInProgress({ ...s2, over: true }), false); assert.equal(V.localInProgress(null), false);
  assert.match(V.LOSE_LOCAL_Q, /Текущая партия будет потеряна/);
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.ok(!/start\('2p'\)/.test(ui)); assert.match(ui, /localInProgress\(state\) \|\| confirm\(V\.LOSE_LOCAL_Q\);[^\n]*\n\s*if \(fileConfirmed\) \$\('#file'\)\.click\(\)/, 'вопрос до окна выбора файла');
  assert.match(ui, /\$\('#menu'\)\.showModal\(\);\n\}/, 'без сессии открывается меню');
});

test('v0.5.6: открыта плашка и пират не выбран — без подсветки ходов', () => {
  const plate = { x: 3, y: 4, pids: [0, 1] };
  assert.equal(V.plateHidesMoves(plate, null), true); assert.equal(V.plateHidesMoves(plate, 2), true, 'выбран пират с другой клетки');
  assert.equal(V.plateHidesMoves(plate, 1), false); assert.equal(V.plateHidesMoves(null, null), false);
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.plate\{display:grid;grid-template-columns:repeat\(var\(--n\)/); // фишка = одна колонка поля
  for (let n = 2; n <= 6; n++) assert.ok(V.platePlacement({ x: 6, n }).span >= n, 'колонок плашки не меньше фишек');
});

test('v0.5.7: новая вкладка — меню над пустым полем, «Продолжить» только для сохранённой незаконченной партии', () => {
  const s = G.newGame({ mode: '1v1', seed: 9 });
  const land = []; for (let y = 0; y < G.N; y++) for (let x = 0; x < G.N; x++) if (V.isLandCell(x, y)) land.push(`${x},${y}`);
  assert.deepEqual(land.sort(), Object.keys(s.tiles).sort(), 'пустое поле повторяет форму острова');
  assert.equal(V.resumeInfo(null), null); assert.equal(V.resumeInfo('{bad'), null);
  assert.equal(V.resumeInfo(G.serialize({ ...s, over: true })), null);
  assert.deepEqual(V.resumeInfo(G.serialize(s)), { mode: '1v1', label: '1 на 1 — Белые против Чёрных, ход №1' });
  assert.equal(V.resumeInfo(G.serialize(G.newGame({ mode: '2p', seed: 1 }))).mode, '2p');
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /else showMenu\(\);/); assert.doesNotMatch(ui, /if \(saved\) \{ state = G\.loadState\(saved\)/, 'нет автовосстановления');
  assert.match(ui, /Net\.forget\(\); net = null;[^\n]*\n[^\n]*\n[^\n]*\n  sessionStorage\.setItem\(V\.NOTE_KEY, 'Партия больше не существует'\); showMenu\(\)/);
});

test('v0.5.8: позиция positions/v058-two-pirates-edge.json — два белых на открытой клетке суши у края, ход белых, плашка', () => {
  const s = G.loadState(fs.readFileSync(new URL('../positions/v058-two-pirates-edge.json', import.meta.url), 'utf8'));
  assert.equal(s.mode, '1v1'); assert.equal(s.current, 0);
  const here = s.pirates.filter(p => p.alive && p.x === 1 && p.y === 6);
  assert.equal(here.length, 2); assert.ok(here.every(p => p.team === 0 && !p.role && G.pirateMoves(s, p).length > 0));
  const t = G.tileAt(s, 1, 6); assert.equal(t.kind, 'empty'); assert.equal(t.open, true); assert.ok(V.isLandCell(1, 6));
  const pl = V.platePlacement({ x: 1, n: 2 }); assert.equal(pl.side, 'right'); assert.equal(pl.start, 2);
  assert.equal(V.plateHidesMoves({ x: 1, y: 6, pids: here.map(p => p.id) }, null), true);
});

test('v0.5.8: пьяные пираты — подсказка; подпись «Продолжить» для 4 команд; заметка меню в sessionStorage', () => {
  const s = G.newGame({ mode: '1v1', seed: 59 }), w = s.pirates.filter(p => p.team === 0);
  for (const p of w.slice(0, 2)) { p.x = 5; p.y = 5; p.drunkUntil = 3; } s.tiles['5,5'] = { kind: 'empty', open: true, coins: 0 };
  w[2].x = 6; w[2].y = 5; w[2].drunkUntil = 3; s.tiles['6,5'] = { kind: 'empty', open: true, coins: 0 };
  assert.equal(V.drunkNotice(s, 5, 5), 'Пираты пьяны и пропускают ход'); assert.equal(V.drunkNotice(s, 6, 5), 'Пират пьян и пропускает ход');
  assert.equal(V.drunkNotice(s, 7, 7), null); assert.equal(V.drunkNotice({ ...s, turn: 3 }, 5, 5), null, 'протрезвели');
  w[0].drunkUntil = 0; assert.equal(V.drunkNotice(s, 5, 5), null, 'один может ходить — плашка, не подсказка');
  assert.equal(V.resumeInfo(G.serialize(G.newGame({ mode: '2p', seed: 1 }))).label, '1 на 1 — классика (по 2 команды, общий счёт), ход №1');
  assert.equal(V.resumeInfo(G.serialize(G.newGame({ mode: '4p', seed: 1 }))).label, '4 игрока — каждый за себя, ход №1');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'); assert.ok(html.includes('1 на 1 — классика (по 2 команды, общий счёт)'));
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /showMenu\(note = sessionStorage\.getItem\(V\.NOTE_KEY\)/); assert.match(ui, /pointerdown[^\n]*removeItem\(V\.NOTE_KEY\)/);
});

test('v0.5.8: значок пьяного пирата есть, пока пират пьян', () => {
  const s = G.newGame({ mode: '1v1', seed: 60 }), p = s.pirates[0];
  assert.equal(V.isDrunk(s, p), false); p.drunkUntil = 3;
  assert.equal(V.isDrunk(s, p), true); assert.equal(V.isDrunk({ ...s, turn: 2 }, p), true); assert.equal(V.isDrunk({ ...s, turn: 3 }, p), false, 'протрезвел');
  assert.equal(V.isDrunk(s, { ...p, alive: false }), false);
  assert.ok(fs.existsSync(new URL('../' + V.DRUNK_ICON, import.meta.url)));
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8'); assert.equal((ui.match(/(?:V\.isDrunk\(s, p\)|k\.drunk) \? `<img class="drunk"/g) || []).length, 2, 'на поле (стопка) и в панели');
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8'); assert.match(css, /img\.drunk\{position:absolute;right:-14%;bottom:-14%/);
});

test('v0.5.8: позиция positions/v058-rum.json — пират заходит на ром, пропускает ход и трезвеет', () => {
  let s = G.loadState(fs.readFileSync(new URL('../positions/v058-rum.json', import.meta.url), 'utf8'));
  assert.equal(s.mode, '1v1'); assert.equal(s.current, 0);
  const t = G.tileAt(s, 6, 8); assert.equal(t.kind, 'barrel'); assert.equal(t.open, true);
  const w = s.pirates.filter(p => p.alive && p.team === 0 && Math.max(Math.abs(p.x - 6), Math.abs(p.y - 8)) === 1);
  assert.equal(w.length, 2);
  for (const p of w) { const c = G.tileAt(s, p.x, p.y); assert.ok(c.kind === 'empty' && c.open && V.isLandCell(p.x, p.y)); assert.ok(G.legalMoves(s).some(m => m.type === 'move' && m.pid === p.id && m.x === 6 && m.y === 8)); }
  assert.ok(s.pirates.filter(p => p.team !== 0).every(p => p.y <= 1), 'чёрные далеко');
  const id = w[0].id;
  s = G.applyMove(s, G.legalMoves(s).find(m => m.type === 'move' && m.pid === id && m.x === 6 && m.y === 8));
  const p = () => s.pirates[id];
  assert.equal(V.isDrunk(s, p()), true);
  let skipped = 0;
  for (let i = 0; i < 20 && V.isDrunk(s, p()); i++) {
    if (s.current === 0) { skipped++; assert.equal(V.drunkNotice(s, 6, 8), 'Пират пьян и пропускает ход'); assert.ok(!G.legalMoves(s).some(m => m.pid === id), 'пьяный не ходит'); }
    s = G.applyMove(s, G.legalMoves(s).find(m => m.pid !== id && !(m.x === 6 && m.y === 8)));
  }
  assert.equal(skipped, 1, 'бочонок — пропуск ровно одного хода (jackal.su)'); assert.equal(V.isDrunk(s, p()), false, 'протрезвел');
  assert.equal(V.drunkNotice(s, 6, 8), null);
  while (s.current !== 0) s = G.applyMove(s, G.legalMoves(s)[0]);
  assert.ok(G.legalMoves(s).some(m => m.pid === id), 'снова ходит'); assert.equal(s.turn + 1, 5, 'на ходу №5');
});

test('v0.5.9: «комнаты нет» — без плашки связи, онлайн-окна и переподключения; заметка убирается из DOM', () => {
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const fn = ui.match(/function roomGone\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /net\.stop\(\)/); assert.match(fn, /net = null/); assert.match(fn, /state = null/);
  assert.match(fn, /\$\('#banner'\); b\.hidden = true; b\.innerHTML = ''/); assert.match(fn, /\$\('#online'\)\.close\(\)/); assert.match(fn, /showMenu\(\)/);
  assert.match(ui, /pointerdown[^\n]*removeItem\(V\.NOTE_KEY\)[^\n]*textContent = ''/);
  const net = fs.readFileSync(new URL('../src/net.js', import.meta.url), 'utf8'); assert.match(net, /!stopped && open\(\)/, 'после stop() переподключений нет');
});

test('v0.5.9: бочонок рома — пропуск ровно одного своего хода и в режиме с 4 командами', () => {
  for (const mode of ['1v1', '2p', '4p']) {
    const s = G.newGame({ mode, seed: 7 }), p = s.pirates[0], n = G.activeTeams(mode).length;
    s.tiles['6,10'] = { kind: 'barrel', open: true, coins: 0 }; p.x = 6; p.y = 11; s.tiles['6,11'] = { kind: 'empty', open: true, coins: 0 };
    const t = G.applyMove(s, G.legalMoves(s).find(m => m.pid === p.id && m.x === 6 && m.y === 10));
    const q = t.pirates[p.id];
    assert.equal(V.isDrunk({ ...t, turn: n }, q), true, mode + ': следующий свой ход пропускает');
    assert.equal(V.isDrunk({ ...t, turn: 2 * n }, q), false, mode + ': через один свой ход трезв');
  }
});

test('v0.5.12: значок пьяного того же размера, что номер (общая CSS-переменная), вынос как у номера', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const rule = sel => { const m = [...css.matchAll(new RegExp(sel.replace(/[.]/g, '\\.') + '(?:,[^{]*)?\\{([^}]*)\\}', 'g'))].map(m => m[1]).join(';'); return k => (m.match(new RegExp('(?:^|;)' + k + ':([^;]+)', 'g')) || []).pop()?.split(':').slice(1).join(':'); };
  const num = rule('.cell .pirate .num'), dr = rule('.cell .pirate img.drunk');
  assert.equal(num('width'), 'var(--badge)'); assert.equal(dr('width'), num('width')); assert.equal(dr('height'), num('height'));
  assert.match(css, /\.cell \.pirate\{--badge:max\(11px,58%\)\}/);
  assert.equal(dr('right'), num('right')); assert.equal(dr('bottom'), num('top'), 'вынос за край как у номера');
  const tb = rule('.crew .tok b'), td = rule('.crew .tok img.drunk');
  assert.equal(tb('min-width'), 'var(--tbadge)'); assert.equal(td('width'), 'var(--tbadge)'); assert.equal(td('height'), tb('height'));
  assert.equal(td('right'), tb('right')); assert.equal(td('bottom'), tb('top'));
});

test('v0.5.10: позиция v0510-rum-both — оба белых пьяны на одной клетке; ход белых №3 — «Пираты пьяны…»', () => {
  let s = G.loadState(fs.readFileSync(new URL('../positions/v0510-rum-both.json', import.meta.url), 'utf8'));
  assert.equal(s.mode, '1v1'); assert.equal(s.current, 0); assert.equal(G.tileAt(s, 6, 8).kind, 'barrel');
  const [a, b] = [0, 1].map(i => s.pirates.find(p => p.team === 0 && p.x === [6, 5][i] && p.y === [8, 9][i]));
  assert.ok(a && b); assert.equal(V.isDrunk(s, a), true);
  s = G.applyMove(s, G.legalMoves(s).find(m => m.pid === b.id && m.x === 6 && m.y === 8));
  s = G.applyMove(s, G.legalMoves(s)[0]); // чёрные
  assert.equal(s.current, 0); assert.equal(s.turn, 2);
  assert.equal(V.drunkNotice(s, 6, 8), 'Пираты пьяны и пропускают ход');
  assert.ok(!G.legalMoves(s).some(m => m.pid === a.id || m.pid === b.id));
});

test('v0.5.10: корабль чёрных у верхнего края — плашка в пределах поля; чужие пираты — подсказка «Сейчас ход»', () => {
  let s = G.loadState(fs.readFileSync(new URL('../positions/v058-rum.json', import.meta.url), 'utf8'));
  assert.equal(V.turnNotice(s, 6, 0), 'Сейчас ход: Белые');
  assert.equal(V.turnNotice(s, 5, 9), null, 'свои');
  s = G.applyMove(s, G.legalMoves(s).find(m => m.pid === 1 && m.x === 8 && m.y === 9));
  const mine = s.pirates.filter(p => p.alive && p.x === 6 && p.y === 0 && p.team === s.current && G.pirateMoves(s, p).length);
  assert.equal(mine.length, 3, 'на корабле чёрных три пирата с ходами');
  const pl = V.platePlacement({ x: 6, n: 3 }); assert.ok(pl.start >= 0 && pl.start + pl.span <= G.N);
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /d\.style\.gridRow = String\(plate\.y \+ 1\)/, 'плашка в той же строке, что и клетка (строка 1 у верхнего края)');
  assert.match(ui, /V\.drunkNotice\(state, x, y\) \|\| V\.turnNotice\(state, x, y\)/);
});

test('v0.5.12: все пираты пьяны — ход сам переходит к сопернику (и при загрузке позиции), с понятным сообщением', () => {
  const raw = fs.readFileSync(new URL('../positions/v0512-all-drunk.json', import.meta.url), 'utf8');
  const j = JSON.parse(raw); assert.equal(j.current, 0); assert.equal(j.mode, '1v1');
  assert.equal(j.pirates.filter(p => p.team === 0 && p.alive && p.drunkUntil > j.turn).length, 3, 'все три белых пьяны');
  const s = G.loadState(raw);
  assert.equal(s.over, false); assert.equal(s.current, 2, 'ход у чёрных'); assert.equal(s.turn, 1);
  assert.ok(G.legalMoves(s).length > 0, 'не зависло');
  assert.equal(s.log.at(-1), '⏭ Белые пропускают ход №1: все пираты пьяны');
  assert.equal(V.skipNotice(s), 'Белые пропускают ход №1: все пираты пьяны');
  const t = G.applyMove(s, G.legalMoves(s)[0]);
  assert.equal(t.current, 0); assert.equal(V.skipNotice(t), null, 'сообщение не висит дальше');
  assert.ok(G.legalMoves(t).some(m => m.pid === t.pirates.find(p => p.team === 0 && p.x === 6 && p.y === 8).id), 'протрезвели и ходят');
  // и посреди партии: белые пьяны после хода чёрных — пропуск без зависания
  const u = G.newGame({ mode: '1v1', seed: 3 }); u.tiles['6,8'] = { kind: 'empty', open: true, coins: 0 };
  for (const p of u.pirates.filter(p => p.team === 0)) { p.x = 6; p.y = 8; p.drunkUntil = 3; }
  u.current = 2; u.turn = 1; const v = G.applyMove(u, G.legalMoves(u)[0]);
  assert.equal(v.current, 2); assert.equal(v.turn, 3); assert.match(V.skipNotice(v), /^Белые пропускают ход №3: все пираты пьяны$/);
});

test('v0.5.12: плашка на корабле — подсказка «выберите одного на плашке»', () => {
  assert.equal(V.plateHint({ x: 6, y: 0, pids: [3, 4, 5] }, null, true), 'На клетке 3 пирата — выберите одного на плашке справа');
  assert.equal(V.plateHint({ x: 6, y: 0, pids: [3, 4, 5] }, 4, true), null);
  assert.equal(V.plateHint({ x: 6, y: 0, pids: [3, 4, 5] }, null, false), null);
  assert.equal(V.plateHint(null, null, true), null);
});

test('v0.5.13: номер и значок — минимум 11px через --badge/--tbadge, белая обводка 1px, pointer-events:none', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /\.cell \.pirate\{--badge:max\(11px,58%\)\}/);
  assert.match(css, /\.crew \.tok\{--tbadge:max\(11px,/);
  const m = css.match(/\.cell \.pirate \.num,\.cell \.pirate img\.drunk,\.crew \.tok b,\.crew \.tok img\.drunk\{([^}]*)\}/);
  assert.ok(m); assert.match(m[1], /outline:1px solid #fff/); assert.match(m[1], /pointer-events:none/);
});

test('v0.5.14: сообщение о пропуске стирается первым же ходом соперника (в журнале остаётся)', () => {
  const s = G.loadState(fs.readFileSync(new URL('../positions/v0512-all-drunk.json', import.meta.url), 'utf8'));
  assert.equal(V.skipNotice(s), 'Белые пропускают ход №1: все пираты пьяны');
  const t = G.applyMove(s, G.legalMoves(s)[0]);
  assert.equal(V.skipNotice(t), null); assert.ok(t.log.some(l => l.includes('Белые пропускают ход №1')));
  assert.equal(V.skipNotice(G.loadState(G.serialize(t))), null, 'и после сохранения/загрузки');
});

test('v0.5.14: стопка своих пиратов — одна верхняя фишка с «×N», пьяна, если пьян хоть один; номера только на плашке', () => {
  const s = G.loadState(fs.readFileSync(new URL('../positions/v0512-all-drunk.json', import.meta.url), 'utf8'));
  const ship = s.pirates.filter(p => p.alive && p.x === 6 && p.y === 0);
  assert.equal(ship.length, 3);
  let st = V.stacks(s, ship, null);
  assert.equal(st.length, 1); assert.equal(st[0].label, '×3'); assert.equal(st[0].n, 3); assert.equal(st[0].top, ship[0]);
  assert.equal(V.stacks(s, ship, ship[2].id)[0].top, ship[2], 'наверху выбранный');
  ship[1].drunkUntil = s.turn + 5; assert.equal(V.stacks(s, ship)[0].drunk, true);
  const one = V.stacks(s, [ship[0]]); assert.equal(one[0].label, V.pirateNumber(s, ship[0]));
  const mix = V.stacks(s, [...ship.slice(0, 2), s.pirates.find(p => p.team === 0)]); assert.equal(mix.length, 2);
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8'); assert.match(ui, /V\.stacks\(s, ps, sel\)/);
});

test('v0.5.14: подсказка внизу — про выбор на плашке, без «повторное нажатие»', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('повторное нажатие')); assert.match(html, /плашка — выберите на ней нужного/);
});

test('v0.5.14: плашка — фишки кликабельны: стоят поверх клеток, клик не уходит в клетку', () => {
  const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8'), ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(css, /\.plate\{z-index:5/); assert.match(ui, /btn\.onclick = e => \{ e\.stopPropagation\(\); choose/);
  assert.ok(!/(?:mousedown|pointerdown)[^\n]*plate *=/.test(ui), 'нет закрытия плашки по mousedown/pointerdown');
});

test('v0.5.15: чёрные на корабле (6,0) — на плашке, в статусе, подсказках и журнале номера 1–3, не id', () => {
  const s = G.loadState(fs.readFileSync(new URL('../positions/v0512-all-drunk.json', import.meta.url), 'utf8'));
  const ship = s.pirates.filter(p => p.alive && p.x === 6 && p.y === 0); assert.deepEqual(ship.map(p => p.id), [3, 4, 5]);
  assert.deepEqual(ship.map(p => V.pirateNumber(s, p)), [1, 2, 3]);
  assert.deepEqual(ship.map(p => G.pieceName(s, p)), ['Ч1', 'Ч2', 'Ч3']);
  assert.deepEqual(ship.map(p => V.selectHint(s, p.id)), [1, 2, 3].map(n => `Ваш ход: выбран пират ${n}, выберите клетку`));
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /n = V\.pirateNumber\(s, p\); return `<button class="tok/, 'плашка подписана pirateNumber');
  assert.ok(!/>\$\{(?:id|t\.pid|p\.id)\}</.test(ui), 'нигде не выводится id');
  const t = G.applyMove(s, G.legalMoves(s).find(m => m.pid === 4));
  assert.ok(!t.log.some(l => /[БЧ][4-9]|пират [4-9]/.test(l)));
});

test('v0.5.16: журнал — история: «Журнал», №хода + точка команды, без эмодзи, 5 последних, новые сверху', () => {
  const s = G.loadState(fs.readFileSync(new URL('../positions/v0512-all-drunk.json', import.meta.url), 'utf8'));
  let e = V.logEntries(s);
  assert.deepEqual(e[0], { n: 1, team: 0, text: 'Белые пропускают ход: все пираты пьяны' });
  let t = s; for (let i = 0; i < 12 && !t.over; i++) t = G.applyMove(t, G.legalMoves(t)[0]);
  e = V.logEntries(t); assert.ok(e.length <= 5);
  for (let i = 1; i < e.length; i++) assert.ok(e[i - 1].n >= e[i].n, 'новые сверху');
  for (const x of V.logEntries({ log: ['⏭ a', '☠ Б1: утонул', '🍾 Белые: +1 рома', '💰 Чёрные: монета на корабле'], logMeta: [1, 2, 3, 4].map(t => ({ t, team: 0 })) }, 5)) assert.ok(!/\p{Extended_Pictographic}|⏭/u.test(x.text), x.text);
  assert.equal(V.logEntries(G.loadState(G.serialize(t))).length, e.length, 'переживает сохранение');
  const ui = fs.readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8'), css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(ui, /<h3>Журнал<\/h3>/); assert.match(ui, /class="dot"/); assert.match(ui, /№\$\{e\.n\}/);
  assert.match(css, /#log\{[^}]*color:#b9c7cc/); assert.match(css, /#log \.dot\{[^}]*border-radius:50%/);
  assert.ok(parseInt(css.match(/#log\{[^}]*font:(\d+)px/)[1]) < 14, 'мельче статуса (14px)');
});
