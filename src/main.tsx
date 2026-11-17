import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App';
import { AuthGate } from '../shared/auth/AuthGate';
import { isVersusPath } from '../shared/routes';
import './styles.css';

// The server answers unknown paths with 404 and this page, which then shows NotFound.

function NotFound() {
  return <main className="page"><div className="empty-page">
    <h1>Page not found</h1>
    <p>There is nothing at <code>{location.pathname}</code>.</p>
    <p><a href="/">Back to the galaxy</a> · <a href="/learn">Lectures</a> · <a href="/arena">Versus</a></p>
  </div></main>;
}

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode>{isVersusPath(location.pathname) ? <AuthGate locale="en"><App/></AuthGate> : <NotFound/>}</React.StrictMode>);
