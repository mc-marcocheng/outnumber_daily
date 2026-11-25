import { expect, it } from 'vitest';
import {
  GRAPH_BUDGETS,
  TIER_GATES,
  analyzeDifficulty,
  evaluateGates,
} from '../src/shared/game/difficulty';
import { compileLevel } from '../src/shared/game/level-schema';
import { replayWithSteps } from '../src/shared/replay';
import { evaluateMechanicalCandidate } from '../tools/build-pool';
import { compactDecisionCandidate } from '../tools/decisions';
import {
  mechanicalDuplicate,
  roleDistance,
} from '../tools/mechanical-signature';
import type { MechanicalRow } from '../tools/mechanical-pool';

it('keeps Easy decisions nontrivial and strictly below Medium and Hard minima', () => {
  expect(TIER_GATES.advanced).toEqual({
    minMeaningfulForks: 1,
    minConceptualForks: 0,
    minDeepForks: 0,
    maxForcedRun: 4,
    minPlausibleTrapEdges: 0,
    minPlausibleTrapShare: { numerator: 1, denominator: 5 },
    minOpeningStates: 3,
    minOpeningTrapShare: null,
    minTightCombats: 1,
    minBankForks: 1,
    bankForksOnlyOnBankingBoards: true,
    policiesMustLose: [1],
    maxPeakDigits: 6,
    actionRange: { min: 5, max: 16 },
  });
  for (const metric of ['minMeaningfulForks', 'minTightCombats'] as const) {
    expect(TIER_GATES.advanced[metric]).toBeLessThan(TIER_GATES.expert[metric]);
    expect(TIER_GATES.expert[metric]).toBeLessThan(TIER_GATES.master[metric]);
  }
  expect(TIER_GATES.advanced.actionRange.min).toBeLessThan(
    TIER_GATES.expert.actionRange.min
  );
  expect(TIER_GATES.expert.actionRange.min).toBeLessThan(
    TIER_GATES.master.actionRange.min
  );
});

it('admits full-proof 4x5 Easy fixtures in a bounded 100-seed nonbank sample', () => {
  const accepted: MechanicalRow[] = [];
  const distinct: MechanicalRow[] = [];
  let zeroForkRejections = 0;
  for (let seed = 0; seed < 100; seed += 1) {
    const candidate = compactDecisionCandidate(seed, {
      programMode: 'nonbank-three-stage',
    });
    if (!candidate)
      throw new Error(`Missing bounded nonbank candidate ${seed}`);
    expect(candidate.raw.width).toBe(4);
    expect(candidate.raw.terrain).toHaveLength(5);
    expect(candidate.raw.spareLives).toBe(0);
    const result = evaluateMechanicalCandidate({
      ...candidate,
      tier: 'advanced',
      seed,
      construction: 'compact-reducing:nonbank-three-stage',
      previous: [],
    });
    if (!('row' in result)) {
      if (result.rejections.includes('meaningfulForksMin 0 < 1'))
        zeroForkRejections += 1;
      continue;
    }
    const level = compileLevel(candidate.raw);
    const analysis = analyzeDifficulty(
      level,
      'advanced',
      GRAPH_BUDGETS.advanced
    );
    if (analysis.status !== 'analyzed')
      throw new Error(`Missing complete report ${seed}`);
    expect(analysis.report.gateViolations).toEqual([]);
    expect(analysis.report.meaningfulForksMin).toBeGreaterThanOrEqual(1);
    expect(analysis.report.tightCombatCountMin).toBeGreaterThanOrEqual(1);
    expect(analysis.report.openingStates).toBeGreaterThanOrEqual(3);
    expect(analysis.report.policyWins).not.toContain('largest-bite');
    expect(analysis.report.policyWinsRenamed).not.toContain('largest-bite');
    expect(result.row.minimumActions).toBeGreaterThanOrEqual(5);
    expect(result.row.minimumActions).toBeLessThanOrEqual(16);
    expect(result.row.requiredRespawns).toBe(0);
    expect(
      candidate.raw.tiles.every(
        (tile) =>
          tile.kind === 'boss' || result.row.criticalTileIds.includes(tile.id)
      )
    ).toBe(true);
    expect(candidate.raw.tiles.some((tile) => tile.kind === 'subtract')).toBe(
      true
    );
    expect(candidate.raw.tiles.some((tile) => tile.kind === 'divide')).toBe(
      true
    );
    expect(result.row.dependencies).toEqual(candidate.dependencies);
    const replay = replayWithSteps(level, result.row.stepOptimalSolution);
    expect(replay.state.phase).toBe('won');
    expect(replay.steps).toBe(result.row.minimumSteps);
    accepted.push(result.row);
    if (!mechanicalDuplicate(distinct, result.row)) distinct.push(result.row);
  }
  expect(accepted.map((row) => row.seed)).toEqual([
    0, 4, 19, 31, 32, 52, 68, 70, 72, 73, 90, 95,
  ]);
  expect(zeroForkRejections).toBe(80);
  expect(distinct.map((row) => row.seed)).toEqual([
    0, 4, 19, 31, 32, 52, 68, 70, 72,
  ]);
  for (const [index, row] of distinct.entries()) {
    for (const previous of distinct.slice(0, index)) {
      expect(row.mechanical).not.toBe(previous.mechanical);
      expect(
        roleDistance(row.sequence, previous.sequence)
      ).toBeGreaterThanOrEqual(3);
      expect(
        roleDistance(row.stepSequence, previous.stepSequence)
      ).toBeGreaterThanOrEqual(3);
    }
  }
}, 30000);

