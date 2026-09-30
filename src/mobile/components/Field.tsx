import type { ReactNode } from 'react';
import { ChevronUpDownIcon } from '@heroicons/react/20/solid';
import { cx, fieldControl, surfaces } from '../theme';

/**
 * Champs de formulaire tactiles.
 *
 * Trois contraintes dictent ces composants, et elles sont toutes invisibles sur
 * un écran d'ordinateur :
 *
 *   • sous 16 px, Safari zoome à la mise au point du champ et ne dézoome
 *     jamais — la page reste décalée pour le reste de la session ;
 *   • `<input type="number">` ouvre un clavier numérique sans virgule sur
 *     iOS, alors que le séparateur décimal français en est une : on saisit
 *     donc du texte avec `inputMode="decimal"` et on normalise ;
 *   • une hauteur de 48 points est le minimum pour viser un champ sans
 *     hésitation, bien au-delà des 36 px d'un formulaire de bureau.
 *
 * La liste déroulante reste native : elle ouvre le sélecteur du système, plus
 * rapide et plus familier que n'importe quelle réimplémentation.
 */

const CONTROL = fieldControl;

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {label && (
        <label className="block text-[13px] font-medium text-zinc-400">{label}</label>
      )}
      {children}
      {error ? (
        <p className="text-[12px] text-red-400">{error}</p>
      ) : (
        hint && <p className="text-[12px] text-zinc-600">{hint}</p>
      )}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        'min-h-[96px] w-full rounded-2xl px-4 py-3 text-[16px] text-zinc-50 placeholder-zinc-600 outline-none transition-colors',
        surfaces.input,
        props.className,
      )}
    />
  );
}

/**
 * Saisie d'un montant.
 *
 * La virgule est acceptée et convertie : c'est ce que produit le clavier
 * décimal français, et un `parseFloat('12,50')` vaut 12.
 */
export function AmountInput({
  value,
  onChange,
  placeholder = '0,00',
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => {
          // On ne garde que ce qui peut composer un nombre : le clavier
          // décimal iOS laisse malgré tout passer d'autres caractères en
          // saisie vocale ou au collage.
          const cleaned = event.target.value.replace(/[^\d.,-]/g, '');
          onChange(cleaned);
        }}
        className={cx(CONTROL, 'pr-10 text-[17px] font-semibold tabular-nums')}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-zinc-500">
        €
      </span>
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          CONTROL,
          // `appearance-none` retire la flèche du système, remplacée par une
          // icône alignée sur le reste de l'interface.
          'appearance-none pr-11',
          className,
        )}
      >
        {children}
      </select>
      <ChevronUpDownIcon
        className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
        aria-hidden="true"
      />
    </div>
  );
}

export function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cx(CONTROL, 'appearance-none')}
    />
  );
}

/** Rangée « libellé + contrôle » pour les écrans de réglages. */
export function SettingRow({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  danger = false,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const content = (
    <>
      {icon && (
        <span
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            danger ? 'bg-red-500/12 text-red-400' : 'bg-white/[0.06] text-zinc-400',
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cx(
            'block truncate text-[15px] font-medium',
            danger ? 'text-red-400' : 'text-zinc-100',
          )}
        >
          {title}
        </span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-zinc-500">{subtitle}</span>}
      </span>
      {trailing}
    </>
  );

  const shared = 'flex min-h-[56px] w-full items-center gap-3 py-2 text-left';

  if (!onClick) return <div className={shared}>{content}</div>;
  return (
    <button type="button" onClick={onClick} className={cx(shared, 'tappable')}>
      {content}
    </button>
  );
}

