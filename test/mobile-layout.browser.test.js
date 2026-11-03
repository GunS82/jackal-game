import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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

function createFixtureStates() {
  let state = G.newGame({ mode: '1v1', seed: 1313 });
  const snapshots = {};
  for (let ply = 0; ply < 8 && (!snapshots.white || !snapshots.black); ply++) {
    const hasOpenTile = Object.values(state.tiles).some(tile => tile.open);
    if (hasOpenTile && state.current === 0 && !snapshots.white) snapshots.white = state;
    if (hasOpenTile && state.current === 2 && !snapshots.black) snapshots.black = state;
    if (snapshots.white && snapshots.black) break;
    const moves = G.legalMoves(G.publicState(state));
    assert.ok(moves.length, 'the deterministic fixture should have another legal move');
    const move = moves.find(candidate => candidate.type === 'move') ?? moves[0];
    state = G.applyMove(state, move);
  }

  for (const turn of ['white', 'black']) {
    assert.ok(snapshots[turn], `could not create a ${turn} turn fixture with an open tile`);
    const opened = Object.values(snapshots[turn].tiles).find(tile => tile.open);
    if (turn === 'white') opened.coins = 3;
    else opened.treasure = 3;
  }
  return Object.fromEntries(Object.entries(snapshots).map(([turn, saved]) => {
    const openTile = Object.entries(saved.tiles).find(([, tile]) => tile.open);
    return [turn, { serialized: G.serialize(saved), cell: openTile[0] }];
  }));
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = resolve(root, relative);
      if (file !== root && !file.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveServer(server));
  });
}

async function inspectMobileLayout(page) {
  return page.evaluate(() => {
    const rect = element => {
      const { x, y, left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { x, y, left, top, right, bottom, width, height };
    };
    const isVisible = element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && box.width > 0 && box.height > 0;
    };
    const board = document.querySelector('#board'), viewport = document.querySelector('#boardViewport');
    const cells = [...board.querySelectorAll('.cell')];
    const cellRects = cells.map(cell => ({ key: cell.dataset.cell, rect: rect(cell) }));
    const outsideOverlaps = [...document.querySelectorAll('body *')]
      .filter(element => element !== board && !board.contains(element) && !element.contains(board) && isVisible(element))
      .flatMap(element => {
        const box = rect(element);
        return cellRects.filter(({ rect: cell }) =>
          Math.min(box.right, cell.right) - Math.max(box.left, cell.left) > 0.5 &&
          Math.min(box.bottom, cell.bottom) - Math.max(box.top, cell.top) > 0.5)
          .map(({ key }) => ({ element: element.id || element.className || element.tagName, cell: key }));
      });
    const badgeOverlaps = cells.flatMap(cell => {
      const icon = cell.querySelector('img.tile:not(.ship-image)');
      const badges = [...cell.querySelectorAll('.coins,.treasure')];
      if (!icon) return [];
      const iconBox = rect(icon);
      return badges.filter(badge => {
        const box = rect(badge);
        return Math.min(iconBox.right, box.right) - Math.max(iconBox.left, box.left) > 0.5 &&
          Math.min(iconBox.bottom, box.bottom) - Math.max(iconBox.top, box.top) > 0.5;
      }).map(badge => ({ cell: cell.dataset.cell, badge: badge.className }));
    });
    const actions = ['shipBtn', 'coinBtn', 'rumBtn', 'reviveBtn', 'passBtn'].map(id => {
      const element = document.getElementById(id);
      return { id, hidden: element.hidden, ...rect(element) };
    });
    const pirates = [...document.querySelectorAll('#mobilePirates button')].map(rect);
    const boardBox = rect(board), viewportBox = rect(viewport);
    const safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)';
    document.body.append(safeAreaProbe);
    const safeTop = parseFloat(getComputedStyle(safeAreaProbe).paddingTop) || 0;
    safeAreaProbe.remove();
    const score = document.querySelector('#topScore'), scoreStyle = getComputedStyle(score);
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
      channel /= 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = color => { const [r, g, b] = rgb(color); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [scoreL, backgroundL] = [luminance(scoreStyle.color), luminance(scoreStyle.backgroundColor)].sort((a, b) => b - a);
    const selectedPirate = document.querySelector('#mobilePirates .mobile-pirate[aria-pressed="true"]');
    return {
      viewportWidth: innerWidth, viewportHeight: innerHeight, boardBox, viewportBox,
      cellCount: cells.length, outsideOverlaps, badgeOverlaps, actions, pirates,
      safeTop, screenTop: rect(document.querySelector('#gameScreen')).top,
      scoreFontSize: parseFloat(getComputedStyle(document.querySelector('#topScore')).fontSize),
      scoreGroups: document.querySelectorAll('#topScore .score-group').length,
      scoreContrast: (scoreL + 0.05) / (backgroundL + 0.05),
      scoreDotColors: [...document.querySelectorAll('#topScore .score-group i')].map(dot => getComputedStyle(dot).backgroundColor),
      selectedPirate: selectedPirate ? {
        background: getComputedStyle(selectedPirate).backgroundColor,
        borderWidth: parseFloat(getComputedStyle(selectedPirate).borderTopWidth),
        outline: getComputedStyle(selectedPirate).outlineStyle,
        label: selectedPirate.querySelector('small')?.textContent,
      } : null,
      turnTextClipped: document.querySelector('#turnText').scrollWidth > document.querySelector('#turnText').clientWidth + 1,
      cellsInsideViewport: cellRects.every(({ rect: cell }) => cell.left >= viewportBox.left - 0.5 &&
        cell.top >= viewportBox.top - 0.5 && cell.right <= viewportBox.right + 0.5 && cell.bottom <= viewportBox.bottom + 0.5),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      teamShips: {
        white: rect(board.querySelector('[data-cell="6,12"]')),
        black: rect(board.querySelector('[data-cell="6,0"]')),
      },
      boardTransform: (() => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(board).transform);
        return { b: matrix.b, c: matrix.c };
      })(),
      shipImageTransforms: [...board.querySelectorAll('.ship-image')].map(image => image.style.transform),
      boardGrid: getComputedStyle(board).gridTemplateColumns,
      controlsVisible: getComputedStyle(document.querySelector('#mobileControls')).display !== 'none',
    };
  });
}

