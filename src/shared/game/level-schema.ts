import { z } from 'zod';
import type { Level, Tile } from './model';

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

const positiveDecimal = z.string().regex(/^[1-9][0-9]{0,11}$/);

const tileBase = {
  id: idSchema,
  cell: z.number().int().nonnegative(),
};

const rawTileSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...tileBase,
      kind: z.literal('subtract'),
      amount: positiveDecimal,
    })
    .strict(),
  z
    .object({
      ...tileBase,
      kind: z.literal('divide'),
      amount: z.string().regex(/^[2-9]$/),
    })
    .strict(),
  z
    .object({
      ...tileBase,
      kind: z.literal('enemy'),
      value: positiveDecimal,
      // Window enemies: the absorption interval is
      // [value + 1, value + maxSurplus] and moves with the enemy.
      maxSurplus: positiveDecimal.optional(),
    })
    .strict(),
  // Bosses never carry a window: strict() rejects a misplaced
  // maxSurplus instead of silently dropping it.
  z
    .object({
      ...tileBase,
      kind: z.literal('boss'),
      value: positiveDecimal,
    })
    .strict(),
  z
    .object({
      ...tileBase,
      kind: z.literal('add'),
      amount: positiveDecimal,
    })
    .strict(),
  z
    .object({
      ...tileBase,
      kind: z.literal('multiply'),
      amount: z.string().regex(/^[2-9]$/),
    })
    .strict(),
  // Set tile: assign the player's value to `amount`; the tile is
  // consumed like any operation.
  z
    .object({
      ...tileBase,
      kind: z.literal('set'),
      amount: positiveDecimal,
    })
    .strict(),
]);

export const rawLevelSchema = z.object({
  formatVersion: z.literal(1),
  id: idSchema,
  revision: z.number().int().positive(),
  title: z.string().min(1).max(80),
  width: z.number().int().min(1).max(7),
  terrain: z
    .array(z.string().regex(/^[.#]+$/))
    .min(1)
    .max(8),
  startCell: z.number().int().nonnegative(),
  startValue: positiveDecimal,
  spareLives: z.number().int().min(0).max(2),
  tiles: z.array(rawTileSchema).min(1).max(47),
});

export type RawLevel = z.infer<typeof rawLevelSchema>;

export const generatedLevelSchema = rawLevelSchema.extend({
  terrain: z
    .array(z.string().regex(/^[.#]+$/))
    .min(1)
    .max(7),
});

export function compileLevel(input: unknown): Level {
  const raw = rawLevelSchema.parse(input);
  const cellCount = raw.width * raw.terrain.length;

  if (raw.terrain.some((row) => row.length !== raw.width)) {
    throw new Error(`${raw.id}: inconsistent terrain width`);
  }

  function isFloor(cell: number): boolean {
    if (cell < 0 || cell >= cellCount) return false;

    const x = cell % raw.width;
    const y = Math.floor(cell / raw.width);

    return raw.terrain[y][x] === '.';
  }

  if (!isFloor(raw.startCell)) {
    throw new Error(`${raw.id}: invalid starting cell`);
  }

  const ids = new Set<string>();
  const occupiedCells = new Set<number>();

  for (const tile of raw.tiles) {
    if (ids.has(tile.id)) {
      throw new Error(`${raw.id}: duplicate tile ID ${tile.id}`);
    }

    if (occupiedCells.has(tile.cell)) {
      throw new Error(`${raw.id}: overlapping objects`);
    }

    if (!isFloor(tile.cell)) {
      throw new Error(`${raw.id}: object is not on floor`);
    }

    if (tile.cell === raw.startCell) {
      throw new Error(`${raw.id}: starting cell must be empty`);
    }

    ids.add(tile.id);
    occupiedCells.add(tile.cell);
  }

  if (raw.tiles.filter((tile) => tile.kind === 'boss').length !== 1) {
    throw new Error(`${raw.id}: exactly one boss is required`);
  }

  const tiles: Tile[] = raw.tiles.map((tile) => {
    if (tile.kind === 'enemy') {
      return {
        ...tile,
        value: BigInt(tile.value),
        maxSurplus:
          tile.maxSurplus === undefined ? undefined : BigInt(tile.maxSurplus),
      };
    }

    if (tile.kind === 'boss') {
      return {
        ...tile,
        value: BigInt(tile.value),
      };
    }

    return {
      ...tile,
      amount: BigInt(tile.amount),
    };
  });

  return {
    id: raw.id,
    revision: raw.revision,
    title: raw.title,
    width: raw.width,
    terrain: raw.terrain,
    startCell: raw.startCell,
    startValue: BigInt(raw.startValue),
    spareLives: raw.spareLives,
    tiles,
  };
}
