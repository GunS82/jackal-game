import * as G from '../src/game.js';
export function simulate(seed, mode, maxMoves = 600, options = {}) {
  let s = G.newGame({ seed, mode, options }); const r = G.rng(seed + 7); let n = 0;
  while (!s.over && n < maxMoves) { const ms = G.legalMoves(s); if (!ms.length) throw new Error('нет ходов, но игра не окончена'); s = G.applyMove(s, ms[Math.floor(r() * ms.length)]); n++; check(s); }
  return { s, n };
}
export function check(s) {
  const total = s.score.reduce((a, b) => a + b, 0) + s.lost + G.coinsLeft(s);
  if (total !== G.TOTAL_COINS) throw new Error('монеты не сходятся: ' + total);
  for (const p of s.pirates) if (p.alive && !G.inGrid(p.x, p.y)) throw new Error('пират вне поля');
}
if (process.argv[1]?.endsWith('sim.js')) {
  const modes = process.argv[2] ? [process.argv[2]] : ['2p', '1v1', '2v2', '4p'];
  for (const mode of modes) for (let seed = 1; seed <= 5; seed++) {
    const { s, n } = simulate(seed, mode, 3000);
    const fin = { ...s, over: true }; // лидер на момент остановки, если партия не закончилась
    console.log(mode, seed, 'ходов', n, 'окончена', s.over, 'стороны', JSON.stringify(G.sideScores(s)), 'утонуло', s.lost, 'причина', s.endReason, s.over ? 'победа' : 'лидер', G.winner(fin).map(k => G.sideName(s, k)).join(' | '));
  }
  // партии с опциями: каждая отдельно и обе вместе
  const OPTS = [{ archipelagoMissionary: true }, { houseCrocDeath: true }, { archipelagoMissionary: true, houseCrocDeath: true }];
  for (const options of OPTS) for (const mode of modes.filter(m => m === '2p' || m === '1v1')) for (let seed = 1; seed <= 3; seed++) {
    const { s, n } = simulate(seed, mode, 3000, options);
    console.log(mode, JSON.stringify(options), seed, 'ходов', n, 'окончена', s.over, 'утонуло', s.lost, 'причина', s.endReason);
  }
}
