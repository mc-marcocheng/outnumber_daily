import { expect, it } from 'vitest';
import { compileLevel, type RawLevel } from '../src/shared/game/level-schema';
import { replayWithSteps } from '../src/shared/replay';
import {
  compactDecisionCandidate,
  type CompactDecisionOptions,
} from '../tools/decisions';
import { visualAdmissionIndex, visualTopology } from '../tools/visual-topology';
import {
  buildExactGraph,
  type ExactGraph,
} from '../src/shared/game/analysis-graph';
import {
  GRAPH_BUDGETS,
  POLICY_IDS,
  TIER_GATES,
  analyzeDifficulty,
  runBaselinePolicy,
} from '../src/shared/game/difficulty';
import { initialState, interact } from '../src/shared/game/engine';
import {
  provesWinningDependencies,
  roleSequence,
} from '../tools/mechanical-signature';
import { evaluateMechanicalCandidate } from '../tools/build-pool';
import {
  mechanicalDuplicate,
  roleDistance,
  type MechanicalIdentity,
} from '../tools/mechanical-signature';
import { SEASON_BOARD_LIMITS } from '../tools/mechanical-pool';

it('keeps varied geometry opt-in and leaves Hard unchanged', () => {
  for (const seed of [0, 1, 9, 170, 3658601378]) {
    for (const tier of ['advanced', 'expert', 'master'] as const) {
      for (const programMode of [undefined, 'bounded'] as const) {
        expect(
          compactDecisionCandidate(seed, {
            tier,
            programMode,
            layoutMode: undefined,
          })
        ).toEqual(compactDecisionCandidate(seed, { tier, programMode }));
        if (tier === 'master') {
          const acceptsLayout = (raw: RawLevel) =>
            visualTopology(raw).topology !== 'never';
          expect(
            compactDecisionCandidate(seed, {
              tier,
              programMode,
              layoutMode: 'varied',
              acceptsLayout,
            })
          ).toEqual(
            compactDecisionCandidate(seed, { tier, programMode, acceptsLayout })
          );
        }
      }
    }
  }
  for (const programMode of ['bounded', 'nonbank-three-stage'] as const) {
    expect(
      compactDecisionCandidate(0, {
        programMode,
        layoutMode: 'varied',
        acceptsLayout: () => false,
      })
    ).toBeUndefined();
  }
});

it('builds opt-in nonbank two-stage Easy witnesses with three-resource openings and varied finishes', () => {
  const lengths = new Set<number>();
  const finishes = new Set<string>();
  let threeResourceOpening = false;
  let admitted = 0;
  for (const seed of [
    ...Array.from({ length: 128 }, (_, index) => index),
    1764075293,
  ]) {
    const options: CompactDecisionOptions = {
      programMode: 'nonbank-two-stage',
      layoutMode: 'varied',
    };
    const candidate = compactDecisionCandidate(seed, options);
    if (!candidate) continue;
    admitted += 1;
    expect(candidate).toEqual(compactDecisionCandidate(seed, options));
    expect(candidate.raw.startValue).toBe('3');
    expect(candidate.raw.spareLives).toBe(0);
    expect(
      candidate.raw.tiles.filter((tile) => tile.kind === 'set')
    ).toHaveLength(1);
    expect(
      candidate.raw.tiles.filter((tile) => tile.id.startsWith('window-'))
    ).toHaveLength(2);
    expect(
      candidate.raw.tiles.some(
        (tile) => tile.id === 'ledger' || tile.id.startsWith('deposit-')
      )
    ).toBe(false);
    expect(candidate.witness.length).toBeGreaterThanOrEqual(7);
    expect(candidate.witness.length).toBeLessThanOrEqual(12);
    expect(
      replayWithSteps(compileLevel(candidate.raw), candidate.witness).state
        .phase
    ).toBe('won');
    lengths.add(candidate.witness.length);
    for (const tile of candidate.raw.tiles.filter((tile) =>
      tile.id.startsWith('finish')
    ))
      finishes.add(tile.kind);
    threeResourceOpening ||=
      candidate.raw.tiles.filter((tile) => tile.id.startsWith('resource-0-'))
        .length === 3;
  }
  expect(admitted).toBeGreaterThanOrEqual(100);
  expect(lengths).toEqual(new Set([7, 8, 9, 10, 11, 12]));
  expect(finishes).toEqual(new Set(['add', 'multiply', 'enemy']));
  expect(threeResourceOpening).toBe(true);
  for (const tier of ['expert', 'master'] as const) {
    expect(
      compactDecisionCandidate(0, { programMode: 'nonbank-two-stage', tier })
    ).toBeUndefined();
  }
  for (const stages of [1, 3, 4, 2.5]) {
    expect(
      compactDecisionCandidate(0, { programMode: 'nonbank-two-stage', stages })
    ).toBeUndefined();
  }
  expect(
    compactDecisionCandidate(0, {
      programMode: 'nonbank-two-stage',
      deposits: 1,
    })
  ).toBeUndefined();
  expect(
    compactDecisionCandidate(0, {
      programMode: 'nonbank-two-stage',
      acceptsLayout: () => false,
    })
  ).toBeUndefined();
}, 30000);

