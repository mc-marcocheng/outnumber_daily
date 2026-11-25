import { afterAll, expect, it } from 'vitest';
import { createLocalPreviewServer } from '../tools/local-preview';
import { loadSeason } from '../tools/season-files';

const { bundle } = loadSeason();
const server = createLocalPreviewServer();
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Missing local server address');
const base = `http://127.0.0.1:${address.port}`;
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
);
const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

it('serves all puzzles and plays, undoes, restarts and completes a real certified route', async () => {
  const catalog = await fetch(`${base}/local/puzzles`).then((response) =>
    response.json()
  );
  expect(catalog.pools.easy).toHaveLength(bundle.pools.advanced.length);
  expect(catalog.pools.medium).toHaveLength(bundle.pools.expert.length);
  expect(catalog.pools.hard).toHaveLength(bundle.pools.master.length);
  const firstId = bundle.pools.advanced[0]!;
  const entry = {
    raw: bundle.levels[firstId]!,
    witness: bundle.certificates[firstId]!.shortestSolution,
  };
  const puzzle = await fetch(`${base}/api/puzzle`).then((response) =>
    response.json()
  );
  expect(puzzle.level.id).toBe(entry.raw.id);
  const identity = { date: puzzle.date, difficulty: 'easy' };
  expect((await post('/api/complete', identity)).status).toBe(400);
  expect(
    (await post('/api/move', { ...identity, tileId: entry.witness[0] })).status
  ).toBe(200);
  expect((await (await post('/api/undo', identity)).json()).actions).toBe(0);
  for (const tileId of entry.witness)
    expect((await post('/api/move', { ...identity, tileId })).status).toBe(200);
  const complete = await (await post('/api/complete', identity)).json();
  expect(complete.endCard.actions).toBe(entry.witness.length);
  expect(complete.endCard.bestSteps).toBeGreaterThan(0);
  expect((await (await post('/api/restart', identity)).json()).actions).toBe(0);
  const last =
    Math.max(
      bundle.pools.advanced.length,
      bundle.pools.expert.length,
      bundle.pools.master.length
    ) - 1;
  await post('/local/select', { index: last });
  const hard = await fetch(`${base}/api/puzzle?difficulty=hard`).then(
    (response) => response.json()
  );
  expect(hard.level.id).toBe(
    catalog.pools.hard[last % catalog.pools.hard.length].id
  );
  expect((await post('/local/select', { index: last + 1 })).status).toBe(400);
});
