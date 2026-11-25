import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  analyzeDifficulty,
  GRAPH_BUDGETS,
} from '../src/shared/game/difficulty';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  seasonCertificateSchema,
  type SeasonBundle,
} from '../src/shared/season-bundle';
import { contentHash } from './content-hash';
import {
  validVerificationProgress,
  verificationHash,
  verifierHash,
} from './build-pool';
import {
  compactBoardFits,
  mechanicalCheckpointSchema,
  mechanicalRowSchema,
  mechanicalTargets,
  type MechanicalRow,
} from './mechanical-pool';
import { mechanicalDuplicate } from './mechanical-signature';
import { RELEASE_SEASON_PATH, writeSeasonBundle } from './season-files';
import { auditVisualTopology, visualDuplicate } from './visual-topology';

const tiers = ['advanced', 'expert', 'master'] as const;

const verificationSchema = z.object({
  complete: z.literal(true),
  checkpointHash: z.string(),
  verifierHash: z.string(),
  independentlyVerified: z.number().int().positive(),
  verificationManifest: z.unknown(),
  visualAudit: z.unknown(),
});

/** Everything the pool builder proved must still hold and must match the current tool sources. */
export function validateEmission(
  input: unknown,
  verification: unknown,
  codeHash: string
) {
  const checkpoint = mechanicalCheckpointSchema.parse(input);
  if (checkpoint.rows.length !== checkpoint.target)
    throw new Error('Emission requires a complete pool');
  const targets = mechanicalTargets(checkpoint.target);
  for (const tier of tiers) {
    if (
      checkpoint.rows.filter((row) => row.tier === tier).length !==
      targets[tier]
    )
      throw new Error(`Unbalanced ${tier} pool`);
  }
  if (checkpoint.rows.some((row) => !compactBoardFits(row.raw, row.tier)))
    throw new Error('A board exceeds its tier dimensions');
  if (
    checkpoint.rows.some(
      (row) =>
        BigInt(row.raw.startValue) > 999n ||
        row.raw.tiles.some(
          (tile) =>
            BigInt('value' in tile ? tile.value : tile.amount) > 999n ||
            (tile.kind === 'enemy' &&
              BigInt(tile.value) + BigInt(tile.maxSurplus ?? '0') > 999n)
        ) ||
        ['subtract', 'divide'].some(
          (kind) =>
            !row.raw.tiles.some(
              (tile) =>
                tile.kind === kind && row.criticalTileIds.includes(tile.id)
            )
        )
    )
  ) {
    throw new Error('Numeric cap or required reducing operations failed');
  }
  const report = verificationSchema.parse(verification);
  const progress = validVerificationProgress(
    report.verificationManifest,
    checkpoint,
    codeHash
  );
  if (
    report.verifierHash !== codeHash ||
    report.checkpointHash !== verificationHash(checkpoint) ||
    !progress ||
    progress.rows.length !== checkpoint.rows.length
  )
    throw new Error(
      'Stale or incomplete independent verification; rerun --verify'
    );
  const audit = auditVisualTopology(checkpoint.rows);
  if (verificationHash(report.visualAudit) !== verificationHash(audit))
    throw new Error('Visual audit mismatch');
  if (
    audit.qualifyingVisualMechanical !== checkpoint.rows.length ||
    audit.minimumActionRoleDistance === null ||
    audit.minimumActionRoleDistance < 3 ||
    audit.minimumStepRoleDistance === null ||
    audit.minimumStepRoleDistance < 3 ||
    audit.maximumWidth > 7 ||
    audit.maximumHeight > 7
  )
    throw new Error('Visual or mechanical admission thresholds failed');
  for (const [index, row] of checkpoint.rows.entries()) {
    const previous = checkpoint.rows.slice(0, index);
    if (contentHash(row.raw) !== row.contentHash)
      throw new Error(`Hash mismatch ${row.raw.id}`);
    if (
      previous.some((other) => other.raw.id === row.raw.id) ||
      mechanicalDuplicate(previous, row) ||
      visualDuplicate(
        previous.map((other) => other.raw),
        row.raw
      )
    )
      throw new Error(`Duplicate puzzle ${row.raw.id}`);
  }
  return { checkpoint, audit };
}

