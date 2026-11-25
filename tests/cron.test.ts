import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ createDailyPost: vi.fn() }));
vi.mock('../src/server/core/post', () => ({
  createDailyPost: mocks.createDailyPost,
}));

import { cron } from '../src/server/routes/cron';

describe('daily post scheduler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the daily handler for midnight UTC', () => {
    const config: unknown = JSON.parse(
      readFileSync(new URL('../devvit.json', import.meta.url), 'utf8')
    );
    expect(config).toMatchObject({
      scheduler: {
        tasks: {
          dailyPost: {
            endpoint: '/internal/cron/daily-post',
            cron: '0 0 * * *',
          },
        },
      },
    });
  });

  it("creates today's post and returns a successful task response", async () => {
    mocks.createDailyPost.mockResolvedValue({ id: 't3_daily' });
    const response = await cron.request('/daily-post', { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(mocks.createDailyPost).toHaveBeenCalledExactlyOnceWith();
    expect(console.log).toHaveBeenCalledWith('daily-post created t3_daily');
  });

  it('reports failed creation as a failed task instead of success', async () => {
    const error = new Error('Reddit unavailable');
    mocks.createDailyPost.mockRejectedValue(error);
    const response = await cron.request('/daily-post', { method: 'POST' });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({});
    expect(console.error).toHaveBeenCalledWith('daily-post failed', error);
  });
});
