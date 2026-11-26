# Season pipeline

The daily puzzles come from a season: a fixed set of certified boards. The real season is private and stays out of Git so players cannot read puzzles before they ship. A small public sample lets a fresh clone build, test and play.

## Where the data lives

| Path | In Git | Purpose |
| --- | --- | --- |
| `content/sample-season.json` | yes | 15 sample puzzles for development, tests and CI |
| `season/season.json` | no | The private release season |
| `.work/` | no | Generator checkpoints, verification reports, scratch |

Both season files use the bundle format in `src/shared/season-bundle.ts`: three pools (`advanced`, `expert`, `master`), the level JSON for every id, and one certificate per level. Easy uses the advanced pool, Medium the expert pool and Hard the master pool.

Vite and the local tools use `season/season.json` when it exists and fall back to the sample otherwise. Set `OUTNUMBER_SEASON=sample` to force the sample. Vitest always uses the sample.

## Schedule

Each difficulty serves one puzzle per UTC date, starting at `SEASON_ANCHOR` in `src/shared/season.ts`, and wraps around at the end of its pool. Pool order sets the date assignments: the puzzle for a date is the entry at its day number, counted from the anchor. Saved runs and leaderboards are keyed by date and difficulty, so a date that has been released must keep its puzzle. To change later dates, keep every pool's released entries in place and in order, and replace only the entries after them. Reordering or removing a released entry moves puzzles that players have already played. Before the game is public, a season can be replaced outright.

## Board rules for the release season

- Maximum size is 4 by 5 for Easy, 5 by 6 for Medium and 6 by 7 for Hard. The board is never rotated to fit.
- Printed values, tile values and window endpoints are at most 999. Player totals and enemies raised by deposits can go higher.
- Division needs an exact integer result.
- Every winning route uses a subtraction tile and a division tile.
- Easy has lower fork thresholds than Medium and Hard. It still needs three opening states, at least one in five plausible traps, 5 to 16 actions and a failure of the largest-bite policy. Do not relax any gate to fill a pool.

## Build a season

Everything here runs offline on a development machine. Nothing uploads or publishes. The commands need Node.js 24 or newer.

1. Generate a pool. Pick a random seed and keep it private: with the same seed, settings and tool sources the generator repeats its search.

   ```sh
   npm run season:pool -- --seed=<private integer> --target=200 --attempts=240 --max-run-ms=900000
   ```

   The checkpoint goes to `.work/pool/pool.json`. Run the same command again to resume. Each run accepts at most `--attempts` new candidates, so a full pool takes many runs. Check `complete` in the printed summary. `--batch` skips re-proving retained rows when you resume, and `--out` picks another directory.

2. Verify the pool. This re-proves every retained row in an isolated worker with the same exact solver, step certifier and respawn proofs, and writes `.work/pool/verification.json`. It can resume after an interruption.

   ```sh
   npm run season:pool -- --verify
   ```

3. Emit the season. The tool refuses a pool that is incomplete, unbalanced, duplicated, or verified against different tool sources. It derives each certificate again and writes `season/season.json` in one rename.

   ```sh
   npm run season:emit
   ```

4. Verify the emitted file. This checks every certificate against its level: content hash, both witnesses, minimum actions, minimum movement steps, exact respawns and required tiles. A solver limit counts as a failure.

   ```sh
   npm run season:verify
   npm run season:verify -- --id=<level id>
   npm run season:verify -- --file=path/to/season.json
   ```

5. Build and play. `npm run build` bundles the season into the server. `npm run dev:local` serves every puzzle on localhost with the real engine.

Never edit a certificate or `season/season.json` by hand. Rebuild and verify instead. Do not cut proof budgets to hide a failure or read a solver limit as proof. The game does not ship a solver or hint search: hints come from the certified step-optimal route.

## What a candidate must pass

A board enters the pool only after all of these hold:

- It fits its tier's dimensions and value cap.
- Baseline policies that must lose do lose, and the tier gates in `src/shared/game/difficulty.ts` pass on a complete exact graph.
- Its causal signature and its action and step role sequences differ enough from every retained board (role distance of at least 3).
- Its terrain topology and tile access graph are new.
- Every tile that is not the boss is required on every winning route.
- Action, step, respawn and required-tile proofs succeed within budget.

## Local preview

`npm run dev:local` builds the client and starts `tools/local-preview.ts` on `http://127.0.0.1:4183` (set `PORT` to change it). Pick a difficulty and puzzle in the toolbar. Moves, undo, restart, hints and completion use the real engine and certificates. Runs stay in memory. The server binds to localhost and never talks to Reddit or Redis.

## Tests

The tool tests use the sample season and small generated boards, never private data. Run them with `npm test`. The `test:ui` browser checks use the same loader, so they run on a fresh clone too.
