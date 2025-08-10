import { useEffect } from 'react';
import { useAppStore } from '../store';
import {
  ArrowTrendingUpIcon,
  ChartBarIcon,
  ShoppingCartIcon,
  UsersIcon,
  MapIcon,
} from '@heroicons/react/24/outline';

// Styles pour la barre de scroll personnalisée
const scrollbarStyles = `
  /* Webkit browsers (Chrome, Safari, Edge) */
  ::-webkit-scrollbar {
    width: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: #1f2226;
    border-radius: 8px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #6226fa;
    border-radius: 8px;
    border: 1px solid #1f2226;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #7c3aed;
    border: 1px solid #1f2226;
  }
  
  ::-webkit-scrollbar-thumb:active {
    background: #6226fa;
    border: 1px solid #1f2226;
  }
  
  /* Firefox */
  html {
    scrollbar-width: thin;
    scrollbar-color: #6226fa #1f2226;
  }
  
  /* Styles spécifiques pour les conteneurs avec scroll */
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #1f2226;
    border-radius: 8px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #6226fa !important;
    border-radius: 8px;
    border: 1px solid #1f2226;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #7c3aed !important;
    border: 1px solid #1f2226;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:active {
    background: #6226fa !important;
    border: 1px solid #1f2226;
  }
  
  /* Force pour tous les scrollbars */
  * {
    scrollbar-width: thin;
    scrollbar-color: #6226fa #1f2226;
  }
`;

