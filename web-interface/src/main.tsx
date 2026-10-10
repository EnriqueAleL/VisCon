import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthGate } from '../../shared/auth/AuthGate';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate locale="de">
      <App />
    </AuthGate>
  </React.StrictMode>,
);
