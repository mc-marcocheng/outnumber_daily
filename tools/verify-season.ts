import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { initialState } from '../src/shared/game/engine';
import { compileLevel } from '../src/shared/game/level-schema';
import { certifySteps } from '../src/shared/game/certify-steps';
import {
  proveExactRespawns,
  proveRequiredTile,
} from '../src/shared/game/claims';
import { solve } from '../src/shared/game/solver';
import { replayWithSteps } from '../src/shared/replay';
import type { SeasonBundle } from '../src/shared/season-bundle';
import { contentHash } from './content-hash';
import { loadSeason } from './season-files';

/**
 * Re-prove every claim in a season bundle: content hash, witness replays,
 * minimum actions, minimum movement steps, exact respawns and required tiles.
 * A solver limit counts as a failure because an unproven claim must not ship.
 * Tier difficulty gates are checked when the pool is built and emitted.
 */
const PROOF_BUDGET = { maxStates: 3_000_000, maxMs: 120_000 };

export function verifyLevel(bundle: SeasonBundle, id: string): string[] {
  const failures: string[] = [];
  const raw = bundle.levels[id];
  const certificate = bundle.certificates[id];
  if (!raw || !certificate) return [`${id}: missing level or certificate`];
  if (certificate.levelId !== id)
    failures.push(`${id}: certificate names ${certificate.levelId}`);
  if (contentHash(raw) !== certificate.contentHash)
    failures.push(`${id}: content hash mismatch`);
  const level = compileLevel(raw);

  const actions = replayWithSteps(level, certificate.shortestSolution);
  if (actions.state.phase !== 'won')
    failures.push(`${id}: shortest solution does not win`);
  else if (certificate.shortestSolution.length !== certificate.minimumActions)
    failures.push(
      `${id}: shortest solution length differs from minimumActions`
    );

  const route = replayWithSteps(level, certificate.stepOptimalSolution);
  if (route.state.phase !== 'won')
    failures.push(`${id}: step-optimal solution does not win`);
  else if (route.steps !== certificate.minimumSteps)
    failures.push(
      `${id}: step witness walks ${route.steps}, claimed ${certificate.minimumSteps}`
    );

  const solved = solve(level, initialState(level), PROOF_BUDGET, {
    canonical: true,
  });
  if (solved.status !== 'solved')
    failures.push(`${id}: minimum actions unverifiable (${solved.status})`);
  else if (solved.minimumActions !== certificate.minimumActions)
    failures.push(
      `${id}: certified ${certificate.minimumActions} actions, solver found ${solved.minimumActions}`
    );

  const steps = certifySteps(level);
  if (steps.status !== 'certified')
    failures.push(`${id}: minimum steps unverifiable (${steps.status})`);
  else if (steps.minimumSteps !== certificate.minimumSteps)
    failures.push(
      `${id}: certified ${certificate.minimumSteps} steps, certifier found ${steps.minimumSteps}`
    );

  if (certificate.requiredRespawns !== null) {
    const proof = proveExactRespawns(
      level,
      certificate.requiredRespawns,
      PROOF_BUDGET
    );
    if (!proof.ok) failures.push(proof.reason);
  }
  for (const tileId of certificate.criticalTileIds) {
    const proof = proveRequiredTile(level, tileId, PROOF_BUDGET);
    if (!proof.ok) failures.push(proof.reason);
  }
  return failures;
}

export function verifySeason(
  bundle: SeasonBundle,
  only?: string
): { verified: number; failures: string[] } {
  const ids = Object.keys(bundle.levels).filter((id) => !only || id === only);
  if (only && ids.length === 0)
    return { verified: 0, failures: [`${only}: not in this season`] };
  const failures: string[] = [];
  for (const [index, id] of ids.entries()) {
    const found = verifyLevel(bundle, id);
    failures.push(...found);
    console.log(
      `${found.length ? 'FAIL' : 'ok  '} ${id} ${index + 1}/${ids.length}`
    );
  }
  return {
    verified:
      ids.length -
      new Set(failures.map((failure) => failure.split(':')[0])).size,
    failures,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const value = (name: string) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const known = new Set(['id', 'file']);
  for (const arg of args)
    if (!arg.startsWith('--') || !known.has(arg.slice(2).split('=')[0]!)) {
      console.error(
        'Usage: npx tsx tools/verify-season.ts [--file=season/season.json] [--id=<level id>]'
      );
      process.exit(2);
    }
  const season = loadSeason(value('file'));
  console.log(
    `Verifying ${Object.keys(season.bundle.levels).length} puzzles from ${season.path} (${season.source})`
  );
  const { verified, failures } = verifySeason(season.bundle, value('id'));
  if (failures.length) {
    console.error(`\n${failures.length} verification failure(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`\nAll ${verified} puzzles verified.`);
}