it('admits varied two-stage Easy fixtures through unchanged policies, preflight and full criticality proofs', () => {
  const fixtures = [
    {
      seed: 3955072965,
      terrain: ['....', '....', '.###', '....', '....'],
      startCell: 13,
      cells: [14, 19, 18, 17, 4, 5, 6, 1, 7, 8],
    },
    {
      seed: 4251544552,
      terrain: ['...#', '....', '.###', '....', '...#'],
      startCell: 6,
      cells: [1, 0, 4, 5, 12, 13, 16, 17, 15, 8],
    },
    {
      seed: 845992017,
      terrain: ['....', '....', '.###', '...#', '...#'],
      startCell: 17,
      cells: [18, 16, 13, 12, 4, 6, 2, 1, 7, 0, 8],
    },
    {
      seed: 3962814396,
      terrain: ['##.#', '....', '..#.', '..#.', '..#.'],
      startCell: 11,
      cells: [7, 2, 15, 19, 9, 17, 12, 8, 4, 16, 5],
    },
  ];
  const previous: {
    raw: RawLevel;
    mechanical: string;
    sequence: string;
    stepSequence: string;
  }[] = [];
  const index = visualAdmissionIndex(previous.map((row) => row.raw));
  for (const fixture of fixtures) {
    const options: CompactDecisionOptions = {
      programMode: 'nonbank-two-stage',
      layoutMode: 'varied',
      acceptsLayout: (raw) =>
        raw.startCell === fixture.startCell &&
        raw.terrain.join('/') === fixture.terrain.join('/') &&
        raw.tiles.map((tile) => tile.cell).join(',') ===
          fixture.cells.join(',') &&
        index.accepts(raw),
    };
    const candidate = compactDecisionCandidate(fixture.seed, options);
    if (!candidate)
      throw new Error(`Missing two-stage fixture ${fixture.seed}`);
    const witnessSequence = roleSequence(candidate.raw, candidate.witness);
    for (const identity of previous) {
      expect(
        roleDistance(witnessSequence, identity.sequence)
      ).toBeGreaterThanOrEqual(3);
      expect(
        roleDistance(witnessSequence, identity.stepSequence)
      ).toBeGreaterThanOrEqual(3);
    }
    const level = compileLevel(candidate.raw);
    for (const policy of TIER_GATES.advanced.policiesMustLose) {
      expect(runBaselinePolicy(level, POLICY_IDS[policy - 1]!).won).toBe(false);
    }
    let graph: ExactGraph | undefined;
    const preflight = analyzeDifficulty(
      level,
      'advanced',
      { maxStates: 20_000, maxEdges: 200_000, maxMs: 2_000 },
      (complete) => {
        graph = complete;
      }
    );
    if (preflight.status !== 'analyzed' || !graph)
      throw new Error(`Incomplete two-stage preflight ${fixture.seed}`);
    expect(preflight.report.gateViolations).toEqual([]);
    expect(provesWinningDependencies(graph, candidate.dependencies)).toBe(true);
    expect(provesWinningDependencies(graph, [['window-0', 'working']])).toBe(
      false
    );
    const result = evaluateMechanicalCandidate({
      ...candidate,
      tier: 'advanced',
      seed: fixture.seed,
      construction: 'nonbank-two-stage:varied',
      previous,
    });
    if (!('row' in result))
      throw new Error(
        `Two-stage ${fixture.seed}: ${result.rejections.join(', ')}`
      );
    expect(result.row.requiredRespawns).toBe(0);
    expect(result.row.minimumActions).toBeGreaterThanOrEqual(7);
    expect(result.row.minimumActions).toBeLessThanOrEqual(12);
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
    expect(
      replayWithSteps(level, result.row.stepOptimalSolution).state.phase
    ).toBe('won');
    for (const identity of previous) {
      expect(result.row.mechanical).not.toBe(identity.mechanical);
      expect(
        roleDistance(result.row.sequence, identity.sequence)
      ).toBeGreaterThanOrEqual(3);
      expect(
        roleDistance(result.row.stepSequence, identity.stepSequence)
      ).toBeGreaterThanOrEqual(3);
    }
    index.add(result.row.raw);
    previous.push(result.row);
  }
  expect(previous).toHaveLength(fixtures.length);
}, 30000);

