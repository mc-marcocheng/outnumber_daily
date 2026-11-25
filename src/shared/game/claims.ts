import { initialState } from './engine';
import type { Level } from './model';
import { solve } from './solver';

/**
 * Proofs of specific claims about a level, shared by the level
 * verifier and the analysis tests. Every proof treats a solver limit
 * as a failure: a claim that cannot be re-proven within budget must
 * not ship, and a limit must never be read as evidence either way.
 */
export type ClaimProof =
  Readonly<{ ok: true }> | Readonly<{ ok: false; reason: string }>;

/**
 * Prove that a level requires exactly `claim` respawns: a solution
 * exists using at most `claim`, and — for claim > 0 — none exists
 * using fewer.
 */
export function proveExactRespawns(
  level: Level,
  claim: number,
  budget: { maxStates: number; maxMs: number }
): ClaimProof {
  if (claim < 0 || claim > level.spareLives) {
    return {
      ok: false,
      reason: `${level.id}: respawn claim ${claim} outside 0..${level.spareLives}`,
    };
  }

  const atClaim = solve(level, initialState(level), budget, {
    canonical: true,
    restrictions: { maxRespawnsUsed: claim },
  });

  if (atClaim.status === 'limit') {
    return {
      ok: false,
      reason: `${level.id}: solver hit ${atClaim.reason} limit proving a solution with ${claim} respawn(s)`,
    };
  }

  if (atClaim.status !== 'solved') {
    return {
      ok: false,
      reason: `${level.id}: no solution with ${claim} respawn(s) (${atClaim.status})`,
    };
  }

  if (claim > 0) {
    const under = solve(level, initialState(level), budget, {
      canonical: true,
      restrictions: { maxRespawnsUsed: claim - 1 },
    });

    if (under.status === 'limit') {
      return {
        ok: false,
        reason: `${level.id}: solver hit ${under.reason} limit proving impossibility with ${claim - 1} respawn(s)`,
      };
    }

    if (under.status !== 'unsolvable') {
      return {
        ok: false,
        reason: `${level.id}: a solution exists with ${claim - 1} respawn(s), so ${claim} is not required`,
      };
    }
  }

  return { ok: true };
}

/**
 * Prove that a single tile is individually required: forbidding only
 * that tile makes the level unsolvable. The grouped version of this
 * check (forbidding a whole set at once) proves only that at least one
 * member is needed and is deliberately not provided.
 */
export function proveRequiredTile(
  level: Level,
  tileId: string,
  budget: { maxStates: number; maxMs: number }
): ClaimProof {
  if (!level.tiles.some((tile) => tile.id === tileId)) {
    return { ok: false, reason: `${level.id}: no tile ${tileId}` };
  }

  const restricted = solve(level, initialState(level), budget, {
    canonical: true,
    restrictions: { forbiddenTileIds: new Set([tileId]) },
  });

  if (restricted.status === 'limit') {
    return {
      ok: false,
      reason: `${level.id}: solver hit ${restricted.reason} limit proving tile ${tileId} required`,
    };
  }

  if (restricted.status !== 'unsolvable') {
    return {
      ok: false,
      reason: `${level.id}: tile ${tileId} is not required (${restricted.status} without it)`,
    };
  }

  return { ok: true };
}
