import { Check, CircleDot } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { DIFFICULTIES, type Difficulty } from '../../shared/season';
import type { DifficultyProgress } from '../../shared/api';
import '../styles/difficulty.css';

const PREVIEW_ROWS: Record<Difficulty, readonly string[]> = {
  easy: ['1..', '.#.', '..5'],
  medium: ['1.#.', '..#.', '#...', '...8'],
  hard: ['1..#.', '.#...', '..#..', '#..#.', '....9'],
};

function DifficultyBoard({ difficulty }: { difficulty: Difficulty }) {
  const rows = PREVIEW_ROWS[difficulty];
  return (
    <span
      className="difficulty-board"
      data-size={rows.length}
      aria-hidden="true"
    >
      {rows.flatMap((row, rowIndex) =>
        Array.from(row, (tile, columnIndex) => (
          <span key={`${rowIndex}:${columnIndex}`} data-tile={tile}>
            {tile === '.' || tile === '#' ? null : tile}
          </span>
        ))
      )}
    </span>
  );
}

export function DifficultySelector({
  value,
  onChange,
  disabled = false,
  progress,
  expanded = false,
}: {
  value: Difficulty;
  onChange: (difficulty: Difficulty) => void;
  disabled?: boolean;
  progress?: Record<Difficulty, DifficultyProgress>;
  expanded?: boolean;
}) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset
      className={`difficulty-selector${expanded ? ' difficulty-selector-expanded' : ''}`}
      disabled={disabled}
    >
      <legend className="sr-only">{t('difficulty.label')}</legend>
      {DIFFICULTIES.map((difficulty) => {
        const status = progress?.[difficulty];
        const completed =
          status?.completed ||
          (status?.bestSteps !== null && status?.bestSteps !== undefined);
        const stateLabel = completed
          ? t('levels.completed')
          : status?.started
            ? t('levels.inProgress')
            : '';
        return (
          <label
            key={difficulty}
            className="difficulty-option"
            data-difficulty={difficulty}
          >
            <input
              type="radio"
              name={name}
              value={difficulty}
              checked={value === difficulty}
              onChange={() => onChange(difficulty)}
            />
            <span className="difficulty-content">
              {expanded && <DifficultyBoard difficulty={difficulty} />}
              <span className="difficulty-name">
                {t(`difficulty.${difficulty}`)}
              </span>
              <span className="difficulty-mark" aria-hidden="true">
                {completed ? (
                  <Check size={14} />
                ) : status?.started ? (
                  <CircleDot size={14} />
                ) : null}
              </span>
            </span>
            {stateLabel && <span className="sr-only">{stateLabel}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}
