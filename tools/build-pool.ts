import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { type ExactGraph } from '../src/shared/game/analysis-graph';
import { certifySteps } from '../src/shared/game/certify-steps';
import { proveExactRespawns } from '../src/shared/game/claims';
import {
  analyzeDifficulty,
  GRAPH_BUDGETS,
  POLICY_IDS,
  runBaselinePolicy,
  TIER_GATES,
} from '../src/shared/game/difficulty';
import { initialState } from '../src/shared/game/engine';
import {
  compileLevel,
  generatedLevelSchema,
} from '../src/shared/game/level-schema';
import { solve } from '../src/shared/game/solver';
import { replayWithSteps } from '../src/shared/replay';
import { contentHash } from './content-hash';
import { compactDecisionCandidate } from './decisions';
import {
  compactBoardFits,
  mechanicalCheckpointSchema,
  mechanicalRowSchema,
  mechanicalTargets,
  type MechanicalCheckpoint,
  type MechanicalRow,
} from './mechanical-pool';
import {
  mechanicalDuplicate,
  mechanicalSignature,
  provesWinningDependencies,
  roleSequence,
} from './mechanical-signature';
import {
  auditVisualTopology,
  visualAdmissionIndex,
  visualDuplicate,
} from './visual-topology';

const tiers = ['advanced', 'expert', 'master'] as const;
const proofBudget = { maxStates: 3_000_000, maxMs: 120_000 };

const evaluationSchema = z.object({
  raw: generatedLevelSchema,
  tier: z.enum(tiers),
  dependencies: z.array(z.array(z.string())),
  construction: z.string(),
  seed: z.number(),
  previous: z.array(
    z.object({
      mechanical: z.string(),
      sequence: z.string(),
      stepSequence: z.string(),
    })
  ),
});
const resultSchema = z.union([
  z.object({ row: mechanicalRowSchema }),
  z.object({ rejections: z.array(z.string()) }),
]);

const verificationProgressSchema = z
  .object({
    formatVersion: z.literal(1),
    checkpointHash: z.string(),
    verifierHash: z.string(),
    rows: z.array(
      z
        .object({
          id: z.string(),
          rowHash: z.string(),
          elapsedMs: z.number().nonnegative(),
        })
        .strict()
    ),
  })
  .strict();

export function verificationHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function verifierHash(): string {
  const files = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    ...['src/shared', 'tools'].flatMap((directory) =>
      readdirSync(directory, { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.(ts|json)$/.test(file))
        .map((file) => `${directory}/${file}`)
    ),
  ].sort();
  const hash = createHash('sha256');
  for (const file of files)
    hash.update(JSON.stringify([file, readFileSync(file, 'utf8')]));
  return hash.digest('hex');
}

export function validVerificationProgress(
  input: unknown,
  checkpoint: MechanicalCheckpoint,
  codeHash: string
): z.infer<typeof verificationProgressSchema> | undefined {
  const parsed = verificationProgressSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.checkpointHash !== verificationHash(checkpoint) ||
    parsed.data.verifierHash !== codeHash
  )
    return undefined;
  const rows = new Map(
    checkpoint.rows.map((row) => [row.raw.id, verificationHash(row)])
  );
  if (
    new Set(parsed.data.rows.map((row) => row.id)).size !==
      parsed.data.rows.length ||
    parsed.data.rows.some((row) => rows.get(row.id) !== row.rowHash)
  )
    return undefined;
  return parsed.data;
}

