import { describe, expect, it } from 'vitest';
import {
  emptyTotals,
  rankingMember,
  rankingValues,
  sameRank,
  updateTotals,
} from '../src/shared/community-ranking';

describe('community ranking', () => {
  it('orders solved count first, then raw steps, then release delay', () => {
    const totals = [
      { solved: 1, steps: 1, elapsedMs: 1 },
      { solved: 2, steps: 30, elapsedMs: 1 },
      { solved: 2, steps: 20, elapsedMs: 200 },
      { solved: 2, steps: 20, elapsedMs: 100 },
    ];
    const ordered = totals
      .map((value, index) => rankingMember(`t2_${index}`, value))
      .sort()
      .map(rankingValues);
    expect(ordered.map((row) => row.userId)).toEqual([
      't2_3',
      't2_2',
      't2_1',
      't2_0',
    ]);
    expect(sameRank(totals[2]!, totals[3]!)).toBe(false);
    expect(sameRank(totals[2]!, { ...totals[2]! })).toBe(true);
  });
  it('counts a puzzle once and keeps first-solve time on replay', () => {
    const first = updateTotals(emptyTotals, undefined, 20, 100);
    expect(first).toEqual({ solved: 1, steps: 20, elapsedMs: 100 });
    expect(updateTotals(first, 20, 20, 500)).toEqual(first);
    expect(updateTotals(first, 20, 15, 500)).toEqual({
      solved: 1,
      steps: 15,
      elapsedMs: 100,
    });
    expect(updateTotals(first, 20, 25, 500)).toEqual(first);
  });
});
