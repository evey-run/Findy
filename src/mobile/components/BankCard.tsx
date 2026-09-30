import { ArrowPathIcon, ExclamationTriangleIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import type { Bank, User } from '../../types';
import { assetUrl } from '../../lib/url';
import { cardSurface, GRAIN_DATA_URI } from '../../lib/cardSurface';
import { formatMoney } from '../../lib/format';
import { parseBrandColors } from '../bank';
import { cx } from '../theme';

/**
 * Un compte, rendu comme la carte qu'il y a dans la poche.
 *
 * L'écran desktop range ses comptes dans une grille de tuiles au format
 * paysage : à 1280 points de large on en voit cinq d'un coup, et la nature de
 * chacun se lit dans son en-tête de section. Sur un téléphone, la même grille
 * donnerait deux vignettes de 160 points où le solde tombe sous la taille
 * lisible.
 *
 * La carte est donc rendue à sa vraie échelle — assez grande pour que le solde
 * soit le premier élément vu — et c'est le carrousel qui remplace la grille :
 * on fait défiler ses comptes du pouce comme on feuillette un portefeuille.
 *
 * Toute la carte est la cible tactile, et elle n'en contient aucune autre. Un
 * bouton de 24 points posé sur une carte (le « … » du desktop) se rate une fois
 * sur trois ; les actions vivent dans la feuille qu'ouvre cet appui.
 */

/** Au-delà de trois visages, la pile devient une bouillie de pixels. */
const MAX_VISIBLE_MEMBERS = 3;

interface BankCardProps {
  bank: Bank;
  onPress?: (bank: Bank) => void;
  /** Ouvre la feuille d'actions du compte (…). */
  onMenu?: (bank: Bank) => void;
  /**
   * Propriétaires du compte, à ne renseigner que si le foyer compte plusieurs
   * personnes : seul, un visage ne ferait que répéter que le compte est à soi.
   */
  members?: User[];
  /** Une synchronisation est en cours pour ce compte. */
  syncing?: boolean;
  /** `carousel` fige la largeur pour que la carte suivante dépasse du bord. */
  variant?: 'full' | 'carousel';
}

export default function BankCard({
  bank,
  onPress,
  onMenu,
  members = [],
  syncing = false,
  variant = 'full',
}: BankCardProps) {
  const surface = cardSurface(bank.color, parseBrandColors(bank.brandColors));
  const balance = formatMoney(bank.balance);
  const expired = bank.ebStatus === 'EXPIRED';
  const linking = bank.ebStatus === 'PENDING' || bank.ebStatus === 'SELECTING_ACCOUNT';

  return (
    <button
      type="button"
      onClick={() => onPress?.(bank)}
      className={cx(
        'tappable relative isolate flex min-h-[190px] flex-col overflow-hidden rounded-[24px] p-4 text-left text-white',
        'ring-1 ring-white/10 shadow-[0_16px_36px_-20px_rgba(0,0,0,0.95)]',
        variant === 'carousel' ? 'w-[300px] shrink-0' : 'w-full',
      )}
      style={{ backgroundImage: surface.background }}
    >
      {/* Matière de la carte : le grain casse les marches de quantification
          d'un dégradé large sur écran sombre, la diagonale lui donne un relief. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <span
          className="absolute inset-0 opacity-[0.13] mix-blend-overlay"
          style={{ backgroundImage: GRAIN_DATA_URI }}
        />
        <span className="absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/[0.07]" />
      </span>

      {/* ── Marque de l'émetteur ── */}
      <span className="flex items-start gap-2.5">
        <BankMark bank={bank} />

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {syncing && <ArrowPathIcon className="h-4 w-4 animate-spin text-white/80" />}
          {linking && (
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-medium text-amber-200">
              Liaison…
            </span>
          )}
          {onMenu && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMenu(bank);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 active:bg-white/20"
              aria-label="Actions du compte"
            >
              <EllipsisHorizontalIcon className="h-4 w-4" />
            </button>
          )}
          {bank.shortName && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
              {bank.shortName}
            </span>
          )}
        </span>
      </span>

      {/* ── Solde ── */}
      <span className="mt-auto block pt-5">
        <span className="block truncate text-[13px] font-medium text-white/65">{bank.name}</span>
        <span
          className={cx(
            // Un solde à sept chiffres déborderait la carte : c'est la taille
            // qui cède, jamais le nombre — un montant tronqué serait un faux.
            'mt-1.5 block font-semibold leading-none tracking-tight tabular-nums drop-shadow-sm',
            balance.length > 13 ? 'text-[21px]' : 'text-[26px]',
          )}
          data-selectable
        >
          {balance}
        </span>
      </span>

      {(bank.cardLast4 || members.length > 0) && (
        <span className="mt-3.5 flex items-end gap-3">
          {bank.cardLast4 && (
            <span className="font-mono text-[11px] tracking-[0.2em] text-white/70">
              ••••&nbsp;{bank.cardLast4}
            </span>
          )}
          {members.length > 0 && <MemberStack members={members} />}
        </span>
      )}

      {expired && (
        <span className="mt-3 flex items-center gap-1.5 rounded-xl border border-amber-400/25 bg-amber-400/15 px-3 py-2 text-[12px] font-medium text-amber-100">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          Connexion expirée — appuyez pour relier
        </span>
      )}
    </button>
  );
}

