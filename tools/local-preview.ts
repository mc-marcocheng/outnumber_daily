import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { compileLevel } from '../src/shared/game/level-schema';
import {
  commitInteraction,
  createSession,
  undo,
  type Session,
} from '../src/shared/game/session';
import { replayWithSteps } from '../src/shared/replay';
import {
  DIFFICULTIES,
  DIFFICULTY_TIERS,
  addDays,
  SEASON_ANCHOR,
} from '../src/shared/season';
import { toWireEvent, toWireState } from '../src/shared/wire';
import { createLocalCommunity } from './local-community';
import { loadSeason } from './season-files';

const identitySchema = z.object({
  difficulty: z.enum(DIFFICULTIES).default('easy'),
  date: z.iso.date().optional(),
});
const moveSchema = identitySchema.extend({ tileId: z.string() });
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export function createLocalPreviewServer() {
  const { bundle } = loadSeason();
  const certificates = bundle.certificates;
  const pools = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      bundle.pools[DIFFICULTY_TIERS[difficulty]].map((id) => ({
        raw: bundle.levels[id]!,
        id,
      })),
    ])
  );
  const selectionSchema = z.object({
    index: z
      .number()
      .int()
      .min(0)
      .max(Math.max(...Object.values(pools).map((pool) => pool.length)) - 1),
  });
  const community = createLocalCommunity();
  let selectedIndex = 0;
  const sessions = new Map<string, Session>();
  const bests = new Map<string, number>();
  return createServer(async (request, response) => {
    const json = (value: unknown, status = 200) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(value));
    };
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/api/community/')) {
        let body = '';
        for await (const chunk of request) {
          body += String(chunk);
          if (body.length > 24_000)
            return json({ message: 'Submission is too large.' }, 413);
        }
        const result = community.handle(
          url,
          request.method ?? 'GET',
          body ? JSON.parse(body) : null
        );
        return json(result.body, result.status);
      }
      if (url.pathname === '/local/puzzles')
        return json({
          selectedIndex,
          pools: Object.fromEntries(
            DIFFICULTIES.map((difficulty) => [
              difficulty,
              pools[difficulty]!.map((entry) => ({
                id: entry.raw.id,
                width: entry.raw.width,
                height: entry.raw.terrain.length,
              })),
            ])
          ),
        });
      if (url.pathname === '/local/select' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) body += String(chunk);
        selectedIndex = selectionSchema.parse(JSON.parse(body)).index;
        return json({ selectedIndex });
      }
      if (url.pathname.startsWith('/api/')) {
        let body = '';
        for await (const chunk of request) body += String(chunk);
        const input: unknown = body
          ? JSON.parse(body)
          : Object.fromEntries(url.searchParams);
        const identity = identitySchema.parse(input);
        const date = identity.date ?? addDays(SEASON_ANCHOR, selectedIndex);
        const entry =
          pools[identity.difficulty]![
            selectedIndex % pools[identity.difficulty]!.length
          ]!;
        const level = compileLevel(entry.raw);
        const certificate = certificates[level.id]!;
        const key = `${date}:${level.id}`;
        let session = sessions.get(key) ?? createSession(level);
        const snapshot = () => ({
          state: toWireState(session.present),
          actions: session.actions.length,
          steps: replayWithSteps(level, session.actions).steps,
        });
        const progress = () => ({
          completed: bests.has(key),
          started: session.actions.length > 0,
          bestSteps: bests.get(key) ?? null,
        });
        if (url.pathname === '/api/init')
          return json({
            type: 'init',
            postId: 'local-preview',
            postDate: date,
            date,
            difficulty: identity.difficulty,
            username: 'Local player',
            avatarUrl: null,
            streak: 0,
            today: {
              date,
              difficulty: identity.difficulty,
              levelId: level.id,
              title: level.title,
              parActions: certificate.minimumActions,
              parSteps: certificate.minimumSteps,
              ...progress(),
            },
          });
        if (url.pathname === '/api/puzzle')
          return json({
            type: 'puzzle',
            date,
            postDate: date,
            difficulty: identity.difficulty,
            progress: Object.fromEntries(
              DIFFICULTIES.map((difficulty) => {
                const other =
                  pools[difficulty]![
                    selectedIndex % pools[difficulty]!.length
                  ]!;
                const otherKey = `${date}:${other.raw.id}`;
                return [
                  difficulty,
                  {
                    completed: bests.has(otherKey),
                    started: (sessions.get(otherKey)?.actions.length ?? 0) > 0,
                    bestSteps: bests.get(otherKey) ?? null,
                  },
                ];
              })
            ),
            level: entry.raw,
            ...snapshot(),
            completed: session.present.phase === 'won',
            bestSteps: bests.get(key) ?? null,
            parActions: certificate.minimumActions,
            parSteps: certificate.minimumSteps,
            avatarUrl: null,
            hintSolution: certificate.stepOptimalSolution,
          });
        if (url.pathname === '/api/move') {
          const move = moveSchema.parse(input);
          const outcome = commitInteraction(level, session, move.tileId);
          if (!outcome.result.ok)
            return json(
              { status: 'error', message: outcome.result.reason },
              400
            );
          session = outcome.session;
          sessions.set(key, session);
          if (session.present.phase === 'won') {
            bests.set(
              key,
              Math.min(bests.get(key) ?? Infinity, snapshot().steps)
            );
            community.recordWin(
              date,
              identity.difficulty,
              level.id,
              snapshot().steps
            );
          }
          return json({
            type: 'move',
            ...snapshot(),
            event: toWireEvent(outcome.result.event),
            path: outcome.result.path,
            completed: session.present.phase === 'won',
          });
        }
        if (url.pathname === '/api/undo' || url.pathname === '/api/restart') {
          session =
            url.pathname === '/api/undo' ? undo(session) : createSession(level);
          sessions.set(key, session);
          return json({ type: url.pathname.slice(5), ...snapshot() });
        }
        if (url.pathname === '/api/complete') {
          if (session.present.phase !== 'won')
            return json(
              { status: 'error', message: 'Puzzle is not complete' },
              400
            );
          return json({
            type: 'complete',
            endCard: {
              ...snapshot(),
              parSteps: certificate.minimumSteps,
              parActions: certificate.minimumActions,
              bestSteps: bests.get(key) ?? null,
              rank: null,
              streak: 0,
              flairMilestone: null,
            },
          });
        }
        if (url.pathname === '/api/leaderboard')
          return json({
            type: 'leaderboard',
            date,
            difficulty: identity.difficulty,
            rows: [],
          });
        if (url.pathname === '/api/archive')
          return json({
            type: 'archive',
            difficulty: identity.difficulty,
            today: date,
            firstDate: date,
            month: date.slice(0, 7),
            days: [{ date, ...progress() }],
          });
        return json(
          {
            status: 'error',
            message: 'This action is unavailable in local preview',
          },
          400
        );
      }
      const localFiles: Record<string, string> = {
        '/': 'scripts/local-preview.html',
        '/local-preview.js': 'scripts/local-preview-client.js',
      };
      const root = resolve('dist/client');
      const file = localFiles[url.pathname]
        ? resolve(localFiles[url.pathname]!)
        : resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!localFiles[url.pathname] && !file.startsWith(`${root}/`))
        return json({ message: 'Not found' }, 404);
      const data = await readFile(file);
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    } catch (error) {
      json(
        {
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Preview request failed',
        },
        400
      );
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = z.coerce
    .number()
    .int()
    .min(1024)
    .max(65535)
    .parse(process.env.PORT ?? 4183);
  const server = createLocalPreviewServer();
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`Local puzzle preview: http://127.0.0.1:${port}`)
  );
}