/** Re-run the tier analysis and reduce the row to the certificate the server ships. */
export function deriveCertificate(row: MechanicalRow) {
  const analysis = analyzeDifficulty(
    compileLevel(row.raw),
    row.tier,
    GRAPH_BUDGETS[row.tier]
  );
  if (analysis.status !== 'analyzed' || analysis.report.gateViolations.length)
    throw new Error(`Certificate analysis failed ${row.raw.id}`);
  const report = analysis.report;
  if (
    report.minimumActions !== row.minimumActions ||
    report.requiredRespawns !== row.requiredRespawns ||
    verificationHash([...report.criticalTileIds].sort()) !==
      verificationHash([...row.criticalTileIds].sort())
  ) {
    throw new Error(`Certificate analysis mismatch ${row.raw.id}`);
  }
  return seasonCertificateSchema.parse({
    levelId: row.raw.id,
    contentHash: row.contentHash,
    minimumActions: row.minimumActions,
    shortestSolution: row.shortestSolution,
    minimumSteps: row.minimumSteps,
    stepOptimalSolution: row.stepOptimalSolution,
    requiredRespawns: row.requiredRespawns,
    criticalTileIds: row.criticalTileIds,
  });
}

export function buildBundle(
  rows: readonly MechanicalRow[],
  certificates: ReadonlyMap<string, z.infer<typeof seasonCertificateSchema>>
): SeasonBundle {
  const pools: SeasonBundle['pools'] = { advanced: [], expert: [], master: [] };
  const levels: SeasonBundle['levels'] = {};
  const shipped: SeasonBundle['certificates'] = {};
  for (const row of rows) {
    const certificate = certificates.get(row.raw.id);
    if (!certificate) throw new Error(`Missing certificate ${row.raw.id}`);
    pools[row.tier].push(row.raw.id);
    levels[row.raw.id] = row.raw;
    shipped[row.raw.id] = certificate;
  }
  return { pools, levels, certificates: shipped };
}

export function emitSeason(
  directory: string,
  output: string = RELEASE_SEASON_PATH
): void {
  const codeHash = verifierHash();
  const checkpointInput: unknown = JSON.parse(
    readFileSync(resolve(directory, 'pool.json'), 'utf8')
  );
  const verificationInput: unknown = JSON.parse(
    readFileSync(resolve(directory, 'verification.json'), 'utf8')
  );
  const { checkpoint } = validateEmission(
    checkpointInput,
    verificationInput,
    codeHash
  );
  const certificates = new Map<
    string,
    z.infer<typeof seasonCertificateSchema>
  >();
  for (const row of checkpoint.rows) {
    const result = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=768',
        '--import',
        'tsx',
        resolve('tools/emit-season.ts'),
        '--certificate-worker',
      ],
      {
        input: JSON.stringify(row),
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
      }
    );
    if (result.error || result.status !== 0)
      throw new Error(
        `Certificate worker failed ${row.raw.id}: ${result.stderr}`
      );
    certificates.set(
      row.raw.id,
      seasonCertificateSchema.parse(JSON.parse(result.stdout))
    );
    console.log(
      `certificate ${row.raw.id} ${certificates.size}/${checkpoint.rows.length}`
    );
  }
  if (verifierHash() !== codeHash)
    throw new Error('Sources changed during certificate derivation');
  mkdirSync(dirname(output), { recursive: true });
  writeSeasonBundle(output, buildBundle(checkpoint.rows, certificates));
  console.log(
    `Wrote ${checkpoint.rows.length} puzzles to ${output}. Run npm run season:verify before release.`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] === '--certificate-worker') {
    console.log(
      JSON.stringify(
        deriveCertificate(
          mechanicalRowSchema.parse(JSON.parse(readFileSync(0, 'utf8')))
        )
      )
    );
  } else {
    const args = process.argv.slice(2);
    const out = args
      .find((arg) => arg.startsWith('--out='))
      ?.slice('--out='.length);
    const positional = args.filter((arg) => !arg.startsWith('--out='));
    if (
      positional.length > 1 ||
      args.some((arg) => arg.startsWith('--') && !arg.startsWith('--out='))
    ) {
      throw new Error(
        'Usage: npx tsx tools/emit-season.ts [POOL_DIRECTORY=.work/pool] [--out=season/season.json]'
      );
    }
    emitSeason(
      positional[0] ?? '.work/pool',
      out ? resolve(out) : RELEASE_SEASON_PATH
    );
  }
}
