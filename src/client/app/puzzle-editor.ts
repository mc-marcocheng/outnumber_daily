import type { RawLevel } from '../../shared/game/level-schema';

export type EditorTool =
  | 'floor'
  | 'wall'
  | 'start'
  | 'enemy'
  | 'window'
  | 'boss'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'set';

export function newDraft(): RawLevel {
  return {
    formatVersion: 1,
    id: 'community-draft',
    revision: 1,
    title: 'My puzzle',
    width: 4,
    terrain: ['....', '####', '####', '####', '####'],
    startCell: 0,
    startValue: '10',
    spareLives: 0,
    tiles: [
      { id: 'tile-1', cell: 1, kind: 'subtract', amount: '2' },
      { id: 'tile-2', cell: 2, kind: 'divide', amount: '2' },
      { id: 'tile-3', cell: 3, kind: 'boss', value: '3' },
    ],
  };
}

export function paintCell(
  level: RawLevel,
  cell: number,
  tool: EditorTool,
  value: number,
  surplus: number
): RawLevel {
  if (cell === level.startCell && tool !== 'start') return level;
  const row = Math.floor(cell / level.width);
  const column = cell % level.width;
  const terrain = level.terrain.map((line, index) =>
    index === row
      ? [...line]
          .map((character, offset) =>
            offset === column ? (tool === 'wall' ? '#' : '.') : character
          )
          .join('')
      : line
  );
  const tiles = level.tiles.filter(
    (tile) => tile.cell !== cell && !(tool === 'boss' && tile.kind === 'boss')
  );
  const base = { id: `tile-${cell}`, cell };
  const amount = String(
    Math.max(
      tool === 'multiply' || tool === 'divide' ? 2 : 1,
      Math.min(
        tool === 'multiply' || tool === 'divide' ? 9 : 999,
        Math.floor(value)
      )
    )
  );
  if (tool === 'enemy' || tool === 'boss')
    tiles.push({ ...base, kind: tool, value: amount });
  else if (tool === 'window')
    tiles.push({
      ...base,
      kind: 'enemy',
      value: amount,
      maxSurplus: String(surplus),
    });
  else if (tool !== 'floor' && tool !== 'wall' && tool !== 'start')
    tiles.push({ ...base, kind: tool, amount });
  return {
    ...level,
    terrain,
    tiles,
    startCell: tool === 'start' ? cell : level.startCell,
  };
}

export function resizeDraft(
  level: RawLevel,
  width: number,
  height: number
): RawLevel {
  const remap = (cell: number) =>
    Math.floor(cell / level.width) * width + (cell % level.width);
  const inside = (cell: number) =>
    cell % level.width < width && Math.floor(cell / level.width) < height;
  const startCell = inside(level.startCell) ? remap(level.startCell) : 0;
  const terrain = Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, column) =>
      row * width + column === startCell
        ? '.'
        : (level.terrain[row]?.[column] ?? '.')
    ).join('')
  );
  return {
    ...level,
    width,
    terrain,
    startCell,
    tiles: level.tiles
      .filter((tile) => inside(tile.cell) && remap(tile.cell) !== startCell)
      .map((tile) => ({
        ...tile,
        cell: remap(tile.cell),
        id: `tile-${remap(tile.cell)}`,
      })),
  };
}