async function inspectBoardGrid(page) {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('#board .cell')];
    const rect = cell => {
      const box = cell.getBoundingClientRect();
      return { key: cell.dataset.cell, left: box.left, top: box.top, width: box.width, height: box.height };
    };
    return { cells: cells.map(rect) };
  });
}

function assertRegularBoardGrid(layout, label) {
  const cells = new Map(layout.cells.map(cell => [cell.key, cell]));
  assert.equal(cells.size, 169, `${label}: all 169 cells should be present`);
  const origin = cells.get('0,0'), nextColumn = cells.get('1,0'), nextRow = cells.get('0,1');
  const stepX = nextColumn.left - origin.left, stepY = nextRow.top - origin.top;
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const cell = cells.get(`${x},${y}`);
    assert.ok(cell, `${label}: missing cell ${x},${y}`);
    assert.ok(Math.abs(cell.left - (origin.left + x * stepX)) < 0.6,
      `${label}: column ${x}, row ${y} is horizontally displaced (${cell.left} vs ${origin.left + x * stepX})`);
    assert.ok(Math.abs(cell.top - (origin.top + y * stepY)) < 0.6,
      `${label}: column ${x}, row ${y} is vertically displaced (${cell.top} vs ${origin.top + y * stepY})`);
    assert.ok(Math.abs(cell.width - origin.width) < 0.6 && Math.abs(cell.height - origin.height) < 0.6,
      `${label}: cell ${x},${y} has a different size`);
  }
}

