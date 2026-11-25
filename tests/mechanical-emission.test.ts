import { describe, expect, it } from 'vitest';
import { buildBundle, validateEmission } from '../tools/emit-season';
import {
  mechanicalCheckpointSchema,
  mechanicalTargets,
  SEASON_BOARD_LIMITS,
  type MechanicalRow,
} from '../tools/mechanical-pool';
import { sampleSeason as sample } from './sample-season';
import { verificationHash } from '../tools/build-pool';
import { contentHash } from '../tools/content-hash';
import { seasonBundleSchema } from '../src/shared/season-bundle';

const emptyCheckpoint = {
  target: 30,
  seed: 1,
  cursor: 0,
  elapsedMs: 0,
  rejections: {},
  constructors: {},
  rows: [],
};

function guardRows(count: number): MechanicalRow[] {
  const targets = mechanicalTargets(count);
  return Array.from({ length: count }, (_, index) => {
    const level = {
      formatVersion: 1 as const,
      id: `guard-${index}`,
      revision: 1,
      title: 'Guard',
      width: 4,
      terrain: ['....'],
      startCell: 0,
      startValue: '9',
      spareLives: 0,
      tiles: [
        { id: 'cut', cell: 1, kind: 'subtract' as const, amount: '2' },
        { id: 'split', cell: 2, kind: 'divide' as const, amount: '2' },
        { id: 'boss', cell: 3, kind: 'boss' as const, value: '2' },
      ],
    };
    const tier =
      index < targets.advanced
        ? 'advanced'
        : index < targets.advanced + targets.expert
          ? 'expert'
          : 'master';
    return {
      tier,
      raw: level,
      mechanical: `mechanical-${index}`,
      sequence: `sequence-${index}`,
      stepSequence: `steps-${index}`,
      construction: 'guard',
      seed: index,
      contentHash: contentHash(level),
      minimumActions: 3,
      minimumSteps: 3,
      requiredRespawns: 0,
      shortestSolution: ['cut', 'split', 'boss'],
      stepOptimalSolution: ['cut', 'split', 'boss'],
      criticalTileIds: ['cut', 'split'],
      dependencies: [],
      elapsedMs: 0,
    };
  });
}

describe('season emission guard', () => {
  it('rejects incomplete pools', () => {
    const checkpoint = mechanicalCheckpointSchema.parse(emptyCheckpoint);
    expect(() => validateEmission(checkpoint, {}, 'current-code')).toThrow(
      'complete pool'
    );
  });
  it('rejects oversized boards, stale pins, partial manifests and unbalanced pools', () => {
    const rows = guardRows(30);
    const checkpoint = mechanicalCheckpointSchema.parse({
      ...emptyCheckpoint,
      cursor: 30,
      rows,
    });
    const oversized = {
      ...checkpoint,
      rows: checkpoint.rows.map((row, index) =>
        index === 0
          ? {
              ...row,
              raw: {
                ...row.raw,
                terrain: Array.from(
                  { length: SEASON_BOARD_LIMITS.advanced.height + 1 },
                  (_, line) =>
                    row.raw.terrain[line] ?? '.'.repeat(row.raw.width)
                ),
              },
            }
          : row
      ),
    };
    expect(() => validateEmission(oversized, {}, 'current')).toThrow(
      'tier dimensions'
    );
    const manifest = {
      formatVersion: 1,
      checkpointHash: verificationHash(checkpoint),
      verifierHash: 'current',
      rows: checkpoint.rows.map((row) => ({
        id: row.raw.id,
        rowHash: verificationHash(row),
        elapsedMs: 1,
      })),
    };
    const report = {
      complete: true,
      independentlyVerified: 30,
      checkpointHash: manifest.checkpointHash,
      verifierHash: 'current',
      verificationManifest: manifest,
      visualAudit: {},
    };
    expect(() => validateEmission(checkpoint, report, 'changed')).toThrow(
      'Stale or incomplete'
    );
    expect(() =>
      validateEmission(
        checkpoint,
        {
          ...report,
          verificationManifest: { ...manifest, rows: manifest.rows.slice(1) },
        },
        'current'
      )
    ).toThrow('Stale or incomplete');
    expect(() =>
      validateEmission(
        checkpoint,
        {
          ...report,
          verificationManifest: {
            ...manifest,
            rows: manifest.rows.map((row, index) =>
              index === 0 ? { ...row, rowHash: 'tampered' } : row
            ),
          },
        },
        'current'
      )
    ).toThrow('Stale or incomplete');
    expect(() =>
      validateEmission(
        {
          ...checkpoint,
          rows: checkpoint.rows.map((row, index) =>
            index === 0 ? { ...row, tier: 'master' } : row
          ),
        },
        report,
        'current'
      )
    ).toThrow('Unbalanced');
  });
  it('builds a bundle that matches the server schema', () => {
    const ids = Object.keys(sample.levels);
    const rows = ids.map((id, index) => {
      const raw = sample.levels[id as keyof typeof sample.levels];
      const certificate =
        sample.certificates[id as keyof typeof sample.certificates];
      return {
        tier: index < 5 ? 'advanced' : index < 10 ? 'expert' : 'master',
        raw,
        mechanical: id,
        sequence: id,
        stepSequence: id,
        construction: 'sample',
        seed: index,
        contentHash: certificate.contentHash,
        minimumActions: certificate.minimumActions,
        minimumSteps: certificate.minimumSteps,
        requiredRespawns: certificate.requiredRespawns ?? 0,
        shortestSolution: certificate.shortestSolution,
        stepOptimalSolution: certificate.stepOptimalSolution,
        criticalTileIds: certificate.criticalTileIds,
        dependencies: [],
        elapsedMs: 0,
      } satisfies MechanicalRow;
    });
    const certificates = new Map(
      ids.map((id) => [
        id,
        sample.certificates[id as keyof typeof sample.certificates],
      ])
    );
    expect(
      seasonBundleSchema.parse(buildBundle(rows, certificates)).pools.advanced
    ).toHaveLength(5);
    expect(() => buildBundle(rows, new Map())).toThrow('Missing certificate');
  });
});
