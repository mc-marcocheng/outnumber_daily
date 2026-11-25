import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PRIVATE_PATHS = [
  // The unreleased puzzle set and generator checkpoints.
  /^season\//,
  /^\.work\//,
  // Local notes and screenshots.
  /^\.shots\//,
  /^\.vscode\//,
  /^\.claude\//,
  /^HANDOVER\.md$/,
  /^SUBMISSION\.md$/,
  // Generated output.
  /(?:^|\/)node_modules\//,
  /^dist\//,
  /^coverage\//,
  /^playwright-report\//,
  /^test-results\//,
];

export function isPrivatePath(filename) {
  return (
    PRIVATE_PATHS.some((pattern) => pattern.test(filename)) ||
    (/(?:^|\/)\.env(?:\..+)?$/.test(filename) &&
      !filename.endsWith('.env.example'))
  );
}

export function checkRepository(all = false) {
  const args = all
    ? ['ls-files', '-z']
    : ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'];
  const filenames = execFileSync('git', args, { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const blocked = filenames.filter(isPrivatePath);
  if (blocked.length) {
    console.error(
      `Remove private or generated files from the Git index:\n${blocked.join('\n')}`
    );
    return false;
  }
  return true;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!checkRepository(process.argv.includes('--all'))) process.exitCode = 1;
}