it('keeps nonbank three-stage Easy construction explicit and bounded', () => {
  let admitted = 0;
  const rejected: string[] = [];
  for (let seed = 0; seed < 128; seed += 1) {
    const candidate = compactDecisionCandidate(seed, {
      programMode: 'nonbank-three-stage',
      onReject: (reason) => rejected.push(reason),
    });
    if (!candidate) continue;
    admitted += 1;
    expect(candidate).toEqual(
      compactDecisionCandidate(seed, { programMode: 'nonbank-three-stage' })
    );
    expect(candidate.raw.width).toBe(4);
    expect(candidate.raw.terrain).toHaveLength(5);
    expect(candidate.raw.spareLives).toBe(0);
    expect(
      candidate.raw.tiles.filter((tile) => tile.kind === 'set')
    ).toHaveLength(1);
    expect(
      candidate.raw.tiles.filter((tile) => tile.id.startsWith('window-'))
    ).toHaveLength(3);
    expect(
      candidate.raw.tiles.some(
        (tile) => tile.id === 'ledger' || tile.id.startsWith('deposit-')
      )
    ).toBe(false);
    expect(new Set(candidate.raw.tiles.map((tile) => tile.cell)).size).toBe(
      candidate.raw.tiles.length
    );
    expect(
      candidate.raw.tiles.some((tile) => tile.cell === candidate.raw.startCell)
    ).toBe(false);
    expect(
      candidate.raw.tiles.every((tile) => {
        const printed = BigInt(
          tile.kind === 'enemy' || tile.kind === 'boss'
            ? tile.value
            : tile.amount
        );
        return (
          printed > 0n &&
          printed <= 999n &&
          (tile.kind !== 'enemy' ||
            printed + BigInt(tile.maxSurplus ?? '0') <= 999n)
        );
      })
    ).toBe(true);
    const level = compileLevel(candidate.raw);
    let state = initialState(level);
    for (const tileId of candidate.witness) {
      const tile = level.tiles.find((tile) => tile.id === tileId);
      if (tile?.kind === 'divide') {
        expect(tile.amount).toBeGreaterThanOrEqual(2n);
        expect(tile.amount).toBeLessThanOrEqual(9n);
        expect(state.value % tile.amount).toBe(0n);
      }
      const transition = interact(level, state, tileId);
      if (!transition.ok)
        throw new Error(`Invalid nonbank witness ${seed}:${tileId}`);
      state = transition.state;
      if (state.phase === 'playing') {
        expect(state.value).toBeGreaterThan(0n);
        expect(state.value).toBeLessThanOrEqual(999n);
      }
    }
    expect(state.phase).toBe('won');
    expect(replayWithSteps(level, candidate.witness).state.phase).toBe('won');
  }
  expect(admitted).toBeGreaterThanOrEqual(120);
  expect(
    rejected.every(
      (reason) => reason === 'bounded program' || reason === 'layout or witness'
    )
  ).toBe(true);
  for (const seed of [-1, 0.5, Infinity]) {
    expect(
      compactDecisionCandidate(seed, { programMode: 'nonbank-three-stage' })
    ).toBeUndefined();
  }
  for (const tier of ['expert', 'master']) {
    expect(
      compactDecisionCandidate(0, {
        programMode: 'nonbank-three-stage',
        tier: tier === 'expert' ? 'expert' : 'master',
      })
    ).toBeUndefined();
  }
  for (const stages of [1, 2, 4, 2.5]) {
    expect(
      compactDecisionCandidate(0, {
        programMode: 'nonbank-three-stage',
        stages,
      })
    ).toBeUndefined();
  }
  expect(
    compactDecisionCandidate(0, {
      programMode: 'nonbank-three-stage',
      deposits: 1,
    })
  ).toBeUndefined();
  expect(
    compactDecisionCandidate(0, {
      programMode: 'nonbank-three-stage',
      acceptsLayout: () => false,
    })
  ).toBeUndefined();
  expect(
    compactDecisionCandidate(0, {
      programMode: 'nonbank-three-stage',
      tier: 'advanced',
      stages: 3,
    })
  ).toEqual(
    compactDecisionCandidate(0, { programMode: 'nonbank-three-stage' })
  );
  expect(
    compactDecisionCandidate(0, { programMode: 'nonbank-three-stage' })
  ).not.toEqual(compactDecisionCandidate(0, { programMode: 'bounded' }));
});

