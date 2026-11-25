import { describe, expect, it } from 'vitest';
import {
  compactBoardFits,
  SEASON_BOARD_LIMITS,
} from '../tools/mechanical-pool';
import { evaluateMechanicalCandidate } from '../tools/build-pool';
import { sampleSeason as sample } from './sample-season';

describe('board limits', () => {
  it('enforces columns and rows without swapping orientation', () => {
    for (const tier of ['advanced', 'expert', 'master'] as const) {
      const { width, height } = SEASON_BOARD_LIMITS[tier];
      expect(
        compactBoardFits(
          { width, terrain: Array(height).fill('.'.repeat(width)) },
          tier
        )
      ).toBe(true);
      expect(
        compactBoardFits(
          {
            width: width + 1,
            terrain: Array(height).fill('.'.repeat(width + 1)),
          },
          tier
        )
      ).toBe(false);
      expect(
        compactBoardFits(
          { width, terrain: Array(height + 1).fill('.'.repeat(width)) },
          tier
        )
      ).toBe(false);
    }
  });
  it('rejects oversized candidates before expensive proof work', () => {
    const source = Object.values(sample.levels)[0]!;
    const raw = {
      ...source,
      terrain: Array.from(
        { length: SEASON_BOARD_LIMITS.advanced.height + 1 },
        (_, index) => source.terrain[index] ?? '.'.repeat(source.width)
      ),
    };
    expect(
      evaluateMechanicalCandidate({
        raw,
        tier: 'advanced',
        construction: 'advanced',
        dependencies: [],
        previous: [],
        seed: 1,
      })
    ).toEqual({ rejections: ['tier board dimensions'] });
  });
});
