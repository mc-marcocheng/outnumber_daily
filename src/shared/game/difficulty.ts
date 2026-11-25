import { buildExactGraph } from './analysis-graph';
import type {
  ExactGraph,
  GraphBudget,
  GraphEdge,
  GraphNode,
} from './analysis-graph';
import { initialState, checkCombat } from './engine';
import type { GameState, InteractionEvent, Level, Tile } from './model';
import { canonicalStateKey } from './reachability';
import { successors } from './transitions';
import type { Transition } from './transitions';

/**
 * Analysis version 2: difficulty measured on one exact state graph,
 * over ALL winning paths, with plausible-move filtering that never
 * consults the solver's answer.
 *
 * The quantitative model is a screening system for the design
 * question: "on every reasonable winning route, does the player
 * repeatedly face attractive alternatives with different long-term
 * consequences?" A graph limit aborts the whole analysis; no metric
 * is ever computed from a partial graph or silently treated as zero.
 */

// --- Fractions -------------------------------------------------------------

export function fractionAtLeast(
  numerator: number,
  denominator: number,
  requiredNumerator: number,
  requiredDenominator: number
): boolean {
  if (denominator <= 0) return false;

  return (
    BigInt(numerator) * BigInt(requiredDenominator) >=
    BigInt(requiredNumerator) * BigInt(denominator)
  );
}

// --- Tier gates -------------------------------------------------------------

export type TierId =
  | 'tutorial'
  | 'campaignMiddle'
  | 'campaignFinale'
  | 'advanced'
  | 'expert'
  | 'master';

export type Fraction = Readonly<{ numerator: number; denominator: number }>;

export type TierGate = Readonly<{
  minMeaningfulForks: number;
  /**
   * Tutorial specification metric (follow-up guide §2.1): forks where
   * one constructive action keeps winning possible and another
   * constructive action makes winning impossible, with NO refutation
   * filtering. Reported for every tier; required only of tutorials.
   */
  minConceptualForks: number;
  minDeepForks: number;
  maxForcedRun: number;
  /** Minimum plausible losing edges among certified-line forks. */
  minPlausibleTrapEdges: number;
  /** Minimum plausible trap share (cross-multiplied); null = report only. */
  minPlausibleTrapShare: Fraction | null;
  /** Minimum distinct 3-ply opening states; null = report only. */
  minOpeningStates: number | null;
  /** Minimum opening trap share; null = report only. */
  minOpeningTrapShare: Fraction | null;
  minTightCombats: number;
  /** Minimum bank forks; null = report only. */
  minBankForks: number | null;
  /** "banking boards" = the gate applies only when spareLives > 0. */
  bankForksOnlyOnBankingBoards: boolean;
  /** Policies (1-based) that must lose. Empty = report only. */
  policiesMustLose: readonly number[];
  maxPeakDigits: number;
  actionRange: Readonly<{ min: number; max: number }>;
}>;

/**
 * Release gates. The tutorial row is an explicit specification
 * (follow-up guide §2.2): tutorials must present one visible conceptual
 * fork — a constructive action that wins against a constructive action
 * that loses, with no refutation filtering — and must not use lives,
 * set tiles or window enemies. `meaningfulForksMin` and the plausible
 * trap metrics are still reported for tutorials but not required: a
 * short calculation may legitimately expose a wrong answer early, and
 * hiding it from the analyzer is not a teaching goal. Later campaign
 * tiers keep the original, stronger gates unchanged.
 */
export const TIER_GATES: Record<TierId, TierGate> = {
  tutorial: {
    minMeaningfulForks: 0,
    minConceptualForks: 1,
    minDeepForks: 0,
    maxForcedRun: 3,
    minPlausibleTrapEdges: 0,
    minPlausibleTrapShare: null,
    minOpeningStates: null,
    minOpeningTrapShare: null,
    minTightCombats: 0,
    minBankForks: 0,
    bankForksOnlyOnBankingBoards: false,
    policiesMustLose: [],
    maxPeakDigits: 4,
    actionRange: { min: 3, max: 6 },
  },
  campaignMiddle: {
    minMeaningfulForks: 1,
    minConceptualForks: 0,
    minDeepForks: 0,
    maxForcedRun: 3,
    minPlausibleTrapEdges: 0,
    minPlausibleTrapShare: { numerator: 1, denominator: 5 },
    minOpeningStates: null,
    minOpeningTrapShare: null,
    minTightCombats: 1,
    minBankForks: null,
    bankForksOnlyOnBankingBoards: false,
    policiesMustLose: [],
    maxPeakDigits: 5,
    actionRange: { min: 5, max: 10 },
  },
  campaignFinale: {
    minMeaningfulForks: 2,
    minConceptualForks: 0,
    minDeepForks: 0,
    maxForcedRun: 3,
    minPlausibleTrapEdges: 0,
    minPlausibleTrapShare: { numerator: 1, denominator: 4 },
    minOpeningStates: 3,
    minOpeningTrapShare: null,
    minTightCombats: 1,
    minBankForks: 1,
    bankForksOnlyOnBankingBoards: false,
    policiesMustLose: [1, 2, 3],
    maxPeakDigits: 6,
    actionRange: { min: 8, max: 12 },
  },
  advanced: {
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
  },
  expert: {
    minMeaningfulForks: 3,
    minConceptualForks: 0,
    minDeepForks: 1,
    maxForcedRun: 3,
    minPlausibleTrapEdges: 0,
    minPlausibleTrapShare: { numerator: 7, denominator: 20 },
    minOpeningStates: 6,
    minOpeningTrapShare: { numerator: 3, denominator: 10 },
    minTightCombats: 3,
    minBankForks: 1,
    bankForksOnlyOnBankingBoards: false,
    policiesMustLose: [1, 2, 3, 4, 5, 6, 7, 8],
    maxPeakDigits: 7,
    actionRange: { min: 10, max: 20 },
  },
  master: {
    minMeaningfulForks: 4,
    minConceptualForks: 0,
    minDeepForks: 2,
    maxForcedRun: 2,
    minPlausibleTrapEdges: 0,
    minPlausibleTrapShare: { numerator: 2, denominator: 5 },
    minOpeningStates: 8,
    minOpeningTrapShare: { numerator: 1, denominator: 2 },
    minTightCombats: 4,
    minBankForks: 2,
    bankForksOnlyOnBankingBoards: false,
    policiesMustLose: [1, 2, 3, 4, 5, 6, 7, 8],
    maxPeakDigits: 8,
    actionRange: { min: 12, max: 22 },
  },
};

