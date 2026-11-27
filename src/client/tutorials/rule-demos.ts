import type { Level, Tile } from '../../shared/game/model';

function demo(
  id: string,
  terrain: readonly string[],
  startValue: bigint,
  tiles: readonly Tile[],
  solution: readonly string[],
  startCell = 0,
  spareLives = 0
): { level: Level; solution: readonly string[] } {
  return {
    solution,
    level: {
      id: `tutorial-demo-${id}`,
      revision: 1,
      title: id,
      terrain,
      width: terrain[0]!.length,
      startCell,
      startValue,
      spareLives,
      tiles,
    },
  };
}

const flat = ['....', '....'];
const wide = ['.....', '.....'];
const basics = demo(
  'basics',
  flat,
  2n,
  [
    { id: 'add', kind: 'add', cell: 1, amount: 3n },
    { id: 'enemy', kind: 'enemy', cell: 2, value: 4n },
    { id: 'boss', kind: 'boss', cell: 3, value: 8n },
  ],
  ['add', 'enemy', 'boss']
);
const multiply = demo(
  'multiply',
  flat,
  2n,
  [
    { id: 'add', kind: 'add', cell: 1, amount: 1n },
    { id: 'multiply', kind: 'multiply', cell: 2, amount: 3n },
    { id: 'boss', kind: 'boss', cell: 3, value: 8n },
  ],
  ['add', 'multiply', 'boss']
);

export const ruleDemos: Readonly<Record<string, ReturnType<typeof demo>>> = {
  player: basics,
  addition: basics,
  combat: basics,
  boss: basics,
  multiply,
  undo: multiply,
  walking: demo(
    'walking',
    ['.#..', '.#..', '....'],
    2n,
    [
      { id: 'add', kind: 'add', cell: 3, amount: 3n },
      { id: 'boss', kind: 'boss', cell: 7, value: 4n },
    ],
    ['add', 'boss']
  ),
  window: demo(
    'window',
    flat,
    3n,
    [
      { id: 'add', kind: 'add', cell: 1, amount: 2n },
      { id: 'window', kind: 'enemy', cell: 2, value: 4n, maxSurplus: 2n },
      { id: 'boss', kind: 'boss', cell: 3, value: 8n },
    ],
    ['add', 'window', 'boss']
  ),
  subtract: demo(
    'subtract',
    wide,
    3n,
    [
      { id: 'multiply', kind: 'multiply', cell: 1, amount: 3n },
      { id: 'subtract', kind: 'subtract', cell: 2, amount: 2n },
      { id: 'window', kind: 'enemy', cell: 3, value: 5n, maxSurplus: 2n },
      { id: 'boss', kind: 'boss', cell: 4, value: 11n },
    ],
    ['multiply', 'subtract', 'window', 'boss']
  ),
  set: demo(
    'set',
    flat,
    9n,
    [
      { id: 'set', kind: 'set', cell: 1, amount: 5n },
      { id: 'window', kind: 'enemy', cell: 2, value: 3n, maxSurplus: 2n },
      { id: 'boss', kind: 'boss', cell: 3, value: 7n },
    ],
    ['set', 'window', 'boss']
  ),
  divide: demo(
    'divide',
    wide,
    5n,
    [
      { id: 'add', kind: 'add', cell: 1, amount: 4n },
      { id: 'divide', kind: 'divide', cell: 2, amount: 3n },
      { id: 'window', kind: 'enemy', cell: 3, value: 2n, maxSurplus: 1n },
      { id: 'boss', kind: 'boss', cell: 4, value: 4n },
    ],
    ['add', 'divide', 'window', 'boss']
  ),
  bank: demo(
    'bank',
    flat,
    2n,
    [
      { id: 'add', kind: 'add', cell: 0, amount: 5n },
      { id: 'ledger', kind: 'enemy', cell: 5, value: 3n },
      { id: 'boss', kind: 'boss', cell: 7, value: 11n },
    ],
    ['ledger', 'add', 'ledger', 'boss'],
    4,
    1
  ),
};
