import { describe, expect, it } from 'vitest';
import {
  validateContribution,
  requireDailyAssessment,
  type ContributionInput,
} from '../src/shared/contributions';

const input: ContributionInput = {
  difficulty: 'easy',
  level: {
    formatVersion: 1,
    id: 'community-draft',
    revision: 1,
    title: 'Halves first',
    width: 4,
    terrain: ['....'],
    startCell: 0,
    startValue: '10',
    spareLives: 0,
    tiles: [
      { id: 'subtract', kind: 'subtract', cell: 1, amount: '2' },
      { id: 'divide', kind: 'divide', cell: 2, amount: '2' },
      { id: 'boss', kind: 'boss', cell: 3, value: '3' },
    ],
  },
  actions: ['subtract', 'divide', 'boss'],
};

describe('community submission validation', () => {
  it('requires a measured daily difficulty for submission', () => {
    const assessment = {
      status: 'assessed',
      difficulty: 'easy',
      minimumActions: 5,
      meaningfulForks: 2,
    } satisfies Parameters<typeof requireDailyAssessment>[0];
    expect(() => requireDailyAssessment(assessment)).not.toThrow();
    expect(() =>
      requireDailyAssessment({ ...assessment, difficulty: null })
    ).toThrow('below daily criteria');
    expect(() =>
      requireDailyAssessment({
        ...assessment,
        status: 'needs-review',
        difficulty: null,
      })
    ).toThrow('could not measure');
  });
  it('replays the solution and computes raw steps', () => {
    expect(validateContribution(input).steps).toBe(3);
  });
  it('rejects oversized boards and printed numbers', () => {
    expect(() =>
      validateContribution({ ...input, level: { ...input.level, width: 5 } })
    ).toThrow('board limit');
    expect(() =>
      validateContribution({
        ...input,
        level: { ...input.level, startValue: '1000' },
      })
    ).toThrow('below 1,000');
  });
  it('accepts a winning puzzle without subtraction or division', () => {
    const simple: ContributionInput = {
      ...input,
      level: {
        ...input.level,
        tiles: [{ id: 'boss', kind: 'boss', cell: 3, value: '3' }],
      },
      actions: ['boss'],
    };
    expect(validateContribution(simple).steps).toBe(3);
  });
  it('accepts a winning route that skips optional reducing operations', () => {
    expect(
      validateContribution({
        ...input,
        level: { ...input.level, terrain: ['....', '....'] },
        actions: ['boss'],
      }).steps
    ).toBe(5);
  });
  it('requires a valid winning solution', () => {
    expect(() => validateContribution({ ...input, actions: [] })).toThrow(
      'Finish a test run'
    );
    expect(() =>
      validateContribution({ ...input, actions: ['subtract', 'divide'] })
    ).toThrow('Finish a test run');
    expect(() =>
      validateContribution({
        ...input,
        actions: ['divide', 'subtract', 'boss'],
      })
    ).toThrow();
  });
  it('rejects disconnected terrain and overlapping objects', () => {
    expect(() =>
      validateContribution({
        ...input,
        level: { ...input.level, terrain: ['....', '####', '....'] },
      })
    ).toThrow('connect');
    expect(() =>
      validateContribution({
        ...input,
        level: { ...input.level, startCell: 1 },
      })
    ).toThrow('starting cell');
  });
});