test('selecting either ship keeps the mobile 13×13 grid aligned', async () => {
  const states = createFixtureStates();
  const screenshots = process.env.MOBILE_LAYOUT_SCREENSHOT_DIR
    ? resolve(process.cwd(), process.env.MOBILE_LAYOUT_SCREENSHOT_DIR)
    : null;
  if (screenshots) await mkdir(screenshots, { recursive: true });

  const server = await startStaticServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    for (const viewport of [{ width: 412, height: 915 }, { width: 360, height: 780 }]) {
      for (const turn of ['white', 'black']) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        try {
          await page.addInitScript(({ serialized }) => {
            localStorage.setItem('jackal-save', serialized);
            localStorage.setItem('jackal-me', 'all');
          }, { serialized: states[turn].serialized });
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
          await page.locator('#continueBtn').waitFor({ state: 'visible' });
          await page.locator('#continueBtn').click();
          await page.waitForFunction(() => document.querySelectorAll('#board .cell').length === 169);

          const shipCell = turn === 'white' ? '6,12' : '6,0';
          await page.locator(`#board [data-cell="${shipCell}"]`).click();
          await page.locator('#board .plate').waitFor({ state: 'visible' });
          assertRegularBoardGrid(await inspectBoardGrid(page), `${viewport.width}×${viewport.height}, ${turn}, crew plate`);

          await page.locator('#board .plate .tok').first().click();
          assert.equal(await page.locator('#shipBtn').isEnabled(), true, `${turn}'s ship should be available`);
          await page.locator('#shipBtn').click();
          await page.waitForFunction(() => document.querySelectorAll('#board .cell.target').length > 0);
          assertRegularBoardGrid(await inspectBoardGrid(page), `${viewport.width}×${viewport.height}, ${turn}, ship selected`);
          if (screenshots) await page.screenshot({
            path: resolve(screenshots, `${viewport.width}x${viewport.height}-${turn}-ship-fit.png`),
            animations: 'disabled', scale: 'css',
          });

          const shipBox = await page.locator(`#board [data-cell="${shipCell}"]`).boundingBox();
          const viewportBox = await page.locator('#boardViewport').boundingBox();
          await page.locator('#boardViewport').dblclick({ position: {
            x: shipBox.x + shipBox.width / 2 - viewportBox.x,
            y: shipBox.y + shipBox.height / 2 - viewportBox.y,
          } });
          await page.waitForFunction(() => document.querySelector('#zoomLevel').value !== 'Целиком');
          assertRegularBoardGrid(await inspectBoardGrid(page), `${viewport.width}×${viewport.height}, ${turn}, ship selected and zoomed`);
          if (screenshots) await page.screenshot({
            path: resolve(screenshots, `${viewport.width}x${viewport.height}-${turn}-ship-zoom.png`),
            animations: 'disabled', scale: 'css',
          });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser?.close();
    await new Promise(resolveServer => server.close(resolveServer));
  }
});

test('mobile zoom, fixed hot-seat orientation, and desktop layout work without overlaps', async () => {
  const states = createFixtureStates();
  const screenshots = process.env.MOBILE_LAYOUT_SCREENSHOT_DIR
    ? resolve(process.cwd(), process.env.MOBILE_LAYOUT_SCREENSHOT_DIR)
    : null;
  if (screenshots) await mkdir(screenshots, { recursive: true });

  const server = await startStaticServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const expectedActionXs = new Map();
    const expectedShipPositions = new Map();

    for (const viewport of [{ width: 412, height: 915 }, { width: 360, height: 780 }]) {
      for (const turn of ['white', 'black']) {
        const fixture = states[turn];
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        try {
          await page.addInitScript(({ serialized }) => {
            localStorage.setItem('jackal-save', serialized);
            localStorage.setItem('jackal-me', 'all');
          }, { serialized: fixture.serialized });
          await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
          await page.locator('#continueBtn').waitFor({ state: 'visible' });
          await page.locator('#continueBtn').click();
          await page.waitForFunction(() => document.querySelectorAll('#board .cell').length === 169);
          await page.locator(`#board [data-cell="${fixture.cell}"]`).click();
          await page.locator('#tileInfo:not([hidden])').waitFor();
          const pirateState = await page.evaluate(() => ({
            compact: matchMedia('(max-width: 600px), (orientation: portrait)').matches,
            me: localStorage.getItem('jackal-me'),
            turn: document.querySelector('#turnText').textContent,
            mobilePiratesHtml: document.querySelector('#mobilePirates').innerHTML,
            buttons: [...document.querySelectorAll('#mobilePirates button.mobile-pirate')].map(button => ({ disabled: button.disabled, text: button.textContent.trim() })),
          }));
          assert.ok(pirateState.buttons.some(button => !button.disabled), `expected an available pirate for ${turn}: ${JSON.stringify(pirateState)}`);
          const pirate = page.locator('#mobilePirates button.mobile-pirate:not([disabled])').first();
          await pirate.click();
          await page.locator('#mobilePirates .mobile-pirate.sel').waitFor();

          let layout = await inspectMobileLayout(page);
          assert.equal(layout.cellCount, 169, 'all 13×13 cells should be rendered');
          assert.ok(layout.screenTop <= layout.safeTop + 1, 'the header must not add a second top safe-area inset');
          assert.ok(layout.scoreFontSize >= 16 && layout.scoreGroups >= 2, 'the score stays readable with a colored marker for each team');
          assert.ok(layout.scoreContrast >= 4.5 && new Set(layout.scoreDotColors).size >= 2, 'score contrast and team markers meet the mobile requirement');
          assert.ok(!layout.turnTextClipped, 'the active team and turn number stay visible in the header');
          assert.ok(layout.cellsInsideViewport, `${viewport.width}×${viewport.height} board cells must fit inside the viewport: ${JSON.stringify(layout)}`);
          assert.ok(!layout.horizontalOverflow, `${viewport.width}×${viewport.height} page must not scroll horizontally`);
          assert.deepEqual(layout.outsideOverlaps, [], `visible controls must not cover board cells: ${JSON.stringify(layout.outsideOverlaps)}`);
          assert.deepEqual(layout.badgeOverlaps, [], `cell badges must not cover their icons: ${JSON.stringify(layout.badgeOverlaps)}`);
          assert.equal(layout.pirates.length, 4, 'three pirate slots and one cancel slot stay visible');
          assert.ok(layout.pirates.every(box => box.width >= 44 && box.height >= 44), 'pirate tap targets must be at least 44×44px');
          assert.equal(layout.selectedPirate?.label, '▲ выбран', 'selected pirate is named in the fixed slot');
          assert.equal(layout.selectedPirate?.borderWidth, 4, 'selected pirate keeps a thick border');
          assert.equal(layout.selectedPirate?.outline, 'none', 'selected pirate uses the gold selection styling');
          assert.ok(layout.actions.every(button => !button.hidden && button.width >= 44 && button.height >= 44), 'all fixed action slots stay visible and at least 44×44px');
          assert.ok(layout.actions.every((button, index) => index === 0 || layout.actions[index - 1].x < button.x), 'action slots keep their left-to-right order');
          assert.ok(Math.abs(layout.boardTransform.b) < 0.001 && Math.abs(layout.boardTransform.c) < 0.001, 'mobile board transform must not rotate the field');
          assert.ok(layout.shipImageTransforms.every(transform => !transform), 'ship icons keep their fixed orientation');
          const actionXs = layout.actions.map(button => button.x);
          const expectedXs = expectedActionXs.get(viewport.width);
          if (expectedXs) assert.deepEqual(actionXs, expectedXs, 'action slots do not move between turns');
          else expectedActionXs.set(viewport.width, actionXs);

          assert.ok(Math.abs(layout.teamShips.white.bottom - layout.boardBox.bottom) <= 1, 'the white ship stays at the bottom edge on every turn');
          assert.ok(Math.abs(layout.teamShips.black.top - layout.boardBox.top) <= 1, 'the black ship stays at the top edge on every turn');
          const expectedShips = expectedShipPositions.get(viewport.width);
          if (expectedShips) assert.deepEqual(layout.teamShips, expectedShips, `the board orientation stays identical on ${turn}'s turn`);
          else expectedShipPositions.set(viewport.width, layout.teamShips);

          await page.locator('#mobileLogToggle').click();
          await page.waitForFunction(() => document.querySelector('#gameScreen').classList.contains('log-expanded'));
          layout = await inspectMobileLayout(page);
          assert.deepEqual(layout.outsideOverlaps, [], `expanded log must not overlap board cells: ${JSON.stringify(layout.outsideOverlaps)}`);
          await page.locator('#mobileLogToggle').click();
          await page.waitForFunction(() => !document.querySelector('#gameScreen').classList.contains('log-expanded'));
          layout = await inspectMobileLayout(page);
          assert.deepEqual(pageErrors, [], `mobile game render should not throw: ${JSON.stringify(pageErrors)}`);

          if (screenshots) await page.screenshot({
            path: resolve(screenshots, `${viewport.width}x${viewport.height}-${turn}-fit.png`),
            animations: 'disabled', scale: 'css',
          });

          const turnBeforeZoom = await page.evaluate(() => JSON.parse(localStorage.getItem('jackal-save')).turn);
          const activeCellBox = await page.locator('#board .cell:has(.pirate.sel)').first().boundingBox();
          const viewportBox = await page.locator('#boardViewport').boundingBox();
          await page.locator('#boardViewport').dblclick({ position: {
            x: activeCellBox.x + activeCellBox.width / 2 - viewportBox.x,
            y: activeCellBox.y + activeCellBox.height / 2 - viewportBox.y,
          } });
          await page.waitForFunction(() => document.querySelector('#zoomLevel').value !== 'Целиком');
          const zoomed = await page.evaluate(() => {
            const viewport = document.querySelector('#boardViewport').getBoundingClientRect();
            const cells = [...document.querySelectorAll('#board .cell')];
            const visibleColumns = new Set(cells.filter(cell => {
              const box = cell.getBoundingClientRect(), center = box.left + box.width / 2;
              return center >= viewport.left && center <= viewport.right;
            }).map(cell => Number(cell.dataset.cell.split(',')[0])));
            const scale = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#board')).transform).a;
            return { visibleColumns: visibleColumns.size, scale, viewportWidth: viewport.width };
          });
          assert.ok(zoomed.scale > 1.5, `double-tap should zoom in: ${JSON.stringify(zoomed)}`);
          assert.ok(zoomed.visibleColumns >= 5 && zoomed.visibleColumns <= 7, `maximum zoom should show about six columns: ${JSON.stringify(zoomed)}`);
          await page.waitForTimeout(320);
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jackal-save')).turn), turnBeforeZoom, 'double-tap must not make a cell move');
          if (screenshots) await page.screenshot({
            path: resolve(screenshots, `${viewport.width}x${viewport.height}-${turn}-zoom.png`),
            animations: 'disabled', scale: 'css',
          });

          const beforePan = await page.locator('#board').evaluate(board => new DOMMatrixReadOnly(getComputedStyle(board).transform).m41);
          const panStart = { x: viewportBox.x + viewportBox.width / 2, y: viewportBox.y + viewportBox.height / 2 };
          await page.mouse.move(panStart.x, panStart.y);
          await page.mouse.down();
          await page.mouse.move(panStart.x + 30, panStart.y + 18, { steps: 3 });
          await page.mouse.up();
          const afterPan = await page.locator('#board').evaluate(board => new DOMMatrixReadOnly(getComputedStyle(board).transform).m41);
          assert.notEqual(afterPan, beforePan, 'a one-pointer drag should pan the zoomed board');
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('jackal-save')).turn), turnBeforeZoom, 'dragging must not make a cell move');

          await page.locator('#zoomFit').click();
          await page.waitForFunction(() => document.querySelector('#zoomLevel').value === 'Целиком');
          layout = await inspectMobileLayout(page);
          assert.ok(layout.cellsInsideViewport, 'fit should restore the full 13×13 board');

          const pinch = await page.evaluate(() => {
            const viewport = document.querySelector('#boardViewport'), rect = viewport.getBoundingClientRect();
            const midX = rect.left + rect.width * 0.48, midY = rect.top + rect.height / 2;
            const startX = midX - 40, secondX = midX + 40;
            const dispatch = (type, pointerId, clientX, clientY) => viewport.dispatchEvent(new PointerEvent(type, {
              bubbles: true, pointerId, pointerType: 'touch', isPrimary: pointerId === 41,
              clientX, clientY, button: 0, buttons: type === 'pointerup' ? 0 : 1,
            }));
            const initial = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#board')).transform);
            const boardPoint = (midX - initial.m41) / initial.a;
            dispatch('pointerdown', 41, startX, midY);
            dispatch('pointerdown', 42, secondX, midY);
            dispatch('pointermove', 42, midX + 90, midY);
            const transformed = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#board')).transform);
            const finalMidX = (startX + midX + 90) / 2;
            const focalError = Math.abs((finalMidX - transformed.m41) / transformed.a - boardPoint);
            dispatch('pointerup', 41, startX, midY);
            dispatch('pointerup', 42, midX + 90, midY);
            return { scale: transformed.a, focalError };
          });
          assert.ok(pinch.scale > 1.4, `two pointers should pinch-zoom: ${JSON.stringify(pinch)}`);
          assert.ok(pinch.focalError < 1, `pinch should keep its midpoint focused: ${JSON.stringify(pinch)}`);
          await page.locator('#zoomFit').click();
          await page.waitForFunction(() => document.querySelector('#zoomLevel').value === 'Целиком');
          const beforeTap = await page.evaluate(() => localStorage.getItem('jackal-save'));
          const stateBeforeTap = G.loadState(beforeTap);
          const selectedPid = Number(await page.locator('#mobilePirates .mobile-pirate.sel').getAttribute('data-pid'));
          const legalMove = G.legalMoves(G.publicState(stateBeforeTap)).find(move => move.type === 'move' && move.pid === selectedPid);
          assert.ok(legalMove, `the selected pirate should have a regular move: pid=${selectedPid}`);
          const targetCell = page.locator(`#board [data-cell="${legalMove.x},${legalMove.y}"]`);
          assert.ok(await targetCell.evaluate(cell => cell.classList.contains('target')), 'the legal destination should be highlighted');
          await targetCell.click();
          await page.waitForFunction(before => localStorage.getItem('jackal-save') !== before, beforeTap);
          const stateAfterTap = G.loadState(await page.evaluate(() => localStorage.getItem('jackal-save')));
          assert.notDeepEqual(stateAfterTap.pirates[selectedPid], stateBeforeTap.pirates[selectedPid], 'a single tap should make the highlighted move');
          assert.deepEqual(pageErrors, [], `mobile game render should not throw: ${JSON.stringify(pageErrors)}`);
        } finally {
          await context.close();
        }
      }
    }

    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await desktop.newPage();
    try {
      await page.addInitScript(({ serialized }) => localStorage.setItem('jackal-save', serialized), { serialized: states.white.serialized });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#continueBtn').waitFor({ state: 'visible' });
      await page.locator('#continueBtn').click();
      await page.waitForFunction(() => document.querySelectorAll('#board .cell').length === 169);
      const desktopLayout = await page.evaluate(() => ({
        mobile: document.querySelector('#gameScreen').classList.contains('mobile-layout'),
        logToggleDisplay: getComputedStyle(document.querySelector('#mobileLogToggle')).display,
        toolbarDisplay: getComputedStyle(document.querySelector('.board-toolbar')).display,
        crewDisplay: getComputedStyle(document.querySelector('#crew')).display,
        mobilePiratesDisplay: getComputedStyle(document.querySelector('#mobilePirates')).display,
      }));
      assert.equal(desktopLayout.mobile, false, 'desktop must keep its normal layout');
      assert.equal(desktopLayout.logToggleDisplay, 'none', 'mobile log toggle stays hidden on desktop');
      assert.notEqual(desktopLayout.toolbarDisplay, 'none', 'desktop zoom toolbar stays available');
      assert.notEqual(desktopLayout.crewDisplay, 'none', 'desktop crew panels stay available');
      assert.equal(desktopLayout.mobilePiratesDisplay, 'none', 'mobile pirate dock stays hidden on desktop');
      const box = await page.locator('#boardViewport').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -120);
      await page.waitForFunction(() => document.querySelector('#zoomLevel').value !== 'Целиком');
      const beforePan = await page.locator('#board').evaluate(board => new DOMMatrixReadOnly(getComputedStyle(board).transform).m41);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 16, { steps: 3 });
      await page.mouse.up();
      const afterPan = await page.locator('#board').evaluate(board => new DOMMatrixReadOnly(getComputedStyle(board).transform).m41);
      assert.notEqual(afterPan, beforePan, 'desktop mouse dragging should pan after wheel zoom');
      await page.locator('#zoomFit').click();
      await page.waitForFunction(() => document.querySelector('#zoomLevel').value === 'Целиком');
    } finally {
      await desktop.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolveServer => server.close(resolveServer));
  }
});
