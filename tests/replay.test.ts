import { describe, expect, it } from 'vitest';
import rawBanking from './fixtures/banking-tutorial.json';
import { initialState, interact } from '../src/shared/game/engine';
import { compileLevel } from '../src/shared/game/level-schema';
import type { Level } from '../src/shared/game/model';
import {
  commitInteraction,
  createSession,
  restoreSession,
  undo,
} from '../src/shared/game/session';
import { replayWithSteps } from '../src/shared/replay';

const banking = compileLevel(rawBanking);
const winningLine = ['bank', 'triple', 'bank', 'boss'];

function tinyLevel(tiles: Level['tiles'], spareLives = 0): Level {
  return {
    id: 'tiny-steps',
    revision: 1,
    title: 'Tiny Steps',
    width: 3,
    terrain: ['...', '...', '...'],
    startCell: 4,
    startValue: 5n,
    spareLives,
    tiles,
  };
}

describe('replayWithSteps', () => {
  it('replays walking mixed with tile actions and refunds walking on undo', () => {
    const level = tinyLevel([{ id: 'boss', kind: 'boss', cell: 0, value: 1n }]);
    const session = restoreSession(level, ['walk:5', 'walk:2', 'boss']);
    expect(session.present.phase).toBe('won');
    expect(replayWithSteps(level, session.actions).steps).toBe(4);
    const walking = undo(undo(session));
    expect(walking.present.position).toBe(5);
    expect(replayWithSteps(level, walking.actions).steps).toBe(1);
  });

  it('rejects blocked, occupied, invalid and no-op walking without mutating state', () => {
    const level: Level = {
      ...tinyLevel([{ id: 'boss', kind: 'boss', cell: 1, value: 1n }]),
      terrain: ['...', '.#.', '...'],
      startCell: 0,
    };
    for (const action of [
      'walk:2',
      'walk:1',
      'walk:4',
      'walk:0',
      'walk:-1',
      'walk:99',
      'walk:1.5',
      'walk:',
    ]) {
      const state = initialState(level);
      const result = interact(
        { ...level, terrain: ['...', '###', '...'] },
        state,
        action
      );
      expect(result.ok).toBe(false);
      expect(state.position).toBe(0);
    }
  });
  it('sums path.length - 1 over the action log', () => {
    const level = tinyLevel([
      { id: 'near', kind: 'enemy', cell: 5, value: 1n },
      { id: 'far', kind: 'enemy', cell: 0, value: 1n },
    ]);

    // near is adjacent (1 step); from cell 5 the route to cell 0 is
    // three cells (5 -> 2 -> 1 -> 0).
    const { steps, state } = replayWithSteps(level, ['near', 'far']);

    expect(steps).toBe(4);
    expect(state.value).toBe(7n);
  });

  it("counts zero steps for an interaction from the target's own cell", () => {
    const level = tinyLevel([{ id: 'op', kind: 'add', cell: 4, amount: 2n }]);

    expect(replayWithSteps(level, ['op']).steps).toBe(0);
  });

  it('matches an independent per-action path sum on the banking line', () => {
    let state = initialState(banking);
    let expected = 0;

    for (const id of winningLine) {
      const result = interact(banking, state, id);

      expect(result.ok).toBe(true);

      if (result.ok) {
        expected += result.path.length - 1;
        state = result.state;
      }
    }

    const replayed = replayWithSteps(banking, winningLine);

    expect(replayed.steps).toBe(expected);
    expect(replayed.state.phase).toBe('won');
  });

  it('accumulates steps across a respawn', () => {
    const level = tinyLevel(
      [
        { id: 'e', kind: 'enemy', cell: 5, value: 9n },
        { id: 'op', kind: 'add', cell: 3, amount: 10n },
      ],
      1
    );

    // Attack (1 step) banks and respawns at the start; collect the add
    // (1 step, ending on cell 3); attack again from cell 3 (2 steps)
    // and absorb.
    const { steps, state } = replayWithSteps(level, ['e', 'op', 'e']);

    expect(steps).toBe(4);
    expect(state.spareLives).toBe(0);
    expect(state.value).toBe(29n);
    expect(state.enemies.has('e')).toBe(false);
  });

  it("undo refunds exactly the undone action's steps", () => {
    let session = createSession(banking);

    for (const id of winningLine) {
      session = commitInteraction(banking, session, id).session;
    }

    const full = replayWithSteps(banking, session.actions).steps;

    session = undo(session);

    const afterUndo = replayWithSteps(banking, session.actions).steps;
    const lastAction = winningLine[winningLine.length - 1];
    const beforeLast = replayWithSteps(banking, winningLine.slice(0, -1));
    const lastResult = interact(banking, beforeLast.state, lastAction);

    expect(lastResult.ok).toBe(true);

    if (lastResult.ok) {
      expect(full - afterUndo).toBe(lastResult.path.length - 1);
    }
  });

  it('agrees with restoreSession on the final state', () => {
    const replayed = replayWithSteps(banking, winningLine);
    const restored = restoreSession(banking, winningLine);

    expect(replayed.state.value).toBe(restored.present.value);
    expect(replayed.state.phase).toBe(restored.present.phase);
    expect(replayed.state.position).toBe(restored.present.position);
    expect([...replayed.state.enemies.entries()]).toEqual([
      ...restored.present.enemies.entries(),
    ]);
  });

  it('rejects an invalid action log', () => {
    expect(() => replayWithSteps(banking, ['triple', 'nope'])).toThrow();
    expect(() => replayWithSteps(banking, [...winningLine, 'bank'])).toThrow();
  });

  it('returns zero steps and the initial state for an empty log', () => {
    const { steps, state } = replayWithSteps(banking, []);

    expect(steps).toBe(0);
    expect(state.value).toBe(banking.startValue);
    expect(state.position).toBe(banking.startCell);
  });
});
