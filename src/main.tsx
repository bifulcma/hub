import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './stile.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: avvisa quando c'è una nuova versione (toast «Aggiorna»). I dati non si perdono.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const avvisa = (w: ServiceWorker) =>
      window.dispatchEvent(new CustomEvent('hub-aggiorna', { detail: () => w.postMessage('attiva') }));
    if (reg.waiting && navigator.serviceWorker.controller) avvisa(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) avvisa(w);
      });
    });
  });
  let ricaricato = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!ricaricato) { ricaricato = true; location.reload(); }
  });
}
