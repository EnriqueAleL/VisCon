import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './AuthGate';
import '../design/base.css';

/**
 * The only page served to visitors without a verified account: no course data, no app code, just the log-in screens.
 * After a successful log-in the server starts answering the same URL with the real app, so a reload is all it takes.
 */
function Reload() {
  useEffect(() => { location.reload(); }, []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <AuthGate locale={/^\/learn(\/|$)/.test(location.pathname) ? 'de' : 'en'}><Reload /></AuthGate>,
);
