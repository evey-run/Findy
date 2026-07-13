import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { useState, useEffect, useRef } from 'react';
import { assetUrl } from '../lib/url';
import { getAutoUpdateEnabled, checkForUpdates, fetchVersionInfo, type VersionInfo } from '../utils/updates';
import {
  HomeIcon,
  CreditCardIcon,
  TagIcon,
  ChartBarIcon,
  BuildingLibraryIcon,
  WalletIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FlagIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Tableau de bord', href: '/dashboard', icon: HomeIcon },
  { name: 'Transactions',    href: '/transactions', icon: CreditCardIcon },
  { name: 'Investissements', href: '/investissement', icon: ChartBarIcon },
  { name: 'Catégories',      href: '/categories', icon: TagIcon },
  { name: 'Objectifs',       href: '/budgets', icon: FlagIcon },
  { name: 'Portefeuille',    href: '/banks', icon: WalletIcon },
];

// Mobile bottom nav — 5 items most-used
const mobileNav = [
  { name: 'Accueil',      href: '/dashboard',      icon: HomeIcon },
  { name: 'Transactions', href: '/transactions',    icon: CreditCardIcon },
  { name: 'Objectifs',    href: '/budgets',         icon: FlagIcon },
  { name: 'Portefeuille', href: '/banks',           icon: WalletIcon },
  { name: 'Paramètres',   href: '/settings',        icon: Cog6ToothIcon },
];

function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const { users, selectedUser, setSelectedUser } = useAppStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [versionInfo, setVersionInfo] = useState<(VersionInfo & { updateAvailable: boolean }) | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Vérification automatique des mises à jour si l'option est activée
  useEffect(() => {
    fetchVersionInfo()
      .then((info) => setVersionInfo({ ...info, updateAvailable: false }))
      .catch(() => {});
    if (getAutoUpdateEnabled()) {
      checkForUpdates().then((info) => info && setVersionInfo(info));
    }
  }, []);

  const renderAvatar = (user: any, size = 'h-8 w-8') => {
    if (user?.avatar) {
      return (
        <img
          src={assetUrl(user.avatar)}
          alt={user.name}
          className={`${size} rounded-full object-cover ring-2 ring-white/10`}
        />
      );
    }
    return (
      <div className={`${size} rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-violet-500/30`}>
        {user?.name?.charAt(0)?.toUpperCase() || '?'}
      </div>
    );
  };

  const currentUserDisplay = selectedUser ?? null;

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden">
      {/* ── Sidebar (desktop) ── */}
      <div className="hidden md:flex md:w-64 md:flex-col flex-shrink-0">
        <div className="flex flex-col h-full bg-white/[0.03] backdrop-blur-xl border-r border-white/[0.06] overflow-y-auto">

          {/* Logo */}
          <div className="px-6 pt-7 pb-2 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <img src="/assets/findy-logo.png" alt="Findy" className="h-5 w-auto flex-shrink-0" />
              <span className="text-zinc-50 font-semibold text-lg tracking-tight">Findy</span>
            </div>
          </div>

          {/* User selector */}
          <div className="px-4 mt-6 flex-shrink-0">
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-xl transition-colors"
              >
                {currentUserDisplay ? (
                  renderAvatar(currentUserDisplay, 'h-9 w-9')
                ) : (
                  <div className="h-9 w-9 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 font-bold text-sm flex-shrink-0">
                    ∀
                  </div>
                )}
                <span className="text-zinc-50 font-medium text-sm truncate">{currentUserDisplay?.name ?? 'Tous'}</span>
                <span className="ml-auto flex-shrink-0">
                  {isUserMenuOpen
                    ? <ChevronUpIcon className="h-3 w-3 text-zinc-500" />
                    : <ChevronDownIcon className="h-3 w-3 text-zinc-500" />}
                </span>
              </button>

              {/* Dropdown */}
              {isUserMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <button
                    onClick={() => { setSelectedUser(null); setIsUserMenuOpen(false); }}
                    className={cx(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors',
                      selectedUser === null && 'bg-violet-600/15'
                    )}
                  >
                    <div className="h-8 w-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-xs font-bold">∀</div>
                    <div>
                      <p className="text-zinc-50 text-sm font-medium">Tous</p>
                      <p className="text-zinc-500 text-xs">Vue globale</p>
                    </div>
                  </button>
                  {users.map((user, idx) => (
                    <button
                      key={user.id}
                      onClick={() => { setSelectedUser(user); setIsUserMenuOpen(false); }}
                      className={cx(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors',
                        idx === users.length - 1 && 'rounded-b-xl',
                        selectedUser?.id === user.id && 'bg-violet-600/15'
                      )}
                    >
                      {renderAvatar(user, 'h-8 w-8')}
                      <p className="text-zinc-50 text-sm font-medium">{user.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Nav links */}
          <nav className="mt-8 flex-1 px-3 space-y-0.5">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cx(
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'text-white bg-white/5'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-500 rounded-r-full" />
                  )}
                  <item.icon
                    className={cx(
                      'flex-shrink-0 h-5 w-5 transition-colors duration-200',
                      isActive ? 'text-violet-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    )}
                    aria-hidden="true"
                  />
                  <span className={isActive ? 'text-zinc-100' : ''}>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Petite mention de version */}
          <div className="px-4 pb-1 pt-1 flex-shrink-0">
            {versionInfo && (
              <p className="text-[11px] text-zinc-600 flex items-center gap-1">
                v{versionInfo.current}
                {versionInfo.updateAvailable && (
                  <span className="text-violet-400">→ v{versionInfo.latest}</span>
                )}
              </p>
            )}
          </div>

          {/* Settings — pinned bottom */}
          <div className="px-3 pb-4 pt-2 border-t border-white/[0.06] mt-2">
            {(() => {
              const isActive = location.pathname === '/settings';
              return (
                <Link
                  to="/settings"
                  className={cx(
                    'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'text-white bg-white/5'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-500 rounded-r-full" />
                  )}
                  <Cog6ToothIcon
                    className={cx(
                      'flex-shrink-0 h-5 w-5 transition-colors duration-200',
                      isActive ? 'text-violet-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    )}
                    aria-hidden="true"
                  />
                  <span className={isActive ? 'text-zinc-100' : ''}>Paramètres</span>
                </Link>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white/[0.03]">
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* pb-20 on mobile for bottom nav clearance */}
          <div className="flex-1 min-h-0 flex flex-col w-full px-6 md:px-10 pt-6 md:pt-8 pb-20 md:pb-6">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-t border-white/[0.08] flex items-center justify-around px-1 py-1.5">
        {mobileNav.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cx(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors',
                isActive ? 'text-violet-400' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
