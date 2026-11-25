import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { puzzleTimeRemaining } from '../splash-simulation';

export function PuzzleCountdown({
  date,
  compact = false,
}: {
  date: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (compact && date !== new Date(now).toISOString().slice(0, 10)) return null;
  return (
    <p
      className={`puzzle-countdown${compact ? ' puzzle-countdown--compact' : ''}`}
      title={t('ui.nextPuzzle')}
    >
      <Clock3 size={16} />
      <span>
        {!compact && (
          <span className="countdown-label">{t('ui.timeRemaining')}</span>
        )}
        <strong>{puzzleTimeRemaining(date, now)}</strong>
      </span>
    </p>
  );
}
