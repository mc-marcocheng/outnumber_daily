import type { GameState, InteractionEvent, Phase } from './game/model';

/** JSON-safe GameState: bigints as decimal strings, Map/Set as arrays. */
export type WireState = {
  position: number;
  value: string;
  spareLives: number;
  phase: Phase;
  enemies: [string, string][];
  usedOps: string[];
};

export type WireEvent = {
  kind: InteractionEvent['kind'];
  tileId: string;
  playerBefore: string;
  playerAfter: string;
  enemyBefore?: string;
  enemyAfter?: string;
  absorbMin?: string;
  absorbMax?: string;
  combatFailure?: 'too-small' | 'too-large';
};

export function toWireState(state: GameState): WireState {
  return {
    position: state.position,
    value: state.value.toString(),
    spareLives: state.spareLives,
    phase: state.phase,
    enemies: [...state.enemies.entries()].map(([id, value]) => [
      id,
      value.toString(),
    ]),
    usedOps: [...state.usedOps],
  };
}

export function fromWireState(wire: WireState): GameState {
  return {
    position: wire.position,
    value: BigInt(wire.value),
    spareLives: wire.spareLives,
    phase: wire.phase,
    enemies: new Map(wire.enemies.map(([id, value]) => [id, BigInt(value)])),
    usedOps: new Set(wire.usedOps),
  };
}

export function toWireEvent(event: InteractionEvent): WireEvent {
  const wire: WireEvent = {
    kind: event.kind,
    tileId: event.tileId,
    playerBefore: event.playerBefore.toString(),
    playerAfter: event.playerAfter.toString(),
  };
  if (event.enemyBefore !== undefined)
    wire.enemyBefore = event.enemyBefore.toString();
  if (event.enemyAfter !== undefined)
    wire.enemyAfter = event.enemyAfter.toString();
  if (event.absorbMin !== undefined)
    wire.absorbMin = event.absorbMin.toString();
  if (event.absorbMax !== undefined)
    wire.absorbMax = event.absorbMax.toString();
  if (event.combatFailure !== undefined)
    wire.combatFailure = event.combatFailure;
  return wire;
}

export function fromWireEvent(wire: WireEvent): InteractionEvent {
  return {
    kind: wire.kind,
    tileId: wire.tileId,
    playerBefore: BigInt(wire.playerBefore),
    playerAfter: BigInt(wire.playerAfter),
    ...(wire.enemyBefore !== undefined && {
      enemyBefore: BigInt(wire.enemyBefore),
    }),
    ...(wire.enemyAfter !== undefined && {
      enemyAfter: BigInt(wire.enemyAfter),
    }),
    ...(wire.absorbMin !== undefined && { absorbMin: BigInt(wire.absorbMin) }),
    ...(wire.absorbMax !== undefined && { absorbMax: BigInt(wire.absorbMax) }),
    ...(wire.combatFailure !== undefined && {
      combatFailure: wire.combatFailure,
    }),
  };
}
