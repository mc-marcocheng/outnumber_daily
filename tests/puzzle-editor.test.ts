import { describe, expect, it } from 'vitest';
import {
  newDraft,
  paintCell,
  resizeDraft,
} from '../src/client/app/puzzle-editor';
import { compileLevel } from '../src/shared/game/level-schema';

describe('puzzle editor', () => {
  it('keeps one boss and one empty starting cell', () => {
    const draft = paintCell(newDraft(), 7, 'boss', 20, 1);
    expect(draft.tiles.filter((tile) => tile.kind === 'boss')).toHaveLength(1);
    expect(paintCell(draft, 0, 'wall', 2, 1)).toBe(draft);
    const moved = paintCell(draft, 7, 'start', 2, 1);
    expect(moved.startCell).toBe(7);
    expect(moved.tiles.some((tile) => tile.cell === 7)).toBe(false);
  });
  it('remaps coordinates and identifiers when resizing', () => {
    const resized = resizeDraft(newDraft(), 5, 6);
    expect(resized.terrain).toHaveLength(6);
    expect(() => compileLevel(resized)).not.toThrow();
    expect(new Set(resized.tiles.map((tile) => tile.id)).size).toBe(
      resized.tiles.length
    );
  });
  it('bounds operation values and replaces occupied cells', () => {
    const draft = paintCell(newDraft(), 1, 'divide', 999, 1);
    expect(draft.tiles.find((tile) => tile.cell === 1)).toMatchObject({
      kind: 'divide',
      amount: '9',
    });
    expect(draft.tiles).toHaveLength(3);
  });
});
