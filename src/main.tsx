import React from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App';
import ManiaApp from './mania/ManiaApp';
import './styles.css';
const arena = /^\/(arena|room|campus|history|leaderboard|profile|java)(\/|$)/.test(location.pathname);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{arena ? <App/> : <ManiaApp/>}</React.StrictMode>);
