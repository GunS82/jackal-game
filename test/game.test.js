import test from 'node:test'; import assert from 'node:assert/strict';
import * as G from '../src/game.js'; import { simulate } from './sim.js';
import fs from 'node:fs';
const pos = (o) => G.loadState(o);
const mv = (s, f) => { const m = G.legalMoves(s).find(f); assert.ok(m, 'ход не найден'); return G.applyMove(s, m); };

test('набор из 117 клеток и 37 монет', () => { let s = G.newGame({ seed: 3 }); assert.equal(Object.keys(s.tiles).length, 117); assert.equal(G.coinsLeft(s), 37); assert.equal(s.pirates.length, 12); });
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
  assert.equal(G.tileAt(s, 6, 10).coins, 0); assert.equal(s.pirates[0].carry, true);
  s = mv(s, m => m.via === 'spin' && m.coin); s = mv(s, m => m.via === 'spin' && m.coin); assert.equal(s.pirates[0].spin, 3); assert.equal(G.tileAt(s, 6, 9).coins, 0);
  s = mv(s, m => m.x === 6 && m.y === 8 && m.coin);
  assert.deepEqual([s.pirates[0].x, s.pirates[0].y, s.pirates[0].carry], [6, 8, false]); assert.equal(G.tileAt(s, 6, 8).coins, 1); assert.equal(G.coinsLeft(s), 1);
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
