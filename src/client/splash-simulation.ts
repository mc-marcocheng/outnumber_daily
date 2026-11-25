import { initialState, interact, pathToTile } from '../shared/game/engine';
import type { GameState, Level, Tile } from '../shared/game/model';

export const SPLASH_BOARD_SIZE = 51;

export function createSplashBoard(random: () => number = Math.random): {
  level: Level;
  state: GameState;
} {
  const center = 25 * SPLASH_BOARD_SIZE + 25;
  const tiles: Tile[] = Array.from(
    { length: SPLASH_BOARD_SIZE ** 2 },
    (_, cell) => cell
  )
    .filter((cell) => cell !== center && random() < 0.24)
    .map((cell): Tile => ({
      id: `enemy-${cell}`,
      kind: 'enemy',
      cell,
      value: BigInt(1 + Math.floor(random() * 9)),
    }));
  const level: Level = {
    id: 'splash-board',
    revision: 1,
    title: 'Outnumber',
    width: SPLASH_BOARD_SIZE,
    terrain: Array.from({ length: SPLASH_BOARD_SIZE }, () =>
      '.'.repeat(SPLASH_BOARD_SIZE)
    ),
    startCell: center,
    startValue: 100n,
    spareLives: 0,
    tiles,
  };
  return { level, state: initialState(level) };
}

export function nextSplashEncounter(
  level: Level,
  state: GameState,
  random: () => number = Math.random
) {
  const nearby = level.tiles
    .filter((tile) => state.enemies.has(tile.id))
    .sort(
      (first, second) =>
        distance(first.cell, state.position) -
        distance(second.cell, state.position)
    );
  const candidates = nearby
    .slice(0, 16)
    .filter((tile) => pathToTile(level, state, tile) !== null)
    .slice(0, 5);
  const target = candidates[Math.floor(random() * candidates.length)];
  if (!target) return null;
  const result = interact(level, state, target.id);
  return result.ok ? result : null;
}

function distance(first: number, second: number) {
  return (
    Math.abs((first % SPLASH_BOARD_SIZE) - (second % SPLASH_BOARD_SIZE)) +
    Math.abs(
      Math.floor(first / SPLASH_BOARD_SIZE) -
        Math.floor(second / SPLASH_BOARD_SIZE)
    )
  );
}

export function puzzleTimeRemaining(date: string, now: number): string {
  const deadline = Date.parse(`${date}T00:00:00Z`) + 86_400_000;
  if (!Number.isFinite(deadline)) return '--:--:--';
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (seconds === 0) return 'Time is up';
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}
