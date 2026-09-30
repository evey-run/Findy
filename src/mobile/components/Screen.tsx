import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { cx, GUTTER, radii, text } from '../theme';

/**
 * Ossature d'un écran mobile.
 *
 * Le défilement est celui du document, pas celui d'un conteneur interne. C'est
 * la seule façon d'obtenir le comportement natif complet — inertie, rebond en
 * butée, masquage de la barre d'adresse sur navigateur, et le geste « taper la
 * barre de statut pour remonter » sur iOS. Les écrans desktop, eux, empilent
 * des boîtes à hauteur fixe : transposé tel quel sur un téléphone, cela donne
 * six zones de défilement imbriquées dont aucune n'a la hauteur voulue.
 *
 * L'en-tête reste collé en haut et ne prend son fond qu'une fois le contenu
 * passé dessous : au repos, le titre semble posé sur la page ; en défilement,
 * il devient une barre lisible.
 */

/** Vrai dès que la page a défilé au-delà de quelques pixels. */
function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [threshold]);

  return scrolled;
}

interface ScreenHeaderProps {
  title: string;
  /** Affiche une flèche de retour à gauche du titre. */
  back?: boolean;
  /** Destination du retour ; par défaut, l'entrée précédente de l'historique. */
  backTo?: string;
  /** Boutons alignés à droite du titre. */
  action?: ReactNode;
  /** Contenu additionnel sous le titre, dans la zone collante (filtres…). */
  children?: ReactNode;
  /** Contenu placé au-dessus du titre (salutation, avatar…). */
  above?: ReactNode;
}

export function ScreenHeader({ title, back, backTo, action, children, above }: ScreenHeaderProps) {
  const scrolled = useScrolled();
  const navigate = useNavigate();

  return (
    <header
      className={cx(
        'sticky top-0 z-40 pt-[max(0.75rem,var(--safe-top))] transition-colors duration-200',
        scrolled
          ? 'bg-[#09090b]/85 backdrop-blur-xl border-b border-white/[0.06]'
          : 'bg-transparent border-b border-transparent',
      )}
    >
      {above && <div className={cx(GUTTER, 'pb-1')}>{above}</div>}

      <div className={cx(GUTTER, 'flex items-center gap-2 pb-3 pt-1')}>
        {back && (
          <button
            type="button"
            onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
            aria-label="Retour"
            className={cx(
              'tappable -ml-2 flex h-11 w-11 shrink-0 items-center justify-center',
              radii.pill,
              'text-zinc-300 active:bg-white/[0.08]',
            )}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
        )}

        <h1 className={cx(text.screenTitle, 'min-w-0 flex-1 truncate')}>{title}</h1>

        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>

      {children}
    </header>
  );
}

interface ScreenProps {
  children: ReactNode;
  /** Espacement latéral standard appliqué au contenu. */
  padded?: boolean;
  className?: string;
}

/**
 * Corps d'un écran : ménage sous le contenu la place de la barre d'onglets
 * flottante, encoche du bas comprise, pour que la dernière ligne d'une liste
 * reste atteignable.
 */
export function ScreenBody({ children, padded = true, className }: ScreenProps) {
  return (
    <main
      className={cx(
        'animate-screen-in pb-[calc(var(--tabbar-height)+16px)]',
        padded && GUTTER,
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Titre de section au-dessus d'une liste, avec un lien facultatif à droite. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pb-2 pt-1">
      <h2 className={text.section}>{title}</h2>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="tappable -mr-2 flex min-h-[44px] items-center px-2 text-[13px] font-medium text-zinc-400 active:text-violet-300"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
