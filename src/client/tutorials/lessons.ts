import type { Level, Tile } from '../../shared/game/model';

export type Lesson = {
  id: string;
  title: string;
  description: string;
  level: Level;
  solution: readonly string[];
};

function lesson(
  id: string,
  title: string,
  description: string,
  startValue: bigint,
  tiles: readonly Tile[],
  solution: readonly string[],
  spareLives = 0,
  terrain: readonly string[] = ['.....', '.....', '.....']
): Lesson {
  return {
    id,
    title,
    description,
    solution,
    level: {
      id: `tutorial-${id}`,
      revision: 1,
      title,
      width: 5,
      terrain,
      startCell: 5,
      startValue,
      spareLives,
      tiles,
    },
  };
}

const practiceLessons: readonly Lesson[] = [
  lesson(
    'walking',
    'Find a path',
    'Tap an empty cell to walk. Objects block paths until used. Every square travelled costs one step; Undo refunds it.',
    4n,
    [
      { id: 'add', kind: 'add', cell: 6, amount: 2n },
      { id: 'boss', kind: 'boss', cell: 9, value: 5n },
    ],
    ['walk:0', 'add', 'boss']
  ),
  lesson(
    'addition',
    'A little stronger',
    'Green + tiles add to your number, once. Become strictly larger than the boss to win.',
    3n,
    [
      { id: 'add', kind: 'add', cell: 7, amount: 4n },
      { id: 'boss', kind: 'boss', cell: 9, value: 6n },
    ],
    ['add', 'boss']
  ),
  lesson(
    'multiply',
    'Order matters',
    "Blue tiles multiply your number. Add first, then multiply to reach the boss's number plus one.",
    2n,
    [
      { id: 'multiply', kind: 'multiply', cell: 6, amount: 3n },
      { id: 'add', kind: 'add', cell: 8, amount: 3n },
      { id: 'boss', kind: 'boss', cell: 9, value: 14n },
    ],
    ['add', 'multiply', 'boss']
  ),
  lesson(
    'subtract',
    'Subtract to fit',
    'A − tile subtracts once. The result must be at least 1. Try −4 first: it stays on the board and costs no steps. Take +8, then −4 to reach 7 and absorb the window enemy.',
    3n,
    [
      { id: 'subtract', kind: 'subtract', cell: 6, amount: 4n },
      { id: 'add', kind: 'add', cell: 7, amount: 8n },
      { id: 'window', kind: 'enemy', cell: 8, value: 5n, maxSurplus: 2n },
      { id: 'boss', kind: 'boss', cell: 9, value: 11n },
    ],
    ['add', 'subtract', 'window', 'boss'],
    0,
    ['....#', '.....', '....#']
  ),
  lesson(
    'divide',
    'Divide exactly',
    'A ÷ tile divides once by an integer of at least 2. The result must be a whole number. Try ÷2 first: 5 cannot divide exactly, so nothing changes. Take +9, then ÷2 to reach 7 and absorb the window enemy.',
    5n,
    [
      { id: 'divide', kind: 'divide', cell: 6, amount: 2n },
      { id: 'add', kind: 'add', cell: 7, amount: 9n },
      { id: 'window', kind: 'enemy', cell: 8, value: 5n, maxSurplus: 2n },
      { id: 'boss', kind: 'boss', cell: 9, value: 11n },
    ],
    ['add', 'divide', 'window', 'boss'],
    0,
    ['....#', '.....', '....#']
  ),
  lesson(
    'set',
    'A fresh number',
    "An = tile replaces your number with the value shown. Use =6 to enter the window enemy's range.",
    30n,
    [
      { id: 'set', kind: 'set', cell: 6, amount: 6n },
      { id: 'window', kind: 'enemy', cell: 8, value: 5n, maxSurplus: 2n },
      { id: 'boss', kind: 'boss', cell: 9, value: 10n },
    ],
    ['set', 'window', 'boss'],
    0,
    ['....#', '.....', '....#']
  ),
  lesson(
    'window',
    'Within the window',
    'The badge shows the values that can absorb this enemy. Values below or above that range lose. Aim for 7 here.',
    3n,
    [
      { id: 'trap', kind: 'multiply', cell: 6, amount: 4n },
      { id: 'add', kind: 'add', cell: 7, amount: 4n },
      { id: 'window', kind: 'enemy', cell: 8, value: 5n, maxSurplus: 2n },
      { id: 'boss', kind: 'boss', cell: 9, value: 11n },
    ],
    ['add', 'window', 'boss'],
    0,
    ['....#', '.....', '....#']
  ),
  lesson(
    'bank',
    'Bank a life',
    'The window accepts only 6 or 7, but +6 makes you 9. Bank your starting 3 into the window enemy first: it grows to 8 and now accepts 9 or 10. Return home, take +6, and absorb it.',
    3n,
    [
      { id: 'window', kind: 'enemy', cell: 8, value: 5n, maxSurplus: 2n },
      { id: 'add', kind: 'add', cell: 6, amount: 6n },
      { id: 'boss', kind: 'boss', cell: 9, value: 16n },
    ],
    ['window', 'add', 'window', 'boss'],
    1
  ),
  lesson(
    'undo',
    'Save the multiplier',
    'The multiplier works once. Grow by absorbing the small enemy before using it. If you multiply too early, Undo restores the tile and refunds your steps.',
    4n,
    [
      { id: 'multiply', kind: 'multiply', cell: 6, amount: 2n },
      { id: 'enemy', kind: 'enemy', cell: 8, value: 3n },
      { id: 'boss', kind: 'boss', cell: 9, value: 13n },
    ],
    ['enemy', 'multiply', 'boss']
  ),
  {
    id: 'blocked',
    title: 'Clear the corridor',
    description:
      'Try the boss or empty far-right cell first: the + tile blocks the only route. Use it to open the corridor. A blocked click costs nothing.',
    solution: ['add', 'boss'],
    level: {
      id: 'tutorial-blocked',
      revision: 1,
      title: 'Clear the corridor',
      width: 5,
      terrain: ['.....'],
      startCell: 0,
      startValue: 3n,
      spareLives: 0,
      tiles: [
        { id: 'add', kind: 'add', cell: 1, amount: 4n },
        { id: 'boss', kind: 'boss', cell: 3, value: 6n },
      ],
    },
  },
];

