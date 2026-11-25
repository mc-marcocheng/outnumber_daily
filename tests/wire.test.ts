import { describe, expect, it } from 'vitest';
import { initialState } from '../src/shared/game/engine';
import type { InteractionEvent, Level } from '../src/shared/game/model';
import {
  fromWireEvent,
  fromWireState,
  toWireEvent,
  toWireState,
} from '../src/shared/wire';

const level: Level = {
  id: 'wire',
  revision: 1,
  title: 'Wire',
  width: 3,
  terrain: ['...', '...', '...'],
  startCell: 4,
  startValue: 5n,
  spareLives: 1,
  tiles: [
    { id: 'e', kind: 'enemy', cell: 5, value: 3n },
    { id: 'b', kind: 'boss', cell: 7, value: 50n },
  ],
};

describe('wire state round-trip', () => {
  it('preserves bigints beyond Number.MAX_SAFE_INTEGER', () => {
    const state = {
      ...initialState(level),
      value: 9007199254740993n,
      enemies: new Map([['b', 18446744073709551617n]]),
    };

    const restored = fromWireState(
      JSON.parse(JSON.stringify(toWireState(state)))
    );

    expect(restored.value).toBe(state.value);
    expect(restored.enemies.get('b')).toBe(18446744073709551617n);
  });

  it('preserves every field through JSON', () => {
    const state = initialState(level);
    const wire = toWireState(state);
    const restored = fromWireState(JSON.parse(JSON.stringify(wire)));

    expect(restored).toEqual(state);
  });
});

describe('wire event round-trip', () => {
  const base: InteractionEvent = {
    kind: 'absorb',
    tileId: 'e',
    playerBefore: 5n,
    playerAfter: 8n,
    enemyBefore: 3n,
  };

  it('preserves optional bigint fields', () => {
    const event: InteractionEvent = {
      ...base,
      enemyAfter: 0n,
      absorbMin: 4n,
      absorbMax: 6n,
    };

    const restored = fromWireEvent(
      JSON.parse(JSON.stringify(toWireEvent(event)))
    );

    expect(restored).toEqual(event);
  });

  it('keeps absent optional fields undefined', () => {
    const restored = fromWireEvent(
      JSON.parse(JSON.stringify(toWireEvent(base)))
    );

    expect(restored.enemyAfter).toBeUndefined();
    expect(restored.absorbMin).toBeUndefined();
    expect(restored.absorbMax).toBeUndefined();
    expect(restored.combatFailure).toBeUndefined();
  });

  it('preserves combatFailure', () => {
    const event: InteractionEvent = {
      ...base,
      kind: 'respawn',
      combatFailure: 'too-large',
    };

    const restored = fromWireEvent(
      JSON.parse(JSON.stringify(toWireEvent(event)))
    );

    expect(restored).toEqual(event);
  });
});
