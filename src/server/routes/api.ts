import { Hono } from 'hono';
import { z } from 'zod';
import { context, reddit, realtime, redis } from '@devvit/web/server';
import { compileLevel } from '../../shared/game/level-schema';
import { initialState } from '../../shared/game/engine';
import { commitInteraction, restoreSession } from '../../shared/game/session';
import { replayWithSteps } from '../../shared/replay';
import { toWireEvent, toWireState } from '../../shared/wire';
import type {
  ArchiveResponse,
  CompleteResponse,
  ErrorResponse,
  InitResponse,
  LeaderboardRealtimeMessage,
  LeaderboardResponse,
  MoveResponse,
  PuzzleResponse,
  RestartResponse,
  ShareResultResponse,
  UndoResponse,
} from '../../shared/api';
import { getDaily, utcDate } from '../daily';
import {
  addDays,
  SEASON_ID,
  DIFFICULTIES,
  SEASON_ANCHOR,
  type Difficulty,
} from '../../shared/season';
import { leaderboardChannel } from '../../shared/leaderboard-channel';
import { recordCommunityWin } from '../community-ranking';
import {
  emptyRun,
  getLeaderboard,
  getPostDate,
  getRank,
  getRun,
  getStreak,
  markStreak,
  recordScore,
  saveRun,
  saveUser,
  type RunRecord,
} from '../storage';

export const api = new Hono();

const puzzleDateSchema = z.iso.date().refine((date) => date <= utcDate());
const difficultySchema = z.enum(DIFFICULTIES);
api.use('*', async (c, next) => {
  if (
    c.req.method === 'GET' &&
    !difficultySchema.safeParse(c.req.query('difficulty') ?? 'easy').success
  ) {
    return c.json<ErrorResponse>(errorResponse('Invalid difficulty'), 400);
  }
  await next();
});

function readDifficulty(value: string | undefined): Difficulty {
  return difficultySchema.parse(value ?? 'easy');
}

async function puzzleProgress(date: string, userId: string) {
  const runs = await Promise.all(
    DIFFICULTIES.map((difficulty) =>
      context.userId ? getRun(date, userId, difficulty) : emptyRun()
    )
  );
  const progress = (run: RunRecord) => ({
    completed: run.completed || run.bestSteps !== null,
    started: run.actions.length > 0,
    bestSteps: run.bestSteps,
  });
  return {
    easy: progress(runs[0]!),
    medium: progress(runs[1]!),
    hard: progress(runs[2]!),
  };
}
const archiveMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((month) => z.iso.date().safeParse(`${month}-01`).success);

async function defaultPuzzleDate(): Promise<string> {
  if (!context.postId) return utcDate();
  const mappedDate = await getPostDate(context.postId);
  if (mappedDate) return mappedDate;
  const post = await reddit.getPostById(context.postId);
  const metadata = z
    .object({ date: z.string() })
    .safeParse(await post.getPostData());
  return metadata.success ? metadata.data.date : utcDate();
}

const mutationBodySchema = z.object({
  difficulty: difficultySchema,
  date: z
    .string()
    .optional()
    .transform(async (date) => date ?? (await defaultPuzzleDate()))
    .pipe(puzzleDateSchema),
});
const moveBodySchema = mutationBodySchema.extend({ tileId: z.string().min(1) });
const shareResultBodySchema = z.object({
  difficulty: difficultySchema,
  message: z.string().trim().min(1).max(2000),
  date: puzzleDateSchema.optional(),
  requestId: z.uuid(),
});
const shareResultRecordSchema = z.object({
  type: z.literal('share-result'),
  commentId: z.string().regex(/^t1_[a-z0-9]+$/),
});

function currentUserId(): string {
  return context.userId ?? 'anonymous';
}

function errorResponse(message: string): ErrorResponse {
  return { status: 'error', message };
}

