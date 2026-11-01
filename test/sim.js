import * as G from '../src/game.js';
export function simulate(seed, mode, maxMoves = 600) {
  let s = G.newGame({ seed, mode }); const r = G.rng(seed + 7); let n = 0;
  while (!s.over && n < maxMoves) { const ms = G.legalMoves(s); if (!ms.length) throw new Error('нет ходов, но игра не окончена'); s = G.applyMove(s, ms[Math.floor(r() * ms.length)]); n++; check(s); }
  return { s, n };
}
export function check(s) {
  const total = s.score.reduce((a, b) => a + b, 0) + s.lost + G.coinsLeft(s);
  if (total !== 37 - (s.mode === '1v1' ? 0 : 0)) throw new Error('монеты не сходятся: ' + total);
  for (const p of s.pirates) if (p.alive && !G.inGrid(p.x, p.y)) throw new Error('пират вне поля');
}
if (process.argv[1]?.endsWith('sim.js')) {
  const modes = process.argv[2] ? [process.argv[2]] : ['2p', '1v1', '2v2', '4p'];
  for (const mode of modes) for (let seed = 1; seed <= 5; seed++) {
    const { s, n } = simulate(seed, mode, 3000);
    const fin = { ...s, over: true }; // лидер на момент остановки, если партия не закончилась
    console.log(mode, seed, 'ходов', n, 'окончена', s.over, 'стороны', JSON.stringify(G.sideScores(s)), 'утонуло', s.lost, s.over ? 'победа' : 'лидер', G.winner(fin).map(k => G.sideName(s, k)).join(' | '));
  }
}
