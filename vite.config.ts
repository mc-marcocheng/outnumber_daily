import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { devvit } from '@devvit/start/vite';

const releaseSeason = fileURLToPath(
  new URL('./season/season.json', import.meta.url)
);
const sampleSeason = fileURLToPath(
  new URL('./content/sample-season.json', import.meta.url)
);

/**
 * The private season is not in Git. Builds use it when present and fall back
 * to the public sample. `OUTNUMBER_SEASON=sample` forces the sample.
 */
function seasonFile(): string {
  if (process.env.OUTNUMBER_SEASON === 'sample' || !existsSync(releaseSeason)) {
    console.info('[season] using content/sample-season.json');
    return sampleSeason;
  }
  console.info('[season] using season/season.json');
  return releaseSeason;
}

export default defineConfig({
  plugins: [react(), devvit()],
  resolve: { alias: { 'season-data': seasonFile() } },
});
