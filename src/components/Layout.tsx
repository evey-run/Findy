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
} from '@heroicons/react/24/outline';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Tableau de bord', href: '/dashboard', icon: HomeIcon },
  { name: 'Transactions', href: '/transactions', icon: CreditCardIcon },
  { name: 'Catégories', href: '/categories', icon: TagIcon },
  { name: 'Budgets', href: '/budgets', icon: ChartBarIcon },
  { name: 'Récurrences', href: '/recurrences', icon: ArrowPathIcon },
  { name: 'Banques', href: '/banks', icon: BuildingLibraryIcon },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { banks, selectedBank, setSelectedBank } = useAppStore();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto bg-white border-r border-gray-200">
          <div className="flex items-center flex-shrink-0 px-4">
            <h1 className="text-xl font-bold text-gray-900">💰 Finance Duo</h1>
          </div>
          
          {/* Bank Selector */}
          <div className="px-4 mt-6">
            <label className="block text-sm font-medium text-gray-700">
              Banque actuelle
            </label>
            <select
              value={selectedBank?.id.toString() || ''}
              onChange={(e) => {
                const bank = banks.find(b => b.id.toString() === e.target.value);
                if (bank) setSelectedBank(bank);
              }}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id.toString()}>
                  {bank.name}
                </option>
              ))}
            </select>
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
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