export const lessons: readonly Lesson[] = [
  'walking',
  'addition',
  'multiply',
  'undo',
  'window',
  'subtract',
  'divide',
  'set',
  'bank',
  'blocked',
].map((id) => {
  const selected = practiceLessons.find((item) => item.id === id);
  if (!selected) throw new Error(`Missing practice lesson ${id}`);
  return selected;
});

export const guidedLevel: Level = {
  id: 'tutorial-guided',
  revision: 1,
  title: 'The first run',
  width: 7,
  terrain: ['.......', '.######', '.......'],
  startCell: 0,
  startValue: 3n,
  spareLives: 1,
  tiles: [
    { id: 'add', kind: 'add', cell: 1, amount: 2n },
    { id: 'multiply', kind: 'multiply', cell: 2, amount: 2n },
    { id: 'set', kind: 'set', cell: 3, amount: 4n },
    { id: 'enemy', kind: 'enemy', cell: 4, value: 3n },
    { id: 'window', kind: 'enemy', cell: 5, value: 5n, maxSurplus: 3n },
    { id: 'boss', kind: 'boss', cell: 6, value: 20n },
    { id: 'reserve', kind: 'add', cell: 14, amount: 40n },
  ],
};

export const guidedActions = [
  'walk:7',
  'add',
  'multiply',
  'set',
  'enemy',
  'window',
  'boss',
  'reserve',
  'boss',
];

export const guidedPages = [
  {
    title: 'You',
    focusCells: [0],
    text: 'The portrait is you. Tap empty floor to walk; tap an object to walk to it and interact. Only travelled squares count as steps.',
    cell: 0,
  },
  {
    title: 'Walk around objects',
    focusCells: [7, 1],
    text: 'One square walked, one step. The + tile blocks the corridor to the right; objects cannot be crossed until consumed.',
    cell: 7,
  },
  {
    title: 'Add',
    focusCells: [1, 2],
    text: '+2 turns 3 into 5. Arithmetic tiles disappear after one use, leaving open floor.',
    cell: 1,
  },
  {
    title: 'Multiply',
    focusCells: [2, 3],
    text: 'Multiply by 2: 5 becomes 10. Changing the order of arithmetic changes the result.',
    cell: 2,
  },
  {
    title: 'Set',
    focusCells: [3, 5],
    text: '=4 replaces 10 with 4. A smaller number can help with narrow absorption windows.',
    cell: 3,
  },
  {
    title: 'Absorb',
    focusCells: [4, 5],
    text: '4 is strictly larger than 3, so you absorb the enemy and become 7. A tie would lose.',
    cell: 4,
  },
  {
    title: 'Hit the window',
    focusCells: [5, 6],
    text: 'This enemy accepts player values 6 to 8. Your 7 is in range: absorb 5 and become 12. Too large also loses.',
    cell: 5,
  },
  {
    title: 'Bank and respawn',
    focusCells: [0, 6, 14],
    text: '12 cannot beat 20. The boss grows to 32, a heart is spent, and you return home as 3. Other changes remain. With no hearts, a defeat ends the run.',
    cell: 6,
  },
  {
    title: 'Build again',
    focusCells: [14, 6],
    text: 'The reserve +40 makes you 43. The corridor remains clear and the boss still holds your deposited 12.',
    cell: 14,
  },
  {
    title: 'Outnumber the boss',
    focusCells: [6],
    text: '43 beats 32: you win. Undo restores a turn and refunds its steps. Restart resets the puzzle. Daily hints give clues from the starting position. Try the practice puzzles next.',
    cell: 6,
  },
];
