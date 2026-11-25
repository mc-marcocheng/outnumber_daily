import type {
  Cell,
  CombatCheck,
  GameState,
  InteractionEvent,
  InteractionKind,
  InteractionResult,
  Level,
  Tile,
} from './model';

/**
 * The single source of combat truth: given a combat tile and the
 * current values, can the player absorb it? Normal enemies absorb any
 * strictly larger value; window enemies also cap the surplus. Bosses
 * never have a window, and ties always lose.
 *
 * The preview, the committed interaction, the solver, and the
 * difficulty analysis all read this function — there is no second
 * arithmetic implementation anywhere.
 */
export function checkCombat(
  tile: Tile,
  player: bigint,
  enemy: bigint
): CombatCheck {
  const min = enemy + 1n;

  const max =
    tile.kind === 'enemy' && tile.maxSurplus !== undefined
      ? enemy + tile.maxSurplus
      : undefined;

  if (player < min) {
    return { absorbs: false, min, max, failure: 'too-small' };
  }

  if (max !== undefined && player > max) {
    return { absorbs: false, min, max, failure: 'too-large' };
  }

  return { absorbs: true, min, max };
}

export function initialState(level: Level): GameState {
  const enemies = new Map<string, bigint>();

  for (const tile of level.tiles) {
    if (tile.kind === 'enemy' || tile.kind === 'boss') {
      enemies.set(tile.id, tile.value);
    }
  }

  return {
    position: level.startCell,
    value: level.startValue,
    spareLives: level.spareLives,
    phase: 'playing',
    enemies,
    usedOps: new Set<string>(),
  };
}

export function isActive(state: GameState, tile: Tile): boolean {
  if (tile.kind === 'enemy' || tile.kind === 'boss') {
    return state.enemies.has(tile.id);
  }

  return !state.usedOps.has(tile.id);
}

export function activeTiles(level: Level, state: GameState): readonly Tile[] {
  return level.tiles.filter((tile) => isActive(state, tile));
}

export function isFloor(level: Level, cell: Cell): boolean {
  const count = level.width * level.terrain.length;

  if (cell < 0 || cell >= count) return false;

  const x = cell % level.width;
  const y = Math.floor(cell / level.width);

  return level.terrain[y][x] === '.';
}

export function neighbors(level: Level, cell: Cell): Cell[] {
  const x = cell % level.width;
  const y = Math.floor(cell / level.width);
  const height = level.terrain.length;

  const result: Cell[] = [];

  // Fixed order makes paths deterministic.
  if (y > 0) result.push(cell - level.width);
  if (x + 1 < level.width) result.push(cell + 1);
  if (y + 1 < height) result.push(cell + level.width);
  if (x > 0) result.push(cell - 1);

  return result;
}

export function pathToTile(
  level: Level,
  state: GameState,
  target: Tile
): readonly Cell[] | null {
  if (!isActive(state, target)) return null;

  return pathToCell(level, state, target.cell);
}

function pathToCell(
  level: Level,
  state: GameState,
  targetCell: Cell
): readonly Cell[] | null {
  const occupied = new Set(activeTiles(level, state).map((tile) => tile.cell));

  const queue: Cell[] = [state.position];
  let head = 0;

  const parent = new Map<Cell, Cell | null>([[state.position, null]]);

  while (head < queue.length) {
    const cell = queue[head++];

    if (cell === targetCell) {
      const path: Cell[] = [];
      let current: Cell | null = cell;

      while (current !== null) {
        path.push(current);
        current = parent.get(current) ?? null;
      }

      return path.reverse();
    }

    for (const next of neighbors(level, cell)) {
      if (!isFloor(level, next)) continue;
      if (parent.has(next)) continue;

      // The target may be entered, but other objects block travel.
      if (occupied.has(next) && next !== targetCell) continue;

      parent.set(next, cell);
      queue.push(next);
    }
  }

  return null;
}

