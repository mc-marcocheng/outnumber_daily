# Contributing

Use Node.js 24 or newer and install with `npm ci`. Keep lifecycle scripts on: they apply the pinned avatar SDK patch and set the Git hooks path to `.githooks`. If you already use another hooks path, it is left alone. Run `npm run check:staged` yourself in that case.

## Before opening a pull request

```sh
npm run check:repo
npm run test:repo
npm run test:types
npm run lint
npm run format:check
npm test
```

Run `npm run test:ui` after changes to gameplay, tutorials or layout. The [development guide](docs/development.md) explains how to serve the build. CI runs all of these, plus a build.

The pre-commit hook rejects private paths and whitespace errors in staged files. It does not stage or format anything. Hooks can be bypassed, so CI checks every tracked path too.

## What belongs in Git

Commit source, tests, reusable tools, lockfiles and the SDK patch. Do not commit:

- `season/` or `.work/`. The release puzzle set and generator checkpoints stay private so players cannot see puzzles early.
- Screenshots, editor settings, build output, credentials or personal notes.

Never edit certificates or `season/season.json` by hand. Rebuild and verify them with the tools in [the season pipeline](docs/season-pipeline.md).

## Code style

- Use named exports and TypeScript type aliases. Avoid type casts.
- Keep Reddit and Redis code in `src/server`, deterministic rules in `src/shared` and UI in `src/client`.
- Do not add a solver or hint search to the client.
- Add a regression test with each behavior fix.
- Run `npm run format` before committing.

## Writing

Write plain, specific text for docs, comments and player-facing copy. Say what something does and keep the caveats. Cut filler, sales language and repeated explanations. Use sentence-case headings and avoid decorative emphasis and em dashes. Keep translations faithful to the English meaning.
