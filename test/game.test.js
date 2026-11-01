import test from 'node:test'; import assert from 'node:assert/strict';
import * as G from '../src/game.js'; import { simulate } from './sim.js';
import fs from 'node:fs';
const pos = (o) => G.loadState(o);
const mv = (s, f) => { const m = G.legalMoves(s).find(f); assert.ok(m, 'ход не найден'); G.applyMove(s, m); return s; };

test('набор из 117 клеток и 37 монет', () => { const s = G.newGame({ seed: 3 }); assert.equal(Object.keys(s.tiles).length, 117); assert.equal(G.coinsLeft(s), 37); assert.equal(s.pirates.length, 12); });
test('первый ход: высадка или сдвиг корабля', () => { const s = G.newGame({ seed: 3 }); const ms = G.legalMoves(s); assert.ok(ms.some(m => m.type === 'move' && m.x === 6 && m.y === 11)); assert.equal(ms.filter(m => m.type === 'ship').length, 2); });
test('лёд повторяет ход', () => { const s = pos({ tiles: { '6,10': { kind: 'ice' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); mv(s, m => m.x === 6 && m.y === 10); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [6, 9]); });
test('крокодил возвращает назад', () => { const s = pos({ tiles: { '6,10': { kind: 'croc' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); mv(s, m => m.x === 6 && m.y === 10); assert.deepEqual([s.pirates[0].x, s.pirates[0].y], [6, 11]); });
test('людоед убивает, аборигенка воскрешает', () => { const s = pos({ tiles: { '5,10': { kind: 'ogre' }, '7,10': { kind: 'abor' } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 0, x: 7, y: 10 }] }); mv(s, m => m.x === 5 && m.y === 10); assert.equal(s.pirates[0].alive, false); s.current = 0; assert.ok(G.legalMoves(s).some(m => m.type === 'revive')); });
test('удар отправляет врага на корабль; с монетой бить нельзя', () => { const s = pos({ tiles: { '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }, { team: 1, x: 6, y: 10 }] }); const ms = G.legalMoves(s).filter(m => m.x === 6 && m.y === 10); assert.ok(ms.length && ms.every(m => !m.coin)); G.applyMove(s, ms[0]); const e = s.pirates.find(p => p.team === 1); assert.deepEqual([e.x, e.y], [0, 6]); });
test('монета доставляется на корабль', () => { const s = pos({ tiles: { '6,11': { coins: 2 } }, pirates: [{ team: 0, x: 6, y: 11 }] }); mv(s, m => m.x === 6 && m.y === 12 && m.coin); assert.equal(s.score[0], 1); assert.equal(G.tileAt(s, 6, 11).coins, 1); });
test('с монетой нельзя на закрытую клетку', () => { const s = pos({ defaultTile: { kind: 'empty', open: false }, tiles: { '6,11': { coins: 1 } }, pirates: [{ team: 0, x: 6, y: 11 }] }); assert.ok(G.legalMoves(s).filter(m => m.coin).every(m => m.y === 12)); });
test('вертушка 2 хода', () => { const s = pos({ tiles: { '6,10': { kind: 'spin2' } }, pirates: [{ team: 0, x: 6, y: 11 }] }); mv(s, m => m.x === 6 && m.y === 10); s.current = 0; const ms = G.legalMoves(s).filter(m => m.pid === 0); assert.equal(ms.length, 1); assert.equal(ms[0].via, 'spin'); });
test('неверный файл даёт понятную ошибку', () => { assert.throws(() => G.loadState('{oops'), /JSON/); assert.throws(() => G.loadState({ pirates: [], tiles: { '1,1': {} } }), /не на острове/); assert.throws(() => G.loadState({ pirates: [{ team: 5 }] }), /team/); });
test('примеры test-positions загружаются', () => { for (const f of fs.readdirSync('test-positions')) { const s = G.loadState(fs.readFileSync('test-positions/' + f, 'utf8')); assert.ok(G.legalMoves(s).length > 0, f); } });
test('случайные партии без ошибок (сотни ходов)', () => { for (const mode of ['2p', '2v2', '4p']) for (let seed = 1; seed <= 10; seed++) { const { n } = simulate(seed, mode, 800); assert.ok(n > 0); } });
