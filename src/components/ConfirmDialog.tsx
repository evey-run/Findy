import { useEffect, useId } from 'react';
import { useAppStore } from '../store';
import { useIsMobile } from '../hooks/useIsMobile';

/**
 * Boîte de confirmation intégrée à l'application.
 * Remplace window.confirm(), qui n'est pas fiable dans la WebView de Tauri
 * (macOS WKWebView) où il peut renvoyer false sans afficher de dialogue,
 * bloquant alors toutes les suppressions.
 *
 * Sur mobile elle devient une feuille montante : une fenêtre centrée place ses
 * boutons hors de portée du pouce, et le geste vers le bas est le seul que
 * l'utilisateur associe à une réponse à donner.
 */
export default function ConfirmDialog() {
  const { confirmDialog, resolveConfirm } = useAppStore();
  const { open, message, title, confirmLabel, danger } = confirmDialog;
  const isMobile = useIsMobile();
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveConfirm(false);
      if (e.key === 'Enter') resolveConfirm(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, resolveConfirm]);

  // Le fond ne doit pas défiler pendant qu'une réponse est attendue : sur
  // téléphone, un geste à côté de la feuille emporterait sinon tout l'écran.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      // Une feuille mobile ouverte au-dessus peut avoir déjà rendu le
      // défilement en se refermant la première ; réappliquer la valeur
      // mémorisée le confisquerait alors définitivement.
      if (document.body.style.overflow === 'hidden') document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const confirmTone = danger ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500';

  return (
    // Au-dessus des feuilles mobiles (z-70) : une confirmation demandée depuis
    // une feuille s'affichait jusqu'ici derrière elle, donc inatteignable.
    <div className={`fixed inset-0 z-[90] flex justify-center ${isMobile ? 'items-end' : 'items-center p-4'}`}>
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${isMobile ? 'animate-backdrop-in' : ''}`}
        onClick={() => resolveConfirm(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className={
          isMobile
            ? 'relative w-full rounded-t-[28px] bg-zinc-900/95 backdrop-blur-xl border-t border-white/10 shadow-2xl px-5 pt-6 pb-[max(1rem,var(--safe-bottom))] animate-sheet-in'
            : 'relative w-full max-w-sm rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-6'
        }
      >
        <h3 id={titleId} className={`font-semibold text-zinc-50 ${isMobile ? 'text-[17px]' : 'text-base'}`}>
          {title || 'Confirmation'}
        </h3>
        <p id={messageId} className="mt-2 text-sm text-zinc-400 whitespace-pre-line">{message}</p>
        {/* L'ordre du DOM garde « Annuler » en premier ; sur mobile l'inversion
            visuelle remonte l'action principale sous le pouce. */}
        <div className={`mt-5 flex gap-2 ${isMobile ? 'flex-col-reverse' : 'justify-end'}`}>
          <button
            onClick={() => resolveConfirm(false)}
            className={
              isMobile
                ? 'tappable h-12 w-full rounded-2xl text-[15px] font-medium text-zinc-400 active:bg-white/[0.06] transition-colors'
                : 'rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors'
            }
          >
            Annuler
          </button>
          <button
            onClick={() => resolveConfirm(true)}
            autoFocus
            className={
              isMobile
                ? `tappable h-12 w-full rounded-2xl text-[15px] font-semibold text-white transition-colors ${confirmTone}`
                : `rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-colors ${confirmTone}`
            }
          >
            {confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
