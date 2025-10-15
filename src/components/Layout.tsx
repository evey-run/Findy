import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import { useState, useEffect, useRef } from 'react';
import {
  HomeIcon,
  CreditCardIcon,
  TagIcon,
  ChartBarIcon,
  BuildingLibraryIcon,
  UserIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import { colors, borderRadius, textSizes, spacing, commonClasses } from '../styles/commonStyles';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Tableau de bord', href: '/dashboard', icon: HomeIcon },
  { name: 'Transactions', href: '/transactions', icon: CreditCardIcon },
  { name: 'Investissements', href: '/investissement', icon: ChartBarIcon },
  { name: 'Catégories', href: '/categories', icon: TagIcon },
  { name: 'Objectifs', href: '/budgets', icon: FlagIcon },
  { name: 'Banques', href: '/banks', icon: BuildingLibraryIcon },
  { name: 'Utilisateurs', href: '/users', icon: UserIcon },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const pathname = (location?.pathname || '').toLowerCase();
  const lockScroll = pathname.startsWith('/dashboard') || pathname.startsWith('/transactions') || pathname.startsWith('/investissement') || pathname.startsWith('/investissements');
  const { users, selectedUser, setSelectedUser } = useAppStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermer le menu quand on clique en dehors
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fonction pour afficher un avatar utilisateur
  const renderUserAvatar = (user: any, size: string = "h-8 w-8") => {
    if (user?.avatar) {
      return (
        <img
          src={user.avatar.startsWith('http') ? user.avatar : `http://localhost:3001${user.avatar}`}
          alt={user.name}
          className={`${size} ${borderRadius.full} object-cover`}
        />
      );
    } else {
      return (
        <div
          className={`${size} ${borderRadius.full} flex items-center justify-center text-white text-sm font-medium`} 
          style={{ backgroundColor: colors.primary }}
        >
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      );
    }
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: colors.background }}>
      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto" style={{ backgroundColor: colors.cardBackground }}>
          
          {/* Section utilisateur avec avatar et menu déroulant */}
          <div className="px-4 mt-6">
            <div className="relative" ref={menuRef}>
              {/* Avatar au-dessus, séparé du bouton cliquable */}
              <div className="w-full flex flex-col items-center">
                {selectedUser ? (
                  <>
                    {renderUserAvatar(selectedUser, "h-20 w-20")}
                    <div className="text-center mt-2">
                      <button
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className="flex items-center justify-center space-x-1 px-2 py-1 hover:bg-white/10 rounded transition-all"
                      >
                        <p className="text-white font-medium text-sm">{selectedUser.name}</p>
                        {isUserMenuOpen ? (
                          <ChevronUpIcon className="h-3 w-3 text-gray-400" />
                        ) : (
                          <ChevronDownIcon className="h-3 w-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-20 w-20 rounded-full flex items-center justify-center text-white font-bold text-3xl" style={{ backgroundColor: '#6226fa' }}>
                      ∀
                    </div>
                    <div className="text-center mt-2">
                      <button
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                        className="flex items-center justify-center space-x-1 px-2 py-1 hover:bg-white/10 rounded transition-all"
                      >
                        <p className="text-white font-medium text-sm">Tous les utilisateurs</p>
                        {isUserMenuOpen ? (
                          <ChevronUpIcon className="h-3 w-3 text-gray-400" />
                        ) : (
                          <ChevronDownIcon className="h-3 w-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Menu déroulant */}
              {isUserMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 rounded-lg shadow-xl z-50" style={{ backgroundColor: '#1f2226' }}>
                  {/* Option "Tous les utilisateurs" */}
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setIsUserMenuOpen(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2 text-left hover:bg-white/10 transition-colors first:rounded-t-lg ${
                      selectedUser === null ? 'bg-violet-600/20' : ''
                    }`}
                  >
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: '#6226fa' }}>
                      ∀
                    </div>
                    <div>
                      <p className="text-white text-sm">Tous les utilisateurs</p>
                      <p className="text-gray-400 text-xs">Vue globale</p>
                    </div>
                  </button>

                  {/* Options utilisateurs */}
                  {users.map((user, index) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setIsUserMenuOpen(false);
                      }}
                      className={`w-full flex items-center space-x-3 px-3 py-2 text-left hover:bg-white/10 transition-colors ${
                        index === users.length - 1 ? 'rounded-b-lg' : ''
                      } ${
                        selectedUser?.id === user.id ? 'bg-violet-600/20' : ''
                      }`}
                    >
                      {renderUserAvatar(user, "h-8 w-8")}
                      <div>
                        <p className="text-white text-sm">{user.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <nav className="mt-8 flex-1 px-2 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={classNames(
                    isActive
                      ? 'text-white relative'
                      : 'text-gray-400 hover:text-white',
                    'group flex items-center px-4 py-3 text-sm font-medium transition-all duration-200 rounded-r-md'
                  )}
                >
                  {/* Barre violette à gauche pour l'élément actif */}
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full" style={{ backgroundColor: '#6226fa' }}></div>
                  )}
                  <item.icon
                    className={classNames(
                      isActive
                        ? 'text-white'
                        : 'text-gray-400 group-hover:text-gray-200',
                      'mr-3 flex-shrink-0 h-6 w-6'
                    )}
                    style={isActive ? { color: '#6226fa' } : {}}
                    aria-hidden="true"
                  />
                  <span style={isActive ? { color: '#6226fa' } : {}} className={isActive ? '' : ''}>
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Mobile sidebar backdrop */}
      <div className="md:hidden">
        {/* Mobile navigation would go here */}
      </div>

      {/* Main content */}
      <div className={lockScroll ? "flex flex-col flex-1 overflow-hidden" : "flex flex-col flex-1 overflow-auto"}>
        <main className="flex-1 relative z-0 flex flex-col focus:outline-none">
          <div className="flex-1 flex flex-col pt-[40px]">
            <div className="flex-1 w-full px-[40px] flex flex-col">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
