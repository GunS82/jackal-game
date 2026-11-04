import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import * as G from '../src/game.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (file !== root && !file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

function fixtureStates() {
  let state = G.newGame({ mode: '1v1', seed: 21121 });
  const result = {};
  for (let index = 0; index < 20 && (!result.white || !result.black); index++) {
    const moves = G.legalMoves(G.publicState(state));
    const turnEndingLandMove = moves.find(move => move.type === 'move' &&
      !G.onShip(state, state.pirates[move.pid]) && G.applyMove(state, move).current !== state.current);
    if (state.current === 0 && state.turn >= 2 && turnEndingLandMove && !result.white) result.white = G.serialize(state);
    if (state.current === 2 && state.turn >= 3 && turnEndingLandMove && !result.black) result.black = G.serialize(state);
    if (result.white && result.black) break;
    const move = moves.find(candidate => candidate.type === 'move') ?? moves[0];
    assert.ok(move, 'fixture state has another legal move');
    state = G.applyMove(state, move);
  }
  assert.ok(result.white && result.black, 'both teams get a fixture state');
  return result;
}

async function camera(page) {
  return page.locator('#board').evaluate(board => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(board).transform);
    return { scaleX: matrix.a, scaleY: matrix.d, x: matrix.m41, y: matrix.m42 };
  });
}

test('issue 21: hot-seat camera stays fixed and Bluetooth lists only active discovery results', async () => {
  const states = fixtureStates();
  const screenshots = process.env.ISSUE_21_SCREENSHOT_DIR
    ? resolve(process.cwd(), process.env.ISSUE_21_SCREENSHOT_DIR)
    : null;
  if (screenshots) await mkdir(screenshots, { recursive: true });

  const server = await startStaticServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    for (const viewport of [{ width: 412, height: 915 }, { width: 360, height: 780 }]) {
      for (const team of ['white', 'black']) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        try {
          await page.addInitScript(({ serialized }) => {
            localStorage.setItem('jackal-save', serialized);
            localStorage.setItem('jackal-me', 'all');
          }, { serialized: states[team] });
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
          await page.locator('#continueBtn').click();
          await page.waitForFunction(() => document.querySelectorAll('#board .cell').length === 169);

          const before = G.loadState(states[team]);
          const boardViewport = page.locator('#boardViewport');
          const viewportBox = await boardViewport.boundingBox();
          await boardViewport.dblclick({ position: { x: viewportBox.width / 2, y: viewportBox.height / 2 } });
          await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#board')).transform).a > 1.05,
            null, { timeout: 5000 });
          const panStart = { x: viewportBox.x + viewportBox.width / 2, y: viewportBox.y + viewportBox.height / 2 };
          await page.mouse.move(panStart.x, panStart.y);
          await page.mouse.down();
          await page.mouse.move(panStart.x + 24, panStart.y + 14, { steps: 3 });
          await page.mouse.up();
          const legalMove = G.legalMoves(G.publicState(before)).find(move =>
            move.type === 'move' && !G.onShip(before, before.pirates[move.pid]) && G.applyMove(before, move).current !== before.current);
          assert.ok(legalMove, `${team} has an available pirate away from its ship`);
          const initialCamera = await camera(page);
          assert.ok(initialCamera.scaleX > 1.05, `${team}: test exercises a manually zoomed camera`);
          const actor = before.pirates[legalMove.pid];
          await page.locator(`#board [data-cell="${actor.x},${actor.y}"]`).evaluate(cell => cell.click());
          await page.locator(`#mobilePirates [data-pid="${legalMove.pid}"].sel`).waitFor();
          assert.deepEqual(await camera(page), initialCamera, `${team}: selecting a pirate must not move or zoom the board`);

          const target = page.locator(`#board [data-cell="${legalMove.x},${legalMove.y}"]`);
          assert.ok(await target.evaluate(cell => cell.classList.contains('target')), `${team}: selected move destination should be highlighted`);
          await target.click();
          await page.waitForFunction(previous => JSON.parse(localStorage.getItem('jackal-save')).turn > previous, before.turn, { timeout: 5000 });
          const after = G.loadState(await page.evaluate(() => localStorage.getItem('jackal-save')));
          assert.notEqual(after.current, before.current, 'the move changes the active team');
          assert.deepEqual(await camera(page), initialCamera, `${team}: changing turns must preserve board zoom and pan`);

          if (screenshots) await page.screenshot({
            path: resolve(screenshots, `${viewport.width}x${viewport.height}-${team}-turn-change.png`),
            animations: 'disabled', scale: 'css',
          });
        } finally {
          await context.close();
        }
      }
    }

    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await page.addInitScript(() => {
        const listeners = new Map();
        let scanCount = 0;
        globalThis.__mockBluetooth = {
          addListener: async (event, callback) => {
            const callbacks = listeners.get(event) ?? [];
            callbacks.push(callback);
            listeners.set(event, callbacks);
            return { remove: async () => listeners.set(event, callbacks.filter(item => item !== callback)) };
          },
          discoverDevices: async () => {
            scanCount++;
            return { scanning: true, devices: [
              { address: 'PAIRED-HEADPHONES', name: 'Previously paired headphones' },
              { address: 'PAIRED-PC', name: 'Previously paired computer' },
            ] };
          },
          emit: (event, value) => (listeners.get(event) ?? []).forEach(callback => callback(value)),
          scanCount: () => scanCount,
        };
        globalThis.jackalBluetooth = globalThis.__mockBluetooth;
      });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#nearbyBtn').click();
      await page.locator('#nearby').waitFor({ state: 'visible' });
      await page.locator('#btScanBtn').click();
      await page.locator('#btErr.searching').waitFor();
      assert.match(await page.locator('#btErr').textContent(), /Идёт поиск телефонов рядом/);
      assert.equal(await page.locator('#btDevices li').count(), 0, 'bonded devices returned by a mock scan are ignored');

      await page.evaluate(() => globalThis.__mockBluetooth.emit('deviceFound', { address: 'ACTIVE-PHONE', name: 'Phone found now' }));
      await page.locator('#btDevices li button').waitFor();
      assert.deepEqual(await page.locator('#btDevices li button').allTextContents(), ['Phone found now']);
      await page.evaluate(() => globalThis.__mockBluetooth.emit('scanState', { scanning: false }));
      await page.waitForFunction(() => !document.querySelector('#btErr').classList.contains('searching'));

      await page.locator('#btScanBtn').click();
      await page.locator('#btErr.searching').waitFor();
      assert.equal(await page.locator('#btDevices li').count(), 0, 'a repeated scan clears the previous results');
      await page.evaluate(() => globalThis.__mockBluetooth.emit('scanState', { scanning: false }));
      await page.waitForFunction(() => document.querySelector('#btErr').textContent === 'Телефоны рядом не найдены.');
      assert.equal(await page.evaluate(() => globalThis.__mockBluetooth.scanCount()), 2);

      await page.locator('#btScanBtn').click();
      await page.locator('#btErr.searching').waitFor();
      await page.locator('#nearby form button').click();
      await page.evaluate(() => { const menu = document.querySelector('#menu'); if (!menu.open) menu.showModal(); });
      await page.locator('#nearbyBtn').click();
      await page.locator('#nearby').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#btScanBtn').isEnabled(), true, 'reopening the dialog allows a new search');
      assert.equal(await page.locator('#btDevices').getAttribute('aria-busy'), 'false');
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolveServer => server.close(resolveServer));
  }
});