export function evaluateMechanicalCandidate(
  input: z.infer<typeof evaluationSchema>
): z.infer<typeof resultSchema> {
  const { raw, tier, dependencies, construction, seed, previous } = input;
  if (!compactBoardFits(raw, tier))
    return { rejections: ['tier board dimensions'] };
  const candidateStarted = Date.now();
  const level = compileLevel(raw);
  let graph: ExactGraph | undefined;
  const analysis = analyzeDifficulty(
    level,
    tier,
    GRAPH_BUDGETS[tier],
    (complete) => {
      graph = complete;
    }
  );
  if (analysis.status !== 'analyzed')
    return { rejections: [`analysis:${analysis.status}`] };
  const report = analysis.report;
  if (report.gateViolations.length)
    return { rejections: [...report.gateViolations] };
  if (
    dependencies
      .flat()
      .some(
        (tileId) =>
          !report.criticalTileIds.includes(tileId) &&
          !level.tiles.some(
            (tile) => tile.id === tileId && tile.kind === 'boss'
          )
      )
  )
    return { rejections: ['decorative composition'] };
  const sequence = roleSequence(raw, report.shortestSolution);
  if (
    mechanicalDuplicate(previous, {
      mechanical: '',
      sequence,
      stepSequence: sequence,
    })
  )
    return { rejections: ['near role sequence'] };
  if (!graph) throw new Error('Analyzed candidate missing exact graph');
  if (!provesWinningDependencies(graph, dependencies))
    return {
      rejections: dependencies
        .filter(
          (dependency) => !provesWinningDependencies(graph!, [dependency])
        )
        .map((dependency) => `dependency order:${dependency.join('->')}`),
    };
  const mechanical = mechanicalSignature(level, graph);
  const steps = certifySteps(level);
  if (steps.status !== 'certified')
    return { rejections: [`steps:${steps.status}`] };
  const stepSequence = roleSequence(raw, steps.stepOptimalSolution);
  const duplicate = mechanicalDuplicate(previous, {
    mechanical,
    sequence,
    stepSequence,
  });
  if (duplicate) return { rejections: [duplicate] };
  return {
    row: {
      tier,
      raw,
      mechanical,
      sequence,
      stepSequence,
      construction,
      seed,
      contentHash: contentHash(raw),
      minimumActions: report.minimumActions,
      minimumSteps: steps.minimumSteps,
      requiredRespawns: report.requiredRespawns,
      shortestSolution: [...report.shortestSolution],
      stepOptimalSolution: [...steps.stepOptimalSolution],
      criticalTileIds: [...report.criticalTileIds],
      dependencies,
      elapsedMs: Date.now() - candidateStarted,
    },
  };
}

export function verificationTimeoutMs(row: MechanicalRow): number {
  return 180_000 + (4 + row.criticalTileIds.length) * proofBudget.maxMs;
}

export function runProofWorker(
  mode: 'evaluate' | 'verify',
  input: unknown
): z.infer<typeof resultSchema> {
  const timeout =
    mode === 'verify'
      ? verificationTimeoutMs(mechanicalRowSchema.parse(input))
      : 180_000;
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=768',
      '--import',
      'tsx',
      resolve('tools/build-pool.ts'),
      `--proof-worker=${mode}`,
    ],
    {
      input: JSON.stringify(input),
      encoding: 'utf8',
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  if (result.error || result.status !== 0) {
    const reason =
      result.error &&
      'code' in result.error &&
      result.error.code === 'ETIMEDOUT'
        ? 'timeout'
        : result.stderr.includes('heap out of memory')
          ? 'memory'
          : 'failed';
    const stage = result.stderr.match(/proof-stage=([^\s]+)/g)?.at(-1);
    return {
      rejections: [
        `worker:${reason}${reason !== 'failed' && stage ? `:${stage}` : ''}`,
      ],
    };
  }
  return resultSchema.parse(JSON.parse(result.stdout));
}

