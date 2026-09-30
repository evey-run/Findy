import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  ArrowsRightLeftIcon,
  ChartPieIcon,
  WalletIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolid,
  ArrowsRightLeftIcon as ArrowsSolid,
  ChartPieIcon as ChartSolid,
  WalletIcon as WalletSolid,
  Squares2X2Icon as SquaresSolid,
} from '@heroicons/react/24/solid';
import { cx } from '../theme';

/**
 * Barre d'onglets flottante.
 *
 * Elle flotte au-dessus du contenu plutôt que de s'y coller : le fond de
 * l'écran continue derrière elle, ce qui donne la profondeur des applications
 * récentes et évite la barre opaque qui ampute l'écran de 60 points.
 *
 * L'onglet actif s'ouvre pour laisser apparaître son libellé ; les autres
 * restent des icônes. Cinq libellés côte à côte seraient illisibles à 390
 * points, et cinq icônes muettes obligeraient à deviner — n'en montrer qu'un
 * dit à la fois où l'on est et où l'on peut aller.
 */

const TABS = [
  {
    label: 'Accueil',
    href: '/dashboard',
    icon: HomeIcon,
    activeIcon: HomeSolid,
    matches: ['/dashboard'],
  },
  {
    label: 'Transactions',
    href: '/transactions',
    icon: ArrowsRightLeftIcon,
    activeIcon: ArrowsSolid,
    matches: ['/transactions'],
  },
  {
    label: 'Analyse',
    href: '/stats',
    icon: ChartPieIcon,
    activeIcon: ChartSolid,
    matches: ['/stats', '/categories'],
  },
  {
    label: 'Portefeuille',
    href: '/banks',
    icon: WalletIcon,
    activeIcon: WalletSolid,
    matches: ['/banks', '/investissement'],
  },
  {
    label: 'Plus',
    href: '/more',
    icon: Squares2X2Icon,
    activeIcon: SquaresSolid,
    matches: ['/more', '/budgets', '/settings', '/tricount', '/server'],
  },
] as const;

export default function TabBar() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 pb-[max(0.5rem,var(--safe-bottom))] pt-2"
      // Le contenu qui passe dessous s'estompe au lieu de venir buter sur la
      // barre : sans ce dégradé, une ligne de liste s'y arrête net.
      style={{
        background:
          'linear-gradient(to top, rgba(9,9,11,0.92) 55%, rgba(9,9,11,0.55) 80%, rgba(9,9,11,0))',
      }}
    >
      <div className="mx-auto flex w-[calc(100%-2rem)] max-w-md items-center justify-between gap-1 rounded-full border border-white/[0.08] bg-zinc-900/80 p-1.5 backdrop-blur-2xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.8)]">
        {TABS.map((tab) => {
          const active = tab.matches.some(
            (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
          );
          const Icon = active ? tab.activeIcon : tab.icon;

          return (
            <Link
              key={tab.href}
              to={tab.href}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex h-11 items-center justify-center gap-1.5 rounded-full transition-all duration-300 ease-out',
                active
                  ? 'flex-1 bg-violet-600 px-3 text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.7)]'
                  : 'w-11 shrink-0 text-zinc-500 active:bg-white/[0.06] active:text-zinc-300',
              )}
            >
              <Icon className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
              {active && (
                <span className="truncate text-[13px] font-semibold tracking-tight">
                  {tab.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
