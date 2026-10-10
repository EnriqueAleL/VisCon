import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthGate } from '../../shared/auth/AuthGate';
import { I18nProvider, useI18n } from './i18n';
import './styles.css';

/** The sign-in screens follow the same language choice as the rest of the page. */
function Shell() {
  const { language } = useI18n();
  return (
    <AuthGate locale={language}>
      <App />
    </AuthGate>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <Shell />
    </I18nProvider>
  </React.StrictMode>,
);
