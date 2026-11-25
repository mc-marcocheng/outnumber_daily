import seasonData from 'season-data';
import type { RawLevel } from '../shared/game/level-schema';
import {
  seasonBundleSchema,
  type SeasonCertificate,
} from '../shared/season-bundle';
import { levelIdForDate, type Difficulty } from '../shared/season';

export type DailyCertificate = Pick<
  SeasonCertificate,
  | 'levelId'
  | 'minimumActions'
  | 'minimumSteps'
  | 'stepOptimalSolution'
  | 'shortestSolution'
>;

export type DailyEntry = {
  level: RawLevel;
  certificate: DailyCertificate;
};

export function utcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const season = seasonBundleSchema.parse(seasonData);

export function getDaily(
  date: string,
  difficulty: Difficulty = 'easy'
): DailyEntry {
  const levelId = levelIdForDate(date, season.pools, undefined, difficulty);
  const level = season.levels[levelId];
  const certificate = season.certificates[levelId];
  if (!level || !certificate) {
    throw new Error(`No season entry for ${date} (${levelId})`);
  }
  return { level, certificate };
}
