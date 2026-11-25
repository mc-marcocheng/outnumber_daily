import { describe, expect, it } from 'vitest';
import {
  mechanicalCheckpointSchema,
  mechanicalTargets,
} from '../tools/mechanical-pool';
import {
  evaluateMechanicalCandidate,
  requiredTileInGraph,
  runMechanicalPool,
  runProofWorker,
  validVerificationProgress,
  verificationHash,
  verificationTimeoutMs,
  verifyMechanicalRow,
} from '../tools/build-pool';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExactGraph } from '../src/shared/game/analysis-graph';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  analyzeDifficulty,
  GRAPH_BUDGETS,
} from '../src/shared/game/difficulty';
import { compactDecisionCandidate } from '../tools/decisions';
import { proveRequiredTile } from '../src/shared/game/claims';

const tier = 'advanced';
const emptyCheckpoint = {
  target: 50,
  seed: 7,
  cursor: 903,
  elapsedMs: 0,
  rejections: {},
  constructors: {},
  rows: [],
};

/** A small generated Easy board that passes every tier gate, so the proofs below run on the real path. */
function fixtureRow() {
  const wanted = {
    terrain: ['....', '....', '.###', '....', '....'],
    startCell: 13,
  };
  const candidate = compactDecisionCandidate(3955072965, {
    programMode: 'nonbank-two-stage',
    layoutMode: 'varied',
    acceptsLayout: (raw) =>
      raw.startCell === wanted.startCell &&
      raw.terrain.join('/') === wanted.terrain.join('/'),
  });
  if (!candidate) throw new Error('Missing generated fixture');
  const result = evaluateMechanicalCandidate({
    ...candidate,
    tier,
    seed: 1,
    construction: 'test-fixture',
    previous: [],
  });
  if (!('row' in result))
    throw new Error(`Fixture rejected: ${result.rejections.join(', ')}`);
  const graph = buildExactGraph(
    compileLevel(result.row.raw),
    GRAPH_BUDGETS[tier]
  );
  if (graph.status !== 'complete') throw new Error('Incomplete fixture graph');
  return { row: result.row, graph: graph.graph };
}

