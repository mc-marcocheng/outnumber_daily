import { SEASON_ID, type Difficulty } from './season';

export function leaderboardChannel(
  date: string,
  difficulty: Difficulty = 'easy'
): string {
  return `outnumber_lb_${SEASON_ID.replaceAll('-', '_')}_${date.replaceAll('-', '_')}_${difficulty}`;
}