/**
 * Marque de la banque.
 *
 * Le logotype officiel est un lettrage large : il se cadre par la hauteur, pas
 * dans un rond. Ceux qui sont sombres — Boursorama est en bleu nuit sur
 * transparent — disparaîtraient sur une carte noire : on les pose alors sur une
 * plaque claire, exactement comme le font les vraies cartes.
 */
function BankMark({ bank }: { bank: Bank }) {
  if (bank.brandLogo) {
    return (
      <span
        className={cx(
          'flex shrink-0 items-center',
          bank.brandLogoLight ? '' : 'rounded-lg bg-white/95 px-2 py-1.5 shadow-sm ring-1 ring-black/5',
        )}
      >
        <img
          src={assetUrl(bank.brandLogo)}
          alt=""
          aria-hidden="true"
          className={cx(
            'max-w-[112px] object-contain object-left',
            bank.brandLogoLight ? 'h-5 drop-shadow' : 'h-4',
          )}
        />
      </span>
    );
  }

  if (bank.image) {
    return (
      <img
        src={assetUrl(bank.image)}
        alt=""
        aria-hidden="true"
        className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-white/25"
      />
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-[17px] ring-1 ring-white/20">
      🏦
    </span>
  );
}

/**
 * Pile des membres, dans le flux et non en position absolue.
 *
 * Posée en absolu comme sur le desktop, elle chevaucherait le solde dès qu'il
 * atteint six chiffres — les deux occupent le bas de la carte, et sur 300
 * points de large il n'y a pas la place de les faire cohabiter à l'aveugle.
 */
function MemberStack({ members }: { members: User[] }) {
  const visible = members.slice(0, MAX_VISIBLE_MEMBERS);
  const overflow = members.length - visible.length;

  return (
    <span className="ml-auto flex shrink-0 items-center -space-x-2">
      {visible.map((member) =>
        member.avatar ? (
          <img
            key={member.id}
            src={assetUrl(member.avatar)}
            alt=""
            aria-hidden="true"
            className="h-6 w-6 rounded-full object-cover ring-2 ring-black/40"
          />
        ) : (
          <span
            key={member.id}
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white ring-2 ring-black/40"
          >
            {member.name.charAt(0).toUpperCase()}
          </span>
        ),
      )}
      {overflow > 0 && (
        <span className="flex h-6 items-center rounded-full bg-white/20 px-1.5 text-[10px] font-semibold tabular-nums text-white ring-2 ring-black/40">
          +{overflow}
        </span>
      )}
    </span>
  );
}