export function verifyMechanicalRow(
  row: MechanicalRow,
  progress: (stage: string) => void = () => {}
): void {
  if (!compactBoardFits(row.raw, row.tier))
    throw new Error('Tier board dimensions failed');
  progress('analysis');
  const level = compileLevel(generatedLevelSchema.parse(row.raw));
  if (contentHash(row.raw) !== row.contentHash)
    throw new Error(`Hash mismatch ${level.id}`);
  let graph: ExactGraph | undefined;
  const analysis = analyzeDifficulty(
    level,
    row.tier,
    GRAPH_BUDGETS[row.tier],
    (complete) => {
      graph = complete;
    }
  );
  if (analysis.status !== 'analyzed' || analysis.report.gateViolations.length)
    throw new Error(`Tier proof failed ${level.id}`);
  const report = analysis.report;
  if (
    report.minimumActions !== row.minimumActions ||
    report.requiredRespawns !== row.requiredRespawns ||
    JSON.stringify([...report.criticalTileIds].sort()) !==
      JSON.stringify([...row.criticalTileIds].sort())
  )
    throw new Error(`Analysis mismatch ${level.id}`);
  progress('graph');
  if (!graph || mechanicalSignature(level, graph) !== row.mechanical)
    throw new Error(`Mechanical mismatch ${level.id}`);
  if (!provesWinningDependencies(graph, row.dependencies))
    throw new Error(`Dependency order failed ${level.id}`);
  if (
    roleSequence(row.raw, row.shortestSolution) !== row.sequence ||
    roleSequence(row.raw, row.stepOptimalSolution) !== row.stepSequence ||
    row.shortestSolution.length !== row.minimumActions
  )
    throw new Error(`Role mismatch ${level.id}`);
  progress('actions');
  const solved = solve(level, initialState(level), proofBudget, {
    canonical: true,
  });
  if (
    solved.status !== 'solved' ||
    solved.minimumActions !== row.minimumActions
  )
    throw new Error(`Action proof failed ${level.id}`);
  progress('steps');
  const steps = certifySteps(level);
  const replay = replayWithSteps(level, row.stepOptimalSolution);
  if (replayWithSteps(level, row.shortestSolution).state.phase !== 'won')
    throw new Error(`Action witness failed ${level.id}`);
  if (
    steps.status !== 'certified' ||
    steps.minimumSteps !== row.minimumSteps ||
    replay.state.phase !== 'won' ||
    replay.steps !== row.minimumSteps
  )
    throw new Error(`Step proof failed ${level.id}`);
  progress('respawns');
  const respawns = proveExactRespawns(level, row.requiredRespawns, proofBudget);
  if (!respawns.ok) throw new Error(`Respawn proof failed ${level.id}`);
  for (const tileId of row.criticalTileIds) {
    progress(`required:${tileId}`);
    if (
      !level.tiles.some((tile) => tile.id === tileId) ||
      !requiredTileInGraph(graph, tileId)
    )
      throw new Error(`Required tile proof failed ${level.id}:${tileId}`);
  }
  if (
    row.dependencies
      .flat()
      .some(
        (tileId) =>
          !row.criticalTileIds.includes(tileId) &&
          !level.tiles.some(
            (tile) => tile.id === tileId && tile.kind === 'boss'
          )
      )
  )
    throw new Error(`Decorative composition ${level.id}`);
  progress('complete');
}

export function requiredTileInGraph(
  graph: ExactGraph,
  tileId: string
): boolean {
  const started = performance.now();
  const reachable = new Set([0]);
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    if (
      performance.now() - started >= proofBudget.maxMs ||
      reachable.size > proofBudget.maxStates
    )
      return false;
    const node = graph.nodes[queue[cursor]!]!;
    if (node.state.phase === 'won') return false;
    for (const edge of node.edges) {
      if (edge.tileId === tileId || edge.to === null || reachable.has(edge.to))
        continue;
      reachable.add(edge.to);
      queue.push(edge.to);
    }
  }
  return true;
}

const USAGE = `Usage: npx tsx tools/build-pool.ts --seed=<uint32> [--target=200] [--attempts=240] [--max-run-ms=900000] [--out=.work/pool] [--batch]
       npx tsx tools/build-pool.ts --verify [--out=.work/pool]

Generation appends accepted puzzles to <out>/pool.json and can be resumed. The seed is stored in the
checkpoint; keep it private. --batch trusts the checkpoint hashes on resume instead of re-proving every
retained row. --verify independently re-proves every retained row in isolated workers and writes
<out>/verification.json. --max-run-ms bounds generation time and reserves 180000 ms per worker.`;