for (const path of ['/move', '/undo', '/restart', '/complete']) {
  api.use(path, async (c, next) => {
    if (c.req.method === 'POST' && !context.userId) {
      return c.json<ErrorResponse>(
        errorResponse('Sign in to save your puzzle.'),
        401
      );
    }
    await next();
  });
}

async function resolveAvatarUrl(): Promise<string | null> {
  try {
    const username = await reddit.getCurrentUsername();
    if (!username) return null;
    const user = await reddit.getCurrentUser();
    if (!user) return null;
    try {
      return (await user.getSnoovatarUrl()) || user.profileImageUrl || null;
    } catch {
      return user.profileImageUrl || null;
    }
  } catch {
    return null;
  }
}

/**
 * Award the highest earned milestone flair. Flair is a cosmetic bonus,
 * so a failure here never blocks the end card.
 */
async function maybeSetFlair(
  username: string,
  streak: number,
  steps: number,
  parSteps: number | null
): Promise<string | null> {
  if (username === 'anonymous') return null;
  let text: string | null = null;
  if (streak >= 30) text = 'Outnumber · 30-day streak';
  else if (streak >= 7) text = 'Outnumber · 7-day streak';
  else if (streak >= 3) text = 'Outnumber · 3-day streak';
  else if (parSteps !== null && steps <= parSteps)
    text = 'Outnumber · par beater';
  if (!text) return null;
  try {
    await reddit.setUserFlair({
      subredditName: context.subredditName,
      username,
      text,
    });
    return text;
  } catch (error) {
    console.error('setUserFlair failed', error);
    return null;
  }
}

api.get('/init', async (c) => {
  const difficulty = readDifficulty(c.req.query('difficulty'));
  const postDate = await defaultPuzzleDate();
  const parsedDate = puzzleDateSchema.safeParse(
    c.req.query('date') ?? (await defaultPuzzleDate())
  );
  if (!parsedDate.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid date'), 400);
  }
  const date = parsedDate.data;
  const entry = getDaily(date, difficulty);
  const userId = currentUserId();
  try {
    const [username, run, avatarUrl] = await Promise.all([
      context.userId ? reddit.getCurrentUsername() : null,
      context.userId ? getRun(date, userId, difficulty) : emptyRun(),
      context.userId ? resolveAvatarUrl() : null,
    ]);
    const streak = context.userId ? await getStreak(date, userId) : 0;
    if (context.userId && username) {
      await saveUser(userId, {
        username,
        avatarUrl,
        lastSeen: date,
      });
    }
    return c.json<InitResponse>({
      type: 'init',
      postId: context.postId ?? '',
      postDate,
      difficulty,
      username: username ?? 'anonymous',
      avatarUrl,
      date,
      streak,
      today: {
        date,
        difficulty,
        levelId: entry.certificate.levelId,
        title: entry.level.title,
        parActions: entry.certificate.minimumActions,
        parSteps: entry.certificate.minimumSteps ?? null,
        completed: run.completed,
        bestSteps: run.bestSteps,
      },
    });
  } catch (error) {
    console.error('init failed', error);
    return c.json<ErrorResponse>(errorResponse('Initialization failed'), 400);
  }
});

api.get('/archive', async (c) => {
  const difficulty = readDifficulty(c.req.query('difficulty'));
  const today = utcDate();
  const parsedMonth = archiveMonthSchema.safeParse(
    c.req.query('month') ?? today.slice(0, 7)
  );
  if (!parsedMonth.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid month'), 400);
  }
  const month = parsedMonth.data;
  const firstDate = SEASON_ANCHOR < today ? SEASON_ANCHOR : today;
  const dates: string[] = [];
  let date = `${month}-01`;
  if (date < firstDate) date = firstDate;
  while (date.startsWith(`${month}-`) && date <= today) {
    dates.push(date);
    if (date === today) break;
    date = addDays(date, 1);
  }
  const userId = currentUserId();
  const days = await Promise.all(
    dates.map(async (date) => {
      const run = context.userId
        ? await getRun(date, userId, difficulty)
        : emptyRun();
      const completed = run.completed || run.bestSteps !== null;
      return {
        date,
        completed,
        started: completed || run.actions.length > 0,
        bestSteps: run.bestSteps,
      };
    })
  );
  return c.json<ArchiveResponse>({
    type: 'archive',
    difficulty,
    today,
    firstDate,
    month,
    days,
  });
});

