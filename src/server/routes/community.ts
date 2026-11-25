import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { context, reddit, redis } from '@devvit/web/server';
import { z } from 'zod';
import {
  communityReviewSchema,
  requireDailyAssessment,
  validateContribution,
} from '../../shared/contributions';
import { assessContribution } from '../../shared/contribution-assessment';
import {
  listReviewQueue,
  listSubmissions,
  saveSubmission,
  updateSubmission,
} from '../community-submissions';
import { getCommunityRanking, RANKING_START_DATE } from '../community-ranking';
import { isCommunityModerator } from '../moderator';
import { utcDate } from '../daily';

export const community = new Hono();
community.use(
  '*',
  bodyLimit({
    maxSize: 24_000,
    onError: (c) => c.json({ message: 'Submission is too large.' }, 413),
  })
);
community.onError((error, c) => {
  console.error('community request failed', error);
  return c.json({ message: 'Could not save changes. Please retry.' }, 500);
});
community.get('/init', async (c) =>
  c.json({
    signedIn: Boolean(context.userId),
    moderator: await isCommunityModerator(),
    rankingStartDate: RANKING_START_DATE,
  })
);
community.get('/leaderboard', async (c) => {
  const request = z
    .object({
      period: z.enum(['today', 'all']).default('all'),
      difficulty: z.enum(['all', 'easy', 'medium', 'hard']).default('all'),
    })
    .safeParse(c.req.query());
  if (!request.success) return c.json({ message: 'Invalid leaderboard.' }, 400);
  const scope = request.data.period === 'today' ? utcDate() : 'all';
  return c.json({
    rows: await getCommunityRanking(scope, request.data.difficulty),
    rankingStartDate: RANKING_START_DATE,
  });
});
community.use('*', async (c, next) => {
  if (!context.userId)
    return c.json({ message: 'Sign in to contribute a puzzle.' }, 401);
  await next();
});
community.get('/submissions', async (c) =>
  c.json({ submissions: await listSubmissions(context.userId!) })
);
community.get('/review', async (c) => {
  if (!(await isCommunityModerator()))
    return c.json({ message: 'Moderator access required.' }, 403);
  const status = z
    .enum(['submitted', 'accepted', 'rejected'])
    .safeParse(c.req.query('status') ?? 'submitted');
  if (!status.success) return c.json({ message: 'Invalid review list.' }, 400);
  return c.json({ submissions: await listReviewQueue(status.data) });
});
for (const path of ['/assess', '/submit']) {
  community.post(path, async (c) => {
    const raw: unknown = await c.req.json().catch(() => null);
    let input;
    try {
      input = validateContribution(raw);
    } catch (error) {
      return c.json(
        {
          message:
            error instanceof z.ZodError
              ? 'Check the puzzle fields and solution.'
              : error instanceof Error
                ? error.message
                : 'Invalid puzzle.',
        },
        400
      );
    }
    const allowed = await redis.set(
      `community-submissions:rate:${context.userId}`,
      '1',
      { nx: true, expiration: new Date(Date.now() + 30_000) }
    );
    if (!allowed)
      return c.json(
        {
          message:
            'Wait 30 seconds before requesting another assessment or submission.',
          retryAfterSeconds: 30,
        },
        429
      );
    const assessment = assessContribution(input);
    if (path === '/assess') return c.json({ assessment, steps: input.steps });
    try {
      requireDailyAssessment(assessment);
    } catch (error) {
      return c.json(
        { message: error instanceof Error ? error.message : 'Invalid puzzle.' },
        400
      );
    }
    const submission = await saveSubmission(
      context.userId!,
      (await reddit.getCurrentUsername()) ?? 'anonymous',
      input,
      assessment
    );
    return c.json({ submission });
  });
}
community.post('/withdraw', async (c) => {
  const request = z
    .object({ id: z.string().regex(/^[a-f0-9]{32}$/) })
    .safeParse(await c.req.json().catch(() => null));
  if (!request.success) return c.json({ message: 'Invalid submission.' }, 400);
  await updateSubmission(context.userId!, request.data.id, 'withdraw');
  return c.json({ ok: true });
});
community.post('/review', async (c) => {
  if (!(await isCommunityModerator()))
    return c.json({ message: 'Moderator access required.' }, 403);
  const request = communityReviewSchema.safeParse(
    await c.req.json().catch(() => null)
  );
  if (!request.success) return c.json({ message: 'Invalid review.' }, 400);
  await updateSubmission(
    request.data.authorId,
    request.data.id,
    request.data.status,
    request.data.status === 'rejected' ? request.data.declineReason : undefined
  );
  return c.json({ ok: true });
});
