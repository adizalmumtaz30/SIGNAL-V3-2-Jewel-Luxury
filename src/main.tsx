import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Declare official cascade layer precedence first to prevent cross-layer !important collisions.
import './styles/sakala-design-system.css';
import './styles/sakala-modern.css';
import './styles/signal-v3-atelier.css';
import './styles/signal-v3-jewel-identity.css';
import './styles/schedule-redesign.css';
import './styles/signal-v5-tokens.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
