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
  '.svg': 'image/svg+xml', '.webp': 'image/webp',
};

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const file = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (file !== root && !file.startsWith(`${root}${sep}`)) return response.writeHead(403).end('Forbidden');
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(await readFile(file));
    } catch { response.writeHead(404).end('Not found'); }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

async function camera(page) {
  return page.locator('#board').evaluate(board => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(board).transform);
    return { scale: matrix.a, x: matrix.m41, y: matrix.m42 };
  });
}

async function waitForCellCenter(page, x, y) {
  await page.waitForFunction(({ x, y }) => {
    const cell = document.querySelector(`#board [data-cell="${x},${y}"]`);
    const viewport = document.querySelector('#boardViewport');
    if (!cell || !viewport) return false;
    const a = cell.getBoundingClientRect(), b = viewport.getBoundingClientRect();
    return Math.abs(a.left + a.width / 2 - b.left - b.width / 2) < 1.5 &&
      Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < 1.5;
  }, { x, y }, { timeout: 4000 });
}

async function distanceToCellCenter(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const cell = document.querySelector(`#board [data-cell="${x},${y}"]`);
    const viewport = document.querySelector('#boardViewport');
    const a = cell.getBoundingClientRect(), b = viewport.getBoundingClientRect();
    return Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2);
  }, { x, y });
}

test('issue 23: mobile coin badge, explicit pirate/ship centering, and no turn-change camera jump', async () => {
  const state = G.loadState({
    mode: '1v1',
    tiles: { '4,6': { kind: 'empty', open: true }, '4,5': { kind: 'empty', open: true } },
    pirates: [{ team: 0, x: 4, y: 6, carry: 1 }, { team: 0, onShip: true }, { team: 2, onShip: true }],
  });
  const screenshots = process.env.ISSUE_23_SCREENSHOT_DIR
    ? resolve(process.cwd(), process.env.ISSUE_23_SCREENSHOT_DIR)
    : null;
  if (screenshots) await mkdir(screenshots, { recursive: true });

  const server = await startStaticServer();
  const address = server.address();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await page.addInitScript(serialized => {
        localStorage.setItem('jackal-save', serialized);
        localStorage.setItem('jackal-me', 'all');
      }, G.serialize(state));
      await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#continueBtn').click();
      const pirateButton = page.locator('#mobilePirates [data-pid="0"]');
      await pirateButton.waitFor();
      assert.equal(await pirateButton.locator('img.mobile-cargo').count(), 1, 'carried coin is shown on the pirate button');
      assert.match(await pirateButton.getAttribute('aria-label'), /несёт монету/, 'the coin marker has an accessible label');
      if (screenshots) await page.screenshot({ path: resolve(screenshots, '412x915-coin-carry.png'), animations: 'disabled', scale: 'css' });

      const boardViewport = page.locator('#boardViewport');
      const viewportBox = await boardViewport.boundingBox();
      await boardViewport.dblclick({ position: { x: viewportBox.width / 2, y: viewportBox.height / 2 } });
      await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#board')).transform).a > 1.05,
        null, { timeout: 5000 });
      const beforeCenter = await camera(page);
      await pirateButton.click();
      await waitForCellCenter(page, 4, 6);
      const afterCenter = await camera(page);
      assert.ok(Math.abs(afterCenter.scale - beforeCenter.scale) < 0.001, 'centering preserves the current zoom');
      assert.ok(Math.abs(afterCenter.x - beforeCenter.x) + Math.abs(afterCenter.y - beforeCenter.y) > 1, 'the pirate button moves the camera');
      const coinButton = page.locator('#coinBtn');
      assert.equal(await coinButton.getAttribute('aria-pressed'), 'true', 'carrying is the default coin action');
      await coinButton.click();
      assert.equal(await coinButton.getAttribute('aria-pressed'), 'false', 'the coin button toggles to leave the coin behind');
      await coinButton.click();
      assert.equal(await coinButton.getAttribute('aria-pressed'), 'true', 'the coin button toggles back to carrying');
      if (screenshots) await page.screenshot({ path: resolve(screenshots, '412x915-pirate-centered.png'), animations: 'disabled', scale: 'css' });

      const shipDistanceBefore = await distanceToCellCenter(page, state.ships[0].x, state.ships[0].y);
      await page.locator('#shipBtn').click();
      await page.waitForFunction(() => document.querySelector('#boardViewport').classList.contains('is-centering'), null, { timeout: 2000 });
      await page.waitForFunction(() => !document.querySelector('#boardViewport').classList.contains('is-centering'), null, { timeout: 3000 });
      await page.waitForFunction(({ x, y, before }) => {
        const cell = document.querySelector(`#board [data-cell="${x},${y}"]`);
        const viewport = document.querySelector('#boardViewport');
        const a = cell.getBoundingClientRect(), b = viewport.getBoundingClientRect();
        return Math.hypot(a.left + a.width / 2 - b.left - b.width / 2, a.top + a.height / 2 - b.top - b.height / 2) < before - 2;
      }, { x: state.ships[0].x, y: state.ships[0].y, before: shipDistanceBefore }, { timeout: 4000 });
      await pirateButton.click();
      await page.waitForTimeout(300);
      assert.ok(await distanceToCellCenter(page, 4, 6) < 1.5, `pirate button re-centers after ship selection: ${JSON.stringify(await camera(page))}`);
      const beforeTurn = await camera(page);
      await page.locator('#board [data-cell="4,5"].target').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('jackal-save')).current === 2, null, { timeout: 4000 });
      assert.deepEqual(await camera(page), beforeTurn, 'changing turns does not move the camera');
    } finally { await context.close(); }
  } finally {
    await browser?.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
});
