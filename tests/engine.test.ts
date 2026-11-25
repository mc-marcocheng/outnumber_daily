import { describe, expect, it } from 'vitest';
import rawBankLevel from './fixtures/bank-it.json';
import rawFrozenTutorial from './fixtures/banking-tutorial.json';
import { compileLevel } from '../src/shared/game/level-schema';
import { initialState, interact } from '../src/shared/game/engine';
import type { GameState, Level } from '../src/shared/game/model';

function step(level: Level, state: GameState, id: string): GameState {
  const result = interact(level, state, id);

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return result.state;
}

// Engine rules that do not depend on which campaign level carries them
// run against a frozen fixture (test-audit 2.2): campaign content may
// change freely without rewriting rule tests.
describe('banking tutorial rules (frozen fixture)', () => {
  const level = compileLevel(rawFrozenTutorial);

  it('supports the intended sacrifice solution', () => {
    let state = initialState(level);

    state = step(level, state, 'bank');

    expect(state.value).toBe(4n);
    expect(state.spareLives).toBe(0);
    expect(state.position).toBe(level.startCell);
    expect(state.enemies.get('bank')).toBe(11n);

    state = step(level, state, 'triple');
    expect(state.value).toBe(12n);

    state = step(level, state, 'bank');
    expect(state.value).toBe(23n);
    expect(state.enemies.has('bank')).toBe(false);

    state = step(level, state, 'boss');

    expect(state.phase).toBe('won');
    expect(state.value).toBe(43n);
  });

  it('does not mutate the input state', () => {
    const before = initialState(level);
    const result = interact(level, before, 'bank');

    expect(result.ok).toBe(true);

    expect(before.value).toBe(4n);
    expect(before.spareLives).toBe(1);
    expect(before.enemies.get('bank')).toBe(7n);
    expect(before.usedOps.size).toBe(0);
  });

  it('does not let the obvious collection order win', () => {
    let state = initialState(level);

    state = step(level, state, 'triple');
    state = step(level, state, 'bank');

    expect(state.value).toBe(19n);

    state = step(level, state, 'boss');

    expect(state.phase).toBe('playing');
    expect(state.value).toBe(4n);
    expect(state.spareLives).toBe(0);
    expect(state.enemies.get('boss')).toBe(39n);
  });
});

describe('Bank It (frozen fixture)', () => {
  const level = compileLevel(rawBankLevel);

  it('supports the intended sacrifice solution', () => {
    let state = initialState(level);

    state = step(level, state, 'banka');

    expect(state.value).toBe(5n);
    expect(state.spareLives).toBe(0);
    expect(state.position).toBe(level.startCell);
    expect(state.enemies.get('banka')).toBe(13n);

    state = step(level, state, 'mulm');
    expect(state.value).toBe(15n);

    state = step(level, state, 'banka');
    expect(state.value).toBe(28n);
    expect(state.enemies.has('banka')).toBe(false);

    state = step(level, state, 'bankb');
    expect(state.value).toBe(49n);
    expect(state.enemies.has('bankb')).toBe(false);

    state = step(level, state, 'boss');

    expect(state.phase).toBe('won');
    expect(state.value).toBe(94n);
  });

  it('does not mutate the input state', () => {
    const before = initialState(level);
    const result = interact(level, before, 'banka');

    expect(result.ok).toBe(true);

    expect(before.value).toBe(5n);
    expect(before.spareLives).toBe(1);
    expect(before.enemies.get('banka')).toBe(8n);
    expect(before.usedOps.size).toBe(0);
  });

  it('does not let the obvious collection order win', () => {
    let state = initialState(level);

    // Skipping the deposit: multiply, absorb both banks, attack the
    // boss with 44 — one short of 45. The attack banks (the life was
    // never spent) and grows the boss beyond every remaining line.
    state = step(level, state, 'mulm');
    state = step(level, state, 'banka');
    state = step(level, state, 'bankb');

    expect(state.value).toBe(44n);

    state = step(level, state, 'boss');

    expect(state.phase).toBe('playing');
    expect(state.value).toBe(5n);
    expect(state.spareLives).toBe(0);
    expect(state.enemies.get('boss')).toBe(89n);
  });
});

