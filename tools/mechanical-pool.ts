import { z } from 'zod';
import { generatedLevelSchema } from '../src/shared/game/level-schema';

export const poolTierSchema = z.enum(['advanced', 'expert', 'master']);
export type PoolTier = z.infer<typeof poolTierSchema>;

/** Largest board per tier, in columns by rows. Orientation is never swapped to fit. */
export const SEASON_BOARD_LIMITS = {
  advanced: { width: 4, height: 5 },
  expert: { width: 5, height: 6 },
  master: { width: 6, height: 7 },
};

export function compactBoardFits(
  raw: { width: number; terrain: readonly string[] },
  tier: keyof typeof SEASON_BOARD_LIMITS
): boolean {
  const limit = SEASON_BOARD_LIMITS[tier];
  return raw.width <= limit.width && raw.terrain.length <= limit.height;
}

export const mechanicalRowSchema = z
  .object({
    tier: poolTierSchema,
    raw: generatedLevelSchema,
    mechanical: z.string(),
    sequence: z.string(),
    stepSequence: z.string(),
    construction: z.string(),
    seed: z.number().int(),
    contentHash: z.string(),
    minimumActions: z.number().int().positive(),
    minimumSteps: z.number().int().nonnegative(),
    requiredRespawns: z.number().int().nonnegative(),
    shortestSolution: z.array(z.string()),
    stepOptimalSolution: z.array(z.string()),
    criticalTileIds: z.array(z.string()),
    dependencies: z.array(z.array(z.string())),
    elapsedMs: z.number().nonnegative(),
  })
  .strict();
export type MechanicalRow = z.infer<typeof mechanicalRowSchema>;

/** Resumable generator state. `seed` is the private base seed; keep it out of Git and docs. */
export const mechanicalCheckpointSchema = z
  .object({
    target: z.number().int().min(1),
    seed: z.number().int().min(0).max(0xffffffff),
    cursor: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative(),
    rejections: z.record(z.string(), z.number().int().nonnegative()),
    constructors: z.record(
      z.string(),
      z
        .object({
          attempts: z.number().int().nonnegative(),
          accepted: z.number().int().nonnegative(),
          lastNovel: z.number().int().nonnegative(),
          elapsedMs: z.number().nonnegative().default(0),
          rejections: z.record(z.string(), z.number().int().nonnegative()),
        })
        .strict()
    ),
    rows: z.array(mechanicalRowSchema),
  })
  .strict();
export type MechanicalCheckpoint = z.infer<typeof mechanicalCheckpointSchema>;

export function mechanicalTargets(total: number): Record<PoolTier, number> {
  if (!Number.isSafeInteger(total) || total < 1)
    throw new Error('Invalid pool target');
  return {
    advanced: Math.floor(total / 3) + (total % 3 > 0 ? 1 : 0),
    expert: Math.floor(total / 3) + (total % 3 > 1 ? 1 : 0),
    master: Math.floor(total / 3),
  };
}