/**
 * Hard search budgets per tier (release ceilings for the full graph).
 * These are configured limits, not measured promises.
 */
export const GRAPH_BUDGETS: Record<TierId, GraphBudget> = {
  tutorial: { maxStates: 50_000, maxEdges: 400_000, maxMs: 3_000 },
  campaignMiddle: { maxStates: 200_000, maxEdges: 1_600_000, maxMs: 10_000 },
  campaignFinale: { maxStates: 200_000, maxEdges: 1_600_000, maxMs: 10_000 },
  advanced: { maxStates: 300_000, maxEdges: 2_400_000, maxMs: 20_000 },
  expert: { maxStates: 500_000, maxEdges: 4_000_000, maxMs: 40_000 },
  master: { maxStates: 750_000, maxEdges: 6_000_000, maxMs: 60_000 },
};

// --- Plausibility -----------------------------------------------------------
//
// P(s) is an operational proxy for "a move a thinking player considers",
// built from legal successors and local 2-ply refutation only. It must
// never consult canWin, solve, or any certificate: a plausibility model
// that knows the answer would make every fork metric circular.

type PlausibilityContext = {
  level: Level;
  startValue: bigint;
  bossId: string;
  plausibleMemo: Map<string, readonly Transition[]>;
  refutedMemo: Map<string, boolean>;
};

function cmpBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function makeContext(level: Level): PlausibilityContext {
  const boss = level.tiles.find((tile) => tile.kind === 'boss');

  if (!boss) throw new Error(`${level.id}: missing boss`);

  return {
    level,
    startValue: level.startValue,
    bossId: boss.id,
    plausibleMemo: new Map(),
    refutedMemo: new Map(),
  };
}

/**
 * Deliberately optimistic wealth upper bound: everything alive, every
 * unused add and set, every future respawn start value, all multiplied
 * by every unused multiplier, ignoring geometry and windows. It must
 * never understate attainable value.
 */
export function wealthUpperBound(
  level: Level,
  state: GameState,
  startValue: bigint
): bigint {
  const bossId = wealthBossId(level);
  const unusedSets: bigint[] = [];
  const unusedAdds: bigint[] = [];
  let multiplierProduct = 1n;

  for (const tile of level.tiles) {
    if (tile.kind === 'enemy' || tile.kind === 'boss') continue;
    if (state.usedOps.has(tile.id)) continue;

    if (tile.kind === 'add') unusedAdds.push(tile.amount);
    if (tile.kind === 'multiply') multiplierProduct *= tile.amount;
    if (tile.kind === 'set') unusedSets.push(tile.amount);
  }

  const setAmounts = [startValue, ...unusedSets];
  const q = setAmounts.reduce((a, b) => (b < a ? b : a));

  let enemiesSum = 0n;

  for (const [id, value] of state.enemies) {
    if (id !== bossId) enemiesSum += value;
  }

  let inside = state.value + enemiesSum + BigInt(state.spareLives) * startValue;

  for (const amount of unusedAdds) inside += amount;
  for (const amount of unusedSets) {
    if (amount > q) inside += amount - q;
  }

  return inside * multiplierProduct;
}

function wealthBossId(level: Level): string {
  const boss = level.tiles.find((tile) => tile.kind === 'boss');

  return boss ? boss.id : '';
}

/** Current value of the boss in this state (banking can grow it). */
function bossValueIn(
  ctx: PlausibilityContext,
  state: GameState
): bigint | undefined {
  return state.enemies.get(ctx.bossId);
}

function visiblyFailed(ctx: PlausibilityContext, state: GameState): boolean {
  if (state.phase === 'lost') return true;
  if (state.phase === 'won') return false;

  const nonLosing = successors(ctx.level, state).filter(
    (transition) => transition.result.state.phase !== 'lost'
  );

  if (nonLosing.length === 0) return true;

  const boss = bossValueIn(ctx, state);

  if (boss === undefined) return true;

  return wealthUpperBound(ctx.level, state, ctx.startValue) <= boss;
}

/**
 * Would every plausible continuation within `horizon` further
 * interactions have visibly failed? A surviving frontier is "unknown",
 * never "winning".
 */
function refutedWithin(
  ctx: PlausibilityContext,
  state: GameState,
  horizon: number
): boolean {
  if (horizon < 0) return false;

  const key = `${canonicalStateKey(ctx.level, state)}:${horizon}`;
  const hit = ctx.refutedMemo.get(key);

  if (hit !== undefined) return hit;

  let result: boolean;

  if (state.phase === 'won') {
    result = false;
  } else if (visiblyFailed(ctx, state)) {
    result = true;
  } else if (horizon === 0) {
    result = false;
  } else {
    const continuations = successors(ctx.level, state).filter(
      (transition) => transition.result.state.phase !== 'lost'
    );

    result =
      continuations.length > 0 &&
      continuations.every((transition) =>
        refutedWithin(ctx, transition.result.state, horizon - 1)
      );
  }

  ctx.refutedMemo.set(key, result);
  return result;
}

/**
 * Does assigning the player value to `amount` immediately enable a
 * combat classification (absorb or bank) on some active target that
 * was not available before? This is what can make a downward set
 * meaningful instead of wasteful.
 */
function downwardSetEnablesCombat(
  ctx: PlausibilityContext,
  before: GameState,
  after: GameState
): boolean {
  if (before.value === after.value) return false;

  const beforeTargets = successors(ctx.level, before);
  const afterTargets = successors(ctx.level, after);

  const classifies = (
    transition: Transition,
    player: bigint
  ): 'absorb' | 'bank' | null => {
    const tile = ctx.level.tiles.find((t) => t.id === transition.tileId);

    if (!tile || (tile.kind !== 'enemy' && tile.kind !== 'boss')) return null;

    const enemy = before.enemies.get(tile.id);

    if (enemy === undefined) return null;

    return checkCombat(tile, player, enemy).absorbs ? 'absorb' : 'bank';
  };

  for (const afterTransition of afterTargets) {
    const afterClass = classifies(afterTransition, after.value);

    if (afterClass === null) continue;

    const beforeTransition = beforeTargets.find(
      (t) => t.tileId === afterTransition.tileId
    );

    const beforeClass = beforeTransition
      ? classifies(beforeTransition, before.value)
      : null;

    if (afterClass === 'absorb' && beforeClass !== 'absorb') return true;

    if (
      afterClass === 'bank' &&
      beforeClass !== 'bank' &&
      after.spareLives > 0
    ) {
      return true;
    }
  }

  return false;
}