// Injecter les styles dans le document
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = scrollbarStyles;
  if (!document.head.querySelector('style[data-scrollbar-custom]')) {
    styleElement.setAttribute('data-scrollbar-custom', 'true');
    document.head.appendChild(styleElement);
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export default function Dashboard() {
  const {
    dashboardData,
    loadDashboardOverview,
    selectedUser,
    transactions,
    isLoading,
  } = useAppStore();

  useEffect(() => {
    loadDashboardOverview();
  }, [loadDashboardOverview, selectedUser]);

  if (isLoading || !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  // Statistiques pour les cartes du haut
  const topStats = [
    {
      name: 'Revenus du mois',
      value: formatCurrency(dashboardData.summary.currentMonthIncome || 0),
      icon: ArrowTrendingUpIcon,
      color: 'text-green-400',
      bgColor: 'bg-green-900 bg-opacity-50',
      description: 'Comptes courants',
      action: <ArrowTrendingUpIcon className="h-4 w-4 text-green-400" />
    },
    {
      name: 'Dépenses du mois',
      value: formatCurrency(dashboardData.summary.currentMonthExpense || 0),
      icon: ShoppingCartIcon,
      color: 'text-red-400',
      bgColor: 'bg-red-900 bg-opacity-50',
      description: 'Comptes courants',
      action: <ShoppingCartIcon className="h-4 w-4 text-red-400" />
    },
    {
      name: 'Économies',
      value: formatCurrency(dashboardData.summary.savingsTotal || 0),
      icon: UsersIcon,
      color: 'text-violet-400',
      bgColor: 'bg-violet-900 bg-opacity-50',
      description: 'Livrets d\'épargne',
      action: <UsersIcon className="h-4 w-4 text-violet-400" />
    },
    {
      name: 'Investissements',
      value: formatCurrency(dashboardData.summary.investmentMonthTotal || 0),
      icon: ChartBarIcon,
      color: 'text-blue-400',
      bgColor: 'bg-blue-900 bg-opacity-50',
      description: 'Dépenses du mois',
      action: <ChartBarIcon className="h-4 w-4 text-blue-400" />
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
            Tableau de bord
          </h2>
          {selectedUser && (
            <p className="mt-1 text-sm text-gray-400">
              Vue de {selectedUser.name}
            </p>
          )}
        </div>
      </div>

      {/* Top Grid: Stats Cards (2x2) and Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Stats Cards - Left Side (2x2 grid) - Now smaller (2 columns out of 5) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {topStats.map((stat) => (
            <div
              key={stat.name}
              className="relative p-3 shadow rounded-lg overflow-hidden border border-gray-700 flex flex-col"
              style={{ backgroundColor: '#272a2f' }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">
                    {stat.name}
                  </p>
                  <p className="text-xl font-bold text-white">
                    {stat.value}
                  </p>
                </div>
                <div className="flex items-center justify-center h-5 w-5">
                  {stat.action}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Devices - Right Side - Now larger (3 columns out of 5) */}
        <div className="lg:col-span-3 shadow rounded-lg border border-gray-700" style={{ backgroundColor: '#272a2f' }}>
          <div className="px-6 py-6 sm:p-8">
            <h3 className="text-sm font-medium text-gray-300 mb-6">
              Devices
            </h3>
            <div className="flex flex-col md:flex-row items-center justify-center md:justify-between">
              <div className="relative h-40 w-40 mb-4 md:mb-0">
                <div className="absolute inset-0 rounded-full border-8 border-gray-700"></div>
                <div 
                  className="absolute inset-0 rounded-full border-8 border-violet-500" 
                  style={{ 
                    clipPath: 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 75% 100%, 50% 75%)'
                  }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-3xl font-bold text-white">12.350</span>
                  <span className="text-sm text-gray-400">Devices</span>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="h-3 w-3 rounded-full bg-violet-500"></div>
                  <span className="text-sm text-gray-300">Mobile</span>
                  <span className="text-sm font-medium text-white ml-2">65%</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="h-3 w-3 rounded-full bg-gray-300"></div>
                  <span className="text-sm text-gray-300">Desktop</span>
                  <span className="text-sm font-medium text-white ml-2">25%</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="h-3 w-3 rounded-full bg-gray-600"></div>
                  <span className="text-sm text-gray-300">Tablet</span>
                  <span className="text-sm font-medium text-white ml-2">10%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Projections and Goals + Revenue by Period */}
        <div className="space-y-6">
          {/* Chart 1: Projections and Goals */}
          <div className="shadow rounded-lg border border-gray-700" style={{ backgroundColor: '#272a2f' }}>
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">
                Projections and goals
              </h3>
              <div className="h-64 flex items-center justify-center">
                <div className="w-full h-full flex items-end justify-between space-x-2">
                  {[40, 65, 30, 80, 45, 60, 35, 70, 50, 75, 55, 65].map((height, index) => (
                    <div key={index} className="flex flex-col items-center space-y-1 flex-1">
                      <div className="w-full flex items-end justify-center space-x-1">
                        <div 
                          className={`w-2 ${index % 3 === 0 ? 'bg-violet-500' : index % 3 === 1 ? 'bg-white' : 'bg-green-400'}`} 
                          style={{ height: `${height}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-500">{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index]}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Revenue by Period - Circle Charts */}
          <div className="shadow rounded-lg border border-gray-700" style={{ backgroundColor: '#272a2f' }}>
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">
                Revenue by period
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Today */}
                <div className="flex flex-col items-center">
                  <div className="relative h-32 w-32 mb-2">
                    <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-violet-500" 
                      style={{ 
                        clipPath: 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 50%)'
                      }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-xl font-bold text-white">$1.2k</span>
                      <span className="text-xs text-gray-400">Today</span>
                    </div>
                  </div>
                </div>
                
                {/* This week */}
                <div className="flex flex-col items-center">
                  <div className="relative h-32 w-32 mb-2">
                    <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-violet-500" 
                      style={{ 
                        clipPath: 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 75%, 75% 100%, 50% 100%)'
                      }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-xl font-bold text-white">$7.2k</span>
                      <span className="text-xs text-gray-400">This week</span>
                    </div>
                  </div>
                </div>
                
                {/* This month */}
                <div className="flex flex-col items-center">
                  <div className="relative h-32 w-32 mb-2">
                    <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-violet-500" 
                      style={{ 
                        clipPath: 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 50% 100%)'
                      }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-xl font-bold text-white">$28.5k</span>
                      <span className="text-xs text-gray-400">This month</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart 2: Revenue by Location */}
        <div className="shadow rounded-lg border border-gray-700" style={{ backgroundColor: '#272a2f' }}>
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-300">
                Revenue by location
              </h3>
              <div className="bg-blue-500 p-1 rounded">
                <MapIcon className="h-3 w-3 text-white" />
              </div>
            </div>
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="relative w-full h-full">
                {/* Simplified world map visualization */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-gray-500 text-sm">World Map Visualization</p>
                </div>
                {/* Dots representing locations */}
                <div className="absolute top-1/4 left-1/4 h-3 w-3 rounded-full bg-violet-500"></div>
                <div className="absolute top-1/3 right-1/3 h-3 w-3 rounded-full bg-violet-500"></div>
                <div className="absolute bottom-1/4 right-1/4 h-3 w-3 rounded-full bg-violet-500"></div>
              </div>
            </div>
            {/* Country stats */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-400">USA</span>
                  <span className="text-xs text-gray-400">100k</span>
                </div>
                <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: '75%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-400">Brazil</span>
                  <span className="text-xs text-gray-400">100k</span>
                </div>
                <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500" style={{ width: '60%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Recent Transactions - Moved to bottom */}
      <div className="shadow rounded-lg border border-gray-700 mt-6" style={{ backgroundColor: '#272a2f' }}>
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-white mb-4">
            Transactions récentes
          </h3>
          {transactions.slice(0, 5).length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              Aucune transaction récente
            </p>
          ) : (
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-700">
                {transactions.slice(0, 5).map((transaction) => (
                  <li key={transaction.id} className="py-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                            transaction.category?.type === 'INCOME'
                              ? 'bg-green-600'
                              : transaction.category?.type === 'EXPENSE'
                              ? 'bg-red-600'
                              : 'bg-violet-600'
                          }`}
                        >
                          {transaction.category?.type === 'INCOME' ? '+' : '-'}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {transaction.description}
                        </p>
                        <p className="text-sm text-gray-400">
                          {transaction.category?.name} • {new Date(transaction.date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className={`text-sm font-medium ${
                            transaction.category?.type === 'INCOME'
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}
                        >
                          {transaction.category?.type === 'INCOME' ? '+' : '-'}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
