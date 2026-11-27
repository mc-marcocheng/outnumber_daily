export type SeasonTier = 'advanced' | 'expert' | 'master';

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type PuzzleIdentity = { date: string; difficulty: Difficulty };
export const DIFFICULTY_TIERS: Readonly<Record<Difficulty, SeasonTier>> = {
  easy: 'advanced',
  medium: 'expert',
  hard: 'master',
};

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

/** UTC date of the first daily puzzle. Each difficulty advances one puzzle per day from here. */
export const SEASON_ANCHOR = '2026-11-11';

/** Prefix for season-scoped storage keys and realtime channels. */
export const SEASON_ID = 'season-2';

export type SeasonPools = Readonly<Record<SeasonTier, readonly string[]>>;

const DAY_MS = 86_400_000;

function utcNoon(date: string): number {
  return Date.parse(`${date}T12:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(utcNoon(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcNoon(to) - utcNoon(from)) / DAY_MS);
}

export function levelIdForDate(
  date: string,
  pools: SeasonPools,
  anchor: string = SEASON_ANCHOR,
  difficulty: Difficulty = 'easy'
): string {
  if (!isDifficulty(difficulty)) throw new Error('Invalid difficulty');
  const tier = DIFFICULTY_TIERS[difficulty];
  const pool = pools[tier];
  if (!pool.length) throw new Error(`Empty season pool: ${tier}`);
  const index = daysBetween(anchor, date);
  if (!Number.isFinite(index)) throw new Error('Invalid schedule date');
  const len = pool.length;
  return pool[((index % len) + len) % len];
}
