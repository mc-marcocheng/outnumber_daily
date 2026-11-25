import { useTranslation } from 'react-i18next';
import type { GameState, Level } from '../../shared/game/model';
import { HeartIcon } from './icons';
import { NumberLabel } from './NumberLabel';

type Props = {
  level: Level;
  state: GameState;
};

/**
 * The persistent status area: player value, spare lives, and boss
 * value, always rendered regardless of level configuration.
 */
export function PlayerStatus({ level, state }: Props) {
  const { t } = useTranslation();
  const boss = level.tiles.find((tile) => tile.kind === 'boss');
  const bossValue = boss ? state.enemies.get(boss.id) : undefined;

  return (
    <div className="game-status" data-testid="game-status">
      <span className="status-slot">
        <span className="status-label">{t('game.you')}</span>
        <NumberLabel value={state.value} className="status-value" />
      </span>

      {level.spareLives > 0 && (
        <span
          className="status-slot status-lives"
          role="img"
          aria-label={t('game.spareLivesAria', {
            left: state.spareLives,
            total: level.spareLives,
          })}
        >
          <span className="hearts">
            {Array.from({ length: level.spareLives }, (_, index) => (
              <span
                key={index}
                className={
                  index < state.spareLives ? 'heart' : 'heart heart--spent'
                }
              >
                <HeartIcon filled={index < state.spareLives} />
              </span>
            ))}
          </span>
        </span>
      )}

      {bossValue !== undefined && (
        <span className="status-slot status-boss">
          <span className="status-label">{t('game.bossLabel')}</span>
          <NumberLabel value={bossValue} className="status-value" />
        </span>
      )}
    </div>
  );
}
