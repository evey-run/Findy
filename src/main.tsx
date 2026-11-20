import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { installApiBase } from './lib/apiBase'
import { isNativeMobile } from './lib/platform'
import './index.css'

async function bootstrap() {
  // Avant tout rendu : en app packagée, les appels backend doivent viser le
  // sidecar Express et non le protocole d'assets de Tauri.
  await installApiBase();

  // Configuration globale pour la locale française
  if (typeof window !== 'undefined') {
    document.documentElement.lang = 'fr-FR';
    if (navigator.language !== 'fr-FR') {
      try {
        Object.defineProperty(navigator, 'language', { get: () => 'fr-FR' });
        Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr'] });
      } catch {
        // Certaines webviews scellent ces propriétés : la locale reste celle du
        // système, ce qui ne justifie pas d'empêcher l'application de démarrer.
      }
    }

    // Comportements natifs (pas de rebond du document, pas de loupe de
    // sélection, pas de flash au tap) — cf. `html.native-app` dans index.css.
    // Posé ici, avant le premier rendu, pour qu'une application native ne
    // montre jamais une image du comportement « page web ». App.tsx prend
    // ensuite le relais et suit les changements de largeur.
    if (isNativeMobile()) {
      document.documentElement.classList.add('native-app');
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
