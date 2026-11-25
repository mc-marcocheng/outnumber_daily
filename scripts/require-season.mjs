import { existsSync } from 'node:fs';

const file = new URL('../season/season.json', import.meta.url);

if (process.env.OUTNUMBER_SEASON === 'sample' || !existsSync(file)) {
  console.error(
    'Refusing to continue: season/season.json is missing or OUTNUMBER_SEASON=sample is set.\n' +
      'A build without the private season would ship the 15-puzzle sample.\n' +
      'See docs/season-pipeline.md.'
  );
  process.exitCode = 1;
}