it('keeps bounded synthesis opt-in even when rejection callbacks are supplied', () => {
  for (const tier of ['advanced', 'expert', 'master'] as const) {
    for (const seed of [0, 1, 5, 9, 104, 170, 178]) {
      expect(
        compactDecisionCandidate(seed, { tier, onReject: () => undefined })
      ).toEqual(compactDecisionCandidate(seed, { tier }));
    }
  }
  expect(
    compactDecisionCandidate(2, { tier: 'master', programMode: 'bounded' })
  ).not.toEqual(compactDecisionCandidate(2, { tier: 'master' }));
  expect(
    compactDecisionCandidate(0, {
      programMode: 'bounded',
      acceptsLayout: () => false,
    })
  ).toBeUndefined();
  for (const seed of [-1, 0.5, Infinity])
    expect(
      compactDecisionCandidate(seed, { programMode: 'bounded' })
    ).toBeUndefined();
});

it.each([
  ['advanced', [0, 1, 5, 7]],
  ['expert', [6, 17, 42, 48]],
  ['master', [13, 67, 72, 99]],
] as const)(
  'admits distinct bounded compact %s fixtures through unchanged full proof gates',
  (tier, seeds) => {
    const previous: MechanicalIdentity[] = [];
    for (const seed of seeds) {
      const candidate = compactDecisionCandidate(seed, {
        tier,
        programMode: 'bounded',
      });
      if (!candidate)
        throw new Error(`Missing bounded candidate ${tier}:${seed}`);
      expect(candidate).toEqual(
        compactDecisionCandidate(seed, { tier, programMode: 'bounded' })
      );
      const level = compileLevel(candidate.raw);
      for (const index of TIER_GATES[tier].policiesMustLose) {
        expect(runBaselinePolicy(level, POLICY_IDS[index - 1]!).won).toBe(
          false
        );
      }
      const result = evaluateMechanicalCandidate({
        ...candidate,
        tier,
        seed,
        construction: 'bounded',
        previous,
      });
      if (!('row' in result))
        throw new Error(`${tier}:${seed}:${result.rejections.join(', ')}`);
      expect(
        candidate.dependencies
          .flat()
          .every(
            (id) => id === 'boss' || result.row.criticalTileIds.includes(id)
          )
      ).toBe(true);
      const resources = candidate.raw.tiles.filter((tile) =>
        tile.id.startsWith('resource-')
      );
      expect(
        resources.every((tile) => result.row.criticalTileIds.includes(tile.id))
      ).toBe(true);
      const graph = buildExactGraph(level, GRAPH_BUDGETS[tier]);
      if (graph.status !== 'complete')
        throw new Error(`Incomplete bounded dependency proof ${tier}:${seed}`);
      expect(
        provesWinningDependencies(graph.graph, candidate.dependencies)
      ).toBe(true);
      const dependency = candidate.dependencies[0]!;
      expect(
        provesWinningDependencies(graph.graph, [[...dependency].reverse()])
      ).toBe(false);
      expect(replayWithSteps(level, candidate.witness).state.phase).toBe('won');
      expect(result.row.requiredRespawns).toBe(tier === 'master' ? 2 : 1);
      expect(candidate.raw.width).toBeLessThanOrEqual(
        SEASON_BOARD_LIMITS[tier].width
      );
      expect(candidate.raw.terrain.length).toBeLessThanOrEqual(
        SEASON_BOARD_LIMITS[tier].height
      );
      for (const identity of previous) {
        expect(
          roleDistance(identity.sequence, result.row.sequence)
        ).toBeGreaterThanOrEqual(3);
        expect(
          roleDistance(identity.stepSequence, result.row.stepSequence)
        ).toBeGreaterThanOrEqual(3);
        expect(result.row.mechanical).not.toBe(identity.mechanical);
      }
      previous.push(result.row);
    }
    expect(previous).toHaveLength(seeds.length);
  },
  30000
);

