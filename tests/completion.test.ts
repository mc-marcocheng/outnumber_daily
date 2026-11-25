import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leaderboardChannel } from '../src/shared/leaderboard-channel';

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  getStreak: vi.fn(),
  recordScore: vi.fn(),
  markStreak: vi.fn(),
  saveUser: vi.fn(),
  setUserFlair: vi.fn(),
  send: vi.fn(),
  getSnoovatarUrl: vi.fn(),
  getRank: vi.fn(),
  profileImageUrl: '',
}));

vi.mock('@devvit/web/server', () => ({
  context: { userId: 't2_player', subredditName: 'outnumber_daily_dev' },
  reddit: {
    getCurrentUsername: async () => 'player',
    getCurrentUser: async () => ({
      getSnoovatarUrl: mocks.getSnoovatarUrl,
      profileImageUrl: mocks.profileImageUrl,
    }),
    setUserFlair: mocks.setUserFlair,
  },
  realtime: { send: mocks.send },
}));
vi.mock('../src/server/storage', () => ({
  getRun: mocks.getRun,
  getStreak: mocks.getStreak,
  recordScore: mocks.recordScore,
  markStreak: mocks.markStreak,
  saveUser: mocks.saveUser,
  getRank: mocks.getRank,
}));
vi.mock('../src/server/daily', () => ({
  utcDate: () => '2026-11-14',
  getDaily: () => ({
    level: {
      formatVersion: 1,
      id: 'completion',
      revision: 1,
      title: 'Completion',
      width: 2,
      terrain: ['..'],
      startCell: 0,
      startValue: '3',
      spareLives: 0,
      tiles: [{ id: 'boss', kind: 'boss', cell: 1, value: '2' }],
    },
    certificate: { minimumActions: 1, minimumSteps: 1 },
  }),
}));

import { api } from '../src/server/routes/api';

async function complete(date = '2026-11-14'): Promise<Response> {
  return api.request('/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, difficulty: 'easy' }),
  });
}

