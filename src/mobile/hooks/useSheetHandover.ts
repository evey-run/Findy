import { useCallback, useEffect, useRef } from 'react';

/**
 * Délai entre la fermeture d'une feuille et l'ouverture de la suivante.
 *
 * Chaque feuille empile une entrée d'historique pour capter le retour Android,
 * et la dépile en se fermant. Ce `history.back()` est asynchrone : présentée
 * dans le même rendu, la feuille suivante reçoit le `popstate` qui en résulte
 * et se referme aussitôt — « Modifier » semblait alors ne rien faire. On
 * attend donc la fin de l'animation de sortie, comme le fait le système.
 */
export const SHEET_HANDOVER_MS = 260;

/** Programme l'ouverture d'une feuille une fois la précédente refermée. */
export function useSheetHandover(): (open: () => void) => void {
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return useCallback((open: () => void) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(open, SHEET_HANDOVER_MS);
  }, []);
}
