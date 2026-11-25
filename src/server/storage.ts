import { redis } from '@devvit/web/server';
import { z } from 'zod';
import type { LeaderboardRow } from '../shared/api';
import {
  addDays,
  DIFFICULTIES,
  SEASON_ID,
  type Difficulty,
} from '../shared/season';

type Transaction = Awaited<ReturnType<typeof redis.watch>>;

async function writeTransaction(
  write: (transaction: Transaction) => Promise<void>
): Promise<void> {
  const transaction = await redis.watch();
  await transaction.multi();
  try {
    await write(transaction);
    const result = await transaction.exec();
    if (result === null) throw new Error('Storage transaction aborted');
  } catch (error) {
    await transaction.discard();
    throw error;
  }
}

function participantsKey(date: string): string {
  return `${SEASON_ID}:participants:${date}`;
}

function userDatesKey(userId: string): string {
  return `${SEASON_ID}:user-dates:${userId}`;
}

function completionKey(userId: string): string {
  return `${SEASON_ID}:completions:${userId}`;
}

function runKey(date: string, userId: string, difficulty: Difficulty): string {
  return `${SEASON_ID}:run:${date}:${difficulty}:${userId}`;
}

function leaderboardKey(date: string, difficulty: Difficulty): string {
  return `${SEASON_ID}:lb:${date}:${difficulty}`;
}

function allRunKeys(date: string, userId: string): string[] {
  return DIFFICULTIES.map((difficulty) => runKey(date, userId, difficulty));
}

function allLeaderboardKeys(date: string): string[] {
  return DIFFICULTIES.map((difficulty) => leaderboardKey(date, difficulty));
}

async function indexProgress(date: string, userId: string): Promise<void> {
  await writeTransaction(async (transaction) => {
    await transaction.hSet(participantsKey(date), { [userId]: '1' });
    await transaction.hSet(userDatesKey(userId), { [date]: '1' });
  });
}

const runRecordSchema = z.object({
  actions: z.array(z.string()),
  steps: z.number().int().nonnegative(),
  completed: z.boolean(),
  bestSteps: z.number().int().nonnegative().nullable(),
  bestActions: z.number().int().nonnegative().nullable(),
});

export type RunRecord = z.infer<typeof runRecordSchema>;

const POST_LOOKUP_TTL_SECONDS = 30 * 24 * 60 * 60;

export function emptyRun(): RunRecord {
  return {
    actions: [],
    steps: 0,
    completed: false,
    bestSteps: null,
    bestActions: null,
  };
}

export async function getRun(
  date: string,
  userId: string,
  difficulty: Difficulty = 'easy'
): Promise<RunRecord> {
  const raw = await redis.get(runKey(date, userId, difficulty));
  if (raw === null || raw === undefined) return emptyRun();
  await indexProgress(date, userId);
  const parsed = runRecordSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : emptyRun();
}

export async function saveRun(
  date: string,
  userId: string,
  run: RunRecord,
  difficulty: Difficulty = 'easy'
): Promise<void> {
  await indexProgress(date, userId);
  await redis.set(runKey(date, userId, difficulty), JSON.stringify(run));
}

const LEADERBOARD_TTL_SECONDS = 30 * 24 * 60 * 60;
const USER_TTL_SECONDS = 30 * 24 * 60 * 60;

function userKey(userId: string): string {
  return `user:${userId}`;
}

export type UserProfile = {
  username: string;
  avatarUrl: string | null;
  lastSeen: string;
};

/**
 * Record a finished run's step count. Only the best (lowest) step count
 * is kept: the sorted set is ascending, so rank 0 is the fewest steps.
 */
export async function recordScore(
  date: string,
  userId: string,
  steps: number,
  difficulty: Difficulty = 'easy'
): Promise<void> {
  const key = leaderboardKey(date, difficulty);
  const existing = await redis.zScore(key, userId);
  if (existing === undefined || steps < existing) {
    await writeTransaction(async (transaction) => {
      await transaction.zAdd(key, { member: userId, score: steps });
      await transaction.expire(key, LEADERBOARD_TTL_SECONDS);
      await transaction.hSet(userDatesKey(userId), { [date]: '1' });
      await transaction.hSet(participantsKey(date), { [userId]: '1' });
    });
  }
}