/** The plausible transitions P(s), memoized by canonical state. */
function plausible(
  ctx: PlausibilityContext,
  state: GameState
): readonly Transition[] {
  const key = canonicalStateKey(ctx.level, state);
  const hit = ctx.plausibleMemo.get(key);

  if (hit) return hit;

  const legal = successors(ctx.level, state);

  // 1. Immediate terminal losses are not plausible.
  let candidates = legal.filter(
    (transition) => transition.result.state.phase !== 'lost'
  );

  // 2. If the boss can fall now, only winning actions matter.
  const winningNow = candidates.filter(
    (transition) => transition.result.state.phase === 'won'
  );

  if (winningNow.length > 0) {
    ctx.plausibleMemo.set(key, winningNow);
    return winningNow;
  }

  // 3. Set tiles that leave the value unchanged are noise.
  candidates = candidates.filter((transition) => {
    const tile = findTile(ctx.level, transition.tileId);

    return !(
      tile?.kind === 'set' &&
      tile.amount === transition.result.event.playerBefore
    );
  });

  // 4. Downward set tiles unless they change a combat classification.
  candidates = candidates.filter((transition) => {
    const tile = findTile(ctx.level, transition.tileId);

    if (tile?.kind !== 'set') return true;
    if (tile.amount >= transition.result.event.playerBefore) return true;

    return downwardSetEnablesCombat(ctx, state, transition.result.state);
  });

  // 5. Remove actions whose successor is shallow-refuted.
  candidates = candidates.filter(
    (transition) => !refutedWithin(ctx, transition.result.state, 2)
  );

  ctx.plausibleMemo.set(key, candidates);
  return candidates;
}

function findTile(level: Level, tileId: string): Tile | undefined {
  return level.tiles.find((tile) => tile.id === tileId);
}

// --- Baseline policies -------------------------------------------------------
//
// Deterministic shallow policies: baselines, not solvers. They never
// call solve, never read canWin, never look at certificates. Tile ID is
// the last tie-breaker.

export const POLICY_IDS = [
  'largest-bite',
  'largest-immediate-value',
  'save-multipliers',
  'bank-early',
  'window-first',
  'two-ply-value',
  'beam-4-value',
  'beam-4-multiplier-reserve',
] as const;

export type PolicyId = (typeof POLICY_IDS)[number];

type Choice = (
  level: Level,
  state: GameState,
  options: readonly Transition[]
) => string | null;

function byId(a: Transition, b: Transition): number {
  return a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0;
}

function pickTransition(
  options: readonly Transition[],
  rank: (transition: Transition) => number
): Transition | undefined {
  let best: Transition | undefined;

  for (const option of options) {
    if (!best) {
      best = option;
      continue;
    }

    const difference = rank(option) - rank(best);

    if (difference > 0 || (difference === 0 && byId(option, best) < 0)) {
      best = option;
    }
  }

  return best;
}

/** Non-terminal transitions only, in stable ID order. */
function alive(options: readonly Transition[]): readonly Transition[] {
  return options.filter(
    (transition) => transition.result.state.phase !== 'lost'
  );
}

const largestBite: Choice = (level, state, options) => {
  const aliveOptions = alive(options);

  if (aliveOptions.length === 0) return null;

  const absorbs = aliveOptions.filter((t) => t.result.event.kind === 'absorb');
  const adds = aliveOptions.filter((t) => t.result.event.kind === 'add');
  const multiplies = aliveOptions.filter(
    (t) => t.result.event.kind === 'multiply'
  );
  const sets = aliveOptions.filter((t) => {
    if (t.result.event.kind !== 'set') return false;

    const tile = level.tiles.find((item) => item.id === t.tileId);

    return tile?.kind === 'set' && tile.amount > state.value;
  });
  const banks = aliveOptions.filter((t) => t.result.event.kind === 'respawn');
  const reductions = aliveOptions.filter(
    (transition) =>
      transition.result.event.kind === 'subtract' ||
      transition.result.event.kind === 'divide'
  );

  const chosen =
    pickTransition(absorbs, (t) => Number(t.result.event.enemyBefore ?? 0n)) ??
    pickTransition(adds, (t) => Number(t.result.event.playerAfter)) ??
    pickTransition(multiplies, (t) => -Number(t.result.event.playerAfter)) ??
    pickTransition(sets, (t) => -Number(t.result.event.playerAfter)) ??
    pickTransition(banks, (t) => -Number(t.result.event.enemyAfter ?? 0n)) ??
    pickTransition(reductions, (transition) =>
      Number(transition.result.event.playerAfter)
    );

  return chosen?.tileId ?? null;
};

const largestImmediateValue: Choice = (_level, _state, options) => {
  const chosen = pickTransition(alive(options), (t) =>
    t.result.event.kind === 'respawn' ? -1 : Number(t.result.event.playerAfter)
  );

  return chosen?.tileId ?? null;
};

const saveMultipliers: Choice = (_level, _state, options) => {
  const aliveOptions = alive(options);

  if (aliveOptions.length === 0) return null;

  const rank = (t: Transition): number => {
    const kind = t.result.event.kind;

    if (kind === 'absorb' || kind === 'add' || kind === 'set') {
      return 3_000_000_000 + Number(t.result.event.playerAfter);
    }

    if (kind === 'multiply') return 2_000_000_000;

    if (kind === 'respawn') return 1_000_000_000;

    return 0;
  };

  return pickTransition(aliveOptions, rank)?.tileId ?? null;
};

const bankEarly: Choice = (level, state, options) => {
  const aliveOptions = alive(options);

  if (aliveOptions.length === 0) return null;

  const bank = pickTransition(
    aliveOptions.filter((t) => t.result.event.kind === 'respawn'),
    (t) => -Number(t.result.event.enemyAfter ?? 0n)
  );

  return bank?.tileId ?? largestBite(level, state, options);
};

