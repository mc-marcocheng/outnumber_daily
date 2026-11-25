You are writing a Devvit web application that will be executed on Reddit.com.

## Tech Stack

- **Frontend**: React 19, CSS, Vite
- **Backend**: Devvit Web managed runtime and Hono; local tooling needs Node.js 24+
- **Communication**: JSON `/api/*` endpoints with shared TypeScript wire types

## Layout & Architecture

- `/src/server`: **Backend Code**. This runs in a secure, serverless environment.
  - `routes/api.ts`: Defines the JSON API routes.
  - `index.ts`: Main server entry point (Hono app).
  - Access `redis`, `reddit`, and `context` here via `@devvit/web/server`.
- `/src/client`: **Frontend Code**. This is executed inside of an iFrame on reddit.com
  - To add an entrypoint, create a HTML file and add to the mapping inside of `devvit.json`
  - Entrypoints:
    - `game.html`: The main React entry point for both inline posts and expanded play. Keep initial loading fast; the real puzzle opens without a Play gate.
    - `tutorial.html`: Standalone tutorials. Tutorials are also available inside the game.
- `/src/shared`: **Shared Code**. Code to share between the client and server
- `/tools`: Offline puzzle generation, certification and the local preview server.
- `/content`: The public sample season.

## Frontend

### Rules

- Instead of `window.location` or `window.assign`, use `navigateTo` from `@devvit/web/client`

### Limitations

- `window.alert`: Use `showToast` or `showForm` from `@devvit/web/client`
- File downloads: Use clipboard API with `showToast` to confirm
- Geolocation, camera, microphone, and notifications web APIs: No alternatives
- Inline script tags inside of `html` files: Use a script tag and separate js/ts file

## Commands

- `npm run test:types`: Check TypeScript types
- `npm run lint`: Check the linter
- `npm run test -- my-file-name`: Run tests isolated to a file
- `npm run test:ui`: Run mocked browser regressions against served build output
- `npm run check:repo`: Reject tracked local artifacts and build output

## Code Style

- Prefer type aliases over interfaces when writing typescript
- Prefer named exports over default exports
- Never cast typescript types

## Global Rules

- You may find code that references blocks or `@devvit/public-api` while building a feature. Do NOT use this code as this project is configured to use Devvit web only.
- Whenever you add an endpoint for a new menu item action, ensure that you've added the corresponding mapping to `devvit.json` so that it is properly registered

Docs: https://developers.reddit.com/docs/llms.txt.

## Writing

Follow https://github.com/blader/humanizer/blob/main/SKILL.md for documentation, all player-facing text (including hints, tutorials, dialogs, errors and translated copy), and comments. Use plain, specific language. Keep supported facts and technical terms. Remove filler, sales language and repeated explanations. Use sentence-case headings and avoid decorative emphasis or em dashes.

## Repository and release safety

- Keep `.shots`, `.vscode`, `HANDOVER.md`, `SUBMISSION.md` and generated build output local.
- Never commit `season/` or `.work/`. The release puzzle set and generator checkpoints are private. `content/sample-season.json` is the only puzzle data in Git.
- Keep reusable tests, tools, lockfiles and SDK patches in Git.
- Do not publish, upload or install publicly without explicit owner approval.
- Use only `r/outnumber_daily_dev` for private playtesting.
- Never hand-edit certificates or generated content. Rebuild and verify offline (see `docs/season-pipeline.md`).
- Do not ship a client solver or hint worker.
