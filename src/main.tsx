import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { engine } from './game/engine';

// exposed for headless test harnesses (harmless in normal play)
(window as unknown as { __engine: typeof engine }).__engine = engine;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
