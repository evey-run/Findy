import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { installApiBase } from './lib/apiBase'
import './index.css'

async function bootstrap() {
  // Avant tout rendu : en app packagée, les appels backend doivent viser le
  // sidecar Express et non le protocole d'assets de Tauri.
  await installApiBase();

  // Configuration globale pour la locale française
  if (typeof window !== 'undefined') {
    document.documentElement.lang = 'fr-FR';
    if (navigator.language !== 'fr-FR') {
      Object.defineProperty(navigator, 'language', { get: () => 'fr-FR' });
      Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr'] });
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
