import { z } from 'zod';

export const rankingTotalsSchema = z.object({
  solved: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
});
export type RankingTotals = z.infer<typeof rankingTotalsSchema>;
export type CommunityRank = RankingTotals & {
  userId: string;
  username: string;
  rank: number;
};
export const emptyTotals: RankingTotals = { solved: 0, steps: 0, elapsedMs: 0 };

export function rankingMember(userId: string, totals: RankingTotals): string {
  const values = [99_999_999 - totals.solved, totals.steps, totals.elapsedMs];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new Error('Ranking total out of range');
  return [
    ...values.map((value) => String(value).padStart(16, '0')),
    userId,
  ].join(':');
}

export function rankingValues(
  member: string
): RankingTotals & { userId: string } {
  const [inverted, steps, elapsed, userId] = member.split(':');
  if (!userId) throw new Error('Invalid ranking member');
  return {
    userId,
    ...rankingTotalsSchema.parse({
      solved: 99_999_999 - Number(inverted),
      steps: Number(steps),
      elapsedMs: Number(elapsed),
    }),
  };
}

export function sameRank(left: RankingTotals, right: RankingTotals): boolean {
  return (
    left.solved === right.solved &&
    left.steps === right.steps &&
    left.elapsedMs === right.elapsedMs
  );
}

export function updateTotals(
  totals: RankingTotals,
  previousSteps: number | undefined,
  steps: number,
  elapsedMs: number
): RankingTotals {
  return {
    solved: totals.solved + (previousSteps === undefined ? 1 : 0),
    steps:
      totals.steps +
      (previousSteps === undefined
        ? steps
        : Math.min(steps - previousSteps, 0)),
    elapsedMs: totals.elapsedMs + (previousSteps === undefined ? elapsedMs : 0),
  };
}