api.get('/puzzle', async (c) => {
  const difficulty = readDifficulty(c.req.query('difficulty'));
  const parsedDate = puzzleDateSchema.safeParse(
    c.req.query('date') ?? (await defaultPuzzleDate())
  );
  if (!parsedDate.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid date'), 400);
  }
  const date = parsedDate.data;
  const entry = getDaily(date, difficulty);
  const level = compileLevel(entry.level);
  const userId = currentUserId();
  const postDate = await defaultPuzzleDate();
  const [loadedRun, avatarUrl] = await Promise.all([
    context.userId ? getRun(date, userId, difficulty) : emptyRun(),
    resolveAvatarUrl(),
  ]);
  let run = loadedRun;
  const progress = await puzzleProgress(date, userId);
  try {
    const { state, steps } = replayWithSteps(level, run.actions);
    return c.json<PuzzleResponse>({
      type: 'puzzle',
      date,
      postDate,
      difficulty,
      progress,
      level: entry.level,
      parActions: entry.certificate.minimumActions,
      parSteps: entry.certificate.minimumSteps ?? null,
      state: toWireState(state),
      steps,
      actions: run.actions.length,
      completed: run.completed,
      bestSteps: run.bestSteps,
      avatarUrl,
      hintSolution: entry.certificate.stepOptimalSolution ?? null,
    });
  } catch {
    // Corrupt action log: reset the run rather than wedge the player.
    run = { ...run, actions: [], steps: 0, completed: false };
    if (context.userId) await saveRun(date, userId, run, difficulty);
    return c.json<PuzzleResponse>({
      type: 'puzzle',
      date,
      postDate,
      difficulty,
      progress,
      level: entry.level,
      parActions: entry.certificate.minimumActions,
      parSteps: entry.certificate.minimumSteps ?? null,
      state: toWireState(initialState(level)),
      steps: 0,
      actions: 0,
      completed: run.completed,
      bestSteps: run.bestSteps,
      avatarUrl,
      hintSolution: entry.certificate.stepOptimalSolution ?? null,
    });
  }
});

api.post('/move', async (c) => {
  const body = await moveBodySchema.safeParseAsync(
    await c.req.json().catch(() => null)
  );
  if (!body.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid move request'), 400);
  }
  const { date, difficulty, tileId } = body.data;
  const entry = getDaily(date, difficulty);
  const level = compileLevel(entry.level);
  const userId = currentUserId();
  const run = await getRun(date, userId, difficulty);
  if (run.completed) {
    return c.json<ErrorResponse>(
      errorResponse('Attempt already finished'),
      400
    );
  }
  try {
    const session = restoreSession(level, run.actions);
    const { result } = commitInteraction(level, session, tileId);
    if (!result.ok) {
      return c.json<ErrorResponse>(errorResponse(result.reason), 400);
    }
    const steps = replayWithSteps(level, [...run.actions, tileId]).steps;
    const completed = result.state.phase === 'won';
    const next: RunRecord = {
      actions: [...run.actions, tileId],
      steps,
      completed,
      bestSteps: completed
        ? run.bestSteps === null
          ? steps
          : Math.min(run.bestSteps, steps)
        : run.bestSteps,
      bestActions: completed
        ? run.bestActions === null
          ? run.actions.length + 1
          : Math.min(run.bestActions, run.actions.length + 1)
        : run.bestActions,
    };
    if (completed) {
      const solvedAt = Date.now();
      await recordCommunityWin(
        date,
        difficulty,
        userId,
        (await reddit.getCurrentUsername()) ?? 'anonymous',
        steps,
        solvedAt
      );
    }
    await saveRun(date, userId, next, difficulty);
    return c.json<MoveResponse>({
      type: 'move',
      state: toWireState(result.state),
      event: toWireEvent(result.event),
      path: [...result.path],
      steps,
      actions: next.actions.length,
      completed,
    });
  } catch (error) {
    console.error('move failed', error);
    return c.json<ErrorResponse>(errorResponse('Move rejected'), 400);
  }
});

