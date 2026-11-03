export const MOBILE_ACTION_IDS = Object.freeze(['ship', 'coin', 'rum', 'revive', 'pass']);

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