it.each(['advanced', 'expert', 'master'] as const)(
  'retries compact %s layouts beyond the original terrain',
  (tier) => {
    const seed = tier === 'master' ? 170 : 0;
    const original = compactDecisionCandidate(seed, { tier });
    if (!original) throw new Error(`Missing compact candidate ${tier}`);
    const signature = visualTopology(original.raw).topology;
    const options = {
      tier,
      acceptsLayout: (raw: RawLevel) =>
        visualTopology(raw).topology !== signature,
    };
    const alternative = compactDecisionCandidate(seed, options);
    if (!alternative)
      throw new Error(`Missing alternative compact layout ${tier}`);
    expect(visualTopology(alternative.raw).topology).not.toBe(signature);
    expect(alternative).toEqual(compactDecisionCandidate(seed, options));
    expect(
      replayWithSteps(compileLevel(alternative.raw), alternative.witness).state
        .phase
    ).toBe('won');
  }
);

it('broadens compact programs without exceeding resource slots or arithmetic limits', () => {
  const kinds = new Set<string>();
  const lengths = new Set<number>();
  const shapes = new Set<string>();
  for (let seed = 9; seed < 200; seed += 1) {
    for (const tier of ['advanced', 'expert', 'master'] as const) {
      const candidate = compactDecisionCandidate(seed, { tier });
      if (!candidate) continue;
      const level = compileLevel(candidate.raw);
      let state = initialState(level);
      const programs = Array.from(
        { length: tier === 'advanced' ? 2 : tier === 'expert' ? 3 : 4 },
        (_, stage) =>
          candidate.raw.tiles.filter((tile) =>
            tile.id.startsWith(`resource-${stage}-`)
          )
      );
      expect(
        programs.every(
          (program, stage) =>
            program.length >= 1 &&
            program.length <= (tier === 'advanced' && stage === 0 ? 2 : 3)
        )
      ).toBe(true);
      expect(
        candidate.raw.tiles.some((tile) => tile.id.startsWith('adjust-'))
      ).toBe(false);
      expect(new Set(candidate.raw.tiles.map((tile) => tile.cell)).size).toBe(
        candidate.raw.tiles.length
      );
      for (const program of programs) {
        lengths.add(program.length);
        for (const tile of program) kinds.add(tile.kind);
      }
      shapes.add(
        programs
          .map((program) => program.map((tile) => tile.kind).join(','))
          .join('|')
      );
      expect(programs.flat().some((tile) => tile.kind === 'subtract')).toBe(
        true
      );
      expect(programs.flat().some((tile) => tile.kind === 'divide')).toBe(true);
      expect(
        programs
          .flat()
          .filter((tile) => tile.kind === 'divide')
          .every(
            (tile) => BigInt(tile.amount) >= 2n && BigInt(tile.amount) <= 9n
          )
      ).toBe(true);
      expect(
        candidate.raw.tiles.every((tile) => {
          const value = BigInt(
            tile.kind === 'enemy' || tile.kind === 'boss'
              ? tile.value
              : tile.amount
          );
          return (
            value > 0n &&
            value <= 999n &&
            (tile.kind !== 'enemy' ||
              value + BigInt(tile.maxSurplus ?? '0') <= 999n)
          );
        })
      ).toBe(true);
      for (const tileId of candidate.witness) {
        const tile = level.tiles.find((tile) => tile.id === tileId);
        if (tile?.kind === 'divide') expect(state.value % tile.amount).toBe(0n);
        const transition = interact(level, state, tileId);
        if (!transition.ok)
          throw new Error(`Invalid compact witness ${tier}:${seed}:${tileId}`);
        state = transition.state;
        expect(state.value).toBeGreaterThan(0n);
        if (state.phase === 'playing')
          expect(state.value).toBeLessThanOrEqual(999n);
      }
      expect(state.phase).toBe('won');
      expect(replayWithSteps(level, candidate.witness).state.phase).toBe('won');
    }
  }
  expect([...kinds].sort()).toEqual([
    'add',
    'divide',
    'enemy',
    'multiply',
    'subtract',
  ]);
  expect([...lengths].sort()).toEqual([1, 2, 3]);
  expect(shapes.size).toBeGreaterThanOrEqual(10);
});

