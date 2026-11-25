import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  get: vi.fn(),
  exists: vi.fn(),
  hGet: vi.fn(),
  hGetAll: vi.fn(),
  set: vi.fn(),
  expire: vi.fn(),
  hSet: vi.fn(),
  bitfield: vi.fn(),
  watch: vi.fn(),
  multi: vi.fn(),
  exec: vi.fn(),
  discard: vi.fn(),
  del: vi.fn(),
  hKeys: vi.fn(),
  hDel: vi.fn(),
  hScan: vi.fn(),
  zScan: vi.fn(),
  zRem: vi.fn(),
  zScore: vi.fn(),
  zAdd: vi.fn(),
  zRange: vi.fn(),
  zRank: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({ redis }));

import {
  emptyRun,
  getLeaderboard,
  getPostDate,
  getRank,
  getRun,
  getStreak,
  getUser,
  markStreak,
  purgeDay,
  purgeUser,
  recordScore,
  rememberPostDate,
  saveRun,
  saveUser,
} from '../src/server/storage';
import { SEASON_ID } from '../src/shared/season';

const retentionSeconds = 30 * 24 * 60 * 60;
const date = '2026-11-14';
const userId = 't2_player';
const namespace = SEASON_ID;

describe('season storage and retention', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    redis.watch.mockResolvedValue(redis);
    redis.exec.mockResolvedValue([]);
    redis.hKeys.mockResolvedValue([]);
    redis.bitfield.mockResolvedValue([0]);
    redis.hScan.mockResolvedValue({ cursor: 0, fieldValues: [] });
    redis.zScan.mockResolvedValue({ cursor: 0, members: [] });
    redis.zRange.mockResolvedValue([]);
  });

  it('writes permanent runs after permanent cleanup indexes', async () => {
    await saveRun(date, userId, emptyRun());
    expect(redis.set).toHaveBeenCalledExactlyOnceWith(
      `${namespace}:run:${date}:easy:${userId}`,
      JSON.stringify(emptyRun())
    );
    expect(redis.hSet.mock.calls).toEqual([
      [`${namespace}:participants:${date}`, { [userId]: '1' }],
      [`${namespace}:user-dates:${userId}`, { [date]: '1' }],
    ]);
    expect(redis.exec.mock.invocationCallOrder[0]).toBeLessThan(
      redis.set.mock.invocationCallOrder[0]!
    );
    expect(redis.expire).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.hKeys).not.toHaveBeenCalled();
  });

  it('reads current progress and repairs its indexes', async () => {
    const run = { ...emptyRun(), bestSteps: 4, bestActions: 3 };
    redis.get.mockResolvedValue(JSON.stringify(run));
    expect(await getRun(date, userId)).toEqual(run);
    expect(redis.hSet.mock.calls).toEqual([
      [`${namespace}:participants:${date}`, { [userId]: '1' }],
      [`${namespace}:user-dates:${userId}`, { [date]: '1' }],
    ]);
  });

  it('does not write a run if its cleanup indexes abort', async () => {
    redis.exec.mockResolvedValueOnce(null);
    await expect(saveRun(date, userId, emptyRun())).rejects.toThrow('aborted');
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.discard).toHaveBeenCalledOnce();
  });

  it('retains profile keys and expires only the profile, not completions', async () => {
    const profile = { username: 'player', avatarUrl: null, lastSeen: date };
    await saveUser(userId, profile);
    redis.hGetAll.mockResolvedValue({ ...profile, avatarUrl: '' });
    expect(await getUser(userId)).toEqual(profile);
    expect(redis.hGetAll).toHaveBeenCalledWith(`user:${userId}`);
    await markStreak(date, userId);
    expect(redis.expire).toHaveBeenCalledExactlyOnceWith(
      `user:${userId}`,
      retentionSeconds
    );
    expect(redis.hSet).toHaveBeenCalledWith(
      `${namespace}:completions:${userId}`,
      { [date]: '1' }
    );
    expect(redis.hKeys).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('discards a profile transaction if its expiry fails', async () => {
    redis.expire.mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      saveUser(userId, { username: 'player', avatarUrl: null, lastSeen: date })
    ).rejects.toThrow('unavailable');
    expect(redis.discard).toHaveBeenCalledOnce();
    expect(redis.exec).not.toHaveBeenCalled();
  });

  it('does not write completion when its cleanup indexes fail', async () => {
    redis.hSet.mockRejectedValueOnce(new Error('unavailable'));
    await expect(markStreak(date, userId)).rejects.toThrow('unavailable');
    expect(redis.hSet).not.toHaveBeenCalledWith(
      `${namespace}:completions:${userId}`,
      expect.anything()
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  it.each([
    ['2027-01-02', ['2027-01-02', '2027-01-01', '2026-12-31'], '2026-12-30'],
    ['2028-03-01', ['2028-03-01', '2028-02-29'], '2028-02-28'],
  ])(
    'counts completions across calendar boundaries from %s',
    async (end, completed, missing) => {
      redis.hGet.mockImplementation(async (key: string, day: string) =>
        key === `${namespace}:completions:${userId}` && completed.includes(day)
          ? '1'
          : undefined
      );
      expect(await getStreak(end, userId)).toBe(completed.length);
      expect(redis.hGet.mock.calls.map((call) => call[1])).toEqual([
        ...completed,
        missing,
      ]);
      expect(redis.bitfield).not.toHaveBeenCalled();
      expect(redis.hSet).not.toHaveBeenCalled();
    }
  );

  it('keeps leaderboards per difficulty', async () => {
    redis.zScore.mockResolvedValue(undefined);
    redis.zRank.mockResolvedValue(undefined);
    expect(await getRank(date, userId)).toBeNull();
    expect(await getLeaderboard(date)).toEqual([]);
    await recordScore(date, userId, 10);
    expect(redis.zScore).toHaveBeenCalledExactlyOnceWith(
      `${namespace}:lb:${date}:easy`,
      userId
    );
    expect(redis.zRange).toHaveBeenCalledExactlyOnceWith(
      `${namespace}:lb:${date}:easy`,
      0,
      49,
      { by: 'rank' }
    );
    expect(redis.zRank).toHaveBeenCalledExactlyOnceWith(
      `${namespace}:lb:${date}:easy`,
      userId
    );
    expect(redis.zAdd).toHaveBeenCalledExactlyOnceWith(
      `${namespace}:lb:${date}:easy`,
      { member: userId, score: 10 }
    );
    expect(redis.expire).toHaveBeenCalledExactlyOnceWith(
      `${namespace}:lb:${date}:easy`,
      retentionSeconds
    );
    expect(redis.hSet.mock.calls).toEqual([
      [`${namespace}:user-dates:${userId}`, { [date]: '1' }],
      [`${namespace}:participants:${date}`, { [userId]: '1' }],
    ]);
  });

  it('returns rankings with retained user profiles', async () => {
    redis.zRange.mockResolvedValue([{ member: userId, score: 10 }]);
    redis.zRank.mockResolvedValue(0);
    redis.hGetAll.mockResolvedValue({ username: 'player' });
    expect(await getLeaderboard(date)).toEqual([
      { userId, username: 'player', steps: 10, rank: 1 },
    ]);
    expect(await getRank(date, userId)).toBe(1);
    expect(redis.hGetAll).toHaveBeenCalledWith(`user:${userId}`);
  });

  it('keeps only the best score', async () => {
    redis.zScore.mockResolvedValue(5);
    await recordScore(date, userId, 10);
    expect(redis.zAdd).not.toHaveBeenCalled();
    await recordScore(date, userId, 4);
    expect(redis.zAdd).toHaveBeenCalledExactlyOnceWith(
      `${namespace}:lb:${date}:easy`,
      { member: userId, score: 4 }
    );
  });

  it('keeps post-date mappings out of user and day purges', async () => {
    redis.get.mockImplementation(async (key: string) =>
      key === 'post-date:t3_old' ? '2026-11-11' : undefined
    );
    expect(await getPostDate('t3_old')).toBe('2026-11-11');
    await rememberPostDate('t3_new', date);
    expect(redis.set).toHaveBeenCalledExactlyOnceWith(
      'post-date:t3_new',
      date,
      { expiration: expect.any(Date) }
    );
    await purgeDay(date);
    await purgeUser(userId);
    expect(
      redis.del.mock.calls.flat().some((key) => key.startsWith('post-date:'))
    ).toBe(false);
  });

  it('purges every date found in the personal indexes', async () => {
    redis.hKeys.mockImplementation(async (key: string) => {
      if (key === `${namespace}:user-dates:${userId}`) return ['2022-01-01'];
      if (key === `${namespace}:completions:${userId}`) return ['2021-01-01'];
      return [];
    });
    await purgeUser(userId);
    for (const indexedDate of ['2022-01-01', '2021-01-01']) {
      expect(redis.del).toHaveBeenCalledWith(
        ...['easy', 'medium', 'hard'].map(
          (d) => `${namespace}:run:${indexedDate}:${d}:${userId}`
        )
      );
      expect(redis.hDel).toHaveBeenCalledWith(
        `${namespace}:participants:${indexedDate}`,
        [userId]
      );
      for (const d of ['easy', 'medium', 'hard'])
        expect(redis.zRem).toHaveBeenCalledWith(
          `${namespace}:lb:${indexedDate}:${d}`,
          [userId]
        );
    }
    expect(redis.del.mock.calls.at(-1)).toEqual([
      `user:${userId}`,
      `${namespace}:user-dates:${userId}`,
      `${namespace}:completions:${userId}`,
    ]);
  });

  it.each(['participants', 'easy', 'medium', 'hard'])(
    'purges a day found only through %s',
    async (source) => {
      if (source === 'participants') {
        redis.hScan.mockImplementation(async (key: string) => ({
          cursor: 0,
          fieldValues:
            key === `${namespace}:participants:${date}`
              ? [{ field: userId, value: '1' }]
              : [],
        }));
      } else {
        redis.zScan.mockImplementation(async (key: string) => ({
          cursor: 0,
          members:
            key === `${namespace}:lb:${date}:${source}`
              ? [{ member: userId, score: 10 }]
              : [],
        }));
      }
      await purgeDay(date);
      for (const d of ['easy', 'medium', 'hard'])
        expect(redis.del.mock.calls.flat()).toContain(
          `${namespace}:run:${date}:${d}:${userId}`
        );
      for (const kind of ['user-dates', 'completions'])
        expect(redis.hDel).toHaveBeenCalledWith(
          `${namespace}:${kind}:${userId}`,
          [date]
        );
      expect(redis.del.mock.calls.at(-1)).toEqual([
        `${namespace}:participants:${date}`,
        ...['easy', 'medium', 'hard'].map(
          (d) => `${namespace}:lb:${date}:${d}`
        ),
      ]);
    }
  );

  it('scans every participant and leaderboard page for day deletion', async () => {
    redis.hScan.mockImplementation(async (key: string, cursor: number) => ({
      cursor: cursor === 0 ? 1 : 0,
      fieldValues: [{ field: `${key}:${cursor}`, value: '1' }],
    }));
    redis.zScan.mockImplementation(async (key: string, cursor: number) => ({
      cursor: cursor === 0 ? 1 : 0,
      members: [{ member: `${key}:${cursor}`, score: 10 }],
    }));
    await purgeDay(date);
    expect(redis.hScan).toHaveBeenCalledTimes(2);
    expect(redis.zScan).toHaveBeenCalledTimes(6);
  });
});
