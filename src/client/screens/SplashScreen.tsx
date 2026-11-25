import { useEffect, useRef, useState } from 'react';
import { requestExpandedMode } from '@devvit/web/client';
import { BookOpen, Flame, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InitResponse } from '../../shared/api';
import { AppAppearance } from '../app/AppAppearance';
import { getJson } from '../api';
import { SplashBoard } from '../components/SplashBoard';
import { PuzzleCountdown } from '../components/PuzzleCountdown';

export function SplashScreen() {
  const { t } = useTranslation();
  const [init, setInit] = useState<InitResponse | null>(null);
  const [error, setError] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const tokenRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getJson<InitResponse>('/api/init');
        if (!cancelled) setInit(data);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="daily-splash">
      <AppAppearance theme="system" motion="system" />
      <SplashBoard tokenRef={tokenRef} />
      <header className="daily-splash-header">
        <p className="daily-eyebrow">A DAILY NUMBERS PUZZLE</p>
        <h1 className="daily-splash-title" aria-label="Outnumber">
          <span className="wordmark-o" aria-hidden="true" ref={tokenRef}>
            {init?.avatarUrl && !avatarFailed ? (
              <img
                src={init.avatarUrl}
                alt=""
                onError={() => setAvatarFailed(true)}
              />
            ) : null}
          </span>
          <span aria-hidden="true">utnumber</span>
        </h1>
        <p className="daily-splash-date">{init?.date ?? ''}</p>
      </header>

      {error ? (
        <p className="daily-splash-error">{t('daily.error')}</p>
      ) : init === null ? (
        <p className="daily-splash-loading">{t('daily.loading')}</p>
      ) : (
        <div className="daily-splash-card">
          <p className="daily-splash-puzzle">{init.today.title}</p>
          <PuzzleCountdown date={init.date} />
          {init.today.completed && init.today.bestSteps !== null ? (
            <p className="daily-splash-best">
              {t('daily.best', { steps: init.today.bestSteps })}
            </p>
          ) : null}
          {init.streak > 0 ? (
            <p className="daily-splash-streak">
              <Flame size={18} />
              {t('daily.streak', { count: init.streak })}
            </p>
          ) : null}
        </div>
      )}

      <button
        type="button"
        className="daily-play-button"
        disabled={init === null && !error}
        onClick={(event) => requestExpandedMode(event.nativeEvent, 'game')}
      >
        <Play size={20} />
        {t('daily.play')}
      </button>
      <button
        type="button"
        className="splash-tutorial-button"
        onClick={(event) => requestExpandedMode(event.nativeEvent, 'tutorial')}
      >
        <BookOpen size={18} />
        Tutorials
      </button>
    </div>
  );
}
