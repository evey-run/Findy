import { useEffect } from 'react';
import { useAppStore } from '../store';

/**
 * Boîte de confirmation intégrée à l'application.
 * Remplace window.confirm(), qui n'est pas fiable dans la WebView de Tauri
 * (macOS WKWebView) où il peut renvoyer false sans afficher de dialogue,
 * bloquant alors toutes les suppressions.
 */
export default function ConfirmDialog() {
  const { confirmDialog, resolveConfirm } = useAppStore();
  const { open, message, title, confirmLabel, danger } = confirmDialog;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveConfirm(false);
      if (e.key === 'Enter') resolveConfirm(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, resolveConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => resolveConfirm(false)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-6">
        <h3 className="text-base font-semibold text-zinc-50">{title || 'Confirmation'}</h3>
        <p className="mt-2 text-sm text-zinc-400 whitespace-pre-line">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => resolveConfirm(false)}
            className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => resolveConfirm(true)}
            autoFocus
            className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'
            }`}
          >
            {confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
