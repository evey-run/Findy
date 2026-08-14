import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { installApiBase } from './lib/apiBase'
import './index.css'

// Avant tout rendu : en app packagée, les appels backend doivent viser le
// sidecar Express et non le protocole d'assets de Tauri.
installApiBase();

// Configuration globale pour la locale française
if (typeof window !== 'undefined') {
  // Configuration de la langue du document
  document.documentElement.lang = 'fr-FR';
  
  // Forcer la locale française pour les dates
  if (navigator.language !== 'fr-FR') {
    Object.defineProperty(navigator, 'language', {
      get: function() { return 'fr-FR'; }
    });
    Object.defineProperty(navigator, 'languages', {
      get: function() { return ['fr-FR', 'fr']; }
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
