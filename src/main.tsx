import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Load the complete operational component foundation first. The V3 and Jewel
// layers intentionally override it, preserving styles for screens that still
// use the original workload / metric component classes.
import './styles/sakala-modern.css';
import './styles/signal-v3-atelier.css';
import './styles/signal-v3-jewel-identity.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
