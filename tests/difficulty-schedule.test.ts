import { describe, expect, it } from 'vitest';
import {
  SEASON_ID,
  DIFFICULTIES,
  levelIdForDate,
  SEASON_ANCHOR,
  type SeasonPools,
} from '../src/shared/season';

const pools: SeasonPools = {
  advanced: ['a0', 'a1'],
  expert: ['e0', 'e1', 'e2'],
  master: ['m0'],
};

describe('daily difficulty scheduling', () => {
  it('offers all three pools on the anchor', () => {
    expect(
      DIFFICULTIES.map((difficulty) =>
        levelIdForDate(SEASON_ANCHOR, pools, SEASON_ANCHOR, difficulty)
      )
    ).toEqual(['a0', 'e0', 'm0']);
    expect(SEASON_ID).toBe('season-2');
  });
  it('advances daily and wraps backward independently', () => {
    expect(levelIdForDate('2026-11-12', pools, SEASON_ANCHOR, 'medium')).toBe(
      'e1'
    );
    expect(levelIdForDate('2026-11-10', pools, SEASON_ANCHOR, 'medium')).toBe(
      'e2'
    );
    expect(levelIdForDate('2026-11-14', pools, SEASON_ANCHOR, 'medium')).toBe(
      'e0'
    );
  });
  it('rejects empty pools and invalid dates', () => {
    expect(() =>
      levelIdForDate(
        SEASON_ANCHOR,
        { ...pools, master: [] },
        SEASON_ANCHOR,
        'hard'
      )
    ).toThrow('Empty season pool');
    expect(() => levelIdForDate('invalid', pools)).toThrow(
      'Invalid schedule date'
    );
  });
});
