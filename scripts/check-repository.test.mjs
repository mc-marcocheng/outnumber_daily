import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPrivatePath } from './check-repository.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('blocks the private season, local artifacts and secrets', () => {
  for (const filename of [
    'season/season.json',
    '.work/pool/pool.json',
    '.shots/test.png',
    '.vscode/settings.json',
    'HANDOVER.md',
    'SUBMISSION.md',
    'node_modules/pkg/index.js',
    'dist/index.js',
    '.env',
    '.env.local',
    'src/.env.production',
  ]) {
    assert.equal(isPrivatePath(filename), true, filename);
  }
});

test('allows source, documentation and reproducible tooling', () => {
  for (const filename of [
    'README.md',
    'CONTRIBUTING.md',
    'docs/development.md',
    'content/sample-season.json',
    'tools/verify-season.ts',
    '.env.example',
    'scripts/ui-check.ts',
    'patches/@devvit+reddit+0.15.3.patch',
    '.githooks/pre-commit',
  ]) {
    assert.equal(isPrivatePath(filename), false, filename);
  }
});

test('rejects staged artifacts but allows their removal', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outnumber-git-'));
  const guard = fileURLToPath(
    new URL('./check-repository.mjs', import.meta.url)
  );
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  const check = (...args) =>
    spawnSync(process.execPath, [guard, ...args], {
      cwd: directory,
      encoding: 'utf8',
    });
  try {
    git('init');
    mkdirSync(path.join(directory, '.shots'));
    writeFileSync(path.join(directory, '.shots', 'private.png'), 'fixture');
    git('add', '.shots');
    assert.equal(check().status, 1);
    assert.equal(check('--all').status, 1);
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-m',
      'fixture'
    );
    git('rm', '--cached', '.shots/private.png');
    assert.equal(check().status, 0);
    assert.equal(check('--all').status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
