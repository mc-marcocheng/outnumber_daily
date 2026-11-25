import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: { userId: 't2_player' },
  getPostDate: vi.fn(),
  purgeDay: vi.fn(),
  purgeUser: vi.fn(),
  getPostById: vi.fn(),
  del: vi.fn(),
  createDailyPost: vi.fn(),
  getCurrentUsername: vi.fn(),
  moderators: vi.fn(),
  submitCustomPost: vi.fn(),
  set: vi.fn(),
  deleteCommunityRanking: vi.fn(),
  deleteSubmissions: vi.fn(),
  deleteCommunityDay: vi.fn(),
  get: vi.fn(),
}));
vi.mock('@devvit/web/server', () => ({
  context: mocks.context,
  reddit: {
    getPostById: mocks.getPostById,
    submitCustomPost: mocks.submitCustomPost,
    getCurrentUsername: mocks.getCurrentUsername,
    getModerators: () => ({ all: mocks.moderators }),
  },
  redis: { del: mocks.del, get: mocks.get, set: mocks.set },
}));
vi.mock('../src/server/storage', () => ({
  getPostDate: mocks.getPostDate,
  purgeDay: mocks.purgeDay,
  purgeUser: mocks.purgeUser,
}));
vi.mock('../src/server/core/post', () => ({
  createDailyPost: mocks.createDailyPost,
}));
vi.mock('../src/server/community-ranking', () => ({
  deleteCommunityRanking: mocks.deleteCommunityRanking,
  deleteCommunityDay: mocks.deleteCommunityDay,
}));
vi.mock('../src/server/community-submissions', () => ({
  deleteSubmissions: mocks.deleteSubmissions,
}));

