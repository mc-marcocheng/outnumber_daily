import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileLevel } from '../src/shared/game/level-schema';
import { replayWithSteps } from '../src/shared/replay';

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  saveRun: vi.fn(),
  recordScore: vi.fn(),
}));
vi.mock('@devvit/web/server', () => ({
  context: { userId: 't2_player' },
  reddit: {},
  realtime: {},
}));
vi.mock('../src/server/storage', () => ({
  getRun: mocks.getRun,
  saveRun: mocks.saveRun,
  recordScore: mocks.recordScore,
}));
vi.mock('../src/server/daily', () => ({
  utcDate: () => '2026-11-14',
  getDaily: () => ({
    level: {
      formatVersion: 1,
      id: 'walking-api',
      revision: 1,
      title: 'Walking',
      width: 4,
      terrain: ['....'],
      startCell: 0,
      startValue: '3',
      spareLives: 0,
      tiles: [{ id: 'boss', kind: 'boss', cell: 3, value: '2' }],
    },
    certificate: { minimumActions: 1, minimumSteps: 3 },
  }),
}));
import { api } from '../src/server/routes/api';

const level = compileLevel({
  formatVersion: 1,
  id: 'walking-api',
  revision: 1,
  title: 'Walking',
  width: 4,
  terrain: ['....'],
  startCell: 0,
  startValue: '3',
  spareLives: 0,
  tiles: [{ id: 'boss', kind: 'boss', cell: 3, value: '2' }],
});
function request(path: string, extra: object = {}) {
  return api.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-11-14', difficulty: 'easy', ...extra }),
  });
}

describe('walking API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRun.mockResolvedValue({
      actions: [],
      steps: 0,
      completed: false,
      bestSteps: null,
      bestActions: null,
    });
  });
  it('persists walk actions and returns JSON-safe unchanged values', async () => {
    const response = await request('/move', { tileId: 'walk:2' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: { position: 2, value: '3' },
      event: {
        kind: 'walk',
        tileId: 'walk:2',
        playerBefore: '3',
        playerAfter: '3',
      },
      path: [0, 1, 2],
      steps: 2,
      completed: false,
    });
    expect(mocks.saveRun).toHaveBeenCalledWith(
      '2026-11-14',
      't2_player',
      expect.objectContaining({ actions: ['walk:2'], steps: 2 }),
      'easy'
    );
  });
  it('rejects occupied destinations without writing', async () => {
    expect((await request('/move', { tileId: 'walk:3' })).status).toBe(400);
    expect(mocks.saveRun).not.toHaveBeenCalled();
  });
  it('undo refunds a walk from a mixed log', async () => {
    mocks.getRun.mockResolvedValue({
      actions: ['walk:1', 'walk:2'],
      steps: 2,
      completed: false,
      bestSteps: null,
      bestActions: null,
    });
    const response = await request('/undo');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      state: { position: 1 },
      steps: 1,
      actions: 1,
    });
  });
  it('keeps direct and segmented routes equally scored', () => {
    expect(replayWithSteps(level, ['walk:1', 'walk:2', 'boss']).steps).toBe(
      replayWithSteps(level, ['boss']).steps
    );
  });
});
