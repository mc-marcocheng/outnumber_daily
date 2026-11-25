import { execFileSync, spawnSync } from 'node:child_process';

if (!process.env.CI) {
  try {
    const result = spawnSync('git', ['config', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
    });
    if (result.error || (result.status !== 0 && result.status !== 1))
      throw result.error ?? new Error('Cannot read Git hooks path');
    const configured = result.stdout.trim();
    if (configured && configured !== '.githooks') {
      console.warn(
        'Existing Git hooks path preserved. Run npm run check:staged before committing.'
      );
    } else {
      execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks']);
    }
  } catch {
    console.warn(
      'Git hooks were not installed. Run npm run check:staged before committing.'
    );
  }
}