export async function getLeaderboard(
  date: string,
  limit = 50,
  difficulty: Difficulty = 'easy'
): Promise<LeaderboardRow[]> {
  const entries = await redis.zRange(
    leaderboardKey(date, difficulty),
    0,
    limit - 1,
    {
      by: 'rank',
    }
  );
  const rows: LeaderboardRow[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) continue;
    const profile = await getUser(entry.member);
    rows.push({
      userId: entry.member,
      username: profile?.username ?? 'anonymous',
      steps: entry.score,
      rank: i + 1,
    });
  }
  return rows;
}

export async function getRank(
  date: string,
  userId: string,
  difficulty: Difficulty = 'easy'
): Promise<number | null> {
  const rank = await redis.zRank(leaderboardKey(date, difficulty), userId);
  return rank === undefined ? null : rank + 1;
}

export async function markStreak(date: string, userId: string): Promise<void> {
  await indexProgress(date, userId);
  await redis.hSet(completionKey(userId), { [date]: '1' });
}

/** Count consecutive completed days ending at `date` (inclusive). */
export async function getStreak(date: string, userId: string): Promise<number> {
  let streak = 0;
  let currentDate = date;
  while ((await redis.hGet(completionKey(userId), currentDate)) === '1') {
    streak += 1;
    currentDate = addDays(currentDate, -1);
  }
  return streak;
}

export async function saveUser(
  userId: string,
  profile: UserProfile
): Promise<void> {
  const key = userKey(userId);
  await writeTransaction(async (transaction) => {
    await transaction.hSet(key, {
      username: profile.username,
      avatarUrl: profile.avatarUrl ?? '',
      lastSeen: profile.lastSeen,
    });
    await transaction.expire(key, USER_TTL_SECONDS);
  });
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const fields = await redis.hGetAll(userKey(userId));
  if (!fields || Object.keys(fields).length === 0) return null;
  return {
    username: fields.username ?? 'anonymous',
    avatarUrl: fields.avatarUrl ? fields.avatarUrl : null,
    lastSeen: fields.lastSeen ?? '',
  };
}

export async function purgeUser(userId: string): Promise<void> {
  const dates = new Set([
    ...(await redis.hKeys(userDatesKey(userId))),
    ...(await redis.hKeys(completionKey(userId))),
  ]);
  for (const date of dates) {
    await redis.del(...allRunKeys(date, userId));
    await redis.hDel(participantsKey(date), [userId]);
    for (const key of allLeaderboardKeys(date)) await redis.zRem(key, [userId]);
  }
  await redis.del(userKey(userId), userDatesKey(userId), completionKey(userId));
}

export async function rememberPostDate(
  postId: string,
  date: string
): Promise<void> {
  await redis.set(`post-date:${postId}`, date, {
    expiration: new Date(Date.now() + POST_LOOKUP_TTL_SECONDS * 1000),
  });
}

export async function getPostDate(postId: string): Promise<string | undefined> {
  return redis.get(`post-date:${postId}`);
}

export async function purgeDay(date: string): Promise<void> {
  const purgeProgress = async (userId: string): Promise<void> => {
    await redis.del(...allRunKeys(date, userId));
    await redis.hDel(userDatesKey(userId), [date]);
    await redis.hDel(completionKey(userId), [date]);
  };
  let cursor = 0;
  do {
    const page = await redis.hScan(
      participantsKey(date),
      cursor,
      undefined,
      100
    );
    for (const { field: userId } of page.fieldValues)
      await purgeProgress(userId);
    cursor = page.cursor;
  } while (cursor !== 0);
  for (const key of allLeaderboardKeys(date)) {
    cursor = 0;
    do {
      const page = await redis.zScan(key, cursor, undefined, 100);
      for (const { member: userId } of page.members)
        await purgeProgress(userId);
      cursor = page.cursor;
    } while (cursor !== 0);
  }
  await redis.del(participantsKey(date), ...allLeaderboardKeys(date));
}
