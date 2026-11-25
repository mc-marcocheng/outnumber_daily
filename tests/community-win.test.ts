import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  saveRun: vi.fn(),
  recordCommunityWin: vi.fn(),
  username: vi.fn(),
}));
vi.mock('@devvit/web/server', () => ({
  context: { userId: 't2_player' },
  reddit: { getCurrentUsername: mocks.username },
}));
vi.mock('../src/server/storage', () => ({
  getRun: mocks.getRun,
  saveRun: mocks.saveRun,
}));
vi.mock('../src/server/community-ranking', () => ({
  recordCommunityWin: mocks.recordCommunityWin,
}));
vi.mock('../src/server/daily', () => ({
  utcDate: () => '2026-11-24',
  getDaily: () => ({
    level: {
      formatVersion: 1,
      id: 'win-test',
      revision: 1,
      title: 'Win test',
      width: 2,
      terrain: ['..'],
      startCell: 0,
      startValue: '3',
      spareLives: 0,
      tiles: [{ id: 'boss', kind: 'boss', cell: 1, value: '2' }],
    },
  }),
}));
import { api } from '../src/server/routes/api';

const move = (tileId = 'boss') =>
  api.request('/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-11-24', difficulty: 'easy', tileId }),
  });

describe('winning-move community recording', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime('2026-11-24T01:00:00Z');
    mocks.username.mockResolvedValue('player');
    mocks.getRun.mockResolvedValue({
      actions: [],
      steps: 999,
      completed: false,
      bestSteps: null,
      bestActions: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('records a server-validated win before the result dialog, using replayed raw steps', async () => {
    const response = await move();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ steps: 1, completed: true });
    expect(mocks.recordCommunityWin).toHaveBeenCalledExactlyOnceWith(
      '2026-11-24',
      'easy',
      't2_player',
      'player',
      1,
      Date.now()
    );
    expect(mocks.recordCommunityWin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveRun.mock.invocationCallOrder[0]!
    );
  });
  it('does not record blocked moves', async () => {
    expect((await move('missing')).status).toBe(400);
    expect(mocks.recordCommunityWin).not.toHaveBeenCalled();
    expect(mocks.saveRun).not.toHaveBeenCalled();
  });
  it('keeps a failed score write retryable without marking the run finished', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordCommunityWin.mockRejectedValueOnce(
      new Error('temporarily unavailable')
    );
    expect((await move()).status).toBe(400);
    expect(mocks.saveRun).not.toHaveBeenCalled();
    expect((await move()).status).toBe(200);
    error.mockRestore();
  });
});
