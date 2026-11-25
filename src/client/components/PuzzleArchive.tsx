import { useEffect, useId, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ArchiveResponse } from '../../shared/api';
import { getJson } from '../api';
import '../styles/archive.css';
import type { Difficulty } from '../../shared/season';
import { DifficultySelector } from './DifficultySelector';

type Props = {
  onSelect: (date: string, difficulty: Difficulty) => void;
  selectedDate: string;
  difficulty?: Difficulty;
};

type Result = {
  month: string;
  difficulty: Difficulty;
  attempt: number;
  data: ArchiveResponse | null;
  error: boolean;
};

function initialMonth(selectedDate: string): string {
  const month = selectedDate.slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? month
    : new Date().toISOString().slice(0, 7);
}

function adjacentMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function PuzzleArchive({
  onSelect,
  selectedDate,
  difficulty = 'easy',
}: Props) {
  const { t, i18n } = useTranslation();
  const weekdayFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    weekdayFormat.format(new Date(Date.UTC(2026, 0, 5 + index)))
  );
  const [month, setMonth] = useState(() => initialMonth(selectedDate));
  const [filter, setFilter] = useState(difficulty);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const headingId = useId();

  useEffect(() => {
    let cancelled = false;
    void getJson<ArchiveResponse>(
      `/api/archive?month=${month}&difficulty=${filter}`
    ).then(
      (data) => {
        if (!cancelled)
          setResult({ month, difficulty: filter, attempt, data, error: false });
      },
      () => {
        if (!cancelled)
          setResult({
            month,
            difficulty: filter,
            attempt,
            data: null,
            error: true,
          });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [month, filter, attempt]);

  const current =
    result?.month === month &&
    result.difficulty === filter &&
    result.attempt === attempt;
  const loading = !current;
  const data = current ? result.data : null;
  const error = current && result.error;
  const bounds = result?.data;
  const previous = adjacentMonth(month, -1);
  const next = adjacentMonth(month, 1);
  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const monthLabel = monthDate.toLocaleDateString(i18n.resolvedLanguage, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const offset = (monthDate.getUTCDay() + 6) % 7;
  const monthEnd = new Date(`${next}-01T00:00:00Z`);
  monthEnd.setUTCDate(0);
  const dayCount = monthEnd.getUTCDate();
  const cellCount = Math.ceil((offset + dayCount) / 7) * 7;
  const days = new Map(data?.days.map((day) => [day.date, day]));

  return (
    <section
      className="puzzle-archive"
      aria-labelledby={headingId}
      data-difficulty={filter}
    >
      <div className="archive-navigation">
        <button
          type="button"
          className="archive-icon-button"
          aria-label={t('ui.previousMonth')}
          title={t('ui.previousMonth')}
          disabled={!bounds || previous < bounds.firstDate.slice(0, 7)}
          onClick={() => setMonth(previous)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h3 id={headingId} className="archive-month" aria-live="polite">
          {monthLabel}
        </h3>
        <button
          type="button"
          className="archive-icon-button"
          aria-label={t('ui.nextMonth')}
          title={t('ui.nextMonth')}
          disabled={!bounds || next > bounds.today.slice(0, 7)}
          onClick={() => setMonth(next)}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="archive-toolbar">
        <DifficultySelector value={filter} onChange={setFilter} />
        <button
          type="button"
          className="archive-today"
          disabled={!data}
          onClick={() => {
            if (data) onSelect(data.today, filter);
          }}
        >
          {t('ui.today')}
        </button>
      </div>

      <div className="archive-calendar" aria-busy={loading}>
        <div className="archive-weekdays" aria-hidden="true">
          {weekdays.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        {loading ? (
          <>
            <span className="archive-sr-only" role="status">
              {t('ui.loadingArchive')}
            </span>
            <div className="archive-days" aria-hidden="true">
              {Array.from({ length: cellCount }, (_, index) => (
                <span className="archive-skeleton" key={index} />
              ))}
            </div>
          </>
        ) : error ? (
          <div className="archive-error">
            <p role="alert">{t('ui.archiveError')}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t('ui.retry')}
            </button>
          </div>
        ) : (
          <div className="archive-days">
            {Array.from({ length: cellCount }, (_, index) => {
              const dayNumber = index - offset + 1;
              if (dayNumber < 1 || dayNumber > dayCount) {
                return (
                  <span
                    className="archive-blank"
                    key={index}
                    aria-hidden="true"
                  />
                );
              }
              const date = `${month}-${String(dayNumber).padStart(2, '0')}`;
              const day = days.get(date);
              const available =
                !!data && !!day && date >= data.firstDate && date <= data.today;
              const status = day?.completed
                ? t('levels.completed')
                : day?.started
                  ? t('levels.inProgress')
                  : '';
              const best =
                day?.bestSteps !== null && day?.bestSteps !== undefined
                  ? t('ui.archiveBest', { steps: day.bestSteps })
                  : '';
              const label = [
                new Date(`${date}T00:00:00Z`).toLocaleDateString(
                  i18n.resolvedLanguage,
                  { dateStyle: 'full', timeZone: 'UTC' }
                ),
                t(`difficulty.${filter}`),
                status,
                best,
                !available ? t('ui.unavailable') : '',
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <button
                  type="button"
                  key={date}
                  className="archive-day"
                  disabled={!available}
                  aria-label={label}
                  aria-current={
                    date === selectedDate && filter === difficulty
                      ? 'date'
                      : undefined
                  }
                  title={label}
                  onClick={() => onSelect(date, filter)}
                >
                  <span className="archive-day-number">{dayNumber}</span>
                  <span className="archive-day-status" aria-hidden="true">
                    {available && day?.completed ? (
                      <Check size={14} />
                    ) : available && day?.started ? (
                      <span className="archive-progress-dot" />
                    ) : null}
                    {available && best && <span>{day?.bestSteps}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="archive-retention">{t('ui.archiveRankings')}</p>
    </section>
  );
}