const windowFirst: Choice = (level, state, options) => {
  const aliveOptions = alive(options);

  if (aliveOptions.length === 0) return null;

  const windowed = aliveOptions.filter((t) => {
    if (t.result.event.kind !== 'absorb') return false;

    const tile = level.tiles.find((item) => item.id === t.tileId);

    return tile?.kind === 'enemy' && tile.maxSurplus !== undefined;
  });

  return (
    pickTransition(windowed, (t) => Number(t.result.event.enemyBefore ?? 0n))
      ?.tileId ?? largestBite(level, state, options)
  );
};

const twoPlyValue: Choice = (level, _state, options) => {
  const aliveOptions = alive(options);

  if (aliveOptions.length === 0) return null;

  // Best value reachable in two interactions, with the immediate value
  // as the tie-breaker.
  const score = (t: Transition): [number, number] => {
    const immediate = Number(t.result.event.playerAfter);
    let best = immediate;

    if (t.result.state.phase === 'playing') {
      for (const follow of successors(level, t.result.state)) {
        const value = Number(follow.result.event.playerAfter);

        if (value > best) best = value;
      }
    }

    return [best, immediate];
  };

  let best: Transition | undefined;

  for (const option of aliveOptions) {
    if (!best) {
      best = option;
      continue;
    }

    const a = score(option);
    const b = score(best);

    if (
      a[0] > b[0] ||
      (a[0] === b[0] && a[1] > b[1]) ||
      (a[0] === b[0] && a[1] === b[1] && option.tileId < best.tileId)
    ) {
      best = option;
    }
  }

  return best?.tileId ?? null;
};

type BeamEval = (level: Level, state: GameState) => readonly bigint[];

function beamChoice(depth: number, evaluate: BeamEval): Choice {
  return (level, state, options) => {
    void options;

    if (state.phase !== 'playing') return null;

    const width = 8;
    type Item = { state: GameState; root: string | null; path: string };

    let frontier: Item[] = [{ state, root: null, path: '' }];

    for (let ply = 0; ply < depth; ply += 1) {
      const next: Item[] = [];

      for (const item of frontier) {
        for (const transition of successors(level, item.state)) {
          const nextRoot = item.root ?? transition.tileId;

          if (transition.result.state.phase === 'won') return nextRoot;

          if (transition.result.state.phase === 'lost') continue;

          next.push({
            state: transition.result.state,
            root: nextRoot,
            path: `${item.path}>${transition.tileId}`,
          });
        }
      }

      if (next.length === 0) break;

      next.sort((a, b) => {
        const valuesA = evaluate(level, a.state);
        const valuesB = evaluate(level, b.state);

        for (let i = 0; i < valuesA.length; i += 1) {
          const difference = cmpBigint(valuesB[i] ?? 0n, valuesA[i] ?? 0n);

          if (difference !== 0) return difference;
        }

        return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
      });

      const kept: Item[] = [];
      const seenKeys = new Set<string>();

      for (const item of next) {
        if (kept.length >= width) break;

        const key = canonicalStateKey(level, item.state);

        if (seenKeys.has(key)) continue;

        seenKeys.add(key);
        kept.push(item);
      }

      frontier = kept;
    }

    return frontier[0]?.root ?? null;
  };
}

function multiplierProduct(level: Level, state: GameState): bigint {
  let product = 1n;

  for (const tile of level.tiles) {
    if (tile.kind === 'multiply' && !state.usedOps.has(tile.id)) {
      product *= tile.amount;
    }
  }

  return product;
}

function accessibleAbsorption(level: Level, state: GameState): bigint {
  if (state.phase !== 'playing') return 0n;

  let sum = 0n;

  for (const transition of successors(level, state)) {
    if (transition.result.event.kind === 'absorb') {
      sum += transition.result.event.enemyBefore ?? 0n;
    }
  }

  return sum;
}

const beamEvalValue: BeamEval = (_level, state) => [state.value];

const beamEvalMultiplierReserve: BeamEval = (level, state) => [
  multiplierProduct(level, state),
  accessibleAbsorption(level, state),
  state.value,
];

export const POLICY_CHOICES: readonly {
  id: PolicyId;
  index: number;
  choose: Choice;
}[] = [
  { id: 'largest-bite', index: 1, choose: largestBite },
  { id: 'largest-immediate-value', index: 2, choose: largestImmediateValue },
  { id: 'save-multipliers', index: 3, choose: saveMultipliers },
  { id: 'bank-early', index: 4, choose: bankEarly },
  { id: 'window-first', index: 5, choose: windowFirst },
  { id: 'two-ply-value', index: 6, choose: twoPlyValue },
  {
    id: 'beam-4-value',
    index: 7,
    choose: beamChoice(4, beamEvalValue),
  },
  {
    id: 'beam-4-multiplier-reserve',
    index: 8,
    choose: beamChoice(4, beamEvalMultiplierReserve),
  },
];

function runPolicy(
  level: Level,
  choose: Choice
): { won: boolean; actions: string[] } {
  let state = initialState(level);
  const actions: string[] = [];
  const maxSteps = level.tiles.length + level.spareLives + 1;

  while (state.phase === 'playing' && actions.length <= maxSteps) {
    const options = successors(level, state);

    if (options.length === 0) break;

    const choice = choose(level, state, options);

    if (!choice) break;

    const step = options.find((transition) => transition.tileId === choice);

    if (!step) break;

    state = step.result.state;
    actions.push(choice);
  }

  return { won: state.phase === 'won', actions };
}

/**
 * Run one baseline policy against a level. Exposed for the generator's
 * cheap-check phase, which must run policies BEFORE any exact analysis;
 * the batched audit lives in the report itself.
 */
export function runBaselinePolicy(
  level: Level,
  policyId: PolicyId
): { won: boolean; actions: string[] } {
  const policy = POLICY_CHOICES.find((candidate) => candidate.id === policyId);

  if (!policy) throw new Error(`unknown policy: ${policyId}`);

  return runPolicy(level, policy.choose);
}

/**
 * Deterministically rename tile IDs so policies whose outcome depends
 * only on tie-breaking reveal themselves.
 */
