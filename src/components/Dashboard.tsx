import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import {
  ArrowTrendingUpIcon,
  ChartBarIcon,
  ShoppingCartIcon,
  UsersIcon,
  TrophyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { Objective } from '../types';

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
    allTransactions,
    loadAllTransactions,
    categories,
    budgets,
    isLoading,
  } = useAppStore();
  
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [objectiveProgress, setObjectiveProgress] = useState<{ [key: string]: number }>({});
  
  // État pour la navigation par mois
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  
  // Fonction pour obtenir le nom du mois en français
  const getMonthName = (date: Date): string => {
    return date.toLocaleString('fr-FR', { month: 'long' });
  };
  
  // Fonctions pour naviguer entre les mois
  const goToPreviousMonth = () => {
    setSelectedMonth(prevMonth => {
      const newMonth = new Date(prevMonth);
      newMonth.setMonth(newMonth.getMonth() - 1);
      return newMonth;
    });
  };
  
  const goToNextMonth = () => {
    setSelectedMonth(prevMonth => {
      const newMonth = new Date(prevMonth);
      newMonth.setMonth(newMonth.getMonth() + 1);
      return newMonth;
    });
  };

  useEffect(() => {
    // Charger toutes les allTransactions pour les analyses et graphiques
    loadAllTransactions({ forceIgnoreSelectedBank: true, ignoreDateRange: true });
    loadDashboardOverview();
    loadObjectives();
  }, [loadDashboardOverview, loadAllTransactions, selectedUser, selectedMonth]);
  
  // Charger les objectifs depuis l'API
  const loadObjectives = async () => {
    try {
      const response = await fetch('/api/objectives');
      if (response.ok) {
        const data = await response.json();
        setObjectives(data);
        
        // Charger les données de progression pour chaque objectif
        data.forEach((objective: Objective) => {
          fetchObjectiveProgress(objective.id);
        });
      }
    } catch (error) {
      console.error('Error loading objectives:', error);
    }
  };
  
  // Récupérer la progression d'un objectif
  const fetchObjectiveProgress = async (objectiveId: string) => {
    try {
      const response = await fetch(`/api/objectives/${objectiveId}/progress`);
      if (response.ok) {
        const data = await response.json();
        setObjectiveProgress(prev => ({
          ...prev,
          [objectiveId]: data.percentage || 0
        }));
      }
    } catch (error) {
      console.error('Error fetching objective progress:', error);
    }
  };
  
  // Fonction pour générer le clipPath en fonction du pourcentage
  const getClipPathForPercentage = (percentage: number): string => {
    const p = Math.min(percentage, 100) / 100;
    
    if (p >= 1) return 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
    
    if (p <= 0) return 'polygon(50% 50%, 50% 0, 50% 0, 50% 0)';
    
    // Diviser le cercle en 8 segments pour une animation plus fluide
    return `polygon(50% 50%, 50% 0%, ${p >= 0.125 ? '100%' : '50%'} 0%, ${p >= 0.375 ? '100%' : '50%'} ${p >= 0.25 ? '100%' : '50%'}, ${p >= 0.625 ? '100%' : '50%'} ${p >= 0.5 ? '100%' : '50%'}, ${p >= 0.875 ? '100%' : '50%'} ${p >= 0.75 ? '100%' : '50%'}, 50% ${p >= 1 ? '100%' : '50%'})`;
  };

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
        
        {/* Navigation par mois */}
        <div className="flex items-center space-x-2 bg-gray-800 rounded-xl px-4 py-2 mt-4 md:mt-0">
          <button 
            onClick={goToPreviousMonth}
            className="text-white hover:text-violet-400 focus:outline-none"
            aria-label="Mois précédent"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="text-white font-medium capitalize px-2">
            {getMonthName(selectedMonth)}
          </span>
          <button 
            onClick={goToNextMonth}
            className="text-white hover:text-violet-400 focus:outline-none"
            aria-label="Mois suivant"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Top Grid: Stats Cards (2x2) and Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Stats Cards - Left Side (2x2 grid) - Now smaller (2 columns out of 5) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {topStats.map((stat) => (
            <div
              key={stat.name}
              className="relative p-3 shadow rounded-2xl overflow-hidden flex flex-col"
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
        
        {/* Objectifs - Right Side - Now larger (3 columns out of 5) */}
        <div className="lg:col-span-3 shadow rounded-2xl" style={{ backgroundColor: '#272a2f' }}>
          <div className="px-6 py-6 sm:p-8">
            <h3 className="text-sm font-medium text-gray-300 mb-6">
              Évolution des objectifs
            </h3>
            <div className="flex flex-col md:flex-row items-center justify-center md:justify-between">
              {(() => {
                // Filtrer les allTransactions du mois en cours
                // Utiliser le mois sélectionné au lieu du mois actuel
                const month = selectedMonth.getMonth();
                const year = selectedMonth.getFullYear();
                
                // Vérifier si une date est dans le mois sélectionné
                const isInSelectedMonth = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                
                // Sélectionner les 3 principales catégories avec budget
                const topCategories = categories
                  .filter(c => c.type === 'EXPENSE')
                  .map(c => {
                    const budget = budgets.find(b => b.categoryId === c.id);
                    if (!budget) return null;
                    
                    // Calculer le montant dépensé ce mois-ci
                    const spent = allTransactions
                      .filter(t => t.categoryId === c.id)
                      .filter(t => {
                        const dt = new Date(t.date);
                        return !isNaN(dt.getTime()) && isInSelectedMonth(dt);
                      })
                      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
                    
                    // Calculer le budget mensuel équivalent
                    let monthlyBudget = budget.amount;
                    switch (budget.period) {
                      case 'WEEKLY':
                        monthlyBudget *= 4.345; // ~52.14/12
                        break;
                      case 'QUARTERLY':
                        monthlyBudget /= 3;
                        break;
                      case 'YEARLY':
                        monthlyBudget /= 12;
                        break;
                    }
                    
                    return {
                      id: c.id,
                      name: c.name,
                      color: c.color,
                      spent,
                      budget: monthlyBudget,
                      progress: monthlyBudget > 0 ? Math.min(spent / monthlyBudget, 1) : 0
                    };
                  })
                  .filter(Boolean)
                  .sort((a, b) => (b?.budget || 0) - (a?.budget || 0))
                  .slice(0, 3);
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                    {topCategories.map((cat, idx) => (
                      <div key={idx} className="flex flex-col items-center">
                        <div className="relative h-36 w-36 mb-3">
                          {/* Cercle de fond */}
                          <div className="absolute inset-0 rounded-full border-8 border-gray-700"></div>
                          {/* Cercle de progression */}
                          <div 
                            className="absolute inset-0 rounded-full border-8" 
                            style={{ 
                              borderColor: cat?.color || '#6226fa',
                              clipPath: `polygon(50% 50%, 50% 0%, ${cat && cat.progress >= 0.125 ? '100%' : '50%'} 0%, ${cat && cat.progress >= 0.375 ? '100%' : '50%'} ${cat && cat.progress >= 0.25 ? '100%' : '50%'}, ${cat && cat.progress >= 0.625 ? '100%' : '50%'} ${cat && cat.progress >= 0.5 ? '100%' : '50%'}, ${cat && cat.progress >= 0.875 ? '100%' : '50%'} ${cat && cat.progress >= 0.75 ? '100%' : '50%'}, 50% ${cat && cat.progress >= 1 ? '100%' : '50%'})`
                            }}
                          ></div>
                          <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-2xl font-bold text-white">{cat ? Math.round(cat.progress * 100) : 0}%</span>
                            <span className="text-xs text-gray-400 mt-1 text-center px-2 truncate max-w-full">{cat?.name || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-medium text-white">{cat ? formatCurrency(cat.spent) : '0 €'}</div>
                          <div className="text-xs text-gray-400">sur {cat ? formatCurrency(cat.budget) : '0 €'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Projections and Goals + Revenue by Period */}
        <div className="space-y-6">
          {/* Chart 1: Projections and Goals */}
          <div className="shadow rounded-2xl" style={{ backgroundColor: '#272a2f' }}>
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

          {/* Objectifs - Circle Charts */}
          <div className="shadow rounded-2xl" style={{ backgroundColor: '#272a2f' }}>
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-sm font-medium text-gray-300 mb-4">
                Évolution des objectifs
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {objectives.slice(0, 3).map((objective) => {
                  const percentage = objectiveProgress[objective.id] || 0;
                  const clipPath = getClipPathForPercentage(percentage);
                  
                  return (
                    <div key={objective.id} className="flex flex-col items-center">
                      <div className="relative h-32 w-32 mb-2">
                        {/* Cercle de fond */}
                        <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                        {/* Cercle de progression */}
                        <div 
                          className="absolute inset-0 rounded-full border-4" 
                          style={{ 
                            borderColor: '#6226fa',
                            clipPath: clipPath
                          }}
                        ></div>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <span className="text-xl font-bold text-white">{Math.round(percentage)}%</span>
                          <span className="text-xs text-gray-400 truncate max-w-full px-2 text-center">{objective.title}</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium text-white">{formatCurrency(objective.targetAmount * percentage / 100)}</div>
                        <div className="text-xs text-gray-400">sur {formatCurrency(objective.targetAmount)}</div>
                      </div>
                    </div>
                  );
                })}
                
                {objectives.length === 0 && (
                  <div className="col-span-3 flex flex-col items-center justify-center py-8">
                    <TrophyIcon className="h-12 w-12 text-gray-500 mb-2" />
                    <p className="text-gray-400 text-center">Aucun objectif trouvé</p>
                  </div>
                )}
                
                {objectives.length > 0 && objectives.length < 3 && Array.from({ length: 3 - objectives.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="flex flex-col items-center">
                    <div className="relative h-32 w-32 mb-2">
                      <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                      <div className="absolute inset-0 flex items-center justify-center flex-col">
                        <TrophyIcon className="h-8 w-8 text-gray-600" />
                        <span className="text-xs text-gray-500 mt-1">Nouvel objectif</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart 2: Catégories du mois */}
        <div className="shadow rounded-2xl" style={{ backgroundColor: '#272a2f' }}>
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-300">
                Catégories du mois
              </h3>
              <div className="bg-violet-500 p-1 rounded">
                <ChartBarIcon className="h-3 w-3 text-white" />
              </div>
            </div>
            <div className="h-80 flex items-center justify-center pt-4">
              {(() => {
                // Filtrer les allTransactions du mois en cours
                // Utiliser le mois sélectionné au lieu du mois actuel
                const month = selectedMonth.getMonth();
                const year = selectedMonth.getFullYear();
                
                // Vérifier si une date est dans le mois sélectionné
                const isInSelectedMonth = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                
                // Fonction utilitaire: budget mensuel équivalent selon la période
                const getMonthlyBudget = (categoryId: string) => {
                  const b = budgets.find(bu => bu.categoryId === categoryId);
                  if (!b) return null;
                  switch (b.period) {
                    case 'MONTHLY':
                      return b.amount;
                    case 'WEEKLY':
                      return b.amount * 4.345; // ~52.14/12
                    case 'QUARTERLY':
                      return b.amount / 3;
                    case 'YEARLY':
                      return b.amount / 12;
                    default:
                      return b.amount;
                  }
                };
                
                // Catégories de dépenses uniquement; calculer budget mensuel et dépenses du mois
                const data = categories
                  .filter(c => c.type === 'EXPENSE')
                  .map(c => {
                    const monthlySpending = allTransactions
                      .filter(t => t.categoryId === c.id)
                      .filter(t => {
                        const dt = new Date(t.date);
                        return !isNaN(dt.getTime()) && isInSelectedMonth(dt);
                      })
                      .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount) || 0), 0);
                    
                    const monthlyBudget = getMonthlyBudget(c.id);
                    return { label: c.name, color: c.color, spending: monthlySpending, budget: monthlyBudget ?? 0 };
                  })
                  .filter(d => (d.budget ?? 0) > 0);
                
                const totalBudget = data.reduce((sum: number, d) => sum + d.budget, 0);
                
                if (totalBudget <= 0) {
                  return (
                    <div className="text-sm text-gray-300 text-center">Aucune donnée disponible.</div>
                  );
                }
                
                const size = 340;
                const radius = 140;
                let angleOffset = 0; // in radians
                
                // Ordonner par budget décroissant pour lisibilité
                const sorted = [...data].sort((a, b) => b.budget - a.budget);
                
                // Helpers to draw sector paths
                const polar = (r: number, a: number) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
                const sectorPath = (rOuter: number, rInner: number, a0: number, a1: number) => {
                  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
                  const p0 = polar(rOuter, a0);
                  const p1 = polar(rOuter, a1);
                  if (rInner <= 0) {
                    // Wedge from center
                    return `M 0 0 L ${p0.x} ${p0.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p1.x} ${p1.y} Z`;
                  }
                  const q0 = polar(rInner, a0);
                  const q1 = polar(rInner, a1);
                  return `M ${p0.x} ${p0.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p1.x} ${p1.y} L ${q1.x} ${q1.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${q0.x} ${q0.y} Z`;
                };
                
                return (
                  <svg width={size} height={size}>
                    <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
                      {sorted.map((d, idx) => {
                        const sliceAngle = (d.budget / totalBudget) * 2 * Math.PI;
                        const start = angleOffset;
                        const end = angleOffset + sliceAngle;
                        angleOffset = end;
                        
                        const ratio = d.budget > 0 ? Math.min(d.spending / d.budget, 1) : 0;
                        const fillOuter = radius * ratio;
                        
                        return (
                          <g key={idx}>
                            {/* Fond (budget total) */}
                            <path d={sectorPath(radius, 0, start, end)} fill={d.color} fillOpacity={0.25} />
                            {/* Remplissage radial (dépenses) */}
                            {ratio > 0 && (
                              <path d={sectorPath(fillOuter, 0, start, end)} fill={d.color} />
                            )}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                );
              })()}
            </div>
            {/* Légende des catégories */}
            <div className="mt-10 grid grid-cols-2 gap-2 max-w-xs mx-auto">
              {(() => {
                // Filtrer les allTransactions du mois en cours
                // Utiliser le mois sélectionné au lieu du mois actuel
                const month = selectedMonth.getMonth();
                const year = selectedMonth.getFullYear();
                
                // Vérifier si une date est dans le mois sélectionné
                const isInSelectedMonth = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                
                // Fonction utilitaire: budget mensuel équivalent selon la période
                const getMonthlyBudget = (categoryId: string) => {
                  const b = budgets.find(bu => bu.categoryId === categoryId);
                  if (!b) return null;
                  switch (b.period) {
                    case 'MONTHLY':
                      return b.amount;
                    case 'WEEKLY':
                      return b.amount * 4.345; // ~52.14/12
                    case 'QUARTERLY':
                      return b.amount / 3;
                    case 'YEARLY':
                      return b.amount / 12;
                    default:
                      return b.amount;
                  }
                };
                
                // Catégories de dépenses uniquement; calculer budget mensuel et dépenses du mois
                const data = categories
                  .filter(c => c.type === 'EXPENSE')
                  .map(c => {
                    const monthlySpending = allTransactions
                      .filter(t => t.categoryId === c.id)
                      .filter(t => {
                        const dt = new Date(t.date);
                        return !isNaN(dt.getTime()) && isInSelectedMonth(dt);
                      })
                      .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount) || 0), 0);
                    
                    const monthlyBudget = getMonthlyBudget(c.id);
                    return { label: c.name, color: c.color, spending: monthlySpending, budget: monthlyBudget ?? 0 };
                  })
                  .filter(d => (d.budget ?? 0) > 0);
                
                // Ordonner par budget décroissant pour lisibilité
                const sorted = [...data].sort((a, b) => b.budget - a.budget);
                
                return sorted.slice(0, 4).map((d, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center min-w-0">
                      <span className="inline-block w-2 h-2 rounded-sm mr-1 flex-shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-xs text-gray-200 truncate">{d.label}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatCurrency(d.spending)}
                      <span className="text-xs text-gray-500 ml-1">
                        ({((d.budget ? d.spending / d.budget : 0) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Recent Transactions - Moved to bottom */}
      <div className="shadow rounded-2xl mt-6" style={{ backgroundColor: '#272a2f' }}>
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-white mb-4">
            Transactions récentes
          </h3>
          {allTransactions.slice(0, 5).length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              Aucune transaction récente
            </p>
          ) : (
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-700">
                {allTransactions
                .filter(transaction => {
                  const transactionDate = new Date(transaction.date);
                  return transactionDate.getMonth() === selectedMonth.getMonth() && 
                         transactionDate.getFullYear() === selectedMonth.getFullYear();
                })
                .slice(0, 5)
                .map((transaction) => (
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
