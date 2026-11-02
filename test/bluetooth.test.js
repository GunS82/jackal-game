import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as G from '../src/game.js';
import { stateMessage } from '../src/bluetooth-protocol.js';

test('Bluetooth: гостю уходит только публичное состояние с пустыми закрытыми клетками', async () => {
  const state = G.newGame({ mode: '1v1', seed: 12345 });
  const message = stateMessage(state);
  assert.equal(message.type, 'state');
  assert.equal(message.opponent, 'online');
  assert.equal(message.state.seed, null);
  assert.notEqual(message.state, state);

  const closed = Object.values(message.state.tiles).filter(tile => !tile.open);
  assert.ok(closed.length > 0);
  for (const tile of closed) assert.deepEqual(tile, { kind: 'empty', open: false, coins: 0 });
  assert.ok(!JSON.stringify(message).includes('12345'));

  const ui = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /sendBluetooth\(stateMessage\(state\)\)/);
  assert.doesNotMatch(ui, /sendBluetooth\(\{\s*type:\s*'state',\s*state\s*\}\)/);
});
