import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  communityReviewSchema,
  requireDailyAssessment,
  validateContribution,
  type CommunitySubmission,
} from '../src/shared/contributions';
import { assessContribution } from '../src/shared/contribution-assessment';
import {
  emptyTotals,
  updateTotals,
  type RankingTotals,
} from '../src/shared/community-ranking';
import type { Difficulty } from '../src/shared/season';

export function createLocalCommunity() {
  const submissions = new Map<string, CommunitySubmission>();
  const wins = new Map<string, number>();
  const totals = new Map<string, RankingTotals>();
  const started = new Date().toISOString().slice(0, 10);
  let nextAssessmentAt = 0;
  return {
    recordWin(
      date: string,
      difficulty: Difficulty,
      levelId: string,
      steps: number
    ) {
      const today = new Date().toISOString().slice(0, 10);
      if (date !== today) return;
      const identity = `${date}:${difficulty}:${levelId}`;
      const previous = wins.get(identity);
      for (const scope of [
        'all:all',
        `all:${difficulty}`,
        `today:${difficulty}`,
        'today:all',
      ]) {
        totals.set(
          scope,
          updateTotals(
            totals.get(scope) ?? emptyTotals,
            previous,
            steps,
            Date.now() - Date.parse(`${date}T00:00:00Z`)
          )
        );
      }
      wins.set(identity, Math.min(previous ?? Infinity, steps));
    },
    handle(
      url: URL,
      method: string,
      input: unknown
    ): { body: unknown; status: number } {
      const ok = (body: unknown) => ({ body, status: 200 });
      const path = url.pathname.replace('/api/community', '');
      if (method === 'GET') {
        if (path === '/init')
          return ok({
            signedIn: true,
            moderator: true,
            rankingStartDate: started,
          });
        if (path === '/leaderboard') {
          const total = totals.get(
            `${url.searchParams.get('period') ?? 'all'}:${url.searchParams.get('difficulty') ?? 'all'}`
          );
          return ok({
            rows: total
              ? [
                  {
                    ...total,
                    userId: 't2_local',
                    username: 'Local player',
                    rank: 1,
                  },
                ]
              : [],
            rankingStartDate: started,
          });
        }
        if (path === '/submissions')
          return ok({ submissions: [...submissions.values()] });
        if (path === '/review') {
          const status = z
            .enum(['submitted', 'accepted', 'rejected'])
            .safeParse(url.searchParams.get('status') ?? 'submitted');
          if (!status.success)
            return { body: { message: 'Invalid review list.' }, status: 400 };
          return ok({
            submissions: [...submissions.values()]
              .filter((row) => row.status === status.data)
              .slice(0, 50),
          });
        }
      }
      if (method === 'POST' && (path === '/submit' || path === '/assess')) {
        let checked;
        try {
          checked = validateContribution(input);
        } catch (error) {
          return {
            status: 400,
            body: {
              message:
                error instanceof z.ZodError
                  ? 'Check the puzzle fields and solution.'
                  : error instanceof Error
                    ? error.message
                    : 'Invalid puzzle.',
            },
          };
        }
        if (Date.now() < nextAssessmentAt)
          return {
            status: 429,
            body: {
              message:
                'Wait 30 seconds before requesting another assessment or submission.',
              retryAfterSeconds: 30,
            },
          };
        nextAssessmentAt = Date.now() + 30_000;
        const assessment = assessContribution(checked);
        if (path === '/assess') return ok({ assessment, steps: checked.steps });
        try {
          requireDailyAssessment(assessment);
        } catch (error) {
          return {
            status: 400,
            body: {
              message:
                error instanceof Error ? error.message : 'Invalid puzzle.',
            },
          };
        }
        const id = createHash('sha256')
          .update(JSON.stringify(input))
          .digest('hex')
          .slice(0, 32);
        const existing = submissions.get(id);
        if (existing) return ok({ submission: existing });
        if (submissions.size >= 10)
          return {
            body: { message: 'Withdraw a submission before adding another.' },
            status: 400,
          };
        const submission: CommunitySubmission = {
          ...checked,
          id,
          assessment,
          author: 'Local player',
          authorId: 't2_local',
          submittedAt: new Date().toISOString(),
          status: 'submitted',
        };
        submissions.set(id, submission);
        return ok({ submission });
      }
      if (method === 'POST' && path === '/withdraw') {
        const { id } = z.object({ id: z.string() }).parse(input);
        submissions.delete(id);
        return ok({ ok: true });
      }
      if (method === 'POST' && path === '/review') {
        const request = communityReviewSchema.safeParse(input);
        if (!request.success)
          return { body: { message: 'Invalid review.' }, status: 400 };
        const { id, status } = request.data;
        const submission = submissions.get(id);
        if (!submission)
          return { body: { message: 'Submission not found.' }, status: 404 };
        const updated = { ...submission, status };
        delete updated.declineReason;
        if (request.data.status === 'rejected')
          updated.declineReason = request.data.declineReason;
        submissions.set(id, updated);
        return ok({ ok: true });
      }
      return { body: { message: 'Not found.' }, status: 404 };
    },
  };
}
