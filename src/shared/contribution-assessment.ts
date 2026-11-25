import { analyzeDifficulty, evaluateGates } from './game/difficulty';
import { compileLevel } from './game/level-schema';
import {
  contributionLimits,
  type ContributionAssessment,
  type ContributionInput,
} from './contributions';

export function assessContribution(
  input: ContributionInput
): ContributionAssessment {
  const level = compileLevel(input.level);
  const result = analyzeDifficulty(level, 'advanced', {
    maxStates: 1_000,
    maxEdges: 8_000,
    maxMs: 150,
  });
  if (result.status !== 'analyzed') {
    return {
      status: 'needs-review',
      difficulty: null,
      minimumActions: null,
      meaningfulForks: null,
    };
  }
  const { report } = result;
  const tiers = [
    { difficulty: 'hard', tier: 'master' },
    { difficulty: 'medium', tier: 'expert' },
    { difficulty: 'easy', tier: 'advanced' },
  ] satisfies {
    difficulty: ContributionInput['difficulty'];
    tier: 'master' | 'expert' | 'advanced';
  }[];
  const match = tiers.find(({ difficulty, tier }) => {
    const limits = contributionLimits[difficulty];
    return (
      level.width <= limits.width &&
      level.terrain.length <= limits.height &&
      evaluateGates(report, level, tier).length === 0
    );
  });
  return {
    status: 'assessed',
    difficulty: match?.difficulty ?? null,
    minimumActions: report.minimumActions,
    meaningfulForks: report.meaningfulForksMin,
  };
}
