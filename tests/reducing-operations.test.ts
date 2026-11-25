import { describe, expect, it } from 'vitest';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  initialState,
  interact,
  interactAssumingReachable,
} from '../src/shared/game/engine';
import { successors } from '../src/shared/game/transitions';
import { certifySteps } from '../src/shared/game/certify-steps';
import { createSession, commitInteraction } from '../src/shared/game/session';

function board(
  kind: 'subtract' | 'divide',
  amount: string,
  startValue: string
) {
  return compileLevel({
    formatVersion: 1,
    id: 'reducing-operations',
    revision: 1,
    title: 'Arithmetic',
    width: 3,
    terrain: ['...'],
    startCell: 0,
    startValue,
    spareLives: 1,
    tiles: [
      { id: 'operation', cell: 1, kind, amount },
      { id: 'boss', cell: 2, kind: 'boss', value: '1' },
    ],
  });
}

describe('reducing operations', () => {
  it.each([
    ['subtract', '4', '5'],
    ['divide', '5', '5'],
  ] as const)('allows %s to produce one', (kind, amount, value) => {
    const level = board(kind, amount, value);
    const state = initialState(level);
    const result = interact(level, state, 'operation');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.value).toBe(1n);
    expect(result.state.usedOps.has('operation')).toBe(true);
    expect(result.event.kind).toBe(kind);
    expect(result.state.spareLives).toBe(1);
    expect(interactAssumingReachable(level, state, 'operation')).toMatchObject({
      state: result.state,
      event: result.event,
    });
  });

  it.each([
    ['subtract', '5', '5', 'non-positive-result'],
    ['subtract', '6', '5', 'non-positive-result'],
    ['divide', '2', '5', 'non-integer-result'],
  ] as const)(
    'blocks invalid %s without mutation',
    (kind, amount, value, reason) => {
      const level = board(kind, amount, value);
      const state = initialState(level);
      expect(interact(level, state, 'operation')).toEqual({
        ok: false,
        reason,
      });
      expect(interactAssumingReachable(level, state, 'operation')).toEqual({
        ok: false,
        reason,
      });
      expect(state.value).toBe(5n);
      expect(state.position).toBe(0);
      expect(state.spareLives).toBe(1);
      expect(state.usedOps.size).toBe(0);
      expect(successors(level, state)).toEqual([]);
      const session = createSession(level);
      const committed = commitInteraction(level, session, 'operation');
      expect(committed.result).toEqual({ ok: false, reason });
      expect(committed.session).toEqual(session);
    }
  );

  it('rejects zero and unit divisors in content', () => {
    expect(() => board('divide', '0', '5')).toThrow();
    expect(() => board('divide', '1', '5')).toThrow();
  });

  it.each(['subtract', 'divide'] as const)('certifies a %s route', (kind) => {
    const level = board(kind, '2', '6');
    expect(certifySteps(level)).toMatchObject({
      status: 'certified',
      minimumSteps: 2,
      stepOptimalSolution: ['operation', 'boss'],
    });
  });
});
