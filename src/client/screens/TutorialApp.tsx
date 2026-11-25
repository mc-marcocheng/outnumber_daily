import { useEffect, useState } from 'react';
import type { InitResponse } from '../../shared/api';
import { AppAppearance } from '../app/AppAppearance';
import { getJson } from '../api';
import { DailyGameScreen } from './DailyGameScreen';
import { TutorialScreen } from './TutorialScreen';

export function TutorialApp() {
  const [playing, setPlaying] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getJson<InitResponse>('/api/init')
      .then((data) => {
        if (active) setAvatarUrl(data.avatarUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <AppAppearance theme="system" motion="system" />
      {playing ? (
        <DailyGameScreen />
      ) : (
        <TutorialScreen
          onClose={() => setPlaying(true)}
          avatarUrl={avatarUrl}
        />
      )}
    </>
  );
}
