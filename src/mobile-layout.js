export const MOBILE_ACTION_IDS = Object.freeze(['ship', 'coin', 'rum', 'revive', 'pass']);

export function boardZoomLimits({
  viewportWidth,
  boardWidth,
  columns = 13,
  maxVisibleColumns = 6,
  minScale = 1,
  maxScale = 3,
} = {}) {
  if (!(viewportWidth > 0) || !(boardWidth > 0) || !(columns > 0) || !(maxVisibleColumns > 0)) {
    return { minScale, maxScale: minScale };
  }
  const scaleForVisibleColumns = viewportWidth / (boardWidth / columns * maxVisibleColumns);
  return { minScale, maxScale: Math.max(minScale, Math.min(maxScale, scaleForVisibleColumns)) };
}

export function clampBoardTransform({
  x = 0,
  y = 0,
  scale = 1,
  minScale = 1,
  maxScale = 3,
  viewportWidth,
  viewportHeight,
  boardWidth,
  boardHeight,
} = {}) {
  const nextScale = Math.max(minScale, Math.min(maxScale, scale));
  const scaledWidth = boardWidth * nextScale, scaledHeight = boardHeight * nextScale;
  return {
    scale: nextScale,
    x: scaledWidth <= viewportWidth ? (viewportWidth - scaledWidth) / 2 : Math.max(viewportWidth - scaledWidth, Math.min(0, x)),
    y: scaledHeight <= viewportHeight ? (viewportHeight - scaledHeight) / 2 : Math.max(viewportHeight - scaledHeight, Math.min(0, y)),
  };
}

export function zoomBoardAtPoint({
  x = 0,
  y = 0,
  scale = 1,
  nextScale = scale,
  focusX = 0,
  focusY = 0,
  minScale = 1,
  maxScale = 3,
  viewportWidth,
  viewportHeight,
  boardWidth,
  boardHeight,
} = {}) {
  const boundedScale = Math.max(minScale, Math.min(maxScale, nextScale));
  const safeScale = Math.max(Number.EPSILON, scale);
  return clampBoardTransform({
    x: focusX - ((focusX - x) / safeScale) * boundedScale,
    y: focusY - ((focusY - y) / safeScale) * boundedScale,
    scale: boundedScale,
    minScale,
    maxScale,
    viewportWidth,
    viewportHeight,
    boardWidth,
    boardHeight,
  });
}

export function boardGestureMoved(startX, startY, x, y, threshold = 8) {
  return Math.hypot(x - startX, y - startY) >= threshold;
}

export function toggleBoardZoom(scale, minScale, maxScale) {
  return scale <= minScale + 0.01 ? maxScale : minScale;
}

export function mobileBoardMetrics({
  viewportWidth,
  viewportHeight,
  columns = 13,
  rows = 13,
  gap = 1,
  maxCellSize = 128,
} = {}) {
  if (!(viewportWidth > 0) || !(viewportHeight > 0) || columns < 1 || rows < 1) {
    return { cellSize: 0, boardWidth: 0, boardHeight: 0, spareHeight: 0 };
  }

  const availableWidth = Math.max(0, viewportWidth - (columns - 1) * gap);
  const availableHeight = Math.max(0, viewportHeight - (rows - 1) * gap);
  const cellSize = Math.min(maxCellSize, availableWidth / columns, availableHeight / rows);
  const boardWidth = cellSize * columns + (columns - 1) * gap;
  const boardHeight = cellSize * rows + (rows - 1) * gap;
  return {
    cellSize,
    boardWidth,
    boardHeight,
    spareHeight: Math.max(0, viewportHeight - boardHeight),
  };
}

// Team 0 starts at the bottom; rotate each other team's ship to the bottom edge.
export function mobileBoardRotation(team = 0) {
  return ((4 - team) % 4 + 4) % 4;
}

// Rotate grid coordinates clockwise without rotating the contents of each cell.
export function orientBoardCell(x, y, turns = 0, size = 13) {
  let col = x, row = y;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [col, row] = [size - 1 - row, col];
  return { x: col, y: row };
}

// Fixed slots stay in place when an action is unavailable.
export function mobileActionSlots(buttons = {}) {
  return MOBILE_ACTION_IDS.map(id => ({
    id,
    disabled: id === 'pass' || buttons[id]?.disabled !== false,
  }));
}
