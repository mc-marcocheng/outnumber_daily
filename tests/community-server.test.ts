import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: { userId: 't2_author', subredditName: 'outnumber_daily_dev' },
  moderators: vi.fn(),
  username: vi.fn(),
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    hGet: vi.fn(),
    hGetAll: vi.fn(),
    hSet: vi.fn(),
    hDel: vi.fn(),
    zAdd: vi.fn(),
    zRem: vi.fn(),
    zRange: vi.fn(),
    watch: vi.fn(),
  },
}));
vi.mock('@devvit/web/server', () => ({
  context: mocks.context,
  redis: mocks.redis,
  reddit: {
    getCurrentUsername: mocks.username,
    getModerators: () => ({ all: mocks.moderators }),
  },
}));

import { community } from '../src/server/routes/community';
import {
  deleteCommunityDay,
  deleteCommunityRanking,
  getCommunityRanking,
  recordCommunityWin,
} from '../src/server/community-ranking';
import {
  deleteSubmissions,
  listReviewQueue,
  listSubmissions,
  saveSubmission,
  updateSubmission,
} from '../src/server/community-submissions';
import { validateContribution } from '../src/shared/contributions';
import { newDraft } from '../src/client/app/puzzle-editor';
import { SEASON_ID } from '../src/shared/season';

const strings = new Map<string, string>();
const hashes = new Map<string, Record<string, string>>();
const sets = new Map<string, Map<string, number>>();
let aborts = 0;
const input = {
  difficulty: 'easy',
  level: newDraft(),
  actions: ['tile-1', 'tile-2', 'tile-3'],
};
const assessment = {
  status: 'needs-review',
  difficulty: null,
  minimumActions: null,
  meaningfulForks: null,
} satisfies Parameters<typeof saveSubmission>[3];
const date = '2026-11-24';
const released = Date.parse(`${date}T00:00:00Z`);
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  strings.clear();
  hashes.clear();
  sets.clear();
  aborts = 0;
  mocks.context.userId = 't2_author';
  mocks.username.mockResolvedValue('author');
  mocks.moderators.mockResolvedValue([]);
  mocks.redis.get.mockImplementation(async (key: string) => strings.get(key));
  mocks.redis.set.mockImplementation(
    async (key: string, value: string, options?: { nx?: boolean }) => {
      if (options?.nx && strings.has(key)) return undefined;
      strings.set(key, value);
      return 'OK';
    }
  );
  mocks.redis.del.mockImplementation(async (...keys: string[]) => {
    for (const key of keys) {
      strings.delete(key);
      hashes.delete(key);
      sets.delete(key);
    }
  });
  mocks.redis.hGet.mockImplementation(
    async (key: string, field: string) => hashes.get(key)?.[field]
  );
  mocks.redis.hGetAll.mockImplementation(async (key: string) => ({
    ...hashes.get(key),
  }));
  mocks.redis.hSet.mockImplementation(
    async (key: string, fields: Record<string, string>) =>
      hashes.set(key, { ...hashes.get(key), ...fields })
  );
  mocks.redis.hDel.mockImplementation(async (key: string, fields: string[]) => {
    const value = hashes.get(key);
    if (value) for (const field of fields) delete value[field];
  });
  mocks.redis.zAdd.mockImplementation(
    async (key: string, entry: { member: string; score: number }) => {
      const set = sets.get(key) ?? new Map<string, number>();
      set.set(entry.member, entry.score);
      sets.set(key, set);
    }
  );
  mocks.redis.zRem.mockImplementation(
    async (key: string, members: string[]) => {
      for (const member of members) sets.get(key)?.delete(member);
    }
  );
  mocks.redis.zRange.mockImplementation(
    async (key: string, start: number, end: number) =>
      [...(sets.get(key) ?? [])]
        .sort(
          ([left, leftScore], [right, rightScore]) =>
            leftScore - rightScore || (left < right ? -1 : left > right ? 1 : 0)
        )
        .slice(start, end + 1)
        .map(([member, score]) => ({ member, score }))
  );
  mocks.redis.watch.mockImplementation(async () => {
    const writes: (() => Promise<unknown>)[] = [];
    return {
      multi: async () => {},
      discard: async () => {
        writes.length = 0;
      },
      set: async (...args: unknown[]) => {
        writes.push(() => mocks.redis.set(...args));
      },
      del: async (...args: unknown[]) => {
        writes.push(() => mocks.redis.del(...args));
      },
      hSet: async (...args: unknown[]) => {
        writes.push(() => mocks.redis.hSet(...args));
      },
      hDel: async (...args: unknown[]) => {
        writes.push(() => mocks.redis.hDel(...args));
      },
      zAdd: async (...args: unknown[]) => {
        writes.push(() => mocks.redis.zAdd(...args));
      },
      zRem: async (...args: unknown[]) => {
        writes.push(() => mocks.redis.zRem(...args));
      },
      exec: async () => {
        if (aborts > 0) {
          aborts -= 1;
          return null;
        }
        for (const write of writes) await write();
        return [];
      },
    };
  });
});

