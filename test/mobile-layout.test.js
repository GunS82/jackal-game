import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileBoardMetrics, availableMobileActions } from '../src/mobile-layout.js';
import * as V from '../src/view.js';
import * as G from '../src/game.js';

test('height mode uses at least 80% of a 360×780 screen for the board', () => {
  const layout = mobileBoardMetrics({ viewportWidth: 360, viewportHeight: 780 });
  assert.ok(layout.boardHeight >= 780 * 0.8, `${layout.boardHeight}px should fill at least 80% of the screen`);
  assert.ok(layout.cellSize >= 48, `${layout.cellSize}px cell is close to the requested 48px`);
  assert.ok(layout.boardWidth > 360, 'height mode keeps the larger board horizontally scrollable');
  assert.equal(layout.logLines, 1);
});

test('fit mode fits the viewport width and allocates three or four log rows', () => {
  const layout = mobileBoardMetrics({ viewportWidth: 360, viewportHeight: 780, mode: 'fit' });
  assert.equal(layout.boardWidth, 360);
  assert.ok(layout.boardHeight < 360, 'outer sea rows compress the board height');
  assert.ok(layout.logLines >= 3 && layout.logLines <= 4);
});

test('mobile action list includes only enabled contextual actions', () => {
  assert.deepEqual(availableMobileActions({
    ship: { disabled: false }, coin: { disabled: false }, revive: { disabled: true }, rum: { disabled: false },
  }), ['coin', 'rum']);
  assert.deepEqual(availableMobileActions({ coin: { disabled: true }, revive: { disabled: true }, rum: { disabled: true } }), []);
});

test('mobile header uses the current turn and compact score', () => {
  const state = G.newGame({ mode: '1v1', seed: 3 });
  assert.equal(V.mobileHeaderText(state), 'Ход Белых · №1');
  assert.equal(V.mobileScore(state), 'Б 0 : Ч 0');
});

test('Android Back closes mobile overlays and fit mode before the active game', () => {
  assert.equal(V.androidBackAction({ mobileMenu: true, fitMode: true, plate: true }), 'close-mobile-menu');
  assert.equal(V.androidBackAction({ fitMode: true, plate: true }), 'height-fit');
  assert.equal(V.androidBackAction({ logExpanded: true, plate: true }), 'collapse-log');
  assert.equal(V.androidBackAction({ plate: true }), 'close-plate');
  assert.equal(V.androidBackAction({ hasGame: true }), 'confirm-game-exit');
  assert.equal(V.androidBackAction(), 'minimize');
});
