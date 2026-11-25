# Outnumber

https://github.com/user-attachments/assets/8752b05a-c41f-4e51-a689-50f9b647cd2e

Outnumber is a daily Reddit puzzle. You choose a path through arithmetic tiles and enemies, and you need to reach the final boss with a bigger number than it has.

The order you visit tiles decides the math. Start at 12, subtract 4, then triple your number, and you get (12 − 4) × 3 = 24. Visit the same tiles in reverse and you get 12 × 3 − 4 = 32. Which route is better depends on the enemies ahead, and sometimes it pays to divide.

## Features

- Three difficulties each day: Easy, Medium and Hard. Each is a compact board that opens in the post without a Play button.
- Tutorials with animated routes, undo to test a hunch, and hints taken from a certified shortest route.
- Scoring by raw steps walked, compared with the proven minimum. A shorter route found later replaces your best.
- Streaks, a puzzle archive, daily leaderboards and a community leaderboard that ranks players by distinct daily solves, then total best steps, then time from release to first solve.
- A community hub with a puzzle editor. Players build a board, test a winning route, request a difficulty assessment and submit privately. Moderators can replay the submitted solution or try their own route.
- Light and dark themes and four languages: English, Traditional Chinese, Simplified Chinese and Japanese.

## How it works

The browser and the Hono server share one game engine that uses `bigint` for exact arithmetic. The server replays and validates every winning run. Redis stores progress, rankings and community submissions.

Daily puzzles are generated and certified offline. Each puzzle ships with proofs of its minimum action count and minimum step count, so the client never runs a solver. The release puzzle set is private and is not in this repository. A 15-puzzle sample in `content/sample-season.json` lets a fresh clone build and play. See [the season pipeline](docs/season-pipeline.md).

Built with Devvit Web, React 19, TypeScript, CSS and Vite.

## Getting started

You need Node.js 24 or newer.

```sh
npm ci
npm run test:types
npm test
npm run dev:local   # play the sample puzzles at http://127.0.0.1:4183
```

`npm run dev` starts a Reddit playtest and needs `npx devvit login` and a test subreddit. `devvit.json` names `outnumber_daily_dev` under `dev.subreddit`; change it to a subreddit you moderate.

## Documentation

- [Development](docs/development.md): layout, commands, local preview, browser tests
- [Season pipeline](docs/season-pipeline.md): generating, certifying and verifying puzzles
- [Community hub](docs/community-hub.md): hub, puzzle editor, review and rankings
- [Data and privacy](docs/data-and-privacy.md): what is stored, deletion, release checks
- [Contributing](CONTRIBUTING.md)

## License

BSD-3-Clause. See [LICENSE](LICENSE).