it('screens expanded compact decisions against the unchanged mechanical gates', () => {
  const previous: MechanicalIdentity[] = [];
  for (const [tier, seed] of [
    ['advanced', 0],
    ['advanced', 5],
    ['advanced', 7],
    ['expert', 0],
  ] as const) {
    const candidate = compactDecisionCandidate(seed, { tier });
    if (!candidate) throw new Error(`Missing compact candidate ${tier}`);
    const result = evaluateMechanicalCandidate({
      ...candidate,
      tier,
      seed,
      construction: 'decision-v2',
      previous: [],
    });
    if (!('row' in result))
      throw new Error(`${tier}:${seed}:${result.rejections.join(', ')}`);
    const limit = SEASON_BOARD_LIMITS[tier];
    expect(candidate.raw.width).toBeLessThanOrEqual(limit.width);
    expect(candidate.raw.terrain.length).toBeLessThanOrEqual(limit.height);
    expect(
      replayWithSteps(compileLevel(candidate.raw), candidate.witness).state
        .phase
    ).toBe('won');
    expect(
      candidate.raw.tiles.every((tile) => {
        const value = BigInt(
          tile.kind === 'enemy' || tile.kind === 'boss'
            ? tile.value
            : tile.amount
        );
        return (
          value > 0n &&
          value <= 999n &&
          (tile.kind !== 'enemy' ||
            value + BigInt(tile.maxSurplus ?? '0') <= 999n)
        );
      })
    ).toBe(true);
    for (const kind of ['subtract', 'divide']) {
      const resources = candidate.raw.tiles.filter(
        (tile) => tile.kind === kind
      );
      expect(resources.length).toBeGreaterThan(0);
      expect(
        resources.every((tile) => result.row.criticalTileIds.includes(tile.id))
      ).toBe(true);
    }
    if (tier === 'advanced') {
      expect(mechanicalDuplicate(previous, result.row)).toBeUndefined();
      previous.push(result.row);
    }
  }
  expect(previous).toHaveLength(3);
}, 120000);

it('keeps unaccepted Hard decisions behind the full proof gates', () => {
  const candidate = compactDecisionCandidate(1, { tier: 'master' });
  if (!candidate) throw new Error('Missing Hard decision fixture');
  expect(candidate.raw.width).toBe(6);
  expect(candidate.raw.terrain.length).toBe(7);
  expect(
    replayWithSteps(compileLevel(candidate.raw), candidate.witness).state.phase
  ).toBe('won');
  expect(
    evaluateMechanicalCandidate({
      ...candidate,
      tier: 'master',
      seed: 1,
      construction: 'decision-v2',
      previous: [],
    })
  ).toEqual({
    rejections: ['forcedRunMax 3 > 2', 'bankForksMin 1 < 2'],
  });
}, 60000);

it.each([
  ['advanced', [0, 5, 7, 33, 40, 119, 130, 162, 175, 184]],
  ['expert', [0, 104, 175, 178]],
  ['master', [170]],
] as const)(
  'accepts mechanically distinct compact %s programs through every proof gate',
  (tier, seeds) => {
    const previous: MechanicalIdentity[] = [];
    for (const seed of seeds) {
      const candidate = compactDecisionCandidate(seed, { tier });
      if (!candidate)
        throw new Error(`Missing compact candidate ${tier}:${seed}`);
      const result = evaluateMechanicalCandidate({
        ...candidate,
        tier,
        seed,
        construction: 'decision-v2',
        previous,
      });
      if (!('row' in result))
        throw new Error(`${tier}:${seed}:${result.rejections.join(', ')}`);
      if (tier === 'master') {
        expect(result.row.requiredRespawns).toBe(2);
        expect(result.row.minimumActions).toBe(16);
        expect(result.row.minimumSteps).toBe(56);
      }
      expect(
        candidate.dependencies
          .flat()
          .every(
            (id) => id === 'boss' || result.row.criticalTileIds.includes(id)
          )
      ).toBe(true);
      for (const identity of previous) {
        expect(result.row.mechanical).not.toBe(identity.mechanical);
        expect(
          roleDistance(identity.sequence, result.row.sequence)
        ).toBeGreaterThanOrEqual(3);
        expect(
          roleDistance(identity.stepSequence, result.row.stepSequence)
        ).toBeGreaterThanOrEqual(3);
      }
      previous.push(result.row);
    }
    expect(previous).toHaveLength(seeds.length);
  },
  120000
);

it('honors compact decision seeds, dimensions and layout admission', () => {
  expect(compactDecisionCandidate(0)).toEqual(compactDecisionCandidate(0));
  expect(
    compactDecisionCandidate(0, { acceptsLayout: () => false })
  ).toBeUndefined();
  for (const seed of [-1, 0.5, Infinity])
    expect(compactDecisionCandidate(seed)).toBeUndefined();
  for (const stages of [1, 5, 2.5])
    expect(compactDecisionCandidate(0, { stages })).toBeUndefined();
  expect(compactDecisionCandidate(0, { stages: 3 })).toBeUndefined();
});
