import { describe, expect, it } from 'vitest';
import { leaderboardChannel } from '../src/shared/leaderboard-channel';

describe('leaderboard realtime channel', () => {
  it('uses only characters accepted by the Devvit client SDK', () => {
    expect(leaderboardChannel('2026-11-14')).toBe(
      'outnumber_lb_season_2_2026_11_14_easy'
    );
    expect(leaderboardChannel('2026-11-14')).toMatch(/^[a-zA-Z0-9_]+$/);
  });

  it('keeps daily subscriptions separate', () => {
    expect(leaderboardChannel('2026-11-14', 'easy')).not.toBe(
      leaderboardChannel('2026-11-14', 'hard')
    );
    expect(leaderboardChannel('2026-11-14')).not.toBe(
      leaderboardChannel('2026-11-13')
    );
  });
});
