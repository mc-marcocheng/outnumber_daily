import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  submitCustomPost: vi.fn(),
  rememberPostDate: vi.fn(),
  getDaily: vi.fn(),
}));
vi.mock('@devvit/web/server', () => ({
  reddit: { submitCustomPost: mocks.submitCustomPost },
}));
vi.mock('../src/server/storage', () => ({
  rememberPostDate: mocks.rememberPostDate,
}));
vi.mock('../src/server/daily', () => ({
  utcDate: () => '2026-11-14',
  getDaily: mocks.getDaily,
}));

import { createDailyPost } from '../src/server/core/post';

describe('daily post creation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDaily.mockReturnValue({
      certificate: { minimumSteps: 27, minimumActions: 10 },
    });
    mocks.submitCustomPost.mockResolvedValue({ id: 't3_daily' });
  });

  it('defaults to UTC today without leaking puzzle par', async () => {
    expect(await createDailyPost()).toEqual({ id: 't3_daily' });
    expect(mocks.getDaily).toHaveBeenCalledWith('2026-11-14');
    expect(mocks.submitCustomPost).toHaveBeenCalledWith({
      title: 'Outnumber Daily: 2026-11-14',
      postData: { date: '2026-11-14' },
    });
    expect(mocks.rememberPostDate).toHaveBeenCalledWith(
      't3_daily',
      '2026-11-14'
    );
  });

  it('keeps an explicit archive date in both durable metadata and cleanup lookup', async () => {
    await createDailyPost('2026-11-10');
    expect(mocks.getDaily).toHaveBeenCalledWith('2026-11-10');
    expect(mocks.submitCustomPost).toHaveBeenCalledWith(
      expect.objectContaining({ postData: { date: '2026-11-10' } })
    );
    expect(mocks.rememberPostDate).toHaveBeenCalledWith(
      't3_daily',
      '2026-11-10'
    );
  });

  it('does not write a cleanup mapping if Reddit rejects creation', async () => {
    mocks.submitCustomPost.mockRejectedValue(new Error('Reddit unavailable'));
    await expect(createDailyPost()).rejects.toThrow('Reddit unavailable');
    expect(mocks.rememberPostDate).not.toHaveBeenCalled();
  });
});
