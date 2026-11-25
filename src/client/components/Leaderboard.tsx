import { useTranslation } from 'react-i18next';
import { context } from '@devvit/web/client';
import { useLeaderboard } from '../hooks/useLeaderboard';
import type { Difficulty } from '../../shared/season';

type Props = {
  date: string;
  difficulty?: Difficulty;
};

export function Leaderboard({ date, difficulty = 'easy' }: Props) {
  const { t } = useTranslation();
  const { rows, loading } = useLeaderboard(date, difficulty);

  if (loading) {
    return <p className="leaderboard-empty">{t('common.loading')}</p>;
  }
  if (rows.length === 0) {
    return <p className="leaderboard-empty">{t('leaderboard.empty')}</p>;
  }

  return (
    <ol className="leaderboard">
      {rows.map((row) => (
        <li
          key={row.userId}
          className={[
            'leaderboard-row',
            row.userId === context.userId ? 'leaderboard-row--self' : '',
          ].join(' ')}
        >
          <span className="leaderboard-rank number">{row.rank}</span>
          <span className="leaderboard-name">{row.username}</span>
          <span className="leaderboard-steps number">
            {t('leaderboard.steps', { steps: row.steps })}
          </span>
        </li>
      ))}
    </ol>
  );
}
