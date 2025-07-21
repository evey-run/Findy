import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppStore } from '../store';
import {
  HomeIcon,
  CreditCardIcon,
  TagIcon,
  ChartBarIcon,
  ArrowPathIcon,
  BuildingLibraryIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Tableau de bord', href: '/dashboard', icon: HomeIcon },
  { name: 'Transactions', href: '/transactions', icon: CreditCardIcon },
  { name: 'Catégories', href: '/categories', icon: TagIcon },
  { name: 'Objectifs', href: '/budgets', icon: ChartBarIcon },
  { name: 'Récurrences', href: '/recurrences', icon: ArrowPathIcon },
  { name: 'Banques', href: '/banks', icon: BuildingLibraryIcon },
  { name: 'Utilisateurs', href: '/users', icon: UserIcon },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { users, selectedUser, setSelectedUser } = useAppStore();

  // Fonction pour afficher un avatar utilisateur
  const renderUserAvatar = (user: any, isSelected: boolean = false) => {
    if (user.avatar) {
      return (
        <img
          src={user.avatar}
          alt={user.name}
          className={`h-8 w-8 rounded-full ring-2 transition-all cursor-pointer object-cover ${
            isSelected ? 'ring-indigo-500' : 'ring-gray-300 hover:ring-indigo-300'
          }`}
          title={user.name}
        />
      );
    } else {
      return (
        <div
          className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium ring-2 transition-all cursor-pointer ${
            isSelected 
              ? 'bg-indigo-600 ring-indigo-500' 
              : 'bg-gray-400 ring-gray-300 hover:ring-indigo-300 hover:bg-indigo-400'
          }`}
          title={user.name}
        >
          {user.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      );
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto bg-white border-r border-gray-200">
          <div className="flex items-center flex-shrink-0 px-4">
            <h1 className="text-xl font-bold text-gray-900">💰 Finance Duo</h1>
          </div>
          
          {/* User Selector with Avatars */}
          <div className="px-4 mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <UserIcon className="w-4 h-4 inline mr-1" />
              Utilisateur
            </label>
            <div className="flex flex-wrap gap-2">
              {/* Bouton "Tous les utilisateurs" */}
              <button
                onClick={() => setSelectedUser(null)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedUser === null
                    ? 'bg-indigo-100 text-indigo-900 border-2 border-indigo-300'
                    : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-indigo-50 hover:border-indigo-200'
                }`}
              >
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  selectedUser === null ? 'bg-indigo-600 text-white' : 'bg-gray-400 text-white'
                }`}>
                  ∀
                </div>
                Tous
              </button>
              
              {/* Avatars des utilisateurs */}
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedUser?.id === user.id
                      ? 'bg-indigo-100 text-indigo-900 border-2 border-indigo-300'
                      : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-indigo-50 hover:border-indigo-200'
                  }`}
                >
                  {renderUserAvatar(user, selectedUser?.id === user.id)}
                  <span className="truncate max-w-[100px]">{user.name}</span>
                </button>
              ))}
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
                      ? 'bg-indigo-100 text-indigo-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                    'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                  )}
                >
                  <item.icon
                    className={classNames(
                      isActive
                        ? 'text-indigo-500'
                        : 'text-gray-400 group-hover:text-gray-500',
                      'mr-3 flex-shrink-0 h-6 w-6'
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
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
      <div className="flex flex-col flex-1 overflow-hidden">
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-full mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
