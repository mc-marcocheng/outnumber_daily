import { beforeEach, describe, expect, it, vi } from 'vitest';

const { strings, hashes, scores, redis } = vi.hoisted(() => {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const scores = new Map<string, Map<string, number>>();
  const redis = {
    get: vi.fn(async (key: string) => strings.get(key)),
    set: vi.fn(async (key: string, value: string) => {
      strings.set(key, value);
    }),
    hSet: vi.fn(async (key: string, fields: Record<string, string>) => {
      hashes.set(key, { ...hashes.get(key), ...fields });
    }),
    hGet: vi.fn(async (key: string, field: string) => hashes.get(key)?.[field]),
    zScore: vi.fn(async (key: string, user: string) =>
      scores.get(key)?.get(user)
    ),
    zAdd: vi.fn(
      async (key: string, entry: { member: string; score: number }) => {
        const rows = scores.get(key) ?? new Map<string, number>();
        rows.set(entry.member, entry.score);
        scores.set(key, rows);
      }
    ),
    expire: vi.fn(async () => undefined),
    watch: vi.fn(),
  };
  return { strings, hashes, scores, redis };
});
vi.mock('@devvit/web/server', () => ({ redis }));
import {
  emptyRun,
  getRun,
  getStreak,
  markStreak,
  recordScore,
  saveRun,
} from '../src/server/storage';

beforeEach(() => {
  strings.clear();
  hashes.clear();
  scores.clear();
  redis.watch.mockResolvedValue({
    ...redis,
    multi: vi.fn(),
    exec: vi.fn(async () => []),
    discard: vi.fn(),
  });
});

describe('difficulty-scoped progress', () => {
  it('keeps same-day runs and bests independent', async () => {
    await saveRun(
      '2026-11-21',
      'user',
      { ...emptyRun(), actions: ['a'], bestSteps: 8 },
      'medium'
    );
    expect((await getRun('2026-11-21', 'user', 'medium')).bestSteps).toBe(8);
    expect(await getRun('2026-11-21', 'user', 'easy')).toEqual(emptyRun());
    expect(await getRun('2026-11-21', 'user', 'hard')).toEqual(emptyRun());
  });
  it('keeps independent score keys but counts a day once for streak', async () => {
    await recordScore('2026-11-21', 'user', 8, 'easy');
    await recordScore('2026-11-21', 'user', 20, 'hard');
    expect(scores.get('season-2:lb:2026-11-21:easy')?.get('user')).toBe(8);
    expect(scores.get('season-2:lb:2026-11-21:hard')?.get('user')).toBe(20);
    await markStreak('2026-11-20', 'user');
    await markStreak('2026-11-21', 'user');
    await markStreak('2026-11-21', 'user');
    expect(await getStreak('2026-11-21', 'user')).toBe(2);
  });
});
