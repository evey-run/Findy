import { useSyncExternalStore } from 'react';
import { MOBILE_BREAKPOINT, shouldUseMobileUI } from '../lib/platform';

/**
 * Suit le basculement desktop ↔ mobile.
 *
 * `useSyncExternalStore` plutôt qu'un `useState` + `useEffect` : la valeur est
 * lue au premier rendu, sans passer par une frame en mise en page desktop qui
 * ferait clignoter la barre latérale sur un téléphone.
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  query.addEventListener('change', onChange);
  // La rotation d'un appareil ne déclenche pas toujours `change` sur la media
  // query avant que la fenêtre n'ait fini de se redimensionner.
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);

  return () => {
    query.removeEventListener('change', onChange);
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, shouldUseMobileUI, () => false);
}
