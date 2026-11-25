import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRun } from '../src/server/storage';

const mocks = vi.hoisted(() => {
  const context: { postId: string; userId?: string } = {
    postId: 't3_archive',
    userId: 't2_player',
  };
  return {
    context,
    getPostDate: vi.fn(),
    getRun: vi.fn(),
    getDaily: vi.fn(),
    getPostData: vi.fn(),
    getLeaderboard: vi.fn(),
    saveRun: vi.fn(),
    saveUser: vi.fn(),
    getStreak: vi.fn(),
    recordScore: vi.fn(),
    markStreak: vi.fn(),
    getCurrentUsername: vi.fn(),
  };
});
vi.mock('@devvit/web/server', () => ({
  context: mocks.context,
  reddit: {
    getCurrentUsername: mocks.getCurrentUsername,
    getPostById: async () => ({ getPostData: mocks.getPostData }),
  },
  realtime: {},
}));
vi.mock('../src/server/storage', () => ({
  emptyRun: () => ({
    actions: [],
    steps: 0,
    completed: false,
    bestSteps: null,
    bestActions: null,
  }),
  getPostDate: mocks.getPostDate,
  getRun: mocks.getRun,
  getLeaderboard: mocks.getLeaderboard,
  saveRun: mocks.saveRun,
  saveUser: mocks.saveUser,
  getStreak: mocks.getStreak,
  recordScore: mocks.recordScore,
  markStreak: mocks.markStreak,
}));
vi.mock('../src/server/daily', () => ({
  getDaily: mocks.getDaily,
  utcDate: () => '2026-11-14',
}));

import { api } from '../src/server/routes/api';

