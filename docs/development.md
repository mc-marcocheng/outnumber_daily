# Development

## Layout

- `src/client`: React webviews, board rendering and animation timelines.
- `src/server`: Hono JSON `/api/*` routes, Reddit integration and Redis storage.
- `src/shared`: the bigint game engine, replay, wire encoding and the season schedule. Client and server both import it.
- `tools`: offline puzzle generation, certification and the local preview server.
- `content`: the public sample season.
- `scripts`: repository checks and the mocked browser tests.
- `tests`: Vitest unit tests.

The app uses plain JSON requests. `devvit.json` registers `game.html` as the default inline entrypoint and as the expanded game, plus `tutorial.html` and the hub entrypoints (`hub`, `intro`, `leaders`, `contribute`). A post loads its dated puzzle directly. The corner control asks Reddit for the expanded view and is not browser fullscreen. The selected date and difficulty carry over into the expanded view for the same post.

## Daily schedule

Each date offers Easy, Medium and Hard. Easy draws from the `advanced` pool, Medium from `expert` and Hard from `master`. Each pool advances one puzzle per UTC date from `SEASON_ANCHOR` and wraps at its end. Changing a pool's order or members after release changes which puzzle appears on every date, so treat a shipped season as frozen. See [the season pipeline](season-pipeline.md).

The first visit opens Easy. Later visits open the difficulty you last loaded on the post's date. Archive filters stay inside the picker. Only choosing a date changes the puzzle and the saved preference.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run login` | Sign in to the Devvit CLI |
| `npm run dev` | Reddit playtest in the subreddit set in `devvit.json` |
| `npm run dev:local` | Build and play every puzzle on localhost |
| `npm run build` | Build client and server |
| `npm run test:types` | Typecheck all projects |
| `npm test` | Run unit tests (`npm test -- storage` runs one slice) |
| `npm run test:ui` | Run mocked browser tests against a served build |
| `npm run lint` | Lint `src` |
| `npm run format` | Format with Prettier (`format:check` only reports) |
| `npm run check:repo` | Reject private or generated files in Git |
| `npm run season:*` | Generate, emit and verify a season |
| `npm run deploy` | Typecheck and upload; refuses to run without the private season |

Do not run a separate build while the playtest watcher writes `dist`. Never run `devvit publish` unless you intend a public release.

## Season data in builds

`vite.config.ts` aliases `season-data` to `season/season.json` when that file exists and to `content/sample-season.json` otherwise. Set `OUTNUMBER_SEASON=sample` to force the sample. Vitest always uses the sample. `npm run deploy` stops if the private season is missing, so a clone cannot upload the sample by accident.

## Local preview

Run `npm run dev:local` and open `http://127.0.0.1:4183`. Pick a difficulty and puzzle in the toolbar, or step with the arrows. The picker shows each puzzle ID. Moves, undo, restart, hints and completion use the real engine and certificates. Runs stay in memory until the server stops. Use one tab, because puzzle selection is shared. The server binds to localhost only and never contacts Reddit or Redis, so the leaderboard and sharing are unavailable. Use `PORT=4184 npm run dev:local` for another port. The hub is at `/hub.html` and the editor at `/contribute.html`.

## Browser tests

Install Chromium once with `npx playwright install chromium`. Build, then serve the output:

```sh
npm run build
python3 -m http.server 4174 --bind 127.0.0.1 --directory dist/client
```

In another terminal run `npm run test:ui`. Set `UI_BASE_URL` to use a different server. The suite mocks every API response and never writes Reddit data. It covers mobile and desktop layouts, saves, tutorials, route replays, completion dialogs, the archive, settings, the hub and the puzzle editor in all four languages. Screenshots go to the ignored `.shots/` directory.

## Rules the engine enforces

- Subtraction tiles remove a positive integer. A move that would leave the player below 1 is blocked and changes nothing.
- Division tiles use divisors 2 to 9 and need an exact integer result. There is no rounding.
- A blocked tile keeps blocking its cell until the player can use it. Walking to nearby empty cells is still allowed.
- Play, replay and the offline proofs use the same engine code.

## Avatar SDK patch

`patches/@devvit+reddit+0.15.3.patch` exposes `iconImg` from the Reddit user response as `profileImageUrl`, so players can see their own picture on the board. `postinstall` applies it with `patch-package --error-on-fail`. Commit the patch and the lockfile, not `node_modules`. Installing with scripts disabled skips the patch.

The server prefers the Snoovatar, then the profile icon, then a numbered token. The patched SDK code is bundled into the server. Devvit does not support this extension, so review or remove it when upgrading Devvit and before a public release. See [Devvit issue 121](https://github.com/reddit/devvit/issues/121).