it('requires an Easy decision, a tight combat, a plausible mistake and a bank fork only when banking', () => {
  const candidate = compactDecisionCandidate(0, {
    programMode: 'nonbank-three-stage',
  });
  if (!candidate) throw new Error('Missing Easy boundary fixture');
  const level = compileLevel(candidate.raw);
  const analysis = analyzeDifficulty(level, 'advanced', GRAPH_BUDGETS.advanced);
  if (analysis.status !== 'analyzed')
    throw new Error('Missing Easy boundary report');
  const report = {
    ...analysis.report,
    meaningfulForksMin: 1,
    tightCombatCountMin: 1,
    openingStates: 3,
    forcedRunMax: 4,
    minimumActions: 5,
    plausibleTrapNumerator: 1,
    plausibleTrapDenominator: 5,
    bankForksMin: 0,
  };
  expect(evaluateGates(report, level, 'advanced')).toEqual([]);
  expect(
    evaluateGates({ ...report, minimumActions: 16 }, level, 'advanced')
  ).toEqual([]);
  expect(
    evaluateGates({ ...report, meaningfulForksMin: 0 }, level, 'advanced')
  ).toContain('meaningfulForksMin 0 < 1');
  expect(
    evaluateGates({ ...report, tightCombatCountMin: 0 }, level, 'advanced')
  ).toContain('tightCombatCountMin 0 < 1');
  expect(
    evaluateGates({ ...report, openingStates: 2 }, level, 'advanced')
  ).toContain('openingStates 2 < 3');
  expect(
    evaluateGates({ ...report, forcedRunMax: 5 }, level, 'advanced')
  ).toContain('forcedRunMax 5 > 4');
  expect(
    evaluateGates(
      { ...report, plausibleTrapNumerator: 0, plausibleTrapDenominator: 0 },
      level,
      'advanced'
    )
  ).toContain('plausibleTrapShare 0/0 < 1/5');
  expect(
    evaluateGates({ ...report, plausibleTrapDenominator: 6 }, level, 'advanced')
  ).toContain('plausibleTrapShare 1/6 < 1/5');
  expect(
    evaluateGates({ ...report, minimumActions: 4 }, level, 'advanced')
  ).toContain('minimumActions 4 < 5');
  expect(
    evaluateGates({ ...report, minimumActions: 17 }, level, 'advanced')
  ).toContain('minimumActions 17 > 16');
  expect(
    evaluateGates(
      { ...report, policyWins: ['largest-bite'] },
      level,
      'advanced'
    )
  ).toContain('policy largest-bite wins but must lose');
  expect(
    evaluateGates(report, { ...level, spareLives: 1 }, 'advanced')
  ).toContain('bankForksMin 0 < 1');
  expect(
    evaluateGates(
      { ...report, bankForksMin: 1 },
      { ...level, spareLives: 1 },
      'advanced'
    )
  ).toEqual([]);
});