function withRenamedIds(level: Level): Level {
  const ordered = level.tiles.map((tile) => tile.id).sort();
  const renamed = new Map(
    ordered.map((id, index) => [id, `r${String(index).padStart(3, '0')}`])
  );

  return {
    ...level,
    tiles: level.tiles.map((tile) => {
      const id = renamed.get(tile.id) ?? tile.id;

      if (tile.kind === 'enemy' || tile.kind === 'boss') {
        return { ...tile, id };
      }

      return { ...tile, id };
    }),
  };
}

// --- Analysis ----------------------------------------------------------------

export type DifficultyReport = {
  analysisVersion: 2;
  levelId: string;
  levelRevision: number;
  tier: TierId;

  minimumActions: number;
  requiredRespawns: number;
  shortestSolution: readonly string[];

  meaningfulForksMin: number;
  conceptualForksMin: number;
  deepForksMin: number;
  bankForksMin: number;
  forcedRunMax: number;

  openingStates: number;
  openingTrapNumerator: number;
  openingTrapDenominator: number;

  plausibleTrapNumerator: number;
  plausibleTrapDenominator: number;

  tightCombatCountMin: number;

  policyWins: readonly string[];
  policyWinsRenamed: readonly string[];
  policyFlips: readonly string[];
  greedyWins: boolean;

  maximumWinningPeak: string;

  criticalTileIds: readonly string[];
  decorativeTileIds: readonly string[];

  uniquePlausible: Readonly<{
    setup: Fraction;
    decision: Fraction;
    cleanup: Fraction;
  }>;

  commutingDiamonds: number;

  graphStates: number;
  graphEdges: number;

  gateViolations: readonly string[];
};

export type DifficultyResult =
  | Readonly<{ status: 'analyzed'; report: DifficultyReport }>
  | Readonly<{ status: 'unsolvable' }>
  | Readonly<{
      status: 'limit';
      reason: 'time' | 'states' | 'edges';
      stage: string;
    }>;

const PENDING_CAP = 32;