describe('durable community rankings', () => {
  it('keeps best raw steps, first timestamp and independent date/difficulty totals', async () => {
    await recordCommunityWin(
      date,
      'easy',
      't2_author',
      'author',
      20,
      released + 1000
    );
    await recordCommunityWin(
      date,
      'easy',
      't2_author',
      'author',
      20,
      released + 5000
    );
    await recordCommunityWin(
      date,
      'easy',
      't2_author',
      'author',
      15,
      released + 9000
    );
    await recordCommunityWin(
      date,
      'hard',
      't2_author',
      'author',
      30,
      released + 2000
    );
    expect(await getCommunityRanking('all', 'all')).toEqual([
      {
        userId: 't2_author',
        username: 'author',
        rank: 1,
        solved: 2,
        steps: 45,
        elapsedMs: 3000,
      },
    ]);
    expect(await getCommunityRanking(date, 'easy')).toMatchObject([
      { solved: 1, steps: 15, elapsedMs: 1000 },
    ]);
    expect(
      JSON.parse(
        hashes.get('community-ranking:wins:t2_author')?.[
          `${SEASON_ID}:${date}:easy`
        ] ?? 'null'
      )
    ).toEqual({ steps: 15, firstSolvedAt: released + 1000 });
  });
  it('retries aborted writes without double-counting and shares exact ranks', async () => {
    aborts = 1;
    await recordCommunityWin(
      date,
      'easy',
      't2_author',
      'author',
      3,
      released + 1000
    );
    await recordCommunityWin(
      date,
      'easy',
      't2_other',
      'other',
      3,
      released + 1000
    );
    expect(
      (await getCommunityRanking('all', 'all')).map((row) => [
        row.rank,
        row.solved,
      ])
    ).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });
  it('does not invent historical times or rank archived solves', async () => {
    await recordCommunityWin(
      '2026-11-23',
      'easy',
      't2_author',
      'author',
      3,
      released + 1000
    );
    await recordCommunityWin(
      date,
      'easy',
      't2_author',
      'author',
      3,
      released + 86_400_000
    );
    expect(mocks.redis.watch).not.toHaveBeenCalled();
  });
  it('removes only the requested player from every community board', async () => {
    await recordCommunityWin(
      date,
      'easy',
      't2_author',
      'author',
      3,
      released + 1000
    );
    await recordCommunityWin(
      date,
      'hard',
      't2_other',
      'other',
      5,
      released + 2000
    );
    await deleteCommunityRanking('t2_author');
    expect(await getCommunityRanking('all', 'all')).toMatchObject([
      { userId: 't2_other' },
    ]);
    expect(hashes.has('community-ranking:wins:t2_author')).toBe(false);
  });

  it('removes a deleted date from all totals while retaining other dates', async () => {
    await recordCommunityWin(
      date,
      'easy',
      't2_author',
      'author',
      3,
      released + 1000
    );
    await recordCommunityWin(
      date,
      'hard',
      't2_author',
      'author',
      5,
      released + 2000
    );
    await recordCommunityWin(
      '2026-11-25',
      'medium',
      't2_author',
      'author',
      8,
      released + 86_400_000 + 3000
    );
    await deleteCommunityDay(date);
    expect(await getCommunityRanking(date, 'all')).toEqual([]);
    expect(await getCommunityRanking('all', 'all')).toMatchObject([
      { solved: 1, steps: 8, elapsedMs: 3000 },
    ]);
    await deleteCommunityDay(date);
    expect(await getCommunityRanking('all', 'all')).toMatchObject([
      { solved: 1 },
    ]);
  });
});

