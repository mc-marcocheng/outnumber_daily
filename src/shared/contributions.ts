import { z } from 'zod';
import { compileLevel, rawLevelSchema } from './game/level-schema';
import { replayWithSteps } from './replay';

export const contributionLimits = {
  easy: { width: 4, height: 5 },
  medium: { width: 5, height: 6 },
  hard: { width: 6, height: 7 },
};

export const contributionSchema = z
  .object({
    difficulty: z.enum(['easy', 'medium', 'hard']),
    level: rawLevelSchema
      .extend({ title: z.string().trim().min(2).max(32) })
      .strict(),
    actions: z.array(z.string().min(1).max(64)).max(256),
  })
  .strict();

export type ContributionInput = z.infer<typeof contributionSchema>;

export const declineReasonSchema = z.string().trim().min(1).max(500);

export const communityReviewSchema = z.discriminatedUnion('status', [
  z.object({
    authorId: z.string().regex(/^t2_[a-z0-9]+$/),
    id: z.string().regex(/^[a-f0-9]{32}$/),
    status: z.literal('accepted'),
  }),
  z.object({
    authorId: z.string().regex(/^t2_[a-z0-9]+$/),
    id: z.string().regex(/^[a-f0-9]{32}$/),
    status: z.literal('rejected'),
    declineReason: declineReasonSchema,
  }),
]);

export type ContributionAssessment = {
  status: 'assessed' | 'needs-review';
  difficulty: ContributionInput['difficulty'] | null;
  minimumActions: number | null;
  meaningfulForks: number | null;
};

export type CommunitySubmission = ContributionInput & {
  id: string;
  authorId: string;
  author: string;
  submittedAt: string;
  status: 'submitted' | 'accepted' | 'rejected';
  declineReason?: string;
  assessment: ContributionAssessment;
  steps: number;
};

export function requireDailyAssessment(assessment: ContributionAssessment) {
  if (assessment.status !== 'assessed')
    throw new Error(
      'Assessment could not measure this puzzle. Revise the board, finish a new test run, and assess again before submitting.'
    );
  if (!assessment.difficulty)
    throw new Error(
      'This puzzle is below daily criteria. Add meaningful choices, finish a new test run, and assess again before submitting.'
    );
}

export function validateContribution(input: unknown) {
  const contribution = contributionSchema.parse(input);
  const { level: raw, difficulty, actions } = contribution;
  const limits = contributionLimits[difficulty];
  if (raw.width > limits.width || raw.terrain.length > limits.height) {
    throw new Error(
      `This level exceeds the ${difficulty} board limit (${limits.width} x ${limits.height}).`
    );
  }
  if (
    BigInt(raw.startValue) > 999n ||
    raw.tiles.some(
      (tile) =>
        BigInt('value' in tile ? tile.value : tile.amount) > 999n ||
        ('maxSurplus' in tile &&
          tile.maxSurplus !== undefined &&
          BigInt(tile.maxSurplus) > 999n)
    )
  )
    throw new Error('Printed values must be below 1,000.');
  const level = compileLevel(raw);
  const reachable = new Set([level.startCell]);
  const pending = [level.startCell];
  for (const cell of pending) {
    const column = cell % level.width;
    const row = Math.floor(cell / level.width);
    for (const [nextColumn, nextRow] of [
      [column - 1, row],
      [column + 1, row],
      [column, row - 1],
      [column, row + 1],
    ]) {
      if (
        nextColumn === undefined ||
        nextRow === undefined ||
        nextColumn < 0 ||
        nextColumn >= level.width ||
        level.terrain[nextRow]?.[nextColumn] !== '.'
      )
        continue;
      const next = nextRow * level.width + nextColumn;
      if (!reachable.has(next)) {
        reachable.add(next);
        pending.push(next);
      }
    }
  }
  if (level.terrain.join('').split('.').length - 1 !== reachable.size) {
    throw new Error('All floor cells must connect to the starting cell.');
  }
  const replay = replayWithSteps(level, actions);
  if (replay.state.phase !== 'won')
    throw new Error('Finish a test run before submitting.');
  return { ...contribution, steps: replay.steps };
}
