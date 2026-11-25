import './styles/tokens.css';
import './styles/app.css';
import './styles/board.css';
import './styles/game.css';
import './styles/daily.css';
import './styles/community.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppAppearance } from './app/AppAppearance';
import { CommunityHub } from './screens/CommunityHub';
import { bootstrapLocale } from './i18n/bootstrap';

bootstrapLocale();
const root = document.getElementById('root');
const initialTab =
  root?.dataset.hubPage === 'contribute'
    ? 'contribute'
    : root?.dataset.hubPage === 'rankings'
      ? 'rankings'
      : root?.dataset.hubPage === 'game'
        ? 'game'
        : 'about';
if (root)
  createRoot(root).render(
    <StrictMode>
      <AppAppearance theme="system" motion="system" />
      <CommunityHub initialTab={initialTab} />
    </StrictMode>
  );
