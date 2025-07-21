import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Category, Budget } from '../types';
import { 
  ChartBarIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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

interface EditingCategory {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'FIXED';
  color: string;
  icon?: string;
  budget?: {
    amount: string;
    period: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    startDate: string;
  };
}

interface BudgetSpending {
  budget: Budget;
  totalSpent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
  periodStart: string;
  periodEnd: string;
}

export default function Categories() {
  const { 
    categories, 
    budgets,
    transactions,
    loadCategories, 
    loadBudgets,
    loadTransactions,
    loadUsers,
    addCategory, 
    updateCategory, 
    removeCategory,
    addBudget,
    updateBudget,
    removeBudget 
  } = useAppStore();
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [budgetSpending, setBudgetSpending] = useState<{ [key: string]: BudgetSpending }>({});
  
  // Couleurs prédéfinies
  const predefinedColors = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#64748b', '#6b7280', '#374151'
  ];
  
  // Types de catégories
  const categoryTypes = [
    { value: 'INCOME', label: 'Revenus', color: '#10b981' },
    { value: 'EXPENSE', label: 'Dépenses', color: '#ef4444' },
    { value: 'FIXED', label: 'Fixe', color: '#6b7280' }
  ];

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        await loadCategories();
        // Charger tous les budgets, indépendamment de la banque sélectionnée
        await loadBudgets(true);
        await loadTransactions();
        await loadUsers();
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, [loadCategories, loadBudgets, loadTransactions, loadUsers]);

  // Calcul des dépenses pour chaque budget
  const calculateBudgetSpending = () => {
    console.log('📊 Calculating budget spending...');
    console.log('📊 Budgets:', budgets.length);
    console.log('📊 Transactions:', transactions.length);
    
    const spending: { [key: string]: BudgetSpending } = {};
    
    for (const budget of budgets) {
      console.log(`📊 Processing budget for category ${budget.categoryId}`);
      
      // Calculer les dates de début et fin de période
      const startDate = new Date(budget.startDate);
      let endDate = new Date(startDate);
      
      switch (budget.period) {
        case 'WEEKLY':
          endDate.setDate(endDate.getDate() + 7);
          break;
        case 'MONTHLY':
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case 'QUARTERLY':
          endDate.setMonth(endDate.getMonth() + 3);
          break;
        case 'YEARLY':
          endDate.setFullYear(endDate.getFullYear() + 1);
          break;
      }
      
      console.log(`📊 Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Filtrer les transactions pour ce budget
      const relevantTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.date);
        const isInCategory = t.categoryId === budget.categoryId;
        const isExpense = t.amount < 0; // Seulement les dépenses
        const isInDateRange = transactionDate >= startDate && transactionDate <= endDate;
        const isInBank = !budget.bankId || t.bankId === budget.bankId;
        
        return isInCategory && isExpense && isInDateRange && isInBank;
      });
      
      console.log(`📊 Found ${relevantTransactions.length} relevant transactions`);
      
      const totalSpent = Math.abs(relevantTransactions.reduce((sum, t) => sum + t.amount, 0));
      const remaining = Math.max(0, budget.amount - totalSpent);
      const percentage = budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0;
      
      console.log(`📊 Budget ${budget.id}: spent ${totalSpent}, remaining ${remaining}, percentage ${percentage}%`);
      
      spending[budget.id] = {
        budget,
        totalSpent,
        remaining,
        percentage: percentage, // Suppression du Math.min pour permettre >100%
        isOverBudget: totalSpent > budget.amount,
        periodStart: startDate.toISOString().split('T')[0],
        periodEnd: endDate.toISOString().split('T')[0]
      };
    }
    
    console.log('📊 Final spending object:', spending);
    setBudgetSpending(spending);
  };

  // Effet pour recalculer les budgets - ajout des dépendances manquantes
  useEffect(() => {
    console.log('📊 Effect triggered - budgets:', budgets.length, 'transactions:', transactions.length);
    if (budgets.length > 0 && transactions.length >= 0) { // Permet les calculs même avec 0 transaction
      calculateBudgetSpending();
    }
  }, [budgets, transactions, categories]); // Ajout de categories pour recalculer si nécessaire

  // Force le recalcul périodique pour s'assurer que les données sont à jour
  useEffect(() => {
    const interval = setInterval(() => {
      if (budgets.length > 0) {
        console.log('📊 Periodic recalculation of budget spending');
        calculateBudgetSpending();
      }
    }, 5000); // Recalcule toutes les 5 secondes

    return () => clearInterval(interval);
  }, [budgets, transactions]);

  // Fonction pour obtenir le budget d'une catégorie
  const getCategoryBudget = (categoryId: string) => {
    return budgets.find(budget => budget.categoryId === categoryId);
  };

  // Fonction pour obtenir les dépenses d'une catégorie
  const getCategorySpending = (categoryId: string) => {
    const budget = getCategoryBudget(categoryId);
    if (!budget) return null;
    return budgetSpending[budget.id];
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const handleEdit = (category: Category) => {
    const categoryBudget = getCategoryBudget(category.id);
    // Fermer le formulaire d'ajout si ouvert
    setShowAddForm(false);
    setEditingId(category.id);
    setEditingCategory({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon,
      budget: categoryBudget ? {
        amount: categoryBudget.amount.toString(),
        period: categoryBudget.period,
        startDate: categoryBudget.startDate.split('T')[0]
      } : {
        amount: '',
        period: 'MONTHLY',
        startDate: new Date().toISOString().split('T')[0]
      }
    });
  };

  const handleSave = async () => {
    if (!editingCategory) return;

    try {
      // Sauvegarder la catégorie
      const categoryResponse = await fetch(`/api/categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingCategory.name,
          type: editingCategory.type,
          color: editingCategory.color,
          icon: editingCategory.icon || null
        }),
      });

      if (categoryResponse.ok) {
        const updatedCategory = await categoryResponse.json();
        updateCategory(editingCategory.id, updatedCategory);

        // Sauvegarder le budget si présent
        if (editingCategory.budget && editingCategory.budget.amount && editingCategory.type === 'EXPENSE') {
          const existingBudget = getCategoryBudget(editingCategory.id);
          const budgetData = {
            amount: parseFloat(editingCategory.budget.amount),
            period: editingCategory.budget.period,
            startDate: editingCategory.budget.startDate,
            shared: false,
            categoryId: editingCategory.id
          };

          if (existingBudget) {
            // Mettre à jour le budget existant
            const budgetResponse = await fetch(`/api/budgets/${existingBudget.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(budgetData)
            });

            if (budgetResponse.ok) {
              const updatedBudget = await budgetResponse.json();
              updateBudget(existingBudget.id, updatedBudget);
            }
          } else {
            // Créer un nouveau budget
            const budgetResponse = await fetch('/api/budgets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(budgetData)
            });

            if (budgetResponse.ok) {
              const newBudget = await budgetResponse.json();
              addBudget(newBudget);
            }
          }
        } else {
          // Supprimer le budget existant si le montant est vide
          const existingBudget = getCategoryBudget(editingCategory.id);
          if (existingBudget) {
            const deleteResponse = await fetch(`/api/budgets/${existingBudget.id}`, {
              method: 'DELETE'
            });

            if (deleteResponse.ok) {
              removeBudget(existingBudget.id);
            }
          }
        }

        setEditingId(null);
        setEditingCategory(null);
        toast.success('Catégorie et budget sauvegardés avec succès');
      }
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingCategory(null);
    setShowAddForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette catégorie et son budget ?')) return;

    try {
      // Supprimer d'abord le budget s'il existe
      const categoryBudget = getCategoryBudget(id);
      if (categoryBudget) {
        await fetch(`/api/budgets/${categoryBudget.id}`, {
          method: 'DELETE'
        });
        removeBudget(categoryBudget.id);
      }

      // Supprimer la catégorie
      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        removeCategory(id);
        toast.success('Catégorie et budget supprimés avec succès');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    try {
      // Créer la catégorie
      const categoryResponse = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingCategory.name,
          type: editingCategory.type,
          color: editingCategory.color,
          icon: editingCategory.icon || null
        }),
      });

      if (categoryResponse.ok) {
        const newCategory = await categoryResponse.json();
        addCategory(newCategory);

        // Créer le budget si présent et c'est une catégorie de dépense
        if (editingCategory.budget && editingCategory.budget.amount && editingCategory.type === 'EXPENSE') {
          const budgetData = {
            amount: parseFloat(editingCategory.budget.amount),
            period: editingCategory.budget.period,
            startDate: editingCategory.budget.startDate,
            shared: false,
            categoryId: newCategory.id
          };

          const budgetResponse = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(budgetData)
          });

          if (budgetResponse.ok) {
            const newBudget = await budgetResponse.json();
            addBudget(newBudget);
          }
        }

        setShowAddForm(false);
        setEditingCategory(null);
        toast.success('Catégorie créée avec succès');
      }
    } catch (error) {
      console.error('Error adding category:', error);
      toast.error('Erreur lors de la création');
    }
  };

  const getTypeLabel = (type: string) => {
    const categoryType = categoryTypes.find(t => t.value === type);
    return categoryType ? categoryType.label : type;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderBottomColor: '#6226fa' }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-screen p-6" style={{ backgroundColor: '#202427' }}>
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
            Catégories & Budgets
          </h2>
          <p className="text-sm text-gray-300 mt-1">
            Gérez vos catégories de transactions et leurs budgets associés
          </p>
        </div>
      </div>

      {/* Categories List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">{categories.map((category) => {
          const categorySpending = getCategorySpending(category.id);
          const categoryBudget = getCategoryBudget(category.id);
          
          return (
            <div key={category.id} className="shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-80" style={{ backgroundColor: '#272a2f' }}>
              {editingId === category.id ? (
                /* Edit Form Card - appears in place of the category being edited */
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex flex-col h-full p-6">
                  <h3 className="text-lg font-medium text-white mb-4">Modifier la catégorie</h3>
                  
                  <div className="space-y-3 flex-1">
                    <input
                      type="text"
                      value={editingCategory?.name || ''}
                      onChange={(e) => setEditingCategory(prev => prev ? {...prev, name: e.target.value} : null)}
                      className="w-full px-3 py-2 border border-gray-600 rounded focus:outline-none focus:ring-1 text-white"
                      style={{ backgroundColor: '#1f2226', borderColor: '#272a2f', '--tw-ring-color': '#6226fa' } as any}
                      placeholder="Nom"
                      required
                    />
                    
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editingCategory?.icon || ''}
                        onChange={(e) => setEditingCategory(prev => prev ? {...prev, icon: e.target.value} : null)}
                        className="w-full px-3 py-2 border border-gray-600 rounded focus:outline-none focus:ring-1 text-white"
                        style={{ backgroundColor: '#1f2226', borderColor: '#272a2f', '--tw-ring-color': '#6226fa' } as any}
                        placeholder="🛒"
                      />
                      
                      <select
                        value={editingCategory?.type || ''}
                        onChange={(e) => setEditingCategory(prev => prev ? {...prev, type: e.target.value as any} : null)}
                        className="w-full px-3 py-2 border border-gray-600 rounded focus:outline-none focus:ring-1 text-white"
                        style={{ backgroundColor: '#1f2226', borderColor: '#272a2f', '--tw-ring-color': '#6226fa' } as any}
                        required
                      >
                        {categoryTypes.map(type => (
                          <option key={type.value} value={type.value} style={{ backgroundColor: '#1f2226' }}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {predefinedColors.slice(0, 16).map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEditingCategory(prev => prev ? {...prev, color} : null)}
                          className={`w-5 h-5 rounded-full border-2 ${
                            editingCategory?.color === color ? 'border-white' : 'border-gray-600'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    {/* Budget section - Only for EXPENSE categories */}
                    {editingCategory?.type === 'EXPENSE' && (
                      <div className="border-t pt-3" style={{ borderColor: '#3a3d42' }}>
                        <p className="text-sm font-medium text-gray-300 mb-2">Budget</p>
                        <input
                          type="number"
                          step="1"
                          value={editingCategory?.budget?.amount || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {
                            ...prev,
                            budget: prev.budget ? {...prev.budget, amount: e.target.value} : {
                              amount: e.target.value,
                              period: 'MONTHLY',
                              startDate: new Date().toISOString().split('T')[0]
                            }
                          } : null)}
                          className="w-full px-3 py-2 border border-gray-600 rounded focus:outline-none focus:ring-1 text-white mb-2"
                          style={{ backgroundColor: '#1f2226', borderColor: '#272a2f', '--tw-ring-color': '#6226fa' } as any}
                          placeholder="Montant (€)"
                        />
                        
                        <select
                          value={editingCategory?.budget?.period || 'MONTHLY'}
                          onChange={(e) => setEditingCategory(prev => prev ? {
                            ...prev,
                            budget: prev.budget ? {...prev.budget, period: e.target.value as any} : {
                              amount: '',
                              period: e.target.value as any,
                              startDate: new Date().toISOString().split('T')[0]
                            }
                          } : null)}
                          className="w-full px-3 py-2 border border-gray-600 rounded focus:outline-none focus:ring-1 text-white"
                          style={{ backgroundColor: '#1f2226', borderColor: '#272a2f', '--tw-ring-color': '#6226fa' } as any}
                        >
                          <option value="MONTHLY" style={{ backgroundColor: '#1f2226' }}>Mensuel</option>
                          <option value="WEEKLY" style={{ backgroundColor: '#1f2226' }}>Hebdo</option>
                          <option value="QUARTERLY" style={{ backgroundColor: '#1f2226' }}>Trimestre</option>
                          <option value="YEARLY" style={{ backgroundColor: '#1f2226' }}>Annuel</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="px-6 py-3 rounded-b-lg" style={{ backgroundColor: '#1f2226' }}>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        Modification
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 text-xs border border-transparent rounded text-white hover:opacity-80"
                          style={{ backgroundColor: '#6227f5' }}
                        >
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              ) : (
                <>
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                          style={{ backgroundColor: category.color }}
                        >
                          {category.icon || category.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <h3 className="text-lg font-medium text-white">{category.name}</h3>
                          <p className="text-sm text-gray-300">
                            {getTypeLabel(category.type)}
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(category)}
                          className="text-gray-500 hover:text-violet-400 transition-colors"
                          title="Modifier"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                          title="Supprimer"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4">
                      {/* Budget progress for EXPENSE categories */}
                      {category.type === 'EXPENSE' && categoryBudget && categorySpending && (
                        <div>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-sm font-medium text-gray-300">
                              Budget {categoryBudget.period === 'MONTHLY' ? 'Mensuel' : 
                             categoryBudget.period === 'WEEKLY' ? 'Hebdomadaire' :
                             categoryBudget.period === 'QUARTERLY' ? 'Trimestriel' : 'Annuel'}
                            </span>
                            <span className={`text-2xl font-bold ${categorySpending.isOverBudget ? 'text-red-400' : 'text-violet-400'}`}>
                              {Math.round(categorySpending.percentage)}%
                            </span>
                          </div>
                          
                          <div className="w-full rounded-full h-3" style={{ backgroundColor: '#1f2226' }}>
                            <div
                              className="h-3 rounded-full transition-all duration-300"
                              style={{ 
                                width: `${Math.min(categorySpending.percentage, 100)}%`,
                                backgroundColor: categorySpending.isOverBudget ? '#ef4444' : '#6226fa'
                              }}
                            />
                          </div>
                          
                          <div className="flex justify-between text-sm text-gray-400 mt-2">
                            <span></span>
                            <span className={categorySpending.isOverBudget ? 'text-red-400' : 'text-gray-400'}>
                              {formatCurrency(categorySpending.totalSpent)}/{formatCurrency(categoryBudget.amount)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* No budget message for EXPENSE categories */}
                      {category.type === 'EXPENSE' && !categoryBudget && (
                        <div className="p-3 rounded-md" style={{ backgroundColor: '#1f2226' }}>
                          <div className="flex items-center justify-center text-gray-400 mb-2">
                            <ChartBarIcon className="h-4 w-4 mr-1" />
                            <span className="text-sm">Pas de budget défini</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-6 py-4" style={{ backgroundColor: '#1f2226' }}>
                    {/* Section des transactions - identique à Banks */}
                    {transactions.filter(t => t.categoryId === category.id).length > 0 ? (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-gray-300">
                            Dernières transactions
                          </p>
                        </div>
                        <div className="space-y-2 mb-4">
                          {transactions
                            .filter(t => t.categoryId === category.id)
                            .slice(0, 3)
                            .map((transaction) => (
                              <div 
                                key={transaction.id} 
                                className="flex justify-between items-center text-sm"
                              >
                                <span className="text-gray-400 truncate flex-1 mr-2">
                                  {transaction.description}
                                </span>
                                <div className="flex items-center space-x-2">
                                  <span className={`font-semibold ${
                                    transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-gray-300">
                            Transactions
                          </p>
                        </div>
                        <div className="text-sm text-gray-400 mb-4">
                          Aucune transaction récente
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Add Category Form Card */}
        {showAddForm ? (
          <div className="shadow rounded-lg border-2 flex flex-col h-80" style={{ backgroundColor: '#272a2f', borderColor: '#6226fa' }}>
            <form onSubmit={handleAddCategory} className="flex flex-col h-full">
              <div className="p-6 flex-1">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-dashed flex-shrink-0 cursor-pointer transition-colors"
                      style={{ borderColor: '#6226fa', backgroundColor: editingCategory?.color || '#6226fa', color: 'white' }}
                      title="Couleur de la catégorie"
                    >
                      <span className="text-lg font-bold">
                        {editingCategory?.icon || editingCategory?.name?.charAt(0).toUpperCase() || '+'}
                      </span>
                    </div>
                    
                    <div className="ml-4 flex-1">
                      <input
                        type="text"
                        value={editingCategory?.name || ''}
                        onChange={(e) => setEditingCategory(prev => prev ? {...prev, name: e.target.value} : null)}
                        className="text-lg font-medium text-white border-none focus:ring-0 p-0 bg-transparent w-full mb-1"
                        placeholder="Nom de la catégorie"
                        required
                      />
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editingCategory?.icon || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, icon: e.target.value} : null)}
                          className="text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent w-16"
                          placeholder="🛒"
                        />
                        
                        <select
                          value={editingCategory?.type || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, type: e.target.value as any} : null)}
                          className="text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent"
                          required
                        >
                          {categoryTypes.map(type => (
                            <option key={type.value} value={type.value} style={{ backgroundColor: '#1f2226' }}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm text-gray-300 mb-2">Couleur</label>
                  <div className="flex flex-wrap gap-1">
                    {predefinedColors.slice(0, 16).map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditingCategory(prev => prev ? {...prev, color} : null)}
                        className={`w-5 h-5 rounded-full border-2 ${
                          editingCategory?.color === color ? 'border-white' : 'border-gray-600'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Budget section - Only for EXPENSE categories */}
                {editingCategory?.type === 'EXPENSE' && (
                  <div className="mt-4">
                    <div className="text-sm text-gray-300 mb-2">
                      Budget (optionnel)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        step="1"
                        value={editingCategory?.budget?.amount || ''}
                        onChange={(e) => setEditingCategory(prev => prev ? {
                          ...prev,
                          budget: prev.budget ? {...prev.budget, amount: e.target.value} : {
                            amount: e.target.value,
                            period: 'MONTHLY',
                            startDate: new Date().toISOString().split('T')[0]
                          }
                        } : null)}
                        className="text-lg font-bold text-white border-none focus:ring-0 p-0 bg-transparent"
                        placeholder="0 €"
                      />
                      
                      <select
                        value={editingCategory?.budget?.period || 'MONTHLY'}
                        onChange={(e) => setEditingCategory(prev => prev ? {
                          ...prev,
                          budget: prev.budget ? {...prev.budget, period: e.target.value as any} : {
                            amount: '',
                            period: e.target.value as any,
                            startDate: new Date().toISOString().split('T')[0]
                          }
                        } : null)}
                        className="text-sm text-gray-300 border-none focus:ring-0 p-0 bg-transparent"
                      >
                        <option value="MONTHLY" style={{ backgroundColor: '#1f2226' }}>Mensuel</option>
                        <option value="WEEKLY" style={{ backgroundColor: '#1f2226' }}>Hebdo</option>
                        <option value="QUARTERLY" style={{ backgroundColor: '#1f2226' }}>Trimestre</option>
                        <option value="YEARLY" style={{ backgroundColor: '#1f2226' }}>Annuel</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="px-6 py-3 rounded-b-lg" style={{ backgroundColor: '#1f2226' }}>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Nouvelle catégorie
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs border border-transparent rounded text-white hover:opacity-80"
                      style={{ backgroundColor: '#6227f5' }}
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        ) : (
          <div 
            className="shadow rounded-lg border-2 border-dashed transition-colors flex flex-col h-80 cursor-pointer group"
            style={{ 
              borderColor: '#616875' // couleur intermédiaire
            } as React.CSSProperties}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#6226fa';
              const icon = e.currentTarget.querySelector('.icon-plus') as HTMLElement;
              const text = e.currentTarget.querySelector('.text-add') as HTMLElement;
              if (icon) icon.style.color = '#6226fa';
              if (text) text.style.color = '#6226fa';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#616875';
              const icon = e.currentTarget.querySelector('.icon-plus') as HTMLElement;
              const text = e.currentTarget.querySelector('.text-add') as HTMLElement;
              if (icon) icon.style.color = '#616875';
              if (text) text.style.color = '#616875';
            }}
            onClick={() => {
              setEditingId(null);
              setShowAddForm(true);
              setEditingCategory({
                id: '',
                name: '',
                type: 'EXPENSE',
                color: predefinedColors[0],
                icon: '',
                budget: {
                  amount: '',
                  period: 'MONTHLY',
                  startDate: new Date().toISOString().split('T')[0]
                }
              });
            }}
          >
            <div className="flex flex-col items-center justify-center h-full p-6">
              <div className="mb-4 transition-colors icon-plus" style={{ color: '#616875' }}>
                <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-center font-medium transition-colors text-add" style={{ color: '#616875' }}>
                Ajouter une catégorie
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
