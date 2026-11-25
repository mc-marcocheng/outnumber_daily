import './styles/tokens.css';
import './styles/app.css';
import './styles/daily.css';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bootstrapLocale } from './i18n/bootstrap';
import { SplashScreen } from './screens/SplashScreen';

bootstrapLocale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SplashScreen />
  </StrictMode>
);
