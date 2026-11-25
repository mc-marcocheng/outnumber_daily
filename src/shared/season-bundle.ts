import { z } from 'zod';
import { rawLevelSchema } from './game/level-schema';

/**
 * Offline proof that ships with each puzzle. `contentHash` binds the proof to
 * the exact level JSON. The server only reads the action and step fields; the
 * rest lets `tools/verify-season.ts` re-derive every claim.
 */
export const seasonCertificateSchema = z
  .object({
    levelId: z.string().min(1),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    minimumActions: z.number().int().positive(),
    shortestSolution: z.array(z.string()),
    minimumSteps: z.number().int().nonnegative(),
    stepOptimalSolution: z.array(z.string()),
    requiredRespawns: z.number().int().nonnegative().nullable(),
    criticalTileIds: z.array(z.string()),
  })
  .strict();

export type SeasonCertificate = z.infer<typeof seasonCertificateSchema>;

const poolSchema = z.array(z.string().min(1)).min(1);

/**
 * The complete puzzle set the server serves. Release builds read the private
 * `season/season.json`. Fresh clones fall back to `content/sample-season.json`.
 */
export const seasonBundleSchema = z
  .object({
    pools: z
      .object({ advanced: poolSchema, expert: poolSchema, master: poolSchema })
      .strict(),
    levels: z.record(z.string(), rawLevelSchema),
    certificates: z.record(z.string(), seasonCertificateSchema),
  })
  .strict()
  .superRefine((bundle, context) => {
    const scheduled = new Set(Object.values(bundle.pools).flat());
    for (const id of scheduled) {
      if (!bundle.levels[id] || !bundle.certificates[id]) {
        context.addIssue({
          code: 'custom',
          message: `Pool entry ${id} has no level or certificate`,
        });
      }
    }
    for (const id of Object.keys(bundle.levels)) {
      if (!scheduled.has(id))
        context.addIssue({
          code: 'custom',
          message: `Level ${id} is not in any pool`,
        });
    }
  });

export type SeasonBundle = z.infer<typeof seasonBundleSchema>;