api.post('/undo', async (c) => {
  const body = await mutationBodySchema.safeParseAsync(
    await c.req.json().catch(() => null)
  );
  if (!body.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid request'), 400);
  }
  const { date, difficulty } = body.data;
  const entry = getDaily(date, difficulty);
  const level = compileLevel(entry.level);
  const userId = currentUserId();
  const run = await getRun(date, userId, difficulty);
  if (run.actions.length === 0) {
    return c.json<ErrorResponse>(errorResponse('Nothing to undo'), 400);
  }
  const actions = run.actions.slice(0, -1);
  const { state, steps } = replayWithSteps(level, actions);
  await saveRun(
    date,
    userId,
    { ...run, actions, steps, completed: false },
    difficulty
  );
  return c.json<UndoResponse>({
    type: 'undo',
    state: toWireState(state),
    steps,
    actions: actions.length,
  });
});

api.post('/restart', async (c) => {
  const body = await mutationBodySchema.safeParseAsync(
    await c.req.json().catch(() => null)
  );
  if (!body.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid request'), 400);
  }
  const { date, difficulty } = body.data;
  const entry = getDaily(date, difficulty);
  const level = compileLevel(entry.level);
  const userId = currentUserId();
  const run = await getRun(date, userId, difficulty);
  await saveRun(
    date,
    userId,
    {
      ...run,
      actions: [],
      steps: 0,
      completed: false,
    },
    difficulty
  );
  return c.json<RestartResponse>({
    type: 'restart',
    state: toWireState(initialState(level)),
    steps: 0,
    actions: 0,
  });
});

api.post('/complete', async (c) => {
  const body = await mutationBodySchema.safeParseAsync(
    await c.req.json().catch(() => null)
  );
  if (!body.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid request'), 400);
  }
  const { date, difficulty } = body.data;
  const entry = getDaily(date, difficulty);
  const level = compileLevel(entry.level);
  const userId = currentUserId();
  const run = await getRun(date, userId, difficulty);
  if (!run.completed) {
    return c.json<ErrorResponse>(errorResponse('Attempt not finished'), 400);
  }
  // Recompute the score from the action log — never trust the client.
  const { state, steps } = replayWithSteps(level, run.actions);
  if (state.phase !== 'won') {
    return c.json<ErrorResponse>(errorResponse('Attempt not won'), 400);
  }
  const parSteps = entry.certificate.minimumSteps ?? null;
  const today = utcDate();
  if (date < today) {
    return c.json<CompleteResponse>({
      type: 'complete',
      endCard: {
        steps,
        parSteps,
        parActions: entry.certificate.minimumActions,
        actions: run.actions.length,
        bestSteps: run.bestSteps,
        rank: null,
        streak: await getStreak(today, userId),
        flairMilestone: null,
      },
    });
  }
  await recordScore(date, userId, steps, difficulty);
  await markStreak(date, userId);
  const username = (await reddit.getCurrentUsername()) ?? 'anonymous';
  await saveUser(userId, {
    username,
    avatarUrl: await resolveAvatarUrl(),
    lastSeen: date,
  });
  const [rank, streak] = await Promise.all([
    getRank(date, userId, difficulty),
    getStreak(date, userId),
  ]);
  const flairMilestone = await maybeSetFlair(username, streak, steps, parSteps);
  try {
    await realtime.send<LeaderboardRealtimeMessage>(
      leaderboardChannel(date, difficulty),
      {
        type: 'lb-update',
        date,
        difficulty,
        userId,
        steps,
      }
    );
  } catch (error) {
    console.error('leaderboard realtime send failed', error);
  }
  return c.json<CompleteResponse>({
    type: 'complete',
    endCard: {
      steps,
      parSteps,
      parActions: entry.certificate.minimumActions,
      actions: run.actions.length,
      bestSteps: run.bestSteps,
      rank,
      streak,
      flairMilestone,
    },
  });
});