import { triggers } from '../src/server/routes/triggers';
import { menu } from '../src/server/routes/menu';

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('deletion routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.userId = 't2_player';
  });

  it('purges the mapped post date without relying on payload postData', async () => {
    mocks.getPostDate.mockResolvedValue('2026-11-14');
    const response = await triggers.request(
      '/on-post-delete',
      jsonRequest({ postId: 't3_post' })
    );
    expect(response.status).toBe(200);
    expect(mocks.purgeDay).toHaveBeenCalledWith('2026-11-14');
    expect(mocks.deleteCommunityDay).toHaveBeenCalledWith('2026-11-14');
    expect(mocks.del).toHaveBeenCalledWith('post-date:t3_post');
    expect(mocks.getPostById).not.toHaveBeenCalled();
  });

  it('fetches post data for a post with no stored date', async () => {
    mocks.getPostById.mockResolvedValue({
      getPostData: async () => ({ date: '2026-11-13' }),
    });
    const response = await triggers.request(
      '/on-post-delete',
      jsonRequest({ postId: 't3_nodate' })
    );
    expect(response.status).toBe(200);
    expect(mocks.purgeDay).toHaveBeenCalledWith('2026-11-13');
  });

  it('clears the deleted hub link without deleting daily progress', async () => {
    mocks.get.mockResolvedValue('t3_hub');
    expect(
      (
        await triggers.request(
          '/on-post-delete',
          jsonRequest({ postId: 't3_hub' })
        )
      ).status
    ).toBe(200);
    expect(mocks.del).toHaveBeenCalledWith('community-hub-post');
    expect(mocks.purgeDay).not.toHaveBeenCalled();
    expect(mocks.deleteCommunityDay).not.toHaveBeenCalled();
  });

  it('leaves unrelated posts alone', async () => {
    mocks.getPostById.mockResolvedValue({ getPostData: async () => undefined });
    expect(
      (
        await triggers.request(
          '/on-post-delete',
          jsonRequest({ postId: 't3_other' })
        )
      ).status
    ).toBe(200);
    expect(mocks.purgeDay).not.toHaveBeenCalled();
  });

  it('rejects malformed deletion payloads', async () => {
    expect(
      (
        await triggers.request(
          '/on-post-delete',
          jsonRequest({ postData: { date: '2026-11-14' } })
        )
      ).status
    ).toBe(400);
    expect(mocks.purgeDay).not.toHaveBeenCalled();
  });

  it('does not acknowledge failed cleanup as success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getPostDate.mockResolvedValue('2026-11-14');
    mocks.purgeDay.mockRejectedValue(new Error('storage unavailable'));
    expect(
      (
        await triggers.request(
          '/on-post-delete',
          jsonRequest({ postId: 't3_post' })
        )
      ).status
    ).toBe(500);
    expect(mocks.del).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('requires confirmation and uses trusted user context', async () => {
    const prompt = await menu.request('/delete-my-data', jsonRequest({}));
    expect(await prompt.json()).toMatchObject({
      showForm: { name: 'deleteMyData' },
    });
    await menu.request(
      '/delete-my-data-confirm',
      jsonRequest({ confirm: false })
    );
    expect(mocks.purgeUser).not.toHaveBeenCalled();
    await menu.request(
      '/delete-my-data-confirm',
      jsonRequest({ confirm: true, userId: 't2_someoneelse' })
    );
    expect(mocks.purgeUser).toHaveBeenCalledExactlyOnceWith('t2_player');
    expect(mocks.deleteCommunityRanking).toHaveBeenCalledExactlyOnceWith(
      't2_player'
    );
    expect(mocks.deleteSubmissions).toHaveBeenCalledExactlyOnceWith(
      't2_player'
    );
  });

  it('rejects logged-out deletion requests', async () => {
    mocks.context.userId = '';
    expect(
      (
        await menu.request(
          '/delete-my-data-confirm',
          jsonRequest({ confirm: true })
        )
      ).status
    ).toBe(401);
    expect(mocks.purgeUser).not.toHaveBeenCalled();
  });

  it('validates dated post creation before calling Reddit', async () => {
    expect(
      (
        await menu.request(
          '/post-create-dated-confirm',
          jsonRequest({ date: '2026-02-30' })
        )
      ).status
    ).toBe(400);
    expect(mocks.createDailyPost).not.toHaveBeenCalled();
    mocks.getCurrentUsername.mockResolvedValue('player');
    mocks.moderators.mockResolvedValue([{ id: 't2_player' }]);
    mocks.createDailyPost.mockResolvedValue({ id: 't3_dated' });
    expect(
      (
        await menu.request(
          '/post-create-dated-confirm',
          jsonRequest({ date: '2026-11-10' })
        )
      ).status
    ).toBe(200);
    expect(mocks.createDailyPost).toHaveBeenCalledExactlyOnceWith('2026-11-10');
  });

  it('denies dated post creation to non-moderators', async () => {
    mocks.getCurrentUsername.mockResolvedValue('player');
    mocks.moderators.mockResolvedValue([]);
    expect(
      (await menu.request('/post-create-dated', { method: 'POST' })).status
    ).toBe(403);
    expect(
      (
        await menu.request(
          '/post-create-dated-confirm',
          jsonRequest({ date: '2026-11-10' })
        )
      ).status
    ).toBe(403);
    expect(mocks.createDailyPost).not.toHaveBeenCalled();
  });

  it('replaces an old-title hub highlight without deleting the old post', async () => {
    mocks.getCurrentUsername.mockResolvedValue('player');
    mocks.moderators.mockResolvedValue([{ id: 't2_player' }]);
    mocks.set.mockResolvedValue('OK');
    mocks.get.mockResolvedValue('t3_old');
    const previous = {
      id: 't3_old',
      title: 'Old hub title',
      unhighlight: vi.fn(),
      delete: vi.fn(),
    };
    const post = {
      id: 't3_new',
      highlight: vi.fn(),
      setCustomPostStyles: vi.fn(),
    };
    mocks.getPostById.mockResolvedValue(previous);
    mocks.submitCustomPost.mockResolvedValue(post);
    expect((await menu.request('/hub-create', jsonRequest({}))).status).toBe(
      200
    );
    expect(mocks.submitCustomPost).toHaveBeenCalledExactlyOnceWith({
      title: 'Outnumber: Daily Numbers Puzzle',
      entry: 'hub',
      postData: { kind: 'community-hub' },
    });
    expect(post.highlight).toHaveBeenCalledWith({
      highlightLabelType: 'MEGATHREAD',
    });
    expect(post.setCustomPostStyles).toHaveBeenCalledWith({
      heightPixels: 256,
    });
    expect(previous.unhighlight).toHaveBeenCalledOnce();
    expect(previous.delete).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith('community-hub-post', 't3_new');
  });

  it('reuses a hub with the requested title', async () => {
    mocks.getCurrentUsername.mockResolvedValue('player');
    mocks.moderators.mockResolvedValue([{ id: 't2_player' }]);
    mocks.set.mockResolvedValue('OK');
    mocks.get.mockResolvedValue('t3_hub');
    const post = {
      id: 't3_hub',
      title: 'Outnumber: Daily Numbers Puzzle',
      highlight: vi.fn(),
      setCustomPostStyles: vi.fn(),
      unhighlight: vi.fn(),
    };
    mocks.getPostById.mockResolvedValue(post);
    expect((await menu.request('/hub-create', jsonRequest({}))).status).toBe(
      200
    );
    expect(mocks.submitCustomPost).not.toHaveBeenCalled();
    expect(post.highlight).toHaveBeenCalledOnce();
    expect(post.setCustomPostStyles).toHaveBeenCalledWith({
      heightPixels: 256,
    });
    expect(post.unhighlight).not.toHaveBeenCalled();
  });
});
