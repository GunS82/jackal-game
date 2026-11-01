import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';

window.jackalBluetooth = registerPlugin('JackalBluetooth');

App.addListener('backButton', () => {
  window.dispatchEvent(new Event('jackal:backbutton'));
});

window.addEventListener('jackal:minimize', () => {
  App.minimizeApp().catch(() => {});
});
