export const MOBILE_LAYOUT = Object.freeze({
  topBar: 44,
  collapsedLog: 18,
  dock: 64,
  gap: 2,
  minLogLines: 3,
  maxLogLines: 4,
  logLineHeight: 16,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Height mode keeps all 13 rows visible; fit mode compresses the two outer sea rows.
export function mobileBoardMetrics({
  viewportWidth,
  viewportHeight,
  mode = 'height',
  columns = 13,
  rows = 13,
  gap = MOBILE_LAYOUT.gap,
  topBar = MOBILE_LAYOUT.topBar,
  collapsedLog = MOBILE_LAYOUT.collapsedLog,
  dock = MOBILE_LAYOUT.dock,
  availableHeight = null,
  maxCellSize = 128,
} = {}) {
  if (!(viewportWidth > 0) || !(viewportHeight > 0) || columns < 1 || rows < 1) {
    return { cellSize: 0, boardWidth: 0, boardHeight: 0, logLines: 0 };
  }

  let cellSize;
  let boardHeight;
  if (mode === 'fit') {
    cellSize = Math.min(maxCellSize, (viewportWidth - (columns - 1) * gap) / columns);
    boardHeight = cellSize * (rows - 1) + (rows - 1) * gap;
  } else {
    const boardSpace = Math.max(1, availableHeight ?? viewportHeight - topBar - collapsedLog - dock);
    cellSize = Math.min(maxCellSize, (boardSpace - (rows - 1) * gap) / rows);
    boardHeight = cellSize * rows + (rows - 1) * gap;
  }

  const boardWidth = cellSize * columns + (columns - 1) * gap;
  const spareHeight = Math.max(0, viewportHeight - topBar - dock - boardHeight);
  const logLines = mode === 'fit'
    ? clamp(Math.floor(spareHeight / MOBILE_LAYOUT.logLineHeight), MOBILE_LAYOUT.minLogLines, MOBILE_LAYOUT.maxLogLines)
    : 1;
  return { cellSize, boardWidth, boardHeight, logLines, spareHeight };
}

export function availableMobileActions(buttons = {}) {
  return ['coin', 'revive', 'rum'].filter(id => buttons[id] && !buttons[id].disabled);
}
