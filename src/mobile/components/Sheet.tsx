import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Feuille modale montante — l'équivalent tactile de la boîte de dialogue.
 *
 * Une fenêtre centrée est un objet de bureau : sur un téléphone elle arrive
 * hors de portée du pouce et masque le contexte. La feuille monte depuis le
 * bas, laisse voir l'écran derrière, et se referme d'un geste vers le bas —
 * c'est le seul mouvement qu'un utilisateur essaie spontanément.
 *
 * Quatre comportements sont indispensables et souvent oubliés :
 *   • le corps de page ne doit pas défiler derrière la feuille ;
 *   • le bouton retour d'Android doit fermer la feuille, pas quitter l'écran ;
 *   • la sortie doit être animée, donc le démontage attendu ;
 *   • le bas doit dégager la barre d'accueil (zone sûre).
 */

/** Compteur de feuilles ouvertes : deux feuilles empilées ne doivent rendre le
 *  défilement au document qu'une fois la dernière refermée. */
let openSheets = 0;
let restoreOverflow = '';

function lockBodyScroll(): void {
  if (openSheets === 0) {
    restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openSheets += 1;
}

function unlockBodyScroll(): void {
  openSheets = Math.max(0, openSheets - 1);
  if (openSheets === 0) document.body.style.overflow = restoreOverflow;
}

const EXIT_MS = 220;

/** Distance au-delà de laquelle le geste vers le bas vaut fermeture. */
const DISMISS_DISTANCE = 110;
/** …ou vitesse suffisante pour une chiquenaude courte mais franche. */
const DISMISS_VELOCITY = 0.6; // px/ms

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Texte secondaire sous le titre. */
  subtitle?: string;
  children: ReactNode;
  /** Barre d'actions collée en bas, hors de la zone de défilement. */
  footer?: ReactNode;
  /** Une feuille pleine hauteur pour les formulaires longs. */
  fullHeight?: boolean;
}

export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  fullHeight = false,
}: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ y: number; time: number } | null>(null);
  const pushedHistory = useRef(false);
  const titleId = useId();

  // `onClose` est presque toujours une lambda recréée à chaque rendu du parent.
  // La garder en référence évite que les effets ci-dessous ne se réabonnent —
  // et, pour l'historique, n'empilent une entrée factice par rendu.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current(), []);

  // ── Montage différé pour laisser jouer l'animation de sortie ──
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      // Une feuille refermée d'un glissement garde son `translateY(100%)`
      // en style en ligne. L'animation d'entrée le couvre tant qu'elle joue,
      // mais pas au-delà : sans ce nettoyage, la feuille rouverte disparaît
      // dès la dernière image.
      if (panelRef.current) {
        panelRef.current.style.transition = '';
        panelRef.current.style.transform = '';
      }
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  // ── Défilement du document ──
  useEffect(() => {
    if (!mounted) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [mounted]);

  // ── Bouton retour Android + touche Échap ──
  //
  // Une entrée d'historique factice est empilée à l'ouverture : le retour
  // système la dépile, ce qui referme la feuille au lieu de quitter l'écran
  // (ou l'application) sous elle.
  useEffect(() => {
    if (!open) return;

    window.history.pushState({ findySheet: true }, '');
    pushedHistory.current = true;

    const handlePopState = () => {
      pushedHistory.current = false;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);

      // Fermeture par l'interface : l'entrée factice est encore là, on la
      // retire pour que le retour système ne rouvre pas un écran fantôme.
      //
      // Le test sur l'état courant est indispensable : si la feuille disparaît
      // parce qu'on a navigué depuis son contenu, une nouvelle entrée a été
      // empilée par-dessus la nôtre — dépiler annulerait cette navigation et
      // ramènerait l'utilisateur à l'écran qu'il vient de quitter.
      const stillOurEntry = (window.history.state as { findySheet?: boolean } | null)?.findySheet;
      if (pushedHistory.current && stillOurEntry) {
        pushedHistory.current = false;
        window.history.back();
      }
      pushedHistory.current = false;
    };
  }, [open, close]);

  // ── Geste de fermeture ──
  //
  // Le geste n'est capté que sur l'en-tête (poignée + titre). Le capter sur
  // toute la feuille rendrait impossible le défilement d'un formulaire long :
  // chaque glissement vers le bas fermerait la feuille au lieu de faire
  // défiler son contenu.
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button, a')) return;
    dragOrigin.current = { y: event.clientY, time: event.timeStamp };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const origin = dragOrigin.current;
    const panel = panelRef.current;
    if (!origin || !panel) return;

    // Seul le glissement vers le bas déplace la feuille : vers le haut, elle
    // est déjà en butée et un caoutchouc n'apporterait rien.
    const delta = Math.max(0, event.clientY - origin.y);
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${delta}px)`;
  }, []);

  const endDrag = useCallback(
    (event: React.PointerEvent) => {
      const origin = dragOrigin.current;
      const panel = panelRef.current;
      dragOrigin.current = null;
      if (!origin || !panel) return;

      const delta = event.clientY - origin.y;
      const elapsed = Math.max(1, event.timeStamp - origin.time);
      const velocity = delta / elapsed;

      panel.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)';

      if (delta > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
        panel.style.transform = 'translateY(100%)';
        close();
        return;
      }
      panel.style.transform = '';
    },
    [close],
  );

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className={cx(
          'absolute inset-0 bg-black/60 backdrop-blur-[2px]',
          closing ? 'animate-backdrop-out' : 'animate-backdrop-in',
        )}
        onClick={close}
      />

      <div
        ref={panelRef}
        className={cx(
          'relative flex flex-col overflow-hidden',
          fullHeight ? 'h-[92dvh]' : 'max-h-[88dvh]',
          surfaces.sheet,
          'rounded-t-[28px] shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.9)]',
          closing ? 'animate-sheet-out' : 'animate-sheet-in',
        )}
      >
        {/* Zone de préhension : poignée + titre. `touch-none` empêche le
            navigateur de préempter le geste pour son propre défilement. */}
        <div
          className="shrink-0 touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="flex justify-center pt-3 pb-1">
            <span className="h-1 w-10 rounded-full bg-white/20" />
          </div>

          {title && (
            <div className="flex items-start gap-3 px-5 pb-3 pt-1">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className={text.section}>
                  {title}
                </h2>
                {subtitle && <p className={cx(text.caption, 'mt-0.5')}>{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className={cx(
                  'tappable -mr-1 flex h-9 w-9 shrink-0 items-center justify-center',
                  radii.pill,
                  'bg-white/[0.06] text-zinc-400',
                )}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>

        <div className="momentum-scroll scroll-contained min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-white/[0.06] px-5 pt-3 pb-[max(1rem,var(--safe-bottom))]">
            {footer}
          </div>
        ) : (
          <div className="shrink-0 pb-[max(0.5rem,var(--safe-bottom))]" />
        )}
      </div>
    </div>,
    document.body,
  );
}