describe('dated puzzle posts', () => {
  it.each([undefined, 'master', '', null])(
    'rejects mutation difficulty %s before run writes',
    async (difficulty) => {
      for (const route of ['/move', '/undo', '/restart', '/complete']) {
        const response = await api.request(route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: '2026-11-14',
            tileId: 'boss',
            difficulty,
          }),
        });
        expect(response.status).toBe(400);
      }
      expect(mocks.saveRun).not.toHaveBeenCalled();
      expect(mocks.recordScore).not.toHaveBeenCalled();
    }
  );
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.userId = 't2_player';
    mocks.getCurrentUsername.mockResolvedValue(null);
    mocks.getStreak.mockResolvedValue(0);
    mocks.getPostDate.mockResolvedValue('2026-11-10');
    mocks.getRun.mockResolvedValue(emptyRun());
    mocks.getLeaderboard.mockResolvedValue([]);
    mocks.getDaily.mockReturnValue({
      level: {
        formatVersion: 1,
        id: 'archive',
        revision: 1,
        title: 'Archive',
        width: 2,
        terrain: ['..'],
        startCell: 0,
        startValue: '3',
        spareLives: 0,
        tiles: [{ id: 'boss', kind: 'boss', cell: 1, value: '2' }],
      },
      certificate: {
        levelId: 'archive',
        minimumActions: 1,
        minimumSteps: 1,
        stepOptimalSolution: ['boss'],
      },
    });
  });

  it('uses the post date in both splash and game', async () => {
    for (const route of ['/init', '/puzzle']) {
      const response = await api.request(route);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ date: '2026-11-10' });
    }
    expect(mocks.getDaily).toHaveBeenCalledWith('2026-11-10', 'easy');
  });

  describe('anonymous requests', () => {
    beforeEach(() => {
      delete mocks.context.userId;
      mocks.getCurrentUsername.mockResolvedValue('shared-player');
      mocks.getStreak.mockResolvedValue(12);
      mocks.getRun.mockResolvedValue({
        actions: ['missing-tile'],
        steps: 7,
        completed: true,
        bestSteps: 3,
        bestActions: 1,
      });
    });

    function expectNoPersonalStorage() {
      expect(mocks.getRun).not.toHaveBeenCalled();
      expect(mocks.getStreak).not.toHaveBeenCalled();
      expect(mocks.saveRun).not.toHaveBeenCalled();
      expect(mocks.saveUser).not.toHaveBeenCalled();
      expect(mocks.recordScore).not.toHaveBeenCalled();
      expect(mocks.markStreak).not.toHaveBeenCalled();
    }

    it('returns a fresh puzzle without loading or repairing the shared run', async () => {
      const response = await api.request('/puzzle');
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        type: 'puzzle',
        actions: 0,
        steps: 0,
        completed: false,
        bestSteps: null,
      });
      expectNoPersonalStorage();
    });

    it('returns empty archive statuses without reading shared runs', async () => {
      const response = await api.request('/archive?month=2026-11');
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.days.length).toBeGreaterThan(0);
      for (const day of body.days) {
        expect(day).toMatchObject({
          completed: false,
          started: false,
          bestSteps: null,
        });
      }
      expectNoPersonalStorage();
    });

    it('initializes without personal progress or saving a user', async () => {
      const response = await api.request('/init');
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        username: 'anonymous',
        avatarUrl: null,
        streak: 0,
        today: { completed: false, bestSteps: null },
      });
      expectNoPersonalStorage();
    });

    it.each(['/move', '/undo', '/restart', '/complete'])(
      'rejects POST %s before parsing or accessing storage',
      async (route) => {
        for (const body of [
          JSON.stringify({ date: '2026-11-14', tileId: 'boss' }),
          '{',
        ]) {
          const response = await api.request(route, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({
            status: 'error',
            message: 'Sign in to save your puzzle.',
          });
        }
        expect(mocks.getDaily).not.toHaveBeenCalled();
        expect(mocks.getPostDate).not.toHaveBeenCalled();
        expectNoPersonalStorage();
      }
    );

    it('keeps leaderboard reads public', async () => {
      expect((await api.request('/leaderboard')).status).toBe(200);
      expect(mocks.getLeaderboard).toHaveBeenCalledWith(
        '2026-11-14',
        50,
        'easy'
      );
      expectNoPersonalStorage();
    });
  });

  it('resets corrupt authenticated replays without losing personal bests', async () => {
    mocks.getRun.mockResolvedValue({
      actions: ['missing-tile'],
      steps: 7,
      completed: true,
      bestSteps: 3,
      bestActions: 1,
    });
    const response = await api.request('/puzzle');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      actions: 0,
      steps: 0,
      completed: false,
      bestSteps: 3,
    });
    expect(mocks.saveRun).toHaveBeenCalledExactlyOnceWith(
      '2026-11-10',
      't2_player',
      {
        actions: [],
        steps: 0,
        completed: false,
        bestSteps: 3,
        bestActions: 1,
      },
      'easy'
    );
  });

  it('allows an explicit date to override post metadata', async () => {
    expect(
      await (await api.request('/puzzle?date=2026-11-12')).json()
    ).toMatchObject({ date: '2026-11-12', postDate: '2026-11-10' });
    expect(mocks.getPostDate).toHaveBeenCalledWith('t3_archive');
  });

  it('falls back to today for a post with no stored date', async () => {
    mocks.getPostDate.mockResolvedValue(undefined);
    expect(await (await api.request('/puzzle')).json()).toMatchObject({
      date: '2026-11-14',
    });
  });

  it('retains the original date after the lookup expires', async () => {
    mocks.getPostDate.mockResolvedValue(undefined);
    mocks.getPostData.mockResolvedValue({ date: '2026-11-11' });
    for (const route of ['/init', '/puzzle']) {
      expect(await (await api.request(route)).json()).toMatchObject({
        date: '2026-11-11',
      });
    }
  });

  it.each([
    '2026-02-29',
    '2026-04-31',
    '2026-00-10',
    '2026-13-01',
    '2026-11-15',
    'invalid',
    '',
  ])('rejects invalid or future read dates: %s', async (date) => {
    for (const route of ['/init', '/puzzle', '/leaderboard']) {
      expect((await api.request(`${route}?date=${date}`)).status).toBe(400);
    }
    expect(mocks.getDaily).not.toHaveBeenCalled();
    expect(mocks.getRun).not.toHaveBeenCalled();
    expect(mocks.getLeaderboard).not.toHaveBeenCalled();
    expect(mocks.saveRun).not.toHaveBeenCalled();
    expect(mocks.saveUser).not.toHaveBeenCalled();
  });

  it('rejects future dates from post metadata', async () => {
    mocks.getPostDate.mockResolvedValue(undefined);
    mocks.getPostData.mockResolvedValue({ date: '2026-11-15' });
    expect((await api.request('/init')).status).toBe(400);
    expect(mocks.getRun).not.toHaveBeenCalled();
    expect(mocks.saveUser).not.toHaveBeenCalled();
  });

  it.each(['2026-02-29', '2026-04-31', '2026-11-15', 'invalid', '', 42, null])(
    'rejects invalid mutation dates without writes: %s',
    async (date) => {
      for (const route of ['/move', '/undo', '/restart', '/complete']) {
        const response = await api.request(route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, tileId: 'boss' }),
        });
        expect(response.status).toBe(400);
      }
      expect(mocks.getDaily).not.toHaveBeenCalled();
      expect(mocks.getRun).not.toHaveBeenCalled();
      expect(mocks.saveRun).not.toHaveBeenCalled();
      expect(mocks.saveUser).not.toHaveBeenCalled();
    }
  );

  it.each(['null', '[]', '42', '{'])(
    'rejects malformed mutation bodies: %s',
    async (body) => {
      for (const route of ['/move', '/undo', '/restart', '/complete']) {
        expect(
          (
            await api.request(route, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            })
          ).status
        ).toBe(400);
      }
      expect(mocks.getRun).not.toHaveBeenCalled();
      expect(mocks.saveRun).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, 42, ''])(
    'rejects invalid move targets: %s',
    async (tileId) => {
      expect(
        (
          await api.request('/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tileId }),
          })
        ).status
      ).toBe(400);
      expect(mocks.getRun).not.toHaveBeenCalled();
      expect(mocks.saveRun).not.toHaveBeenCalled();
    }
  );

  it('uses the historical post default for every mutation', async () => {
    for (const route of ['/move', '/undo', '/restart', '/complete']) {
      mocks.getRun.mockClear();
      const response = await api.request(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tileId: 'boss', difficulty: 'easy' }),
      });
      expect(response.status).toBe(
        route === '/move' || route === '/restart' ? 200 : 400
      );
      expect(mocks.getRun).toHaveBeenCalledWith(
        '2026-11-10',
        't2_player',
        'easy'
      );
    }
  });

  it.each(['2026-02-29', '2026-11-15'])(
    'rejects invalid post defaults before reading or writing runs: %s',
    async (date) => {
      mocks.getPostDate.mockResolvedValue(date);
      for (const route of ['/init', '/puzzle']) {
        expect((await api.request(route)).status).toBe(400);
      }
      for (const route of ['/move', '/undo', '/restart', '/complete']) {
        expect(
          (
            await api.request(route, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tileId: 'boss' }),
            })
          ).status
        ).toBe(400);
      }
      expect(mocks.getDaily).not.toHaveBeenCalled();
      expect(mocks.getRun).not.toHaveBeenCalled();
      expect(mocks.saveRun).not.toHaveBeenCalled();
      expect(mocks.saveUser).not.toHaveBeenCalled();
    }
  );

  it('keeps the leaderboard default on today when opened from an old post', async () => {
    expect(await (await api.request('/leaderboard')).json()).toMatchObject({
      date: '2026-11-14',
    });
    expect(mocks.getPostDate).not.toHaveBeenCalled();
  });

  it('accepts a real leap day before the season anchor', async () => {
    expect((await api.request('/puzzle?date=2024-02-29')).status).toBe(200);
    expect(mocks.getRun).toHaveBeenCalledWith(
      '2024-02-29',
      't2_player',
      'easy'
    );
  });

  it('saves historical personal bests and preserves them on undo and restart', async () => {
    const request = (route: string) =>
      api.request(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tileId: 'boss', difficulty: 'easy' }),
      });
    expect((await request('/move')).status).toBe(200);
    expect(mocks.saveRun).toHaveBeenLastCalledWith(
      '2026-11-10',
      't2_player',
      {
        actions: ['boss'],
        steps: 1,
        completed: true,
        bestSteps: 1,
        bestActions: 1,
      },
      'easy'
    );
    mocks.getRun.mockResolvedValue({
      actions: ['boss'],
      steps: 1,
      completed: true,
      bestSteps: 1,
      bestActions: 1,
    });
    for (const route of ['/undo', '/restart']) {
      expect((await request(route)).status).toBe(200);
      expect(mocks.saveRun).toHaveBeenLastCalledWith(
        '2026-11-10',
        't2_player',
        {
          actions: [],
          steps: 0,
          completed: false,
          bestSteps: 1,
          bestActions: 1,
        },
        'easy'
      );
    }
    mocks.getRun.mockResolvedValue({
      ...emptyRun(),
      bestSteps: 0,
      bestActions: 0,
    });
    expect((await request('/move')).status).toBe(200);
    expect(mocks.saveRun).toHaveBeenLastCalledWith(
      '2026-11-10',
      't2_player',
      expect.objectContaining({ bestSteps: 0, bestActions: 0 }),
      'easy'
    );
  });
});