export function analyzeDifficulty(
  level: Level,
  tier: TierId,
  budget: GraphBudget,
  onCompleteGraph?: (graph: ExactGraph) => void
): DifficultyResult {
  const graphResult = buildExactGraph(level, budget);

  if (graphResult.status === 'limit') {
    return { status: 'limit', reason: graphResult.reason, stage: 'graph' };
  }

  const graph: ExactGraph = graphResult.graph;
  onCompleteGraph?.(graph);
  const nodes = graph.nodes;
  const total = nodes.length;

  const indexOfKey = new Map<string, number>();
  for (let i = 0; i < total; i += 1) {
    indexOfKey.set(canonicalStateKey(level, nodes[i].state), i);
  }

  // --- Win/distance/respawn/peak dynamic programming (reverse order) ---

  const canWin = new Array<boolean>(total).fill(false);
  const minRemaining = new Array<number>(total).fill(Number.POSITIVE_INFINITY);
  const minRespawns = new Array<number>(total).fill(Number.POSITIVE_INFINITY);
  const peak = new Array<bigint>(total).fill(0n);

  for (let i = total - 1; i >= 0; i -= 1) {
    const node = nodes[i];

    if (node.state.phase === 'won') {
      canWin[i] = true;
      minRemaining[i] = 0;
      minRespawns[i] = 0;
      peak[i] = node.state.value;
      continue;
    }

    if (node.state.phase !== 'playing') continue;

    let winning = false;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestRespawns = Number.POSITIVE_INFINITY;
    let bestPeak = 0n;

    for (const edge of node.edges) {
      if (edge.to === null || !canWin[edge.to]) continue;

      winning = true;
      bestDistance = Math.min(bestDistance, 1 + minRemaining[edge.to]);
      bestRespawns = Math.min(
        bestRespawns,
        (edge.event.kind === 'respawn' ? 1 : 0) + minRespawns[edge.to]
      );
      bestPeak = bestPeak > peak[edge.to] ? bestPeak : peak[edge.to];
    }

    canWin[i] = winning;
    minRemaining[i] = bestDistance;
    minRespawns[i] = bestRespawns;
    peak[i] = node.state.value > bestPeak ? node.state.value : bestPeak;
  }

  const startKey = canonicalStateKey(level, initialState(level));
  const startIndex = indexOfKey.get(startKey)!;

  if (!canWin[startIndex]) {
    return { status: 'unsolvable' };
  }

  // --- Certified shortest line (canonical solver) mapped onto nodes ---

  const shortest = minRemaining[startIndex];
  const certifiedLine: number[] = [];

  {
    let index = startIndex;

    while (nodes[index].state.phase === 'playing') {
      certifiedLine.push(index);

      let nextIndex: number | undefined;

      for (const edge of nodes[index].edges) {
        if (
          edge.to !== null &&
          canWin[edge.to] &&
          minRemaining[edge.to] === minRemaining[index] - 1
        ) {
          nextIndex = edge.to;
          break;
        }
      }

      if (nextIndex === undefined) break;

      index = nextIndex;
    }

    certifiedLine.push(index); // the won node
  }

  // --- Plausibility and fork flags ---------------------------------------

  const ctx = makeContext(level);

  const plausibleOf = new Array<readonly Transition[]>(total);
  const meaningfulFork = new Array<boolean>(total).fill(false);
  const deepFork = new Array<boolean>(total).fill(false);
  const bankFork = new Array<boolean>(total).fill(false);

  for (let i = 0; i < total; i += 1) {
    const node = nodes[i];

    if (node.state.phase !== 'playing') continue;

    const plausibleEdges = plausible(ctx, node.state);

    plausibleOf[i] = plausibleEdges;

    let winning = 0;
    let losing = 0;
    let hasRespawn = false;
    let deepLoser = false;

    for (const edge of plausibleEdges) {
      const targetIndex = indexOfKey.get(
        canonicalStateKey(level, edge.result.state)
      );

      // Plausible edges always lead to nonterminal states, which are
      // graph nodes by construction.
      if (targetIndex === undefined) continue;

      if (canWin[targetIndex]) {
        winning += 1;
      } else {
        losing += 1;

        if (!refutedWithin(ctx, nodes[targetIndex].state, 4)) {
          deepLoser = true;
        }
      }

      if (edge.result.event.kind === 'respawn') hasRespawn = true;
    }

    if (winning > 0 && losing > 0) {
      meaningfulFork[i] = true;
      deepFork[i] = deepLoser;
      bankFork[i] = hasRespawn;
    }
  }

  // --- Conceptual forks (tutorial specification metric) --------------------
  //
  // No plausibility filtering and no refutation here by design: a
  // tutorial alternative may be disprovable by a short calculation and
  // still teach the lesson (follow-up guide §2.1). A conceptual fork
  // is a state where one constructive action keeps winning possible
  // and another constructive action makes winning impossible.

  const conceptualFork = new Array<boolean>(total).fill(false);

  for (let i = 0; i < total; i += 1) {
    const node = nodes[i];

    if (node.state.phase !== 'playing') continue;

    let constructiveWin = false;
    let constructiveLose = false;

    for (const edge of node.edges) {
      if (!isConstructiveAction(edge.event)) continue;

      // Constructive actions never end the game, so the target is a
      // graph node; the null check is defensive.
      if (edge.to === null) continue;

      if (canWin[edge.to]) constructiveWin = true;
      else constructiveLose = true;
    }

    conceptualFork[i] = constructiveWin && constructiveLose;
  }

  // --- Min-over-winning-paths metrics ------------------------------------

  const meaningfulMin = new Array<number>(total).fill(0);
  const conceptualMin = new Array<number>(total).fill(0);
  const deepMin = new Array<number>(total).fill(0);
  const bankMin = new Array<number>(total).fill(0);
  const tightMin = new Array<number>(total).fill(0);

  for (let i = total - 1; i >= 0; i -= 1) {
    const node = nodes[i];

    if (node.state.phase !== 'playing') continue;

    let bestMeaningful = Number.POSITIVE_INFINITY;
    let bestConceptual = Number.POSITIVE_INFINITY;
    let bestDeep = Number.POSITIVE_INFINITY;
    let bestBank = Number.POSITIVE_INFINITY;
    let bestTight = Number.POSITIVE_INFINITY;

    for (const edge of node.edges) {
      if (edge.to === null || !canWin[edge.to]) continue;

      bestMeaningful = Math.min(bestMeaningful, meaningfulMin[edge.to]);
      bestConceptual = Math.min(bestConceptual, conceptualMin[edge.to]);
      bestDeep = Math.min(bestDeep, deepMin[edge.to]);
      bestBank = Math.min(bestBank, bankMin[edge.to]);

      const tight = isTightCombat(edge) ? 1 : 0;

      bestTight = Math.min(bestTight, tight + tightMin[edge.to]);
    }

    meaningfulMin[i] = meaningfulFork[i] ? 1 + bestMeaningful : bestMeaningful;
    conceptualMin[i] = conceptualFork[i] ? 1 + bestConceptual : bestConceptual;
    deepMin[i] = deepFork[i] ? 1 + bestDeep : bestDeep;
    bankMin[i] = bankFork[i] ? 1 + bestBank : bestBank;
    tightMin[i] = bestTight;
  }

  // --- Forced runs (max over winning paths, decision region only) --------

  const runMemo = new Map<string, number>();

  const gapMax = (
    index: number,
    pending: number,
    seenFork: boolean
  ): number => {
    const node = nodes[index];

    if (node.state.phase === 'won') return 0;

    const memoKey = `${index}:${pending}:${seenFork ? 1 : 0}`;
    const hit = runMemo.get(memoKey);

    if (hit !== undefined) return hit;

    let best = 0;

    for (const edge of node.edges) {
      if (edge.to === null || !canWin[edge.to]) continue;

      let candidate: number;

      if (meaningfulFork[edge.to]) {
        const gap = seenFork ? pending : 0;

        candidate = Math.max(gap, gapMax(edge.to, 0, true));
      } else {
        candidate = gapMax(
          edge.to,
          Math.min(pending + 1, PENDING_CAP),
          seenFork
        );
      }

      if (candidate > best) best = candidate;
    }

    runMemo.set(memoKey, best);
    return best;
  };

  const forcedRunMax = gapMax(startIndex, 0, false);

  // --- Certified-line shares ----------------------------------------------

  let trapEdges = 0;
  let trapTotal = 0;
  const regionStates: { setup: number; decision: number; cleanup: number } = {
    setup: 0,
    decision: 0,
    cleanup: 0,
  };
  const regionForced: { setup: number; decision: number; cleanup: number } = {
    setup: 0,
    decision: 0,
    cleanup: 0,
  };

  const playingLine = certifiedLine.filter(
    (index) => nodes[index].state.phase === 'playing'
  );

  const forkPositions = playingLine
    .map((index, position) => (meaningfulFork[index] ? position : -1))
    .filter((position) => position >= 0);

  const firstFork = forkPositions[0] ?? -1;
  const lastFork = forkPositions[forkPositions.length - 1] ?? -1;

  playingLine.forEach((index, position) => {
    if (meaningfulFork[index]) {
      const plausibleEdges = plausibleOf[index];

      trapTotal += plausibleEdges.length;
      trapEdges += plausibleEdges.filter((edge) => {
        const targetIndex = indexOfKey.get(
          canonicalStateKey(level, edge.result.state)
        );

        return targetIndex === undefined || !canWin[targetIndex];
      }).length;
    }

    const region =
      firstFork < 0 || position < firstFork
        ? 'setup'
        : position <= lastFork
          ? 'decision'
          : 'cleanup';

    regionStates[region] += 1;

    if (plausibleOf[index].length === 1) regionForced[region] += 1;
  });

  // --- Openings ------------------------------------------------------------

  const openingKeys = new Map<string, boolean>();

  {
    let frontier: GameState[] = [nodes[startIndex].state];

    for (let ply = 1; ply <= 3; ply += 1) {
      const next: GameState[] = [];

      for (const state of frontier) {
        for (const edge of plausible(ctx, state)) {
          const key = canonicalStateKey(level, edge.result.state);
          const isLost = edge.result.state.phase === 'lost';

          if (!openingKeys.has(key)) {
            const targetIndex = isLost ? undefined : indexOfKey.get(key);

            openingKeys.set(
              key,
              targetIndex !== undefined ? canWin[targetIndex] : false
            );
          }

          if (edge.result.state.phase === 'playing') {
            next.push(edge.result.state);
          }
        }
      }

      frontier = next;
    }
  }

  const openingStates = openingKeys.size;
  let openingTraps = 0;

  for (const canWinValue of openingKeys.values()) {
    if (!canWinValue) openingTraps += 1;
  }

  // --- Policies -------------------------------------------------------------

  const policyWins: string[] = [];
  const policyWinsRenamed: string[] = [];
  const policyFlips: string[] = [];
  let greedyWins = false;

  const renamedLevel = withRenamedIds(level);

  for (const policy of POLICY_CHOICES) {
    const outcome = runPolicy(level, policy.choose);
    const renamed = runPolicy(renamedLevel, policy.choose);

    if (outcome.won) policyWins.push(policy.id);
    if (renamed.won) policyWinsRenamed.push(policy.id);
    if (outcome.won !== renamed.won) policyFlips.push(policy.id);
    if (policy.index === 1) greedyWins = outcome.won;
  }

  // --- Critical / decorative tiles (exact, over all solutions) ---------------

  const criticalTileIds: string[] = [];
  const shortestTileIds = new Set<string>();

  // Tiles on at least one shortest path: edge lies on a shortest
  // winning path when distance(start) + 1 + remaining(to) == shortest.
  const distanceFromStart = nodes.map((node) => node.depth);

  for (let i = 0; i < total; i += 1) {
    if (!canWin[i]) continue;
    if (distanceFromStart[i] + minRemaining[i] !== shortest) continue;

    if (nodes[i].state.phase === 'won') continue;

    for (const edge of nodes[i].edges) {
      if (edge.to === null || !canWin[edge.to]) continue;

      if (
        distanceFromStart[i] + 1 + minRemaining[edge.to] === shortest &&
        distanceFromStart[edge.to] + minRemaining[edge.to] === shortest
      ) {
        shortestTileIds.add(edge.tileId);
      }
    }
  }

  for (const tile of level.tiles) {
    if (tile.kind === 'boss') continue;

    if (tileRequired(nodes, tile.id)) {
      criticalTileIds.push(tile.id);
    }
  }

  const decorativeTileIds = level.tiles
    .filter(
      (tile) =>
        tile.kind !== 'boss' &&
        !criticalTileIds.includes(tile.id) &&
        !shortestTileIds.has(tile.id)
    )
    .map((tile) => tile.id);

  // --- Commuting diamonds (diagnostic) ---------------------------------------
  //
  // Two actions commute at s when both orders are legal, remain
  // nonterminal through both interactions, and produce identical
  // canonical states. Pairwise only: commutation is not transitive and
  // equivalence classes are deliberately not formed.

  let commutingDiamonds = 0;

  for (let i = 0; i < total; i += 1) {
    const node = nodes[i];

    if (node.state.phase !== 'playing') continue;

    const edges = node.edges;

    for (let a = 0; a < edges.length; a += 1) {
      const edgeA = edges[a];

      if (edgeA.to === null) continue;

      for (let b = a + 1; b < edges.length; b += 1) {
        const edgeB = edges[b];

        if (edgeB.to === null) continue;

        // s → a → b
        const abEdge = nodes[edgeA.to].edges.find(
          (candidate) => candidate.tileId === edgeB.tileId
        );

        if (!abEdge || abEdge.to === null) continue;

        // s → b → a
        const baEdge = nodes[edgeB.to].edges.find(
          (candidate) => candidate.tileId === edgeA.tileId
        );

        if (!baEdge || baEdge.to === null) continue;

        const abState = nodes[abEdge.to].state;
        const baState = nodes[baEdge.to].state;

        if (
          canonicalStateKey(level, abState) ===
          canonicalStateKey(level, baState)
        ) {
          commutingDiamonds += 1;
        }
      }
    }
  }

  // --- Assemble report ---------------------------------------------------------

  const report: DifficultyReport = {
    analysisVersion: 2,
    levelId: level.id,
    levelRevision: level.revision,
    tier,
    minimumActions: shortest,
    requiredRespawns: minRespawns[startIndex],
    shortestSolution: certifiedLineActions(level, nodes, certifiedLine),
    meaningfulForksMin: meaningfulMin[startIndex],
    conceptualForksMin: conceptualMin[startIndex],
    deepForksMin: deepMin[startIndex],
    bankForksMin: bankMin[startIndex],
    forcedRunMax,
    openingStates,
    openingTrapNumerator: openingTraps,
    openingTrapDenominator: openingStates,
    plausibleTrapNumerator: trapEdges,
    plausibleTrapDenominator: trapTotal,
    tightCombatCountMin: tightMin[startIndex],
    policyWins,
    policyWinsRenamed,
    policyFlips,
    greedyWins,
    maximumWinningPeak: peak[startIndex].toString(),
    criticalTileIds,
    decorativeTileIds,
    uniquePlausible: {
      setup: {
        numerator: regionForced.setup,
        denominator: regionStates.setup,
      },
      decision: {
        numerator: regionForced.decision,
        denominator: regionStates.decision,
      },
      cleanup: {
        numerator: regionForced.cleanup,
        denominator: regionStates.cleanup,
      },
    },
    commutingDiamonds,
    graphStates: total,
    graphEdges: graph.edgeCount,
    gateViolations: [],
  };

  report.gateViolations = evaluateGates(report, level, tier);

  return { status: 'analyzed', report };
}

