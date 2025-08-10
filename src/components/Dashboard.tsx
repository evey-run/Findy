import { useEffect, useState } from 'react';
import { useAppStore } from '../store/index';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
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
    allTransactions,
    loadAllTransactions,
    categories,
    budgets,
    isLoading,
    setDateRange,
  } = useAppStore();
  
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [objectiveProgress, setObjectiveProgress] = useState<{ [key: string]: number }>({});
  
  // Types de périodes disponibles
  type PeriodType = 'week' | 'month' | 'year';
  
  // État pour le type de période sélectionné
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  
  // État pour la date sélectionnée (peut être une semaine, un mois ou une année)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Alias pour la compatibilité avec le code existant
  const selectedMonth = selectedDate;
  
  // État pour stocker les données du mois précédent
  const [previousMonthData, setPreviousMonthData] = useState<{
    currentMonthIncome: number;
    currentMonthExpense: number;
    savingsTotal: number;
    investmentMonthTotal: number;
  }>({ 
    currentMonthIncome: 0, 
    currentMonthExpense: 0, 
    savingsTotal: 0, 
    investmentMonthTotal: 0 
  });
  
  // Fonction pour obtenir le nom de la période
  const getPeriodName = (date: Date, type: PeriodType): string => {
    switch (type) {
      case 'week':
        // Obtenir le lundi de la semaine
        const startOfWeek = new Date(date);
        const dayOfWeek = startOfWeek.getDay() || 7; // 0 = dimanche, 1-6 = lundi-samedi
        startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek + 1); // Aller au lundi
        
        // Obtenir le dimanche de la semaine
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        
        // Format: "10-16 janvier 2025"
        return `${startOfWeek.getDate()}-${endOfWeek.getDate()} ${startOfWeek.toLocaleString('fr-FR', { month: 'long' })} ${startOfWeek.getFullYear()}`;
        
      case 'month':
        // Format: "janvier 2025"
        return date.toLocaleString('fr-FR', { month: 'long' }) + ' ' + date.getFullYear();
        
      case 'year':
        // Format: "2025"
        return date.getFullYear().toString();
        
      default:
        return date.toLocaleString('fr-FR', { month: 'long' }) + ' ' + date.getFullYear();
    }
  };
  
  // Fonctions pour naviguer entre les périodes
  const goToPrevious = () => {
    setSelectedDate(prevDate => {
      const newDate = new Date(prevDate);
      
      switch (periodType) {
        case 'week':
          // Reculer d'une semaine
          newDate.setDate(newDate.getDate() - 7);
          break;
        case 'month':
          // Reculer d'un mois
          newDate.setMonth(newDate.getMonth() - 1);
          break;
        case 'year':
          // Reculer d'une année
          newDate.setFullYear(newDate.getFullYear() - 1);
          break;
      }
      
      return newDate;
    });
  };
  
  const goToNext = () => {
    setSelectedDate(prevDate => {
      const newDate = new Date(prevDate);
      
      switch (periodType) {
        case 'week':
          // Avancer d'une semaine
          newDate.setDate(newDate.getDate() + 7);
          break;
        case 'month':
          // Avancer d'un mois
          newDate.setMonth(newDate.getMonth() + 1);
          break;
        case 'year':
          // Avancer d'une année
          newDate.setFullYear(newDate.getFullYear() + 1);
          break;
      }
      
      // Vérifier si la nouvelle date est dans le futur
      const currentDate = new Date();
      if (newDate > currentDate) {
        // Si c'est dans le futur, rester à la date actuelle
        return prevDate;
      }
      
      return newDate;
    });
  };
  
  // Fonction pour changer le type de période
  const changePeriodType = (type: PeriodType) => {
    setPeriodType(type);
  };

  useEffect(() => {
    // Déterminer la plage de dates en fonction du type de période sélectionné
    let startDate: Date;
    let endDate: Date;
    let previousStartDate: Date;
    let previousEndDate: Date;
    
    switch (periodType) {
      case 'week':
        // Début de la semaine (lundi)
        startDate = new Date(selectedDate);
        const dayOfWeek = startDate.getDay() || 7; // 0 = dimanche, 1-6 = lundi-samedi, convert 0 to 7
        startDate.setDate(startDate.getDate() - dayOfWeek + 1); // Aller au lundi
        
        // Fin de la semaine (dimanche)
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        
        // Semaine précédente
        previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 7);
        previousEndDate = new Date(endDate);
        previousEndDate.setDate(previousEndDate.getDate() - 7);
        break;
        
      case 'month':
        // Début et fin du mois
        startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        endDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
        
        // Mois précédent
        previousStartDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
        previousEndDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 0);
        break;
        
      case 'year':
        // Début et fin de l'année
        startDate = new Date(selectedDate.getFullYear(), 0, 1);
        endDate = new Date(selectedDate.getFullYear(), 11, 31);
        
        // Année précédente
        previousStartDate = new Date(selectedDate.getFullYear() - 1, 0, 1);
        previousEndDate = new Date(selectedDate.getFullYear() - 1, 11, 31);
        break;
    }
    
    // Mettre à jour la plage de dates dans le store
    setDateRange({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    
    // Charger les données du tableau de bord et des transactions
    loadDashboardOverview();
    loadAllTransactions({ forceIgnoreSelectedBank: true });
    
    // Charger les objectifs
    loadObjectives();
    
    // Charger les données de la période précédente pour calculer les tendances
    const fetchPreviousPeriodData = async () => {
      try {
        // Construire les paramètres de requête
        const params = new URLSearchParams();
        params.append('startDate', previousStartDate.toISOString());
        params.append('endDate', previousEndDate.toISOString());
        
        // Faire la requête API
        const response = await fetch(`/api/dashboard/overview?${params}`);
        const data = await response.json();
        
        // Mettre à jour l'état avec les données de la période précédente
        setPreviousMonthData({
          currentMonthIncome: data.summary.currentMonthIncome || 0,
          currentMonthExpense: data.summary.currentMonthExpense || 0,
          savingsTotal: data.summary.savingsTotal || 0,
          investmentMonthTotal: data.summary.investmentMonthTotal || 0
        });
      } catch (error) {
        console.error('Erreur lors de la récupération des données de la période précédente:', error);
      }
    };
    
    fetchPreviousPeriodData();
  }, [loadDashboardOverview, loadAllTransactions, selectedUser, selectedDate, periodType, setDateRange]);
  
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

  // Fonction pour calculer la tendance par rapport au mois précédent
  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return { isUp: true, percentage: 100 };
    if (current === previous) return { isUp: true, percentage: 0 };
    
    const diff = current - previous;
    const percentage = Math.abs(Math.round((diff / previous) * 100));
    
    return {
      isUp: diff > 0,
      percentage
    };
  };

  // Statistiques pour les cartes du haut
  const topStats = [
    {
      name: 'Revenus',
      value: formatCurrency(dashboardData.summary.currentMonthIncome || 0),
      icon: ArrowTrendingUpIcon,
      color: 'text-green-400',
      bgColor: 'bg-green-900 bg-opacity-50',
      description: 'Comptes courants',
      action: <ArrowTrendingUpIcon className="h-4 w-4 text-green-400" />,
      trend: calculateTrend(
        dashboardData.summary.currentMonthIncome || 0,
        previousMonthData.currentMonthIncome
      )
    },
    {
      name: 'Dépenses',
      value: formatCurrency(dashboardData.summary.currentMonthExpense || 0),
      icon: ShoppingCartIcon,
      color: 'text-red-400',
      bgColor: 'bg-red-900 bg-opacity-50',
      description: 'Comptes courants',
      action: <ShoppingCartIcon className="h-4 w-4 text-red-400" />,
      trend: calculateTrend(
        dashboardData.summary.currentMonthExpense || 0,
        previousMonthData.currentMonthExpense
      )
    },
    {
      name: 'Économies',
      value: formatCurrency(dashboardData.summary.savingsTotal || 0),
      icon: UsersIcon,
      color: 'text-violet-400',
      bgColor: 'bg-violet-900 bg-opacity-50',
      description: 'Livrets d\'épargne',
      action: <UsersIcon className="h-4 w-4 text-violet-400" />,
      trend: calculateTrend(
        dashboardData.summary.savingsTotal || 0,
        previousMonthData.savingsTotal
      )
    },
    {
      name: 'Investissements',
      value: formatCurrency(dashboardData.summary.investmentMonthTotal || 0),
      icon: ChartBarIcon,
      color: 'text-blue-400',
      bgColor: 'bg-blue-900 bg-opacity-50',
      description: 'Dépenses du mois',
      action: <ChartBarIcon className="h-4 w-4 text-blue-400" />,
      trend: calculateTrend(
        dashboardData.summary.investmentMonthTotal || 0,
        previousMonthData.investmentMonthTotal
      )
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
        
        {/* Navigation et sélecteur de période */}
        <div className="flex items-center space-x-4 mt-4 md:mt-0">
          {/* Navigation par période */}
          <div className="flex items-center space-x-2 rounded-xl px-4 py-2">
            <button 
              onClick={goToPrevious}
              className="text-white hover:text-violet-400 focus:outline-none"
              aria-label="Période précédente"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <span className="text-white font-medium capitalize px-2">
              {getPeriodName(selectedDate, periodType)}
            </span>
            <button 
              onClick={goToNext}
              className="text-white hover:text-violet-400 focus:outline-none"
              aria-label="Période suivante"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
          
          {/* Sélecteur de période */}
          <div className="flex items-center rounded-xl px-4 py-2">
            <button 
              onClick={() => changePeriodType('week')}
              className={`text-sm px-2 py-1 rounded ${periodType === 'week' ? 'bg-violet-700 text-white' : 'text-gray-300 hover:text-white'}`}
            >
              Semaine
            </button>
            <button 
              onClick={() => changePeriodType('month')}
              className={`text-sm px-2 py-1 rounded mx-1 ${periodType === 'month' ? 'bg-violet-700 text-white' : 'text-gray-300 hover:text-white'}`}
            >
              Mois
            </button>
            <button 
              onClick={() => changePeriodType('year')}
              className={`text-sm px-2 py-1 rounded ${periodType === 'year' ? 'bg-violet-700 text-white' : 'text-gray-300 hover:text-white'}`}
            >
              Année
            </button>
          </div>
        </div>
      </div>

      {/* Top Grid: Stats Cards (2x2) and Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Stats Cards - Left Side (2x2 grid) - Now smaller (2 columns out of 5) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {topStats.map((stat) => (
            <div
              key={stat.name}
              className="relative p-4 shadow rounded-2xl overflow-hidden flex flex-col"
              style={{ backgroundColor: '#272a2f' }}
            >
              <div className="flex flex-col items-center">
                <p className="text-sm font-medium text-gray-400 mb-2 text-center">
                  {stat.name}
                </p>
                <p className="text-2xl font-bold text-white text-center mb-2">
                  {stat.value}
                </p>
                <div className="flex items-center justify-center mt-1">
                  {stat.trend.percentage > 0 ? (
                    <div className={`flex items-center ${stat.name === 'Dépenses du mois' 
                      ? (stat.trend.isUp ? 'text-red-400' : 'text-green-400') 
                      : (stat.trend.isUp ? 'text-green-400' : 'text-red-400')}`}>
                      {stat.trend.isUp ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                      ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                      )}
                      <span className="text-xs">
                        {stat.trend.percentage}% {stat.trend.isUp ? 'hausse' : 'baisse'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">Stable</span>
                  )}
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
                
                // Déterminer la période de filtrage en fonction du type de période sélectionné
                let isInSelectedPeriod: (d: Date) => boolean;
                let startDate: Date = new Date();
                let endDate: Date = new Date();
                
                switch (periodType) {
                  case 'week':
                    // Début de la semaine (lundi)
                    startDate = new Date(selectedDate);
                    const dayOfWeek = startDate.getDay() || 7; // 0 = dimanche, 1-6 = lundi-samedi
                    startDate.setDate(startDate.getDate() - dayOfWeek + 1); // Aller au lundi
                    
                    // Fin de la semaine (dimanche)
                    endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 6);
                    
                    isInSelectedPeriod = (d: Date) => d >= startDate && d <= endDate;
                    break;
                    
                  case 'month':
                    // Vérifier si une date est dans le mois sélectionné
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                    break;
                    
                  case 'year':
                    // Vérifier si une date est dans l'année sélectionnée
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year;
                    break;
                    
                  default:
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                }
                
                // Sélectionner les 3 principales catégories avec budget
                const topCategories = categories
                  .filter(c => c.type === 'EXPENSE')
                  .map(c => {
                    const budget = budgets.find(b => b.categoryId === c.id);
                    if (!budget) return null;
                    
                    // Calculer le montant dépensé pour la période sélectionnée
                    const spent = allTransactions
                      .filter(t => t.categoryId === c.id)
                      .filter(t => {
                        const dt = new Date(t.date);
                        return !isNaN(dt.getTime()) && isInSelectedPeriod(dt);
                      })
                      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
                    
                    // Calculer le budget équivalent pour la période sélectionnée
                    let periodBudget = budget.amount;
                    
                    // Convertir le budget selon la période du budget et la période sélectionnée
                    if (periodType === 'week') {
                      // Convertir en budget hebdomadaire
                      switch (budget.period) {
                        case 'WEEKLY':
                          // Déjà hebdomadaire
                          break;
                        case 'MONTHLY':
                          periodBudget /= 4.345; // ~12/52.14
                          break;
                        case 'QUARTERLY':
                          periodBudget /= 13.035; // ~4.345*3
                          break;
                        case 'YEARLY':
                          periodBudget /= 52.14;
                          break;
                      }
                    } else if (periodType === 'month') {
                      // Convertir en budget mensuel
                      switch (budget.period) {
                        case 'WEEKLY':
                          periodBudget *= 4.345; // ~52.14/12
                          break;
                        case 'MONTHLY':
                          // Déjà mensuel
                          break;
                        case 'QUARTERLY':
                          periodBudget /= 3;
                          break;
                        case 'YEARLY':
                          periodBudget /= 12;
                          break;
                      }
                    } else if (periodType === 'year') {
                      // Convertir en budget annuel
                      switch (budget.period) {
                        case 'WEEKLY':
                          periodBudget *= 52.14;
                          break;
                        case 'MONTHLY':
                          periodBudget *= 12;
                          break;
                        case 'QUARTERLY':
                          periodBudget *= 4;
                          break;
                        case 'YEARLY':
                          // Déjà annuel
                          break;
                      }
                    }
                    
                    return {
                      id: c.id,
                      name: c.name,
                      color: c.color,
                      spent,
                      budget: periodBudget,
                      progress: periodBudget > 0 ? Math.min(spent / periodBudget, 1) : 0
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
                Catégories
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
                // Déterminer la période de filtrage en fonction du type de période sélectionné
                let isInSelectedPeriod: (d: Date) => boolean;
                
                switch (periodType) {
                  case 'week':
                    // Début de la semaine (lundi)
                    const startDate = new Date(selectedDate);
                    const dayOfWeek = startDate.getDay() || 7; // 0 = dimanche, 1-6 = lundi-samedi
                    startDate.setDate(startDate.getDate() - dayOfWeek + 1); // Aller au lundi
                    
                    // Fin de la semaine (dimanche)
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 6);
                    
                    isInSelectedPeriod = (d: Date) => d >= startDate && d <= endDate;
                    break;
                    
                  case 'month':
                    // Vérifier si une date est dans le mois sélectionné
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                    break;
                    
                  case 'year':
                    // Vérifier si une date est dans l'année sélectionnée
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year;
                    break;
                    
                  default:
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                }
                
                // Fonction utilitaire: budget adapté à la période sélectionnée
                const getMonthlyBudget = (categoryId: string) => {
                  const b = budgets.find(bu => bu.categoryId === categoryId);
                  if (!b) return null;
                  
                  let periodBudget = b.amount;
                  
                  // Convertir le budget selon la période du budget et la période sélectionnée
                  if (periodType === 'week') {
                    // Convertir en budget hebdomadaire
                    switch (b.period) {
                      case 'WEEKLY':
                        // Déjà hebdomadaire
                        break;
                      case 'MONTHLY':
                        periodBudget /= 4.345; // ~12/52.14
                        break;
                      case 'QUARTERLY':
                        periodBudget /= 13.035; // ~4.345*3
                        break;
                      case 'YEARLY':
                        periodBudget /= 52.14;
                        break;
                    }
                  } else if (periodType === 'month') {
                    // Convertir en budget mensuel
                    switch (b.period) {
                      case 'WEEKLY':
                        periodBudget *= 4.345; // ~52.14/12
                        break;
                      case 'MONTHLY':
                        // Déjà mensuel
                        break;
                      case 'QUARTERLY':
                        periodBudget /= 3;
                        break;
                      case 'YEARLY':
                        periodBudget /= 12;
                        break;
                    }
                  } else if (periodType === 'year') {
                    // Convertir en budget annuel
                    switch (b.period) {
                      case 'WEEKLY':
                        periodBudget *= 52.14;
                        break;
                      case 'MONTHLY':
                        periodBudget *= 12;
                        break;
                      case 'QUARTERLY':
                        periodBudget *= 4;
                        break;
                      case 'YEARLY':
                        // Déjà annuel
                        break;
                    }
                  }
                  
                  return periodBudget;
                };
                
                // Catégories de dépenses uniquement; calculer budget mensuel et dépenses du mois
                const data = categories
                  .filter(c => c.type === 'EXPENSE')
                  .map(c => {
                    const monthlySpending = allTransactions
                      .filter(t => t.categoryId === c.id)
                      .filter(t => {
                        const dt = new Date(t.date);
                        return !isNaN(dt.getTime()) && isInSelectedPeriod(dt);
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
                // Déterminer la période de filtrage en fonction du type de période sélectionné
                let isInSelectedPeriod: (d: Date) => boolean;
                
                switch (periodType) {
                  case 'week':
                    // Début de la semaine (lundi)
                    const startDate = new Date(selectedDate);
                    const dayOfWeek = startDate.getDay() || 7; // 0 = dimanche, 1-6 = lundi-samedi
                    startDate.setDate(startDate.getDate() - dayOfWeek + 1); // Aller au lundi
                    
                    // Fin de la semaine (dimanche)
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 6);
                    
                    isInSelectedPeriod = (d: Date) => d >= startDate && d <= endDate;
                    break;
                    
                  case 'month':
                    // Vérifier si une date est dans le mois sélectionné
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                    break;
                    
                  case 'year':
                    // Vérifier si une date est dans l'année sélectionnée
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year;
                    break;
                    
                  default:
                    isInSelectedPeriod = (d: Date) => d.getFullYear() === year && d.getMonth() === month;
                }
                
                // Fonction utilitaire: budget adapté à la période sélectionnée
                const getMonthlyBudget = (categoryId: string) => {
                  const b = budgets.find(bu => bu.categoryId === categoryId);
                  if (!b) return null;
                  
                  let periodBudget = b.amount;
                  
                  // Convertir le budget selon la période du budget et la période sélectionnée
                  if (periodType === 'week') {
                    // Convertir en budget hebdomadaire
                    switch (b.period) {
                      case 'WEEKLY':
                        // Déjà hebdomadaire
                        break;
                      case 'MONTHLY':
                        periodBudget /= 4.345; // ~12/52.14
                        break;
                      case 'QUARTERLY':
                        periodBudget /= 13.035; // ~4.345*3
                        break;
                      case 'YEARLY':
                        periodBudget /= 52.14;
                        break;
                    }
                  } else if (periodType === 'month') {
                    // Convertir en budget mensuel
                    switch (b.period) {
                      case 'WEEKLY':
                        periodBudget *= 4.345; // ~52.14/12
                        break;
                      case 'MONTHLY':
                        // Déjà mensuel
                        break;
                      case 'QUARTERLY':
                        periodBudget /= 3;
                        break;
                      case 'YEARLY':
                        periodBudget /= 12;
                        break;
                    }
                  } else if (periodType === 'year') {
                    // Convertir en budget annuel
                    switch (b.period) {
                      case 'WEEKLY':
                        periodBudget *= 52.14;
                        break;
                      case 'MONTHLY':
                        periodBudget *= 12;
                        break;
                      case 'QUARTERLY':
                        periodBudget *= 4;
                        break;
                      case 'YEARLY':
                        // Déjà annuel
                        break;
                    }
                  }
                  
                  return periodBudget;
                };
                
                // Catégories de dépenses uniquement; calculer budget mensuel et dépenses du mois
                const data = categories
                  .filter(c => c.type === 'EXPENSE')
                  .map(c => {
                    const monthlySpending = allTransactions
                      .filter(t => t.categoryId === c.id)
                      .filter(t => {
                        const dt = new Date(t.date);
                        return !isNaN(dt.getTime()) && isInSelectedPeriod(dt);
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
