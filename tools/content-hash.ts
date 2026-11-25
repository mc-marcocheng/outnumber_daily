import { createHash } from 'node:crypto';
import type { RawLevel } from '../src/shared/game/level-schema';

/**
 * Canonical form: JSON with keys in a fixed order, no whitespace.
 * Only gameplay-relevant fields are hashed — the title is excluded so
 * translation changes never invalidate a certificate.
 *
 * Node-only (crypto); never imported from browser-reachable code.
 */
export function canonicalLevelString(raw: RawLevel): string {
  const tiles = [...raw.tiles]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((tile) =>
      tile.kind === 'enemy' || tile.kind === 'boss'
        ? {
            c: tile.cell,
            i: tile.id,
            k: tile.kind,
            v: tile.value,
            ...(tile.kind === 'enemy' && tile.maxSurplus !== undefined
              ? { x: tile.maxSurplus }
              : {}),
          }
        : { a: tile.amount, c: tile.cell, i: tile.id, k: tile.kind }
    );

  return JSON.stringify({
    f: raw.formatVersion,
    i: raw.id,
    r: raw.revision,
    w: raw.width,
    t: raw.terrain,
    s: raw.startCell,
    v: raw.startValue,
    l: raw.spareLives,
    o: tiles,
  });
}

export function contentHash(raw: RawLevel): string {
  return createHash('sha256').update(canonicalLevelString(raw)).digest('hex');
}