api.post('/share-result', async (c) => {
  const userId = context.userId;
  if (!userId) {
    return c.json<ErrorResponse>(
      errorResponse('Sign in to share your result.'),
      401
    );
  }
  const postId = context.postId;
  if (!postId || !/^t3_[a-z0-9]+$/.test(postId)) {
    return c.json<ErrorResponse>(
      errorResponse('Open a puzzle post to share your result.'),
      400
    );
  }
  const body = shareResultBodySchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!body.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid request'), 400);
  }
  try {
    const parsedDate = puzzleDateSchema.safeParse(await defaultPuzzleDate());
    if (
      !parsedDate.success ||
      (body.data.date && body.data.date !== parsedDate.data)
    ) {
      return c.json<ErrorResponse>(
        errorResponse('Result does not match this post.'),
        400
      );
    }
    const date = parsedDate.data;
    const difficulty = body.data.difficulty;
    const key = `share-result:${SEASON_ID}:${postId}:${date}:${difficulty}:${userId}:${body.data.requestId.toLowerCase()}`;
    const cached = await redis.get(key);
    if (cached) {
      const result = shareResultRecordSchema.safeParse(JSON.parse(cached));
      if (result.success) return c.json<ShareResultResponse>(result.data);
      return c.json<ErrorResponse>(
        errorResponse('Check the post for your comment before trying again.'),
        409
      );
    }
    const run = await getRun(date, userId, difficulty);
    if (!run.completed) {
      return c.json<ErrorResponse>(
        errorResponse('Finish this puzzle before sharing a result.'),
        400
      );
    }
    const { state, steps } = replayWithSteps(
      compileLevel(getDaily(date, difficulty).level),
      run.actions
    );
    if (state.phase !== 'won') {
      return c.json<ErrorResponse>(
        errorResponse('Finish this puzzle before sharing a result.'),
        400
      );
    }
    const expiration = new Date(Date.now() + 10 * 60 * 1000);
    const acquired = await redis.set(key, JSON.stringify({ pending: true }), {
      nx: true,
      expiration,
    });
    if (acquired !== 'OK') {
      return c.json<ErrorResponse>(
        errorResponse('Check the post for your comment before trying again.'),
        409
      );
    }
    const comment = await reddit.submitComment({
      id: postId,
      text: `${body.data.message}\n\n^(Outnumber Daily · ${date} · ${difficulty} · ${steps} steps)`,
      runAs: 'USER',
    });
    const result: ShareResultResponse = {
      type: 'share-result',
      commentId: comment.id,
    };
    await redis.set(key, JSON.stringify(result), { expiration });
    return c.json<ShareResultResponse>(result);
  } catch {
    return c.json<ErrorResponse>(
      errorResponse(
        'Could not confirm your comment. Check the post before trying again.'
      ),
      502
    );
  }
});

api.get('/leaderboard', async (c) => {
  const difficulty = readDifficulty(c.req.query('difficulty'));
  const parsedDate = puzzleDateSchema.safeParse(
    c.req.query('date') ?? utcDate()
  );
  if (!parsedDate.success) {
    return c.json<ErrorResponse>(errorResponse('Invalid date'), 400);
  }
  const date = parsedDate.data;
  const rows = await getLeaderboard(date, 50, difficulty);
  return c.json<LeaderboardResponse>({
    type: 'leaderboard',
    date,
    difficulty,
    rows,
  });
});