describe('private submissions', () => {
  it('deduplicates submissions and isolates each author', async () => {
    const checked = validateContribution(input);
    const first = await saveSubmission(
      't2_author',
      'author',
      checked,
      assessment
    );
    const second = await saveSubmission(
      't2_author',
      'author',
      checked,
      assessment
    );
    expect(first.id).toBe(second.id);
    expect(await listSubmissions('t2_author')).toHaveLength(1);
    expect(await listSubmissions('t2_other')).toEqual([]);
  });
  it('shortlists privately, retains exports and withdraws from both queues', async () => {
    const submission = await saveSubmission(
      't2_author',
      'author',
      validateContribution(input),
      assessment
    );
    await updateSubmission('t2_author', submission.id, 'accepted');
    expect(await listReviewQueue()).toEqual([]);
    expect(await listReviewQueue('accepted')).toMatchObject([
      { status: 'accepted', level: input.level },
    ]);
    await deleteSubmissions('t2_author');
    expect(await listReviewQueue('accepted')).toEqual([]);
    expect(await listSubmissions('t2_author')).toEqual([]);
  });
  it('retains trimmed rejection reasons, moves queues and clears reasons on acceptance', async () => {
    const submission = await saveSubmission(
      't2_author',
      'author',
      validateContribution(input),
      assessment
    );
    await updateSubmission('t2_author', submission.id, 'accepted');
    await updateSubmission(
      't2_author',
      submission.id,
      'rejected',
      '  Add meaningful choices.  '
    );
    expect(await listReviewQueue()).toEqual([]);
    expect(await listReviewQueue('accepted')).toEqual([]);
    expect(await listReviewQueue('rejected')).toMatchObject([
      {
        id: submission.id,
        status: 'rejected',
        declineReason: 'Add meaningful choices.',
      },
    ]);
    expect(await listSubmissions('t2_author')).toMatchObject([
      { declineReason: 'Add meaningful choices.' },
    ]);
    await updateSubmission(
      't2_author',
      submission.id,
      'rejected',
      'Updated reason.'
    );
    expect(await listReviewQueue('rejected')).toHaveLength(1);
    await updateSubmission('t2_author', submission.id, 'accepted');
    expect(await listReviewQueue('rejected')).toEqual([]);
    const [accepted] = await listReviewQueue('accepted');
    expect(accepted).not.toHaveProperty('declineReason');
  });
  it('requires a bounded rejection reason before mutating storage', async () => {
    const submission = await saveSubmission(
      't2_author',
      'author',
      validateContribution(input),
      assessment
    );
    for (const reason of [undefined, '', ' \n ', 'a'.repeat(501)])
      await expect(
        updateSubmission('t2_author', submission.id, 'rejected', reason)
      ).rejects.toThrow();
    expect(await listReviewQueue()).toHaveLength(1);
    expect(await listReviewQueue('rejected')).toEqual([]);
    await updateSubmission(
      't2_author',
      submission.id,
      'rejected',
      ` ${'a'.repeat(500)} `
    );
    expect(await listReviewQueue('rejected')).toMatchObject([
      { declineReason: 'a'.repeat(500) },
    ]);
  });
  it('removes rejected submissions from indexes on withdrawal and account deletion', async () => {
    const submission = await saveSubmission(
      't2_author',
      'author',
      validateContribution(input),
      assessment
    );
    await updateSubmission(
      't2_author',
      submission.id,
      'rejected',
      'Revise the board.'
    );
    await updateSubmission('t2_author', submission.id, 'withdraw');
    expect(await listReviewQueue('rejected')).toEqual([]);
    const replacement = await saveSubmission(
      't2_author',
      'author',
      validateContribution(input),
      assessment
    );
    await updateSubmission(
      't2_author',
      replacement.id,
      'rejected',
      'Revise the board.'
    );
    strings.set('community-submissions:rate:t2_author', '1');
    await deleteSubmissions('t2_author');
    expect(await listSubmissions('t2_author')).toEqual([]);
    expect(await listReviewQueue('rejected')).toEqual([]);
    expect(strings.has('community-submissions:rate:t2_author')).toBe(false);
  });
  it('preserves the prior status and index when a review transaction aborts', async () => {
    const submission = await saveSubmission(
      't2_author',
      'author',
      validateContribution(input),
      assessment
    );
    aborts = 1;
    await expect(
      updateSubmission(
        't2_author',
        submission.id,
        'rejected',
        'Revise choices.'
      )
    ).rejects.toThrow('changed');
    expect(await listReviewQueue()).toEqual([submission]);
    expect(await listReviewQueue('rejected')).toEqual([]);
    expect(await listSubmissions('t2_author')).toEqual([submission]);
  });
  it('does not partially store a submission when its transaction aborts', async () => {
    aborts = 1;
    await expect(
      saveSubmission(
        't2_author',
        'author',
        validateContribution(input),
        assessment
      )
    ).rejects.toThrow('changed');
    expect(await listSubmissions('t2_author')).toEqual([]);
    expect(await listReviewQueue()).toEqual([]);
  });
  it('limits each author to ten submissions', async () => {
    for (let index = 0; index < 10; index += 1)
      await saveSubmission(
        't2_author',
        'author',
        validateContribution({
          ...input,
          level: { ...input.level, title: `Draft ${index}` },
        }),
        assessment
      );
    await expect(
      saveSubmission(
        't2_author',
        'author',
        validateContribution(input),
        assessment
      )
    ).rejects.toThrow('10 submissions');
  });
});

