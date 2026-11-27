import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: { userId: 't2_player', postId: 't3_puzzle' },
  getRun: vi.fn(),
  getPostDate: vi.fn(),
  getPostById: vi.fn(),
  submitComment: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  records: new Map<string, string>(),
}));

vi.mock('@devvit/web/server', () => ({
  context: mocks.context,
  reddit: {
    submitComment: mocks.submitComment,
    getPostById: mocks.getPostById,
  },
  redis: { get: mocks.get, set: mocks.set },
}));
vi.mock('../src/server/storage', () => ({
  getRun: mocks.getRun,
  getPostDate: mocks.getPostDate,
}));
vi.mock('../src/server/daily', () => ({
  utcDate: () => '2026-11-14',
  getDaily: () => ({
    level: {
      formatVersion: 1,
      id: 'share',
      revision: 1,
      title: 'Share',
      width: 3,
      terrain: ['...'],
      startCell: 0,
      startValue: '3',
      spareLives: 0,
      tiles: [{ id: 'boss', kind: 'boss', cell: 2, value: '2' }],
    },
  }),
}));

import { api } from '../src/server/routes/api';

const requestId = 'c144a64a-6ea3-4f13-aee3-662bd0fb6dfa';
async function share(
  overrides: Record<string, unknown> = {}
): Promise<Response> {
  return api.request('/share-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '  **That was close!**  ',
      difficulty: 'easy',
      requestId,
      ...overrides,
    }),
  });
}

describe('explicit result comments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.records.clear();
    mocks.context.userId = 't2_player';
    mocks.context.postId = 't3_puzzle';
    mocks.getPostDate.mockResolvedValue('2026-11-14');
    mocks.getRun.mockResolvedValue({
      actions: ['boss'],
      completed: true,
      steps: 999,
      bestSteps: 1,
    });
    mocks.submitComment.mockResolvedValue({ id: 't1_result' });
    mocks.get.mockImplementation(async (key: string) => mocks.records.get(key));
    mocks.set.mockImplementation(
      async (key: string, value: string, options?: { nx?: boolean }) => {
        if (options?.nx && mocks.records.has(key)) return '';
        mocks.records.set(key, value);
        return 'OK';
      }
    );
  });

  it('requires sign-in before accessing storage or Reddit', async () => {
    mocks.context.userId = '';
    expect((await share()).status).toBe(401);
    expect(mocks.getPostDate).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it.each(['', 't1_comment'])(
    'requires a current post (%s)',
    async (postId) => {
      mocks.context.postId = postId;
      expect((await share()).status).toBe(400);
      expect(mocks.submitComment).not.toHaveBeenCalled();
    }
  );

  it.each(['', ' \n\t ', 'x'.repeat(2001), null])(
    'rejects invalid custom messages',
    async (message) => {
      expect((await share({ message })).status).toBe(400);
      expect(mocks.submitComment).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, 'not-a-uuid'])(
    'requires a UUID request ID',
    async (invalidId) => {
      expect((await share({ requestId: invalidId })).status).toBe(400);
      expect(mocks.submitComment).not.toHaveBeenCalled();
    }
  );

  it('rejects malformed JSON', async () => {
    const response = await api.request('/share-result', {
      method: 'POST',
      body: '{',
    });
    expect(response.status).toBe(400);
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it('rejects an archive date unrelated to the post', async () => {
    expect((await share({ date: '2026-11-13' })).status).toBe(400);
    expect(mocks.getRun).not.toHaveBeenCalled();
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it.each(['2026-11-15', '2026-11-14) forged', 'invalid'])(
    'rejects invalid dates (%s)',
    async (date) => {
      expect((await share({ date })).status).toBe(400);
      expect(mocks.submitComment).not.toHaveBeenCalled();
    }
  );

  it('requires the current saved run to be completed', async () => {
    mocks.getRun.mockResolvedValue({ actions: ['boss'], completed: false });
    expect((await share()).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it('requires a winning replay even with a saved completed flag', async () => {
    mocks.getRun.mockResolvedValue({ actions: [], completed: true });
    expect((await share()).status).toBe(400);
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it('handles a corrupt replay without leaking errors or posting', async () => {
    mocks.getRun.mockResolvedValue({ actions: ['missing'], completed: true });
    expect((await share()).status).toBe(502);
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it('posts top-level as USER with Markdown and replayed steps, ignoring forged fields', async () => {
    const response = await share({
      steps: 0,
      completed: true,
      postId: 't3_other',
      runAs: 'APP',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: 'share-result',
      commentId: 't1_result',
    });
    expect(mocks.getRun).toHaveBeenCalledWith(
      '2026-11-14',
      't2_player',
      'easy'
    );
    expect(mocks.submitComment).toHaveBeenCalledExactlyOnceWith({
      id: 't3_puzzle',
      text: '**That was close!**\n\n^(Outnumber Daily · 2026-11-14 · easy · 2 steps)',
      runAs: 'USER',
    });
    expect(mocks.set).toHaveBeenCalledWith(
      `share-result:season-2:t3_puzzle:2026-11-14:easy:t2_player:${requestId}`,
      JSON.stringify({ pending: true }),
      { nx: true, expiration: expect.any(Date) }
    );
  });

  it('accepts a trimmed message of 2000 characters', async () => {
    expect((await share({ message: ` ${'x'.repeat(2000)} ` })).status).toBe(
      200
    );
  });

  it('uses the post metadata date when the mapping is missing', async () => {
    mocks.getPostDate.mockResolvedValue(undefined);
    mocks.getPostById.mockResolvedValue({
      getPostData: async () => ({ date: '2026-11-13' }),
    });
    expect((await share({ date: '2026-11-13' })).status).toBe(200);
    expect(mocks.getPostById).toHaveBeenCalledWith('t3_puzzle');
    expect(mocks.getRun).toHaveBeenCalledWith(
      '2026-11-13',
      't2_player',
      'easy'
    );
  });

  it('returns a cached success without submitting again', async () => {
    await share();
    const response = await share({ requestId: requestId.toUpperCase() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: 'share-result',
      commentId: 't1_result',
    });
    expect(mocks.submitComment).toHaveBeenCalledOnce();
  });

  it('blocks an overlapping request that loses the NX lock', async () => {
    const responses = await Promise.all([share(), share()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(mocks.submitComment).toHaveBeenCalledOnce();
  });

  it('keeps the lock on a Reddit failure with an unknown outcome', async () => {
    mocks.submitComment.mockRejectedValue(new Error('secret Reddit details'));
    const response = await share();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      status: 'error',
      message:
        'Could not confirm your comment. Check the post before trying again.',
    });
    expect((await share()).status).toBe(409);
    expect(mocks.submitComment).toHaveBeenCalledOnce();
  });

  it('does not post if Redis cannot acquire a lock', async () => {
    mocks.set.mockRejectedValue(new Error('storage details'));
    expect((await share()).status).toBe(502);
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it('does not repost if caching fails after Reddit accepts the comment', async () => {
    mocks.set
      .mockImplementationOnce(async (key: string, value: string) => {
        mocks.records.set(key, value);
        return 'OK';
      })
      .mockRejectedValueOnce(new Error('cache failed'));
    expect((await share()).status).toBe(502);
    expect((await share()).status).toBe(409);
    expect(mocks.submitComment).toHaveBeenCalledOnce();
  });
});
