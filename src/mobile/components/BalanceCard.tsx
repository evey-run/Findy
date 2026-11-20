import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { GRAIN_DATA_URI } from '../../lib/cardSurface';
import { formatMoney } from '../../lib/format';
import { cx, radii } from '../theme';

/**
 * Carte de solde — le point focal de l'accueil.
 *
 * Un tableau de bord desktop peut aligner quatre indicateurs de même poids ;
 * sur un téléphone, cela ne donne que quatre petits chiffres également
 * illisibles. Un seul montant occupe donc le haut de l'écran, assez grand pour
 * être lu à bout de bras, et le reste devient secondaire.
 *
 * Le fond est un dégradé irisé posé sur du presque-noir : il donne à la carte
 * la matière d'un objet plutôt que d'un rectangle, sans jamais monter assez en
 * clarté pour attaquer le contraste du montant blanc.
 */

const MESH = [
  'radial-gradient(120% 120% at 12% 8%, rgba(124,58,237,0.55) 0%, rgba(124,58,237,0) 55%)',
  'radial-gradient(110% 110% at 88% 16%, rgba(217,70,239,0.40) 0%, rgba(217,70,239,0) 58%)',
  'radial-gradient(130% 120% at 72% 108%, rgba(34,211,238,0.28) 0%, rgba(34,211,238,0) 60%)',
  'linear-gradient(150deg, #191430 0%, #0c0c11 100%)',
].join(', ');

/** Le masquage du solde survit au redémarrage : c'est une préférence, pas un état. */
const HIDDEN_STORAGE_KEY = 'findy-balance-hidden';

function readHidden(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(HIDDEN_STORAGE_KEY) === '1';
}

interface BalanceCardProps {
  label: string;
  amount: number;
  /** Contrôle placé en haut à gauche — sélecteur de compte, période… */
  selector?: ReactNode;
  /** Ligne d'information sous le montant. */
  footer?: ReactNode;
  /** Dégradé personnalisé (celui d'une banque, via `cardSurface`). */
  background?: string;
  /** Masque le bouton œil quand le montant n'a rien de sensible. */
  hideToggle?: boolean;
}

export default function BalanceCard({
  label,
  amount,
  selector,
  footer,
  background,
  hideToggle = false,
}: BalanceCardProps) {
  const [hidden, setHidden] = useState(readHidden);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(HIDDEN_STORAGE_KEY, hidden ? '1' : '0');
  }, [hidden]);

  const toggle = useCallback(() => setHidden((value) => !value), []);

  return (
    <section
      className={cx(
        radii.hero,
        'relative isolate flex min-h-[188px] flex-col justify-between overflow-hidden p-5 text-white',
        'ring-1 ring-white/[0.08] shadow-[0_20px_50px_-24px_rgba(124,58,237,0.6)]',
      )}
      style={{ backgroundImage: background ?? MESH }}
    >
      {/* Grain : sans lui, un dégradé aussi large montre ses marches de
          quantification sur un écran OLED. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.14] mix-blend-overlay"
        style={{ backgroundImage: GRAIN_DATA_URI }}
      />

      <div className="flex items-start justify-between gap-3">
        {selector}
      </div>

      <div>
        <p className="text-[13px] font-medium text-white/60">{label}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p
            className="text-[34px] font-semibold leading-none tracking-tight tabular-nums drop-shadow-sm"
            data-selectable
          >
            {hidden ? '•• ••• €' : formatMoney(amount)}
          </p>
          {!hideToggle && (
            <button
              type="button"
              onClick={toggle}
              aria-label={hidden ? 'Afficher le solde' : 'Masquer le solde'}
              aria-pressed={hidden}
              className="tappable -mb-1 -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/70 active:bg-white/10"
            >
              {hidden ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          )}
        </div>
        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </section>
  );
}
