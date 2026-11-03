import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileBoardMetrics, mobileBoardRotation, orientBoardCell, mobileActionSlots } from '../src/mobile-layout.js';
import * as V from '../src/view.js';
import * as G from '../src/game.js';

test('the full 13×13 board fits the mobile board area at both required portrait sizes', () => {
  for (const [width, height] of [[412, 649], [360, 514]]) {
    const layout = mobileBoardMetrics({ viewportWidth: width, viewportHeight: height });
    assert.equal(layout.boardWidth, width);
    assert.equal(layout.boardHeight, width);
    assert.ok(layout.cellSize > 0);
    assert.ok(layout.boardHeight <= height);
  }
});

test('the active team ship is placed at the bottom without turning cell contents upside down', () => {
  assert.equal(mobileBoardRotation(0), 0);
  assert.deepEqual(orientBoardCell(6, 12, mobileBoardRotation(0)), { x: 6, y: 12 });
  for (const [team, ship] of [[1, [0, 6]], [2, [6, 0]], [3, [12, 6]]]) {
    const rotated = orientBoardCell(...ship, mobileBoardRotation(team));
    assert.equal(rotated.x, 6);
    assert.equal(rotated.y, 12);
  }
});

test('mobile action slots stay in place while unavailable actions are disabled', () => {
  const slots = mobileActionSlots({
    ship: { disabled: false }, coin: { disabled: true }, rum: { disabled: false }, revive: { disabled: true },
  });
  assert.deepEqual(slots.map(slot => slot.id), ['ship', 'coin', 'rum', 'revive', 'pass']);
  assert.deepEqual(slots.map(slot => slot.disabled), [false, true, false, true, true]);
});

test('mobile header uses the current turn and compact score', () => {
  const state = G.newGame({ mode: '1v1', seed: 3 });
  assert.equal(V.mobileHeaderText(state), 'Ход Белых · №1');
  assert.equal(V.mobileScore(state), 'Б 0 : Ч 0');
});

test('Android Back closes mobile overlays and the expanded log before the active game', () => {
  assert.equal(V.androidBackAction({ mobileMenu: true, logExpanded: true, plate: true }), 'close-mobile-menu');
  assert.equal(V.androidBackAction({ logExpanded: true, plate: true }), 'collapse-log');
  assert.equal(V.androidBackAction({ plate: true }), 'close-plate');
  assert.equal(V.androidBackAction({ hasGame: true }), 'confirm-game-exit');
  assert.equal(V.androidBackAction(), 'minimize');
});