/**
 * Constructive tutorial action (follow-up guide §2.1): a successful
 * non-boss absorption, an addition, or a multiplication. Boss attacks
 * are excluded by their event kind ("win"/"respawn"/"loss"); set and
 * bank actions are not constructive; immediate losses never appear as
 * constructive edges because absorb/add/multiply keep the game playing.
 */
function isConstructiveAction(event: InteractionEvent): boolean {
  return (
    event.kind === 'absorb' || event.kind === 'add' || event.kind === 'multiply'
  );
}

/**
 * A successful non-boss combat is tight when the player value sits
 * within 2 of an absorption boundary: the lower bound (enemy + 1) or,
 * for window enemies, the upper bound (enemy + maxSurplus).
 */
function isTightCombat(edge: GraphEdge): boolean {
  const combat = edge.event;

  if (combat.kind !== 'absorb') return false;

  const lower = combat.playerBefore - (combat.absorbMin ?? combat.playerBefore);

  if (lower >= 0n && lower <= 2n) return true;

  if (combat.absorbMax === undefined) return false;

  const upper = combat.absorbMax - combat.playerBefore;

  return upper >= 0n && upper <= 2n;
}

function certifiedLineActions(
  level: Level,
  nodes: readonly GraphNode[],
  line: readonly number[]
): string[] {
  void level;

  const actions: string[] = [];

  for (let i = 0; i + 1 < line.length; i += 1) {
    const from = line[i];
    const to = line[i + 1];

    const edge = nodes[from].edges.find((candidate) => candidate.to === to);

    if (!edge) break;

    actions.push(edge.tileId);
  }

  return actions;
}

