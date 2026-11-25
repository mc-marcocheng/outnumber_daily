import { redis } from '@devvit/web/server';
import { z } from 'zod';
import { SEASON_ID, type Difficulty } from '../shared/season';
import {
  emptyTotals,
  rankingMember,
  rankingTotalsSchema,
  rankingValues,
  sameRank,
  updateTotals,
  type CommunityRank,
} from '../shared/community-ranking';

export const RANKING_START_DATE = '2026-11-24';
const prefix = 'community-ranking';
const winSchema = z.object({
  steps: z.number().int().nonnegative(),
  firstSolvedAt: z.number().int().nonnegative(),
});

export async function recordCommunityWin(
  date: string,
  difficulty: Difficulty,
  userId: string,
  username: string,
  steps: number,
  solvedAt: number
): Promise<void> {
  if (
    date < RANKING_START_DATE ||
    date !== new Date(solvedAt).toISOString().slice(0, 10)
  )
    return;
  const releaseAt = Date.parse(`${date}T00:00:00.000Z`);
  const ledgerKey = `${prefix}:wins:${userId}`;
  const totalsKey = `${prefix}:totals:${userId}`;
  const identity = `${SEASON_ID}:${date}:${difficulty}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const transaction = await redis.watch(ledgerKey, totalsKey);
    try {
      const raw = await redis.hGet(ledgerKey, identity);
      const previous = raw ? winSchema.parse(JSON.parse(raw)) : undefined;
      if (previous && previous.steps <= steps) {
        await transaction.discard();
        return;
      }
      const scopes = [
        `all:${difficulty}`,
        'all:all',
        `${date}:${difficulty}`,
        `${date}:all`,
      ];
      const changes = await Promise.all(
        scopes.map(async (scope) => {
          const stored = await redis.hGet(totalsKey, scope);
          const before = stored
            ? rankingTotalsSchema.parse(JSON.parse(stored))
            : emptyTotals;
          const after = updateTotals(
            before,
            previous?.steps,
            steps,
            solvedAt - releaseAt
          );
          return { scope, before, after };
        })
      );
      await transaction.multi();
      await transaction.hSet(ledgerKey, {
        [identity]: JSON.stringify({
          steps,
          firstSolvedAt: previous?.firstSolvedAt ?? solvedAt,
        }),
      });
      await transaction.set(`${prefix}:name:${userId}`, username);
      for (const { scope, before, after } of changes) {
        const board = `${prefix}:board:${scope}`;
        if (before.solved)
          await transaction.zRem(board, [rankingMember(userId, before)]);
        await transaction.zAdd(board, {
          member: rankingMember(userId, after),
          score: 0,
        });
        await transaction.hSet(totalsKey, { [scope]: JSON.stringify(after) });
      }
      if ((await transaction.exec()) !== null) return;
    } catch (error) {
      await transaction.discard();
      throw error;
    }
  }
  throw new Error('Score changed concurrently. Please retry.');
}

export async function getCommunityRanking(
  scope: string,
  difficulty: Difficulty | 'all'
): Promise<CommunityRank[]> {
  const entries = await redis.zRange(
    `${prefix}:board:${scope}:${difficulty}`,
    0,
    49,
    { by: 'rank' }
  );
  const rows: CommunityRank[] = [];
  for (const entry of entries) {
    const values = rankingValues(entry.member);
    const previous = rows.at(-1);
    rows.push({
      ...values,
      username:
        (await redis.get(`${prefix}:name:${values.userId}`)) ?? 'anonymous',
      rank:
        previous && sameRank(previous, values)
          ? previous.rank
          : rows.length + 1,
    });
  }
  return rows;
}

export async function deleteCommunityRanking(userId: string): Promise<void> {
  const totalsKey = `${prefix}:totals:${userId}`;
  const ledgerKey = `${prefix}:wins:${userId}`;
  const transaction = await redis.watch(totalsKey, ledgerKey);
  try {
    const totals = await redis.hGetAll(totalsKey);
    await transaction.multi();
    for (const [scope, raw] of Object.entries(totals ?? {})) {
      await transaction.zRem(`${prefix}:board:${scope}`, [
        rankingMember(userId, rankingTotalsSchema.parse(JSON.parse(raw))),
      ]);
    }
    await transaction.del(totalsKey, ledgerKey, `${prefix}:name:${userId}`);
    if ((await transaction.exec()) === null)
      throw new Error('Score changed during deletion. Please retry.');
  } catch (error) {
    await transaction.discard();
    throw error;
  }
}

async function deletePlayerDate(date: string, userId: string): Promise<void> {
  const totalsKey = `${prefix}:totals:${userId}`;
  const ledgerKey = `${prefix}:wins:${userId}`;
  const transaction = await redis.watch(totalsKey, ledgerKey);
  try {
    const ledger = await redis.hGetAll(ledgerKey);
    const totals = await redis.hGetAll(totalsKey);
    const removals = Object.entries(ledger ?? {}).filter(
      ([identity]) => identity.split(':')[1] === date
    );
    const updated = new Map<
      string,
      ReturnType<typeof rankingTotalsSchema.parse>
    >();
    for (const [identity, raw] of removals) {
      const win = winSchema.parse(JSON.parse(raw));
      const difficulty = identity.split(':')[2];
      for (const scope of [
        `all:${difficulty}`,
        'all:all',
        `${date}:${difficulty}`,
        `${date}:all`,
      ]) {
        const current =
          updated.get(scope) ??
          rankingTotalsSchema.parse(JSON.parse(totals[scope] ?? 'null'));
        updated.set(
          scope,
          rankingTotalsSchema.parse({
            solved: current.solved - 1,
            steps: current.steps - win.steps,
            elapsedMs:
              current.elapsedMs -
              (win.firstSolvedAt - Date.parse(`${date}T00:00:00Z`)),
          })
        );
      }
    }
    await transaction.multi();
    for (const [scope, after] of updated) {
      const before = rankingTotalsSchema.parse(
        JSON.parse(totals[scope] ?? 'null')
      );
      await transaction.zRem(`${prefix}:board:${scope}`, [
        rankingMember(userId, before),
      ]);
      if (after.solved) {
        await transaction.zAdd(`${prefix}:board:${scope}`, {
          member: rankingMember(userId, after),
          score: 0,
        });
        await transaction.hSet(totalsKey, { [scope]: JSON.stringify(after) });
      } else await transaction.hDel(totalsKey, [scope]);
    }
    if (removals.length)
      await transaction.hDel(
        ledgerKey,
        removals.map(([identity]) => identity)
      );
    if ((await transaction.exec()) === null)
      throw new Error('Score changed during date deletion. Please retry.');
  } catch (error) {
    await transaction.discard();
    throw error;
  }
}

export async function deleteCommunityDay(date: string): Promise<void> {
  let rows = await getCommunityRanking(date, 'all');
  while (rows.length) {
    for (const row of rows) await deletePlayerDate(date, row.userId);
    rows = await getCommunityRanking(date, 'all');
  }
}