function tinyLevel(tiles: Level['tiles'], spareLives = 0): Level {
  return {
    id: 'tiny',
    revision: 1,
    title: 'Tiny',
    width: 3,
    terrain: ['...', '...', '...'],
    startCell: 4,
    startValue: 5n,
    spareLives,
    tiles,
  };
}

describe('combat', () => {
  it('wins only when strictly greater; ties lose', () => {
    const equal = tinyLevel([{ id: 'e', kind: 'enemy', cell: 5, value: 5n }]);
    let state = step(equal, initialState(equal), 'e');

    // Tie: enemy absorbs the player value.
    expect(state.enemies.get('e')).toBe(10n);
    expect(state.value).toBe(0n);
    expect(state.phase).toBe('lost');

    const lower = tinyLevel([{ id: 'e', kind: 'enemy', cell: 5, value: 6n }]);
    state = step(lower, initialState(lower), 'e');
    expect(state.enemies.get('e')).toBe(11n);
    expect(state.phase).toBe('lost');

    const higher = tinyLevel([{ id: 'e', kind: 'enemy', cell: 5, value: 4n }]);
    state = step(higher, initialState(higher), 'e');
    expect(state.enemies.has('e')).toBe(false);
    expect(state.value).toBe(9n);
    expect(state.phase).toBe('playing');
  });

  it('respawns with preserved board changes when a life remains', () => {
    const level = tinyLevel(
      [
        { id: 'e', kind: 'enemy', cell: 5, value: 9n },
        { id: 'op', kind: 'add', cell: 3, amount: 2n },
      ],
      1
    );

    let state = step(level, initialState(level), 'op');
    expect(state.value).toBe(7n);
    expect(state.usedOps.has('op')).toBe(true);

    state = step(level, state, 'e');

    // 7 <= 9: the enemy strengthens and the player respawns.
    expect(state.enemies.get('e')).toBe(16n);
    expect(state.spareLives).toBe(0);
    expect(state.position).toBe(level.startCell);
    expect(state.value).toBe(5n);
    // Consumed operations stay consumed.
    expect(state.usedOps.has('op')).toBe(true);
  });

  it('boss obeys ordinary combat rules and wins the attempt', () => {
    const weak = tinyLevel([{ id: 'b', kind: 'boss', cell: 5, value: 3n }]);
    const won = step(weak, initialState(weak), 'b');
    expect(won.phase).toBe('won');
    expect(won.value).toBe(8n);

    const strong = tinyLevel(
      [{ id: 'b', kind: 'boss', cell: 5, value: 7n }],
      1
    );
    const lost = step(strong, initialState(strong), 'b');
    // Same combat rules: the boss strengthens and the player respawns.
    expect(lost.phase).toBe('playing');
    expect(lost.enemies.get('b')).toBe(12n);
    expect(lost.spareLives).toBe(0);
    expect(lost.position).toBe(strong.startCell);
  });

  it('terminal loss leaves the strengthened enemy on the board', () => {
    const level = tinyLevel([{ id: 'e', kind: 'enemy', cell: 5, value: 5n }]);

    const state = step(level, initialState(level), 'e');

    expect(state.phase).toBe('lost');
    expect(state.value).toBe(0n);
    expect(state.enemies.get('e')).toBe(10n);
    expect(state.position).toBe(5);
  });
});