/**
 * A tile is required exactly when forbidding it makes the level
 * unwinnable: no winning path uses only the other tiles. Computed with
 * one filtered traversal per tile over the exact graph.
 */
function tileRequired(nodes: readonly GraphNode[], tileId: string): boolean {
  const total = nodes.length;
  const reachable = new Array<boolean>(total).fill(false);
  const winning = new Array<boolean>(total).fill(false);

  reachable[0] = true;

  for (let i = 0; i < total; i += 1) {
    if (!reachable[i]) continue;

    const node = nodes[i];

    if (node.state.phase === 'won') {
      winning[i] = true;
      continue;
    }

    if (node.state.phase !== 'playing') continue;

    for (const edge of node.edges) {
      if (edge.tileId === tileId) continue;

      if (edge.to !== null) reachable[edge.to] = true;
    }
  }

  // Backward pass: a node can win (without the tile) iff some
  // non-forbidden winning edge leads to a node that can win.
  for (let i = total - 1; i >= 0; i -= 1) {
    const node = nodes[i];

    if (!reachable[i]) continue;

    if (node.state.phase === 'won') {
      winning[i] = true;
      continue;
    }

    if (node.state.phase !== 'playing') continue;

    for (const edge of node.edges) {
      if (edge.tileId === tileId || edge.to === null) continue;

      if (winning[edge.to]) {
        winning[i] = true;
        break;
      }
    }
  }

  return !winning[0];
}

/** Gate evaluation; returns human-readable violations. */
export function evaluateGates(
  report: DifficultyReport,
  level: Level,
  tier: TierId
): string[] {
  const gate = TIER_GATES[tier];
  const violations: string[] = [];
  const add = (violation: string) => violations.push(violation);

  if (report.meaningfulForksMin < gate.minMeaningfulForks) {
    add(
      `meaningfulForksMin ${report.meaningfulForksMin} < ${gate.minMeaningfulForks}`
    );
  }

  if (report.conceptualForksMin < gate.minConceptualForks) {
    add(
      `conceptualForksMin ${report.conceptualForksMin} < ${gate.minConceptualForks}`
    );
  }

  if (report.deepForksMin < gate.minDeepForks) {
    add(`deepForksMin ${report.deepForksMin} < ${gate.minDeepForks}`);
  }

  if (report.forcedRunMax > gate.maxForcedRun) {
    add(`forcedRunMax ${report.forcedRunMax} > ${gate.maxForcedRun}`);
  }

  if (report.plausibleTrapNumerator < gate.minPlausibleTrapEdges) {
    add(
      `plausible traps ${report.plausibleTrapNumerator} < ${gate.minPlausibleTrapEdges}`
    );
  }

  if (gate.minPlausibleTrapShare) {
    const { numerator, denominator } = gate.minPlausibleTrapShare;

    if (
      !fractionAtLeast(
        report.plausibleTrapNumerator,
        report.plausibleTrapDenominator,
        numerator,
        denominator
      )
    ) {
      add(
        `plausibleTrapShare ${report.plausibleTrapNumerator}/${report.plausibleTrapDenominator} < ${numerator}/${denominator}`
      );
    }
  }

  if (
    gate.minOpeningStates !== null &&
    report.openingStates < gate.minOpeningStates
  ) {
    add(`openingStates ${report.openingStates} < ${gate.minOpeningStates}`);
  }

  if (gate.minOpeningTrapShare) {
    const { numerator, denominator } = gate.minOpeningTrapShare;

    if (
      !fractionAtLeast(
        report.openingTrapNumerator,
        report.openingTrapDenominator,
        numerator,
        denominator
      )
    ) {
      add(
        `openingTrapShare ${report.openingTrapNumerator}/${report.openingTrapDenominator} < ${numerator}/${denominator}`
      );
    }
  }

  if (report.tightCombatCountMin < gate.minTightCombats) {
    add(
      `tightCombatCountMin ${report.tightCombatCountMin} < ${gate.minTightCombats}`
    );
  }

  const bankingBoard = level.spareLives > 0;

  if (
    gate.minBankForks !== null &&
    (!gate.bankForksOnlyOnBankingBoards || bankingBoard) &&
    report.bankForksMin < gate.minBankForks
  ) {
    add(`bankForksMin ${report.bankForksMin} < ${gate.minBankForks}`);
  }

  for (const policyIndex of gate.policiesMustLose) {
    const policy = POLICY_CHOICES.find(
      (candidate) => candidate.index === policyIndex
    );

    if (policy && policyWinsFor(report, policy.id)) {
      add(`policy ${policy.id} wins but must lose`);
    }
  }

  const peakDigits = report.maximumWinningPeak.length;

  if (peakDigits > gate.maxPeakDigits) {
    add(`peak digits ${peakDigits} > ${gate.maxPeakDigits}`);
  }

  if (report.minimumActions < gate.actionRange.min) {
    add(`minimumActions ${report.minimumActions} < ${gate.actionRange.min}`);
  }

  if (report.minimumActions > gate.actionRange.max) {
    add(`minimumActions ${report.minimumActions} > ${gate.actionRange.max}`);
  }

  // Tutorial specification (follow-up guide §2.2): the first three
  // campaign levels teach plain arithmetic — no lives, no set tiles,
  // no window enemies, and no respawn on any winning line.
  if (tier === 'tutorial') {
    if (report.requiredRespawns !== 0) {
      add(
        `tutorial spec: requiredRespawns ${report.requiredRespawns} must be 0`
      );
    }

    for (const tile of level.tiles) {
      if (tile.kind === 'set') {
        add('tutorial spec: set tiles are not allowed');
      }

      if (tile.kind === 'enemy' && tile.maxSurplus !== undefined) {
        add('tutorial spec: window enemies are not allowed');
      }
    }
  }

  return violations;
}

function policyWinsFor(report: DifficultyReport, policyId: PolicyId): boolean {
  return report.policyWins.includes(policyId);
}