export function runMechanicalPool(argv: readonly string[]): void {
  const options = new Map(
    argv.map((argument) => {
      const [key, ...value] = argument.split('=');
      return [key!, value.join('=') || 'true'];
    })
  );
  if (options.has('--help')) {
    console.log(USAGE);
    return;
  }
  for (const key of options.keys())
    if (
      ![
        '--seed',
        '--target',
        '--attempts',
        '--out',
        '--verify',
        '--max-run-ms',
        '--batch',
      ].includes(key)
    )
      throw new Error(`Unknown option ${key}`);
  const verifying = options.has('--verify');
  if (verifying && options.get('--verify') !== 'true')
    throw new Error('Use --verify without a value');
  if (
    options.has('--batch') &&
    (options.get('--batch') !== 'true' || verifying)
  )
    throw new Error('Use --batch only for generation');
  const attempts = Number(options.get('--attempts') ?? 240);
  const maxRunMs = Number(
    options.get('--max-run-ms') ?? Number.MAX_SAFE_INTEGER
  );
  if (!Number.isSafeInteger(attempts) || attempts < 0)
    throw new Error('Invalid attempts');
  if (!Number.isSafeInteger(maxRunMs) || maxRunMs < 180_000)
    throw new Error('Invalid max-run-ms: reserve at least 180000 ms');
  const output = resolve(options.get('--out') ?? '.work/pool');
  if (output === process.cwd())
    throw new Error('Use a staging directory such as .work/pool');
  const checkpointPath = resolve(output, 'pool.json');
  const saved = existsSync(checkpointPath)
    ? mechanicalCheckpointSchema.parse(
        JSON.parse(readFileSync(checkpointPath, 'utf8'))
      )
    : undefined;
  const requestedSeed = options.has('--seed')
    ? Number(options.get('--seed'))
    : undefined;
  const target = Number(options.get('--target') ?? saved?.target ?? 200);
  const targets = mechanicalTargets(target);
  if (verifying && !saved)
    throw new Error('Nothing to verify: no pool.json in the output directory');
  if (!saved && requestedSeed === undefined)
    throw new Error('Pass --seed=<uint32> when starting a new pool');
  const checkpoint: MechanicalCheckpoint =
    saved ??
    mechanicalCheckpointSchema.parse({
      target,
      seed: requestedSeed,
      cursor: 0,
      elapsedMs: 0,
      rejections: {},
      constructors: {},
      rows: [],
    });
  if (checkpoint.target !== target)
    throw new Error('Checkpoint target differs; use a fresh staging directory');
  if (requestedSeed !== undefined && checkpoint.seed !== requestedSeed)
    throw new Error('Checkpoint seed differs; use a fresh staging directory');
  mkdirSync(output, { recursive: true });
  const counts = () =>
    Object.fromEntries(
      tiers.map((tier) => [
        tier,
        checkpoint.rows.filter((row) => row.tier === tier).length,
      ])
    );
  const save = () => {
    writeFileSync(
      `${checkpointPath}.tmp`,
      JSON.stringify(checkpoint, null, 2) + '\n'
    );
    renameSync(`${checkpointPath}.tmp`, checkpointPath);
  };
  const seen: MechanicalRow[] = [];
  const codeHash = verifierHash();
  const progressPath = resolve(output, 'verification-progress.json');
  const savedProgress =
    verifying && existsSync(progressPath)
      ? validVerificationProgress(
          JSON.parse(readFileSync(progressPath, 'utf8')),
          checkpoint,
          codeHash
        )
      : undefined;
  const verificationProgress = savedProgress ?? {
    formatVersion: 1,
    checkpointHash: verificationHash(checkpoint),
    verifierHash: codeHash,
    rows: [],
  };
  const completed = new Set(verificationProgress.rows.map((row) => row.id));
  const verificationStarted = Date.now();
  for (const row of checkpoint.rows) {
    if (!compactBoardFits(row.raw, row.tier))
      throw new Error(`Board exceeds its tier limit ${row.raw.id}`);
    if (
      seen.some((previous) => previous.raw.id === row.raw.id) ||
      mechanicalDuplicate(seen, row)
    )
      throw new Error(`Duplicate checkpoint row ${row.raw.id}`);
    if (
      visualDuplicate(
        seen.map((previous) => previous.raw),
        row.raw
      )
    )
      throw new Error(`Visual duplicate checkpoint row ${row.raw.id}`);
    if (contentHash(row.raw) !== row.contentHash)
      throw new Error(`Hash mismatch ${row.raw.id}`);
    if (!options.has('--batch') && !completed.has(row.raw.id)) {
      const rowStarted = Date.now();
      const verified = runProofWorker('verify', row);
      if ('rejections' in verified)
        throw new Error(
          `Checkpoint verification failed ${row.raw.id}: ${verified.rejections.join(', ')}`
        );
      if (verificationHash(verified.row) !== verificationHash(row))
        throw new Error(`Worker row mismatch ${row.raw.id}`);
      if (verifying) {
        verificationProgress.rows.push({
          id: row.raw.id,
          rowHash: verificationHash(row),
          elapsedMs: Date.now() - rowStarted,
        });
        writeFileSync(
          `${progressPath}.tmp`,
          JSON.stringify(verificationProgress, null, 2) + '\n'
        );
        renameSync(`${progressPath}.tmp`, progressPath);
      }
    }
    seen.push(row);
    console.log(
      `${options.has('--batch') ? 'loaded' : 'verified'} ${row.raw.id} ${seen.length}/${checkpoint.rows.length}`
    );
  }
  const verificationMs = Date.now() - verificationStarted;
  if (
    tiers.some(
      (tier) =>
        checkpoint.rows.filter((row) => row.tier === tier).length >
        targets[tier]
    )
  )
    throw new Error('Checkpoint exceeds tier target');
  const started = Date.now();
  const visualIndex = visualAdmissionIndex(
    checkpoint.rows.map((row) => row.raw)
  );
  let family = '';
  let candidateStarted = started;
  const recordTime = () => {
    const now = Date.now();
    checkpoint.elapsedMs += now - candidateStarted;
    const counter = checkpoint.constructors[family];
    if (counter) counter.elapsedMs += now - candidateStarted;
    candidateStarted = now;
  };
  const reject = (reason: string) => {
    checkpoint.rejections[reason] = (checkpoint.rejections[reason] ?? 0) + 1;
    const counter = checkpoint.constructors[family];
    if (counter)
      counter.rejections[reason] = (counter.rejections[reason] ?? 0) + 1;
    recordTime();
    save();
    console.log(
      `rejected cursor=${checkpoint.cursor} family=${family} ${reason}`
    );
  };
  let examined = 0;
  for (
    ;
    !verifying && examined < attempts && checkpoint.rows.length < target;
    examined += 1
  ) {
    if (Date.now() - started + 180_000 >= maxRunMs) break;
    const cursor = checkpoint.cursor++;
    const seed = (checkpoint.seed + cursor * 7919) >>> 0;
    const availableTiers = tiers.filter(
      (tier) =>
        checkpoint.rows.filter((row) => row.tier === tier).length <
        targets[tier]
    );
    const tier = availableTiers[cursor % availableTiers.length]!;
    family = tier;
    candidateStarted = Date.now();
    const counter = (checkpoint.constructors[family] ??= {
      attempts: 0,
      accepted: 0,
      lastNovel: 0,
      elapsedMs: 0,
      rejections: {},
    });
    counter.attempts += 1;
    const programSeed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const nonbank = tier === 'advanced';
    const shortEasy = nonbank && Math.floor(cursor / 2) % 3 !== 0;
    const stages = shortEasy ? 2 : tier === 'master' ? 4 : 3;
    let compositionFailure = 'composition replay';
    const composed = compactDecisionCandidate(programSeed, {
      tier,
      programMode: shortEasy
        ? 'nonbank-two-stage'
        : nonbank
          ? 'nonbank-three-stage'
          : 'bounded',
      ...(tier !== 'master' ? { layoutMode: 'varied' as const } : {}),
      onReject: (reason) => {
        compositionFailure = `composition:${reason}`;
      },
      ...(tier === 'master' ? { deposits: 2 } : {}),
      acceptsLayout: (raw) => {
        if (!visualIndex.accepts(raw)) return false;
        const level = compileLevel(raw);
        if (
          TIER_GATES[tier].policiesMustLose.some(
            (index) => runBaselinePolicy(level, POLICY_IDS[index - 1]!).won
          )
        )
          return false;
        const preflight = analyzeDifficulty(level, tier, {
          maxStates: 20_000,
          maxEdges: 200_000,
          maxMs: 2_000,
        });
        return (
          preflight.status === 'analyzed' &&
          preflight.report.gateViolations.length === 0
        );
      },
    });
    const construction = `${family}:stages=${stages}:program=${programSeed}${nonbank ? ':nonbank' : ''}`;
    if (!composed) {
      reject(compositionFailure);
      continue;
    }
    const raw = generatedLevelSchema.parse({
      ...composed.raw,
      id: `season-${tier}-${cursor + 1}`,
      revision: 1,
      title: `Puzzle ${cursor + 1}`,
    });
    const visualReason = visualDuplicate(
      checkpoint.rows.map((row) => row.raw),
      raw
    );
    if (visualReason) {
      reject(visualReason);
      continue;
    }
    const level = compileLevel(raw);
    if (
      TIER_GATES[tier].policiesMustLose.some(
        (index) => runBaselinePolicy(level, POLICY_IDS[index - 1]!).won
      )
    ) {
      reject('baseline policy');
      continue;
    }
    const preflight = analyzeDifficulty(level, tier, {
      maxStates: 20_000,
      maxEdges: 200_000,
      maxMs: 2_000,
    });
    if (preflight.status !== 'analyzed') {
      reject('preflight:graph-limit');
      continue;
    }
    if (preflight.report.gateViolations.length) {
      for (const reason of preflight.report.gateViolations) reject(reason);
      continue;
    }
    const result = runProofWorker('evaluate', {
      raw,
      tier,
      dependencies: composed.dependencies,
      construction,
      seed,
      previous: checkpoint.rows.map(
        ({ mechanical, sequence, stepSequence }) => ({
          mechanical,
          sequence,
          stepSequence,
        })
      ),
    });
    if ('rejections' in result) {
      for (const reason of result.rejections) reject(reason);
      continue;
    }
    const row = result.row;
    checkpoint.rows.push(row);
    visualIndex.add(row.raw);
    counter.accepted += 1;
    counter.lastNovel = counter.attempts;
    recordTime();
    save();
    console.log(
      `retained ${row.raw.id} ${tier} actions=${row.minimumActions} steps=${row.minimumSteps} ${row.elapsedMs}ms pool=${checkpoint.rows.length}/${target}`
    );
  }
  const runMs = Date.now() - started;
  if (
    verifying &&
    (verifierHash() !== codeHash ||
      verificationHash(
        mechanicalCheckpointSchema.parse(
          JSON.parse(readFileSync(checkpointPath, 'utf8'))
        )
      ) !== verificationProgress.checkpointHash)
  ) {
    throw new Error('Verification inputs changed during run');
  }
  save();
  const summary = {
    target,
    targets,
    retained: checkpoint.rows.length,
    counts: counts(),
    examinedThisRun: examined,
    checkpointHash: verificationHash(checkpoint),
    examinedTotal: checkpoint.cursor,
    runMs,
    maxRunMs,
    verificationMs,
    totalMs: checkpoint.elapsedMs,
    complete: checkpoint.rows.length === target,
    independentlyVerified: verifying ? seen.length : 0,
    verifierHash: codeHash,
    verificationProofMs: verifying
      ? verificationProgress.rows.reduce((sum, row) => sum + row.elapsedMs, 0)
      : 0,
    verificationManifest: verifying ? verificationProgress : undefined,
    roleSequences: new Set(checkpoint.rows.map((row) => row.sequence)).size,
    stepRoleSequences: new Set(checkpoint.rows.map((row) => row.stepSequence))
      .size,
    mechanicalSignatures: new Set(checkpoint.rows.map((row) => row.mechanical))
      .size,
    visualAudit: auditVisualTopology(checkpoint.rows),
    rejections: checkpoint.rejections,
    constructors: checkpoint.constructors,
  };
  writeFileSync(
    resolve(output, verifying ? 'verification.json' : 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n'
  );
  console.log(JSON.stringify(summary, null, 2));
  if (verifying && !summary.complete)
    console.log('Partial pool verified; not eligible for emission.');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const mode = process.argv[2];
  if (mode === '--proof-worker=evaluate') {
    console.log(
      JSON.stringify(
        evaluateMechanicalCandidate(
          evaluationSchema.parse(JSON.parse(readFileSync(0, 'utf8')))
        )
      )
    );
  } else if (mode === '--proof-worker=verify') {
    const row = mechanicalRowSchema.parse(JSON.parse(readFileSync(0, 'utf8')));
    const started = Date.now();
    verifyMechanicalRow(row, (stage) =>
      console.error(`proof-stage=${stage} elapsedMs=${Date.now() - started}`)
    );
    console.log(JSON.stringify({ row }));
  } else runMechanicalPool(process.argv.slice(2));
}