describe('pool checkpoints', () => {
  it('validates options and distributes arbitrary targets', () => {
    expect(() => runMechanicalPool(['--batch', '--verify'])).toThrow(
      'only for generation'
    );
    expect(() => runMechanicalPool(['--batch=false'])).toThrow(
      'only for generation'
    );
    expect(() => runMechanicalPool(['--max-run-ms=179999'])).toThrow(
      'Invalid max-run-ms'
    );
    expect(() => runMechanicalPool(['--max-run-ms=NaN'])).toThrow(
      'Invalid max-run-ms'
    );
    expect(() => runMechanicalPool(['--fork-from=somewhere'])).toThrow(
      'Unknown option'
    );
    expect(mechanicalTargets(200)).toEqual({
      advanced: 67,
      expert: 67,
      master: 66,
    });
    expect(mechanicalTargets(1000)).toEqual({
      advanced: 334,
      expert: 333,
      master: 333,
    });
    expect(mechanicalTargets(1001)).toEqual({
      advanced: 334,
      expert: 334,
      master: 333,
    });
    expect(() => mechanicalTargets(0)).toThrow();
  });
  it('requires a seed and rejects unknown checkpoint shapes', () => {
    expect(mechanicalCheckpointSchema.safeParse([]).success).toBe(false);
    expect(mechanicalCheckpointSchema.safeParse(emptyCheckpoint).success).toBe(
      true
    );
    expect(
      mechanicalCheckpointSchema.safeParse({
        ...emptyCheckpoint,
        seed: undefined,
      }).success
    ).toBe(false);
    expect(
      mechanicalCheckpointSchema.safeParse({ ...emptyCheckpoint, seed: -1 })
        .success
    ).toBe(false);
    expect(
      mechanicalCheckpointSchema.safeParse({
        ...emptyCheckpoint,
        unexpected: true,
      }).success
    ).toBe(false);
    const directory = mkdtempSync(join(tmpdir(), 'pool-seed-'));
    try {
      expect(() =>
        runMechanicalPool([`--out=${directory}`, '--attempts=0'])
      ).toThrow('Pass --seed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('independently re-proves a valid row and rejects proof tampering', () => {
    const { row, graph } = fixtureRow();
    expect(requiredTileInGraph(graph, 'boss')).toBe(true);
    expect(requiredTileInGraph(graph, 'nonexistent')).toBe(false);
    for (const tile of row.raw.tiles) {
      expect(requiredTileInGraph(graph, tile.id)).toBe(
        proveRequiredTile(compileLevel(row.raw), tile.id, {
          maxStates: 3_000_000,
          maxMs: 120_000,
        }).ok
      );
    }
    const stages: string[] = [];
    expect(verificationTimeoutMs(row)).toBe(
      180_000 + (4 + row.criticalTileIds.length) * 120_000
    );
    expect(() =>
      verifyMechanicalRow(row, (stage) => stages.push(stage))
    ).not.toThrow();
    expect(stages).toEqual([
      'analysis',
      'graph',
      'actions',
      'steps',
      'respawns',
      ...row.criticalTileIds.map((tileId) => `required:${tileId}`),
      'complete',
    ]);
    expect(() =>
      verifyMechanicalRow({ ...row, contentHash: 'invalid' })
    ).toThrow('Hash mismatch');
    expect(() =>
      verifyMechanicalRow({ ...row, minimumActions: row.minimumActions + 1 })
    ).toThrow('Analysis mismatch');
    expect(() =>
      verifyMechanicalRow({ ...row, mechanical: 'invalid' })
    ).toThrow('Mechanical mismatch');
    expect(() =>
      verifyMechanicalRow({
        ...row,
        criticalTileIds: [...row.criticalTileIds, 'nonexistent'],
      })
    ).toThrow('Analysis mismatch');
    expect(() =>
      verifyMechanicalRow({
        ...row,
        shortestSolution: row.shortestSolution.map(
          () => row.shortestSolution[0]!
        ),
      })
    ).toThrow('Invalid witness');
    expect(runProofWorker('verify', row)).toEqual({ row });
    expect(
      runProofWorker('verify', { ...row, contentHash: 'invalid' })
    ).toEqual({ rejections: ['worker:failed'] });
  }, 120000);
  it('ties verification progress to the checkpoint, tool sources and each row', () => {
    const { row } = fixtureRow();
    const checkpoint = mechanicalCheckpointSchema.parse({
      ...emptyCheckpoint,
      rows: [row],
    });
    const progress = {
      formatVersion: 1,
      checkpointHash: verificationHash(checkpoint),
      verifierHash: 'code',
      rows: [{ id: row.raw.id, rowHash: verificationHash(row), elapsedMs: 1 }],
    };
    expect(validVerificationProgress(progress, checkpoint, 'code')).toEqual(
      progress
    );
    expect(
      validVerificationProgress(progress, checkpoint, 'changed-code')
    ).toBeUndefined();
    expect(
      validVerificationProgress(
        progress,
        { ...checkpoint, target: 200 },
        'code'
      )
    ).toBeUndefined();
    expect(
      validVerificationProgress(
        { ...progress, rows: [{ ...progress.rows[0], rowHash: 'tampered' }] },
        checkpoint,
        'code'
      )
    ).toBeUndefined();
    expect(
      validVerificationProgress(
        { ...progress, rows: [...progress.rows, ...progress.rows] },
        checkpoint,
        'code'
      )
    ).toBeUndefined();
    expect(
      validVerificationProgress(
        { ...progress, unexpected: true },
        checkpoint,
        'code'
      )
    ).toBeUndefined();
  });
  it('resumes, batch-loads and verifies a saved pool', () => {
    const { row } = fixtureRow();
    const directory = mkdtempSync(join(tmpdir(), 'pool-resume-'));
    const write = (rows: unknown[]) =>
      writeFileSync(
        join(directory, 'pool.json'),
        JSON.stringify({ ...emptyCheckpoint, rows })
      );
    const summary = () =>
      JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
    try {
      write([{ ...row, contentHash: 'invalid' }]);
      expect(() =>
        runMechanicalPool(['--batch', '--attempts=0', `--out=${directory}`])
      ).toThrow('Hash mismatch');
      expect(() =>
        runMechanicalPool(['--seed=8', '--attempts=0', `--out=${directory}`])
      ).toThrow('seed differs');
      write([row]);
      runMechanicalPool([
        '--attempts=1',
        '--max-run-ms=180000',
        `--out=${directory}`,
      ]);
      expect(summary()).toMatchObject({
        examinedThisRun: 0,
        examinedTotal: 903,
        retained: 1,
        maxRunMs: 180000,
      });
      runMechanicalPool(['--batch', '--attempts=0', `--out=${directory}`]);
      expect(summary()).toMatchObject({
        retained: 1,
        independentlyVerified: 0,
      });
      runMechanicalPool(['--verify', `--out=${directory}`]);
      const verified = JSON.parse(
        readFileSync(join(directory, 'verification.json'), 'utf8')
      );
      expect(verified).toMatchObject({
        retained: 1,
        independentlyVerified: 1,
        verificationManifest: {
          checkpointHash: verified.checkpointHash,
          verifierHash: verified.verifierHash,
          rows: [{ id: row.raw.id, rowHash: verificationHash(row) }],
        },
      });
      runMechanicalPool(['--verify', `--out=${directory}`]);
      expect(
        JSON.parse(readFileSync(join(directory, 'verification.json'), 'utf8'))
          .verificationManifest
      ).toEqual(verified.verificationManifest);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 180000);
  it('exposes only a complete analysis graph without changing the report', () => {
    const level = compileLevel(fixtureRow().row.raw);
    const graph = buildExactGraph(level, GRAPH_BUDGETS[tier]);
    if (graph.status !== 'complete')
      throw new Error('Incomplete fixture graph');
    let completedGraph;
    const report = analyzeDifficulty(
      level,
      tier,
      GRAPH_BUDGETS[tier],
      (complete) => {
        completedGraph = complete;
      }
    );
    expect(completedGraph).toEqual(graph.graph);
    expect(report).toEqual(analyzeDifficulty(level, tier, GRAPH_BUDGETS[tier]));
    let incompleteCallback = false;
    expect(
      analyzeDifficulty(
        level,
        tier,
        { ...GRAPH_BUDGETS[tier], maxStates: 0 },
        () => {
          incompleteCallback = true;
        }
      ).status
    ).toBe('limit');
    expect(incompleteCallback).toBe(false);
  });
});