describe('community API authorization and bounds', () => {
  it('lets guests read rankings but not submissions or assessment', async () => {
    mocks.context.userId = '';
    expect(
      (await community.request('/leaderboard?period=all&difficulty=all')).status
    ).toBe(200);
    expect((await community.request('/submissions')).status).toBe(401);
    expect((await community.request('/assess', json(input))).status).toBe(401);
  });
  it('denies review operations without trusted moderator membership', async () => {
    expect((await community.request('/review')).status).toBe(403);
    expect(
      (
        await community.request(
          '/review',
          json({
            authorId: 't2_author',
            id: 'a'.repeat(32),
            status: 'accepted',
          })
        )
      ).status
    ).toBe(403);
    mocks.moderators.mockResolvedValue([{ id: 't2_author' }]);
    expect((await community.request('/review?status=accepted')).status).toBe(
      200
    );
  });
  it('validates moderator rejection reasons, lists rejections and clears reasons on acceptance', async () => {
    mocks.moderators.mockResolvedValue([{ id: 't2_author' }]);
    const submission = await saveSubmission(
      't2_author',
      'author',
      validateContribution(input),
      assessment
    );
    const review = {
      authorId: 't2_author',
      id: submission.id,
      status: 'rejected',
    };
    for (const declineReason of [
      undefined,
      null,
      123,
      '',
      ' \n ',
      'a'.repeat(501),
    ]) {
      const response = await community.request(
        '/review',
        json({ ...review, declineReason })
      );
      expect(response.status).toBe(400);
    }
    expect(await listReviewQueue()).toHaveLength(1);
    expect(
      (
        await community.request(
          '/review',
          json({ ...review, declineReason: '  Revise choices.  ' })
        )
      ).status
    ).toBe(200);
    const rejected = await community.request('/review?status=rejected');
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({
      submissions: [{ declineReason: 'Revise choices.', status: 'rejected' }],
    });
    expect((await community.request('/review?status=unknown')).status).toBe(
      400
    );
    expect(
      (
        await community.request(
          '/review',
          json({
            ...review,
            status: 'accepted',
            declineReason: 'Stale reason.',
          })
        )
      ).status
    ).toBe(200);
    const accepted = await community.request('/review?status=accepted');
    expect(await accepted.json()).toEqual({
      submissions: [{ ...submission, status: 'accepted' }],
    });
    expect(await listReviewQueue('rejected')).toEqual([]);
  });
  it('ignores a forged owner when withdrawing a private submission', async () => {
    const submission = await saveSubmission(
      't2_other',
      'other',
      validateContribution(input),
      assessment
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      (
        await community.request(
          '/withdraw',
          json({ id: submission.id, authorId: 't2_other' })
        )
      ).status
    ).toBe(500);
    expect(await listSubmissions('t2_other')).toHaveLength(1);
    vi.restoreAllMocks();
  });
  it('rate-limits assessment and enforces payload and puzzle constraints', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    expect(
      (await community.request('/assess', json({ ...input, actions: [] })))
        .status
    ).toBe(400);
    expect((await community.request('/assess', json(input))).status).toBe(200);
    const rateCall = mocks.redis.set.mock.calls[0];
    expect(rateCall).toEqual([
      'community-submissions:rate:t2_author',
      '1',
      { nx: true, expiration: new Date(1_030_000) },
    ]);
    now.mockReturnValue(1_029_999);
    for (const path of ['/assess', '/submit']) {
      const response = await community.request(path, json(input));
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({
        message:
          'Wait 30 seconds before requesting another assessment or submission.',
        retryAfterSeconds: 30,
      });
    }
    expect(
      (
        await community.request(
          '/submit',
          json({ padding: 'a'.repeat(25_000) })
        )
      ).status
    ).toBe(413);
    vi.restoreAllMocks();
  });
  it('rejects below-daily submission without saving it', async () => {
    const result = await community.request('/submit', json(input));
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({
      message: expect.stringContaining('below daily criteria'),
    });
    expect(await listSubmissions('t2_author')).toEqual([]);
    const limited = await community.request('/assess', json(input));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ retryAfterSeconds: 30 });
  });
});
