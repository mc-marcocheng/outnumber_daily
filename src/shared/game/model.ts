export type Cell = number;
export type TileId = string;

export type CombatTile = Readonly<{
  id: TileId;
  cell: Cell;
  kind: 'enemy' | 'boss';
  value: bigint;
  /**
   * Window enemies only: the largest surplus over the enemy's current
   * value that still absorbs. The legal player interval is
   * [value + 1, value + maxSurplus], both inclusive, and it moves with
   * the enemy when a bank grows it. Bosses never have a window.
   */
  maxSurplus?: bigint;
}>;

export type OperationTile = Readonly<{
  id: TileId;
  cell: Cell;
  kind: 'add' | 'subtract' | 'multiply' | 'divide' | 'set';
  amount: bigint;
}>;

export type Tile = CombatTile | OperationTile;

export type Level = Readonly<{
  id: string;
  revision: number;
  title: string;
  width: number;
  terrain: readonly string[];
  startCell: Cell;
  startValue: bigint;
  spareLives: number;
  tiles: readonly Tile[];
}>;

export type Phase = 'playing' | 'won' | 'lost';

export type GameState = Readonly<{
  position: Cell;
  value: bigint;
  spareLives: number;
  phase: Phase;

  // Only living enemies/bosses appear in this map.
  enemies: ReadonlyMap<TileId, bigint>;

  // Operation IDs that have already been consumed.
  usedOps: ReadonlySet<TileId>;
}>;

export type InteractionKind =
  | 'walk'
  | 'absorb'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'set'
  | 'respawn'
  | 'loss'
  | 'win';

export type CombatFailure = 'too-small' | 'too-large';

export type CombatCheck = Readonly<{
  absorbs: boolean;
  /** Smallest player value that absorbs (enemy value + 1). */
  min: bigint;
  /** Largest absorbable value for window enemies; open-ended otherwise. */
  max?: bigint;
  failure?: CombatFailure;
}>;

export type InteractionEvent = Readonly<{
  kind: InteractionKind;
  tileId: TileId;
  playerBefore: bigint;
  playerAfter: bigint;
  enemyBefore?: bigint;
  enemyAfter?: bigint;
  /** Combat interactions: the legal absorption interval at that moment. */
  absorbMin?: bigint;
  absorbMax?: bigint;
  /** Rejected combat interactions: why the attack could not absorb. */
  combatFailure?: CombatFailure;
}>;

export type InteractionResult =
  | Readonly<{
      ok: true;
      state: GameState;
      path: readonly Cell[];
      event: InteractionEvent;
    }>
  | Readonly<{
      ok: false;
      reason:
        | 'attempt-finished'
        | 'unknown-tile'
        | 'inactive-tile'
        | 'unreachable'
        | 'non-positive-result'
        | 'non-integer-result';
    }>;