export function interact(
  level: Level,
  state: GameState,
  tileId: string
): InteractionResult {
  if (state.phase !== 'playing') {
    return { ok: false, reason: 'attempt-finished' };
  }

  if (tileId.startsWith('walk:')) {
    const rawCell = tileId.slice(5);
    const cell = Number(rawCell);
    if (
      !/^(0|[1-9][0-9]*)$/.test(rawCell) ||
      !Number.isSafeInteger(cell) ||
      !isFloor(level, cell) ||
      cell === state.position ||
      activeTiles(level, state).some((tile) => tile.cell === cell)
    ) {
      return { ok: false, reason: 'unreachable' };
    }
    const path = pathToCell(level, state, cell);
    if (!path) return { ok: false, reason: 'unreachable' };
    return {
      ok: true,
      state: { ...state, position: cell },
      path,
      event: {
        kind: 'walk',
        tileId,
        playerBefore: state.value,
        playerAfter: state.value,
      },
    };
  }

  const tile = level.tiles.find((item) => item.id === tileId);

  if (!tile) {
    return { ok: false, reason: 'unknown-tile' };
  }

  if (!isActive(state, tile)) {
    return { ok: false, reason: 'inactive-tile' };
  }

  const path = pathToTile(level, state, tile);

  if (!path) {
    return { ok: false, reason: 'unreachable' };
  }

  return applyInteraction(level, state, tile, path);
}

/**
 * Validity checks without the navigation search, for callers that have
 * already established reachability (the solver enumerates targets with
 * one flood fill instead of one BFS per object).
 */
export function interactAssumingReachable(
  level: Level,
  state: GameState,
  tileId: string
): InteractionResult {
  if (state.phase !== 'playing') {
    return { ok: false, reason: 'attempt-finished' };
  }

  const tile = level.tiles.find((item) => item.id === tileId);

  if (!tile) {
    return { ok: false, reason: 'unknown-tile' };
  }

  if (!isActive(state, tile)) {
    return { ok: false, reason: 'inactive-tile' };
  }

  return applyInteraction(level, state, tile, []);
}

function applyInteraction(
  level: Level,
  state: GameState,
  tile: Tile,
  path: readonly Cell[]
): InteractionResult {
  if (tile.kind === 'subtract' && state.value <= tile.amount) {
    return { ok: false, reason: 'non-positive-result' };
  }
  if (tile.kind === 'divide' && state.value % tile.amount !== 0n) {
    return { ok: false, reason: 'non-integer-result' };
  }
  const enemies = new Map(state.enemies);
  const usedOps = new Set(state.usedOps);

  let next: GameState = {
    ...state,
    position: tile.cell,
    enemies,
    usedOps,
  };

  let kind: InteractionKind;
  let enemyBefore: bigint | undefined;
  let enemyAfter: bigint | undefined;
  let combat: CombatCheck | undefined;

  if (tile.kind === 'add') {
    usedOps.add(tile.id);

    next = {
      ...next,
      value: state.value + tile.amount,
    };

    kind = 'add';
  } else if (tile.kind === 'subtract') {
    usedOps.add(tile.id);
    next = { ...next, value: state.value - tile.amount };
    kind = 'subtract';
  } else if (tile.kind === 'divide') {
    usedOps.add(tile.id);
    next = { ...next, value: state.value / tile.amount };
    kind = 'divide';
  } else if (tile.kind === 'multiply') {
    usedOps.add(tile.id);

    next = {
      ...next,
      value: state.value * tile.amount,
    };

    kind = 'multiply';
  } else if (tile.kind === 'set') {
    usedOps.add(tile.id);

    next = {
      ...next,
      value: tile.amount,
    };

    kind = 'set';
  } else {
    const enemyValue = enemies.get(tile.id)!;
    enemyBefore = enemyValue;
    combat = checkCombat(tile, state.value, enemyValue);

    if (combat.absorbs) {
      enemies.delete(tile.id);

      next = {
        ...next,
        value: state.value + enemyValue,
        phase: tile.kind === 'boss' ? 'won' : 'playing',
      };

      kind = tile.kind === 'boss' ? 'win' : 'absorb';
    } else {
      enemyAfter = enemyValue + state.value;
      enemies.set(tile.id, enemyAfter);

      if (state.spareLives > 0) {
        next = {
          ...next,
          position: level.startCell,
          value: level.startValue,
          spareLives: state.spareLives - 1,
        };

        kind = 'respawn';
      } else {
        next = {
          ...next,
          value: 0n,
          phase: 'lost',
        };

        kind = 'loss';
      }
    }
  }

  const event: InteractionEvent = {
    kind,
    tileId: tile.id,
    playerBefore: state.value,
    playerAfter: next.value,
    enemyBefore,
    enemyAfter,
    ...(combat
      ? {
          absorbMin: combat.min,
          absorbMax: combat.max,
          combatFailure: combat.failure,
        }
      : {}),
  };

  return {
    ok: true,
    state: next,
    path,
    event,
  };
}
