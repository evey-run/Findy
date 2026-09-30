import type { ReactNode } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { cx, radii } from '../theme';

/**
 * Commandes tactiles communes.
 *
 * Toutes partagent la même règle : 44 points de haut au minimum, un retour
 * visuel à l'appui (`:active`) et jamais de dépendance au survol.
 */

// ─── Contrôle segmenté ──────────────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Occupe toute la largeur disponible plutôt que de s'ajuster au contenu. */
  fullWidth?: boolean;
  className?: string;
}

/**
 * Sélecteur en pilule — « Mois / Année », « Dépenses / Revenus ».
 *
 * Une liste déroulante native pour deux ou trois choix coûte un aller-retour
 * modal ; les options visibles côte à côte se choisissent d'un doigt.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fullWidth = true,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cx(
        'flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.04] p-1',
        fullWidth && 'w-full',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'min-h-[38px] rounded-full px-4 text-[14px] font-medium transition-colors duration-200',
              fullWidth && 'flex-1',
              active
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-400 active:bg-white/[0.06]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Pastilles de filtre ────────────────────────────────────────────────────

/**
 * Rangée de filtres qui déborde volontairement des marges de l'écran.
 *
 * Le débord (`-mx-5 px-5`) est ce qui fait comprendre qu'on peut faire défiler :
 * une pastille coupée par le bord est une invitation, une rangée qui s'arrête
 * pile au bord ressemble à une liste complète.
 */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar snap-row -mx-5 flex gap-2 overflow-x-auto px-5 py-1">
      {children}
    </div>
  );
}

export function Chip({
  label,
  active = false,
  onClick,
  leading,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  leading?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'tappable flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap',
        active
          ? 'border-violet-500/60 bg-violet-600/20 text-violet-200'
          : 'border-white/[0.08] bg-white/[0.04] text-zinc-400',
      )}
    >
      {leading}
      {label}
    </button>
  );
}

// ─── Boutons ────────────────────────────────────────────────────────────────

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
};

/** Action principale : pleine largeur, elle tombe sous le pouce. */
export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'tappable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 text-[15px] font-semibold text-white',
        'shadow-[0_8px_24px_-10px_rgba(124,58,237,0.9)] disabled:opacity-40 disabled:shadow-none',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, type = 'button', disabled, className }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'tappable flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-[15px] font-medium text-zinc-300 disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DangerButton({ children, onClick, type = 'button', disabled, className }: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'tappable flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600/90 text-[15px] font-semibold text-white disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Bouton d'icône rond, dimensionné pour le pouce quelle que soit l'icône. */
export function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'tappable flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        'border border-white/[0.08] bg-white/[0.05] text-zinc-300 active:bg-white/[0.12]',
        className,
      )}
    >
      {children}
    </button>
  );
}

// ─── Bouton d'action flottant ───────────────────────────────────────────────

/**
 * Action principale de l'écran, posée au-dessus de la barre d'onglets.
 *
 * Les écrans desktop cachent « Ajouter » dans un bouton d'en-tête, hors de
 * portée du pouce et souvent réduit à une icône dès que la fenêtre rétrécit.
 */
export function Fab({
  onClick,
  label,
  icon,
}: {
  onClick: () => void;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'tappable fixed right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-violet-600 pl-4 pr-5 text-[15px] font-semibold text-white',
        'shadow-[0_10px_30px_-8px_rgba(124,58,237,0.9)]',
      )}
      style={{ bottom: 'calc(var(--tabbar-height) + 12px)' }}
    >
      {icon ?? <PlusIcon className="h-6 w-6" />}
      <span>{label}</span>
    </button>
  );
}

// ─── Interrupteur ───────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      // `inline-flex items-center` + une pastille en flux : un enfant en
      // `absolute` sans `left` part de sa position statique, que le centrage
      // par défaut d'un bouton place au milieu — la pastille se retrouve alors
      // à droite quel que soit l'état.
      className={cx(
        'inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-violet-600' : 'bg-white/[0.12]',
      )}
    >
      <span
        className={cx(
          'inline-block h-[27px] w-[27px] transform rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

// ─── Pilule de sélection posée sur la carte de solde ────────────────────────

/**
 * Déclencheur clair sur fond coloré — l'équivalent du « Main card •••• 6510 »
 * des maquettes. Il doit rester lisible sur un dégradé quelconque, d'où le
 * fond blanc plutôt qu'un voile.
 */
export function LightPill({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'tappable flex h-9 max-w-[70%] items-center gap-1.5 bg-white/95 px-3.5 text-[13px] font-semibold text-zinc-900',
        radii.pill,
      )}
    >
      {children}
    </button>
  );
}
