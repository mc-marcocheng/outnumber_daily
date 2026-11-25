import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  seasonBundleSchema,
  type SeasonBundle,
} from '../src/shared/season-bundle';

/** Private release puzzles. Not in Git. */
export const RELEASE_SEASON_PATH = fileURLToPath(
  new URL('../season/season.json', import.meta.url)
);
/** Public sample puzzles that let a fresh clone build and test. */
export const SAMPLE_SEASON_PATH = fileURLToPath(
  new URL('../content/sample-season.json', import.meta.url)
);

export type LoadedSeason = {
  bundle: SeasonBundle;
  path: string;
  source: 'release' | 'sample' | 'file';
};

export function readSeasonBundle(path: string): SeasonBundle {
  return seasonBundleSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * Load an explicit file, or the private season when it exists, or the sample.
 * `OUTNUMBER_SEASON=sample` forces the sample, matching the Vite build.
 */
export function loadSeason(explicitPath?: string): LoadedSeason {
  if (explicitPath)
    return {
      bundle: readSeasonBundle(explicitPath),
      path: explicitPath,
      source: 'file',
    };
  const useRelease =
    process.env.OUTNUMBER_SEASON !== 'sample' &&
    existsSync(RELEASE_SEASON_PATH);
  const path = useRelease ? RELEASE_SEASON_PATH : SAMPLE_SEASON_PATH;
  return {
    bundle: readSeasonBundle(path),
    path,
    source: useRelease ? 'release' : 'sample',
  };
}

/** Validate, then replace the file in one rename so a failed run never leaves a partial season. */
export function writeSeasonBundle(path: string, bundle: SeasonBundle): void {
  const checked = seasonBundleSchema.parse(bundle);
  writeFileSync(`${path}.tmp`, JSON.stringify(checked, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}