describe('navigation', () => {
  it('walls and active objects block paths; cleared cells open them', () => {
    const level: Level = {
      id: 'nav',
      revision: 1,
      title: 'Nav',
      width: 3,
      terrain: ['...', '#.#', '...'],
      startCell: 0,
      startValue: 5n,
      spareLives: 0,
      tiles: [
        { id: 'gate', kind: 'enemy', cell: 1, value: 2n },
        { id: 'goal', kind: 'boss', cell: 2, value: 20n },
      ],
    };

    let state = initialState(level);

    // The wall row blocks the left column route; the gate blocks the top row.
    expect(interact(level, state, 'goal')).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });

    state = step(level, state, 'gate');

    // The gate cell is now clear, so the boss next door is reachable.
    expect(state.position).toBe(1);
    expect(interact(level, state, 'goal')).toMatchObject({ ok: true });
  });

  it('rejects interactions with inactive objects', () => {
    const level = tinyLevel([{ id: 'op', kind: 'add', cell: 5, amount: 1n }]);

    let state = step(level, initialState(level), 'op');

    expect(interact(level, state, 'op')).toMatchObject({
      ok: false,
      reason: 'inactive-tile',
    });
  });

  it('walks across floor without changing the value', () => {
    const level = tinyLevel([{ id: 'far', kind: 'enemy', cell: 8, value: 1n }]);

    const result = interact(level, initialState(level), 'far');

    expect(result.ok).toBe(true);

    if (result.ok) {
      // Path includes start and destination; length reflects Manhattan walk.
      expect(result.path[0]).toBe(4);
      expect(result.path[result.path.length - 1]).toBe(8);
      expect(result.event.playerBefore).toBe(5n);
      expect(result.event.playerAfter).toBe(6n);
    }
  });

  it('prefers a deterministic route', () => {
    const level = tinyLevel([{ id: 'e', kind: 'enemy', cell: 0, value: 1n }]);

    const first = interact(level, initialState(level), 'e');
    const second = interact(level, initialState(level), 'e');

    expect(first).toEqual(second);
    // Fixed neighbor order (up, right, down, left) routes through cell 1.
    expect(first.ok && first.path).toEqual([4, 1, 0]);
  });
});

describe('strength conservation invariants', () => {
  function totalStrength(state: GameState): bigint {
    let total = state.value;

    for (const value of state.enemies.values()) {
      total += value;
    }

    return total;
  }

  it('absorption preserves total strength', () => {
    const level = tinyLevel([
      { id: 'e', kind: 'enemy', cell: 5, value: 3n },
      { id: 'b', kind: 'boss', cell: 7, value: 50n },
    ]);

    const before = initialState(level);
    const after = step(level, before, 'e');

    expect(totalStrength(before)).toBe(totalStrength(after));
  });

  it('addition increases total strength by the tile amount', () => {
    const level = tinyLevel([
      { id: 'op', kind: 'add', cell: 5, amount: 4n },
      { id: 'b', kind: 'boss', cell: 7, value: 50n },
    ]);

    const before = initialState(level);
    const after = step(level, before, 'op');

    expect(totalStrength(after) - totalStrength(before)).toBe(4n);
  });

  it('multiplication increases total strength by (factor - 1) * playerBefore', () => {
    const level = tinyLevel([
      { id: 'op', kind: 'multiply', cell: 5, amount: 3n },
      { id: 'b', kind: 'boss', cell: 7, value: 50n },
    ]);

    const before = initialState(level);
    const after = step(level, before, 'op');

    expect(totalStrength(after) - totalStrength(before)).toBe(
      2n * before.value
    );
  });

  it('respawning increases total strength by exactly the starting value', () => {
    const level = tinyLevel(
      [
        { id: 'e', kind: 'enemy', cell: 5, value: 9n },
        { id: 'b', kind: 'boss', cell: 7, value: 50n },
      ],
      1
    );

    const before = initialState(level);
    const after = step(level, before, 'e');

    expect(totalStrength(after) - totalStrength(before)).toBe(level.startValue);
  });

  it('terminal loss preserves total strength', () => {
    const level = tinyLevel([
      { id: 'e', kind: 'enemy', cell: 5, value: 9n },
      { id: 'b', kind: 'boss', cell: 7, value: 50n },
    ]);

    const before = initialState(level);
    const after = step(level, before, 'e');

    expect(totalStrength(after)).toBe(totalStrength(before));
  });
});
