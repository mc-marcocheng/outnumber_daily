import { readSeasonBundle, SAMPLE_SEASON_PATH } from '../tools/season-files';

/** The public sample puzzles, validated. Tests never read the private season. */
export const sampleSeason = readSeasonBundle(SAMPLE_SEASON_PATH);