describe('completion rewards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.profileImageUrl = '';
    mocks.getRun.mockResolvedValue({
      actions: ['boss'],
      steps: 999,
      completed: true,
      bestSteps: 1,
      bestActions: 1,
    });
    mocks.getStreak.mockResolvedValue(1);
    mocks.getRank.mockResolvedValue(1);
  });

  it('verifies historical completions without competitive side effects', async () => {
    mocks.getStreak.mockResolvedValue(7);
    const response = await complete('2026-11-10');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: 'complete',
      endCard: {
        steps: 1,
        parSteps: 1,
        parActions: 1,
        actions: 1,
        bestSteps: 1,
        rank: null,
        streak: 7,
        flairMilestone: null,
      },
    });
    expect(mocks.getStreak).toHaveBeenCalledWith('2026-11-14', 't2_player');
    for (const effect of [
      mocks.recordScore,
      mocks.markStreak,
      mocks.saveUser,
      mocks.setUserFlair,
      mocks.send,
      mocks.getRank,
      mocks.getSnoovatarUrl,
    ]) {
      expect(effect).not.toHaveBeenCalled();
    }
  });

  it('rejects historical completions without a winning replay', async () => {
    mocks.getRun.mockResolvedValue({
      actions: [],
      steps: 0,
      completed: true,
      bestSteps: 0,
      bestActions: 0,
    });
    expect((await complete('2026-11-10')).status).toBe(400);
    expect(mocks.getStreak).not.toHaveBeenCalled();
    expect(mocks.recordScore).not.toHaveBeenCalled();
  });

  it('uses the profile icon when no Snoovatar exists', async () => {
    mocks.profileImageUrl = 'https://styles.redditmedia.com/profile.png';
    expect((await complete()).status).toBe(200);
    expect(mocks.saveUser).toHaveBeenCalledWith(
      't2_player',
      expect.objectContaining({ avatarUrl: mocks.profileImageUrl })
    );
  });

  it('prefers the Snoovatar over the profile icon', async () => {
    mocks.profileImageUrl = 'https://styles.redditmedia.com/profile.png';
    mocks.getSnoovatarUrl.mockResolvedValue('https://i.redd.it/snoovatar.png');
    expect((await complete()).status).toBe(200);
    expect(mocks.saveUser).toHaveBeenCalledWith(
      't2_player',
      expect.objectContaining({ avatarUrl: 'https://i.redd.it/snoovatar.png' })
    );
  });

  it('keeps the numbered fallback when neither image exists', async () => {
    expect((await complete()).status).toBe(200);
    expect(mocks.saveUser).toHaveBeenCalledWith(
      't2_player',
      expect.objectContaining({ avatarUrl: null })
    );
  });

  it('keeps completion available when the avatar service fails', async () => {
    mocks.getSnoovatarUrl.mockRejectedValue(new Error('avatar unavailable'));
    const response = await complete();
    expect(response.status).toBe(200);
    expect(mocks.saveUser).toHaveBeenCalledWith(
      't2_player',
      expect.objectContaining({ avatarUrl: null })
    );
    expect(await response.json()).toMatchObject({ endCard: { steps: 1 } });
  });

  it('uses the profile icon when Snoovatar lookup fails', async () => {
    mocks.profileImageUrl = 'https://styles.redditmedia.com/profile.png';
    mocks.getSnoovatarUrl.mockRejectedValue(new Error('avatar unavailable'));
    expect((await complete()).status).toBe(200);
    expect(mocks.saveUser).toHaveBeenCalledWith(
      't2_player',
      expect.objectContaining({ avatarUrl: mocks.profileImageUrl })
    );
  });

  it.each([3, 7, 30])(
    'awards the %i-day milestone ahead of par flair',
    async (streak) => {
      mocks.getStreak.mockResolvedValue(streak);
      const response = await complete();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        endCard: {
          streak,
          steps: 1,
          flairMilestone: `Outnumber · ${streak}-day streak`,
        },
      });
      expect(mocks.setUserFlair).toHaveBeenCalledWith({
        subredditName: 'outnumber_daily_dev',
        username: 'player',
        text: `Outnumber · ${streak}-day streak`,
      });
    }
  );

  it('scores replayed steps and publishes on the shared daily channel', async () => {
    expect((await complete()).status).toBe(200);
    expect(mocks.recordScore).toHaveBeenCalledWith(
      '2026-11-14',
      't2_player',
      1,
      'easy'
    );
    expect(mocks.markStreak).toHaveBeenCalledWith('2026-11-14', 't2_player');
    expect(mocks.send).toHaveBeenCalledWith(leaderboardChannel('2026-11-14'), {
      type: 'lb-update',
      date: '2026-11-14',
      difficulty: 'easy',
      userId: 't2_player',
      steps: 1,
    });
  });

  it('does not award unfinished attempts', async () => {
    mocks.getRun.mockResolvedValue({
      actions: [],
      steps: 0,
      completed: false,
      bestSteps: null,
      bestActions: null,
    });
    expect((await complete()).status).toBe(400);
    expect(mocks.recordScore).not.toHaveBeenCalled();
    expect(mocks.markStreak).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects a completed flag without a winning replay', async () => {
    mocks.getRun.mockResolvedValue({
      actions: [],
      steps: 0,
      completed: true,
      bestSteps: 0,
      bestActions: 0,
    });
    expect((await complete()).status).toBe(400);
    expect(mocks.recordScore).not.toHaveBeenCalled();
    expect(mocks.markStreak).not.toHaveBeenCalled();
  });

  it('keeps the end card available if cosmetic flair fails', async () => {
    mocks.setUserFlair.mockRejectedValue(new Error('flair unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await complete();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        endCard: { flairMilestone: null, steps: 1 },
      });
      expect(mocks.send).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  });

  it('keeps the recorded result available if realtime delivery fails', async () => {
    mocks.send.mockRejectedValue(new Error('realtime unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await complete();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        endCard: { steps: 1, rank: 1, streak: 1 },
      });
      expect(mocks.recordScore).toHaveBeenCalledWith(
        '2026-11-14',
        't2_player',
        1,
        'easy'
      );
      expect(mocks.markStreak).toHaveBeenCalledWith('2026-11-14', 't2_player');
    } finally {
      log.mockRestore();
    }
  });
});
