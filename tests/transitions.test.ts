import { describe, expect, it } from 'vitest';
import rawBanking from './fixtures/banking-tutorial.json';
import rawOrderMatters from './fixtures/order-matters-v1.json';
import rawTimesTwo from './fixtures/times-two-v1.json';
import rawBankIt from './fixtures/bank-it.json';
import { interact, initialState } from '../src/shared/game/engine';
import { compileLevel } from '../src/shared/game/level-schema';
import type { GameState, Level } from '../src/shared/game/model';
import { canonicalStateKey } from '../src/shared/game/reachability';
import { successors } from '../src/shared/game/transitions';

const fixtureLevels = [rawBanking, rawOrderMatters, rawTimesTwo, rawBankIt].map(
  (raw) => compileLevel(raw)
);

/**
 * Differential guard for the flood-fill fast path: `successors()` must
 * produce exactly the same set of (tileId, resulting state) pairs as
 * the naive "ask interact() for every tile" filter, across every
 * fixture level and every state reachable within 6 plies.
 */
function naiveSuccessors(
  level: Level,
  state: GameState
): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];

  for (const tile of level.tiles) {
    const result = interact(level, state, tile.id);

    if (result.ok && result.state.phase !== 'lost') {
      out.push([tile.id, canonicalStateKey(level, result.state)]);
    }
  }

  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

function fastSuccessors(
  level: Level,
  state: GameState
): Array<readonly [string, string]> {
  return successors(level, state)
    .filter((t) => t.result.state.phase !== 'lost')
    .map((t) => [t.tileId, canonicalStateKey(level, t.result.state)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

describe('successors', () => {
  it(
    'matches naive per-tile interaction on every fixture level to depth 6',
    { timeout: 120_000 },
    () => {
      const MAX_STATES = 30_000;

      for (const level of fixtureLevels) {
        const start = initialState(level);
        const frontier: GameState[] = [start];
        const seen = new Set([canonicalStateKey(level, start)]);
        let depth = 0;

        while (frontier.length > 0 && depth < 6) {
          const next: GameState[] = [];

          for (const state of frontier) {
            const naive = naiveSuccessors(level, state);
            const fast = fastSuccessors(level, state);

            expect(fast).toEqual(naive);

            for (const transition of successors(level, state)) {
              const successor = transition.result.state;

              if (successor.phase !== 'playing') continue;

              const key = canonicalStateKey(level, successor);

              if (!seen.has(key)) {
                seen.add(key);
                next.push(successor);
              }
            }
          }

          frontier.length = 0;
          frontier.push(...next);
          depth += 1;

          expect(
            seen.size,
            `${level.id}: state explosion at depth ${depth}`
          ).toBeLessThan(MAX_STATES);
        }
      }
    }
  );

  it('returns no transitions for terminal states', () => {
    for (const level of fixtureLevels) {
      expect(
        successors(level, { ...initialState(level), phase: 'won' })
      ).toEqual([]);
    }
  });
});
