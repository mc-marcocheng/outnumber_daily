import { describe, expect, it } from 'vitest';
import { activeTiles, initialState, interact } from '../src/shared/game/engine';
import { compileLevel, rawLevelSchema } from '../src/shared/game/level-schema';
import type { GameState, Level } from '../src/shared/game/model';
import { positionStateKey } from '../src/shared/game/reachability';
import { replayWithSteps } from '../src/shared/replay';
import { certifySteps } from '../src/shared/game/certify-steps';
import sampleSeason from '../content/sample-season.json';

const previewLevel = sampleSeason.levels['sample-easy-1'];

// Independent oracle: Dijkstra over position-keyed states using the real
// engine's interact() path length (NOT the reachability distance map the
// certifier relies on), so the two computations are genuinely separate.
function bruteMinSteps(level: Level): number {
  const start = initialState(level);
  const dist = new Map<string, number>([[positionStateKey(start), 0]]);
  const queue: Array<[number, GameState]> = [[0, start]];
  let best = Number.POSITIVE_INFINITY;

  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, state] = queue.shift()!;
    if (d > (dist.get(positionStateKey(state)) ?? Infinity)) continue;
    if (state.phase === 'won') {
      best = Math.min(best, d);
      continue;
    }
    if (state.phase !== 'playing') continue;

    for (const tile of activeTiles(level, state)) {
      const r = interact(level, state, tile.id);
      if (!r.ok) continue;
      const nd = d + Math.max(r.path.length - 1, 0);
      const key = positionStateKey(r.state);
      if (nd < (dist.get(key) ?? Infinity)) {
        dist.set(key, nd);
        queue.push([nd, r.state]);
      }
    }
  }
  return best;
}

const trivial = compileLevel(
  rawLevelSchema.parse({
    formatVersion: 1,
    id: 't1',
    revision: 1,
    title: 'T1',
    width: 2,
    terrain: ['..', '..'],
    startCell: 0,
    startValue: '5',
    spareLives: 0,
    tiles: [{ id: 'boss', kind: 'boss', cell: 3, value: '4' }],
  })
);

const needsAdd = compileLevel(
  rawLevelSchema.parse({
    formatVersion: 1,
    id: 't2',
    revision: 1,
    title: 'T2',
    width: 3,
    terrain: ['...', '...', '...'],
    startCell: 0,
    startValue: '1',
    spareLives: 0,
    tiles: [
      { id: 'add', kind: 'add', cell: 1, amount: '4' },
      { id: 'boss', kind: 'boss', cell: 8, value: '4' },
    ],
  })
);

describe('min-steps certification', () => {
  it('matches brute-force Dijkstra on a trivial win', () => {
    const r = certifySteps(trivial);
    expect(r.status).toBe('certified');
    if (r.status !== 'certified') return;
    expect(r.minimumSteps).toBe(bruteMinSteps(trivial));
    expect(r.minimumSteps).toBe(2);
  });

  it('matches brute-force Dijkstra when an operation is required', () => {
    const r = certifySteps(needsAdd);
    expect(r.status).toBe('certified');
    if (r.status !== 'certified') return;
    expect(r.minimumSteps).toBe(bruteMinSteps(needsAdd));
  });

  it('certifies a sample puzzle and the witness replays to a win', () => {
    const level = compileLevel(rawLevelSchema.parse(previewLevel));
    const r = certifySteps(level);
    expect(r.status).toBe('certified');
    if (r.status !== 'certified') return;
    expect(r.minimumSteps).toBe(bruteMinSteps(level));
    const replay = replayWithSteps(level, r.stepOptimalSolution);
    expect(replay.state.phase).toBe('won');
    expect(replay.steps).toBe(r.minimumSteps);
  });

  it('step-optimal is never worse than the action-optimal line', () => {
    const level = compileLevel(rawLevelSchema.parse(previewLevel));
    const r = certifySteps(level);
    if (r.status !== 'certified') throw new Error('not certified');
    const actionOptimal = replayWithSteps(level, [
      'sets',
      'bank',
      'sett',
      'add1',
      'snack1',
      'add2',
      'snack2',
      'bank',
      'mul',
      'boss',
    ]);
    expect(r.minimumSteps).toBeLessThanOrEqual(actionOptimal.steps);
  });
});
