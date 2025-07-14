import { useEffect } from 'react';
import { useAppStore } from '../store';
import {
  CurrencyEuroIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

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
    budgets,
    isLoading,
    dateRange,
  } = useAppStore();

  useEffect(() => {
    loadDashboardOverview();
  }, [loadDashboardOverview, selectedUser, dateRange.startDate, dateRange.endDate]);

  if (isLoading || !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const stats = [
    {
      name: 'Revenus du mois',
      value: formatCurrency(dashboardData.summary.totalIncome),
      icon: ArrowTrendingUpIcon,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      name: 'Dépenses du mois',
      value: formatCurrency(dashboardData.summary.totalExpenses),
      icon: ArrowTrendingDownIcon,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      name: 'Solde',
      value: formatCurrency(dashboardData.summary.balance),
      icon: CurrencyEuroIcon,
      color: dashboardData.summary.balance >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: dashboardData.summary.balance >= 0 ? 'bg-green-50' : 'bg-red-50',
    },
    {
      name: 'Budgets actifs',
      value: budgets.length.toString(),
      icon: ChartBarIcon,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  const recentTransactions = transactions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Tableau de bord
          </h2>
          {selectedUser && (
            <p className="mt-1 text-sm text-gray-500">
              Vue de {selectedUser.name}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="relative bg-white pt-5 px-4 pb-12 sm:pt-6 sm:px-6 shadow rounded-lg overflow-hidden"
          >
            <dt>
              <div className={`absolute ${stat.bgColor} rounded-md p-3`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} aria-hidden="true" />
              </div>
              <p className="ml-16 text-sm font-medium text-gray-500 truncate">
                {stat.name}
              </p>
            </dt>
            <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
              <p className={`text-2xl font-semibold ${stat.color}`}>
                {stat.value}
              </p>
            </dd>
          </div>
        ))}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Transactions récentes
          </h3>
          {recentTransactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Aucune transaction récente
            </p>
          ) : (
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-200">
                {recentTransactions.map((transaction) => (
                  <li key={transaction.id} className="py-4">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                            transaction.category?.type === 'INCOME'
                              ? 'bg-green-500'
                              : transaction.category?.type === 'EXPENSE'
                              ? 'bg-red-500'
                              : 'bg-blue-500'
                          }`}
                        >
                          {transaction.category?.type === 'INCOME' ? '+' : '-'}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {transaction.description}
                        </p>
                        <p className="text-sm text-gray-500">
                          {transaction.category?.name} • {new Date(transaction.date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className={`text-sm font-medium ${
                            transaction.category?.type === 'INCOME'
                              ? 'text-green-600'
                              : 'text-red-600'
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

      {/* Budget Progress */}
      {budgets.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Progression des budgets
            </h3>
            <div className="space-y-4">
              {budgets
                .slice(0, 3)
                .map((budget) => {
                  const spent = transactions
                    .filter(t => 
                      t.categoryId === budget.categoryId && 
                      t.category?.type === 'EXPENSE' &&
                      new Date(t.date) >= new Date(budget.startDate)
                    )
                    .reduce((sum, t) => sum + t.amount, 0);
                  
                  const percentage = Math.min((Math.abs(spent) / budget.amount) * 100, 100);
                  const isOverBudget = Math.abs(spent) > budget.amount;

                  return (
                    <div key={budget.id}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {budget.category?.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatCurrency(Math.abs(spent))} / {formatCurrency(budget.amount)}
                        </p>
                      </div>
                      <div className="mt-1">
                        <div className="bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              isOverBudget
                                ? 'bg-red-500'
                                : percentage > 80
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
