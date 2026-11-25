import './styles/tokens.css';
import './styles/app.css';
import './styles/board.css';
import './styles/game.css';
import './styles/daily.css';
import './styles/experience.css';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppAppearance } from './app/AppAppearance';
import { DailyGameScreen } from './screens/DailyGameScreen';
import { bootstrapLocale } from './i18n/bootstrap';

bootstrapLocale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppAppearance theme="system" motion="system" />
    <DailyGameScreen />
  </StrictMode>
);
