import { describe, expect, it } from 'vitest';
// Frozen pre-overhaul 031 (§2.2): these tests exercise engine rules
// (order sensitivity, immutability, preview determinism) on a stable
// board, not on shipped campaign content.
import rawOrderMatters from './fixtures/order-matters-v1.json';
import { checkCombat, initialState, interact } from '../src/shared/game/engine';
import { compileLevel } from '../src/shared/game/level-schema';

/**
 * A duel board: start on the right, one window enemy to the left, and
 * a boss sealed behind walls (the schema requires one boss per level;
 * sealing keeps it out of every interaction).
 */
function duel(
  startValue: string,
  opts: { spareLives?: number; enemy?: Record<string, unknown> } = {}
) {
  return compileLevel({
    formatVersion: 1,
    id: 'fixture-duel',
    revision: 1,
    title: 'Duel',
    width: 3,
    terrain: ['.##', '#..'],
    startCell: 5,
    startValue,
    spareLives: opts.spareLives ?? 1,
    tiles: [
      {
        id: 'w',
        kind: 'enemy',
        cell: 4,
        value: '10',
        maxSurplus: '3',
        ...opts.enemy,
      },
      { id: 'boss', kind: 'boss', cell: 0, value: '99' },
    ],
  });
}

function attack(level: ReturnType<typeof duel>) {
  const result = interact(level, initialState(level), 'w');

  if (!result.ok) throw new Error(`attack rejected: ${result.reason}`);

  return result;
}

describe('checkCombat window table (enemy 10, width 3)', () => {
  const tile = {
    id: 'w',
    kind: 'enemy' as const,
    cell: 1,
    value: 10n,
    maxSurplus: 3n,
  };

  it('rejects the boundary value as too small', () => {
    const check = checkCombat(tile, 10n, 10n);

    expect(check.absorbs).toBe(false);
    expect(check.failure).toBe('too-small');
    expect(check.min).toBe(11n);
    expect(check.max).toBe(13n);
  });

  it('absorbs at the lower edge and interior', () => {
    expect(checkCombat(tile, 11n, 10n).absorbs).toBe(true);
    expect(checkCombat(tile, 13n, 10n).absorbs).toBe(true);
  });

  it('rejects past the upper edge as too large', () => {
    const check = checkCombat(tile, 14n, 10n);

    expect(check.absorbs).toBe(false);
    expect(check.failure).toBe('too-large');
  });
});

describe('window enemy interactions', () => {
  it('player 10 against 10 banks: too small', () => {
    const result = attack(duel('10'));

    expect(result.event.kind).toBe('respawn');
    expect(result.event.combatFailure).toBe('too-small');
    expect(result.event.absorbMin).toBe(11n);
    expect(result.event.enemyAfter).toBe(20n);
  });

  it('player 11 absorbs to 21', () => {
    const result = attack(duel('11'));

    expect(result.event.kind).toBe('absorb');
    expect(result.event.playerAfter).toBe(21n);
    expect(result.event.absorbMin).toBe(11n);
    expect(result.event.absorbMax).toBe(13n);
  });

  it('player 13 absorbs to 23', () => {
    const result = attack(duel('13'));

    expect(result.event.kind).toBe('absorb');
    expect(result.event.playerAfter).toBe(23n);
  });

  it('player 14 banks: too large', () => {
    const result = attack(duel('14'));

    expect(result.event.kind).toBe('respawn');
    expect(result.event.combatFailure).toBe('too-large');
  });

  it('banking 14 grows the enemy to 24 and moves the interval to 25–27', () => {
    const level = duel('14');
    const result = attack(level);
    const next = result.state;

    expect(next.enemies.get('w')).toBe(24n);
    expect(next.value).toBe(14n); // startValue
    expect(next.spareLives).toBe(0);

    // The interval moved with the enemy: [25, 27].
    const again = interact(level, next, 'w');

    expect(again.ok).toBe(true);

    if (again.ok) {
      expect(again.event.absorbMin).toBe(25n);
      expect(again.event.absorbMax).toBe(27n);
      // Player 14 is below the moved interval and no lives remain.
      expect(again.event.kind).toBe('loss');
      expect(again.event.combatFailure).toBe('too-small');
    }
  });

  it('an out-of-range attack with no spare life is a loss, not a bank', () => {
    const level = duel('14', { spareLives: 0 });

    const result = attack(level);

    expect(result.event.kind).toBe('loss');
    expect(result.event.combatFailure).toBe('too-large');
    expect(result.state.phase).toBe('lost');
  });

  it('a normal enemy without a window still absorbs any larger value', () => {
    const level = duel('14', {
      spareLives: 0,
      enemy: { maxSurplus: undefined },
    });

    const plain = interact(level, initialState(level), 'w');

    expect(plain.ok).toBe(true);

    if (plain.ok) {
      expect(plain.event.kind).toBe('absorb');
      expect(plain.event.playerAfter).toBe(24n);
      expect(plain.event.absorbMax).toBeUndefined();
    }
  });

  it('a boss still punishes a tie', () => {
    const level = compileLevel({
      formatVersion: 1,
      id: 'fixture-boss-tie',
      revision: 1,
      title: 'Boss Tie',
      width: 2,
      terrain: ['..'],
      startCell: 0,
      startValue: '10',
      spareLives: 0,
      tiles: [{ id: 'w', kind: 'boss', cell: 1, value: '10' }],
    });

    const result = interact(level, initialState(level), 'w');

    expect(result.ok).toBe(true);

    if (result.ok) {
      // Tie: the boss grows and the attempt ends.
      expect(result.event.kind).toBe('loss');
      expect(result.event.enemyAfter).toBe(20n);
      expect(result.state.phase).toBe('lost');
    }
  });
});

