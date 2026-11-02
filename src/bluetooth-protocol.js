import * as G from './game.js';

// Bluetooth-клиент получает только публичное состояние, как и онлайн-клиент.
export function stateMessage(state, opponent = 'online') {
  return { type: 'state', state: G.publicState(state), opponent };
}
