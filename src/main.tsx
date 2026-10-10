import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App';
import ManiaApp from './mania/ManiaApp';
import { AuthGate } from '../shared/auth/AuthGate';
import './styles.css';
const arena = /^\/(arena|room|campus|history|leaderboard|profile|java)(\/|$)/.test(location.pathname);
createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthGate locale="en">{arena ? <App/> : <ManiaApp/>}</AuthGate></React.StrictMode>);