describe('set tiles', () => {
  function setBoard() {
    return compileLevel({
      formatVersion: 1,
      id: 'fixture-set',
      revision: 1,
      title: 'Set',
      width: 3,
      terrain: ['...', '##.'],
      startCell: 0,
      startValue: '30',
      spareLives: 1,
      tiles: [
        { id: 's', kind: 'set', cell: 1, amount: '7' },
        { id: 'a', kind: 'add', cell: 2, amount: '3' },
        { id: 'boss', kind: 'boss', cell: 5, value: '99' },
      ],
    });
  }

  it('sets the value exactly and consumes the tile', () => {
    const level = setBoard();
    const state = initialState(level);
    const result = interact(level, state, 's');

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.event.kind).toBe('set');
      expect(result.event.playerBefore).toBe(30n);
      expect(result.event.playerAfter).toBe(7n);
      expect(result.state.value).toBe(7n);
      expect(result.state.usedOps.has('s')).toBe(true);
    }
  });

  it('cannot be reused', () => {
    const level = setBoard();
    const first = interact(level, initialState(level), 's');

    expect(first.ok).toBe(true);

    if (first.ok) {
      const second = interact(level, first.state, 's');

      expect(second.ok).toBe(false);

      if (!second.ok) expect(second.reason).toBe('inactive-tile');
    }
  });

  it('banking respawns without restoring consumed operations', () => {
    const level = compileLevel({
      formatVersion: 1,
      id: 'fixture-bank-ops',
      revision: 1,
      title: 'Bank Ops',
      width: 4,
      terrain: ['....', '#..#'],
      startCell: 0,
      startValue: '5',
      spareLives: 1,
      tiles: [
        { id: 's', kind: 'set', cell: 1, amount: '7' },
        { id: 'a', kind: 'add', cell: 2, amount: '2' },
        { id: 'w', kind: 'enemy', cell: 3, value: '4', maxSurplus: '1' },
        { id: 'boss', kind: 'boss', cell: 5, value: '99' },
      ],
    });

    let state = initialState(level);

    const useSet = interact(level, state, 's');

    expect(useSet.ok).toBe(true);

    if (!useSet.ok) return;
    state = useSet.state;

    const useAdd = interact(level, state, 'a');

    expect(useAdd.ok).toBe(true);

    if (!useAdd.ok) return;
    state = useAdd.state;

    // Player 9 is above the window [5, 5]: attack banks.
    const bank = interact(level, state, 'w');

    expect(bank.ok).toBe(true);

    if (bank.ok) {
      expect(bank.event.kind).toBe('respawn');
      expect(bank.event.combatFailure).toBe('too-large');
      expect(bank.state.usedOps.has('s')).toBe(true);
      expect(bank.state.usedOps.has('a')).toBe(true);
      expect(bank.state.enemies.get('w')).toBe(13n);
      expect(bank.state.value).toBe(5n);
    }
  });
});

describe('preview and commit share one transition', () => {
  it('does not mutate the state passed in', () => {
    const level = compileLevel(rawOrderMatters);
    const state = initialState(level);
    const before = {
      value: state.value,
      position: state.position,
      enemies: [...state.enemies.entries()],
      usedOps: [...state.usedOps],
      phase: state.phase,
    };

    interact(level, state, 'soak');

    expect(state.value).toBe(before.value);
    expect(state.position).toBe(before.position);
    expect([...state.enemies.entries()]).toEqual(before.enemies);
    expect([...state.usedOps]).toEqual(before.usedOps);
    expect(state.phase).toBe(before.phase);
  });

  it('two previews of the same interaction are deeply equal', () => {
    const level = compileLevel(rawOrderMatters);
    const state = initialState(level);

    const first = interact(level, state, 'soak');
    const second = interact(level, state, 'soak');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (first.ok && second.ok) {
      expect(second.event).toEqual(first.event);
      expect(second.state).toEqual(first.state);
    }
  });
});
