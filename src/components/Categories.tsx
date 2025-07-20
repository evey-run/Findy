import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Category, Budget } from '../types';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  ChartBarIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
  const calculateBudgetSpending = async () => {
    const spending: { [key: string]: BudgetSpending } = {};
    
    for (const budget of budgets) {
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
      
      // Filtrer les transactions pour ce budget
      const relevantTransactions = transactions.filter(t => 
        t.categoryId === budget.categoryId &&
        t.amount < 0 && // Seulement les dépenses
        new Date(t.date) >= startDate &&
        new Date(t.date) <= endDate &&
        (!budget.bankId || t.bankId === budget.bankId) // Filtrer par banque si budget spécifique
      );
      
      const totalSpent = Math.abs(relevantTransactions.reduce((sum, t) => sum + t.amount, 0));
      const remaining = Math.max(0, budget.amount - totalSpent);
      const percentage = budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0;
      
      spending[budget.id] = {
        budget,
        totalSpent,
        remaining,
        percentage: Math.min(percentage, 100),
        isOverBudget: totalSpent > budget.amount,
        periodStart: startDate.toISOString().split('T')[0],
        periodEnd: endDate.toISOString().split('T')[0]
      };
    }
    
    setBudgetSpending(spending);
  };

  // Effet pour recalculer les budgets
  useEffect(() => {
    if (budgets.length > 0 && transactions.length > 0) {
      calculateBudgetSpending();
    }
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

  const getTypeColor = (type: string) => {
    const categoryType = categoryTypes.find(t => t.value === type);
    return categoryType ? categoryType.color : '#6b7280';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Catégories & Budgets
          </h2>
        </div>
      </div>

      {/* Categories List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-fr">
        {categories.map((category) => {
          const categorySpending = getCategorySpending(category.id);
          const categoryBudget = getCategoryBudget(category.id);
          
          return (
            <div key={category.id} className="bg-white shadow rounded-lg p-4 flex flex-col h-full min-h-[180px]">
              {editingId === category.id ? (
                /* Edit Form Card - appears in place of the category being edited */
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="flex flex-col h-full space-y-2">
                  <h3 className="text-md font-medium text-gray-900">Modifier la catégorie</h3>
                  
                  <div className="space-y-2 flex-1">
                    <input
                      type="text"
                      value={editingCategory?.name || ''}
                      onChange={(e) => setEditingCategory(prev => prev ? {...prev, name: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                      placeholder="Nom"
                      required
                    />
                    
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editingCategory?.icon || ''}
                        onChange={(e) => setEditingCategory(prev => prev ? {...prev, icon: e.target.value} : null)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                        placeholder="🛒"
                      />
                      
                      <select
                        value={editingCategory?.type || ''}
                        onChange={(e) => setEditingCategory(prev => prev ? {...prev, type: e.target.value as any} : null)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                        required
                      >
                        {categoryTypes.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {predefinedColors.slice(0, 16).map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEditingCategory(prev => prev ? {...prev, color} : null)}
                          className={`w-4 h-4 rounded-full border ${
                            editingCategory?.color === color ? 'border-gray-900' : 'border-gray-300'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    {/* Budget section - Only for EXPENSE categories */}
                    {editingCategory?.type === 'EXPENSE' && (
                      <div className="border-t pt-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Budget</p>
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
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1 mb-1"
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
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                        >
                          <option value="MONTHLY">Mensuel</option>
                          <option value="WEEKLY">Hebdo</option>
                          <option value="QUARTERLY">Trimestre</option>
                          <option value="YEARLY">Annuel</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-2 py-1 border border-transparent rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700"
                    >
                      Sauvegarder
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {category.icon && (
                        <span className="text-lg">{category.icon}</span>
                      )}
                      <h3 className="text-lg font-medium text-gray-900">{category.name}</h3>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(category)}
                          className="text-gray-400 hover:text-blue-600"
                          title="Modifier"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="text-gray-400 hover:text-red-600"
                          title="Supprimer"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: getTypeColor(category.type) + '20', 
                        color: getTypeColor(category.type) 
                      }}
                    >
                      {getTypeLabel(category.type)}
                    </span>
                  </div>

                  <div className="flex-1">
                    {/* Budget progress for EXPENSE categories */}
                    {category.type === 'EXPENSE' && categoryBudget && categorySpending && (
                      <div className="mt-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-gray-700">Budget {categoryBudget.period === 'MONTHLY' ? 'Mensuel' : 
                           categoryBudget.period === 'WEEKLY' ? 'Hebdomadaire' :
                           categoryBudget.period === 'QUARTERLY' ? 'Trimestriel' : 'Annuel'}</span>
                        </div>
                        

                        <div className="flex justify-between text-lg font-semibold mb-2">
                          <span className="text-red-600">
                            {formatCurrency(categorySpending.totalSpent)}
                          </span>
                          <span className="text-gray-900">
                            {formatCurrency(categoryBudget.amount)}
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all duration-300 ${
                              categorySpending.isOverBudget
                                ? 'bg-red-500'
                                : categorySpending.percentage > 80
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(categorySpending.percentage, 100)}%` }}
                          />
                        </div>
                        
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>{Math.round(categorySpending.percentage)}%</span>
                          <span className={categorySpending.isOverBudget ? 'text-red-600' : 'text-green-600'}>
                            {categorySpending.isOverBudget ? 'Budget dépassé !' : `${formatCurrency(categorySpending.remaining)} restant`}
                          </span>
                        </div>

                        <div className="border-t pt-3 mt-3">
                          {/* Afficher les 3 dernières transactions de cette catégorie */}
                          <div className="mt-3">
                            {transactions.filter(t => t.categoryId === category.id).length > 0 ? (
                              <>
                                <p className="text-xs text-gray-500 mb-1">
                                  Dernières transactions:
                                </p>
                                <div className="space-y-1">
                                  {transactions
                                    .filter(t => t.categoryId === category.id)
                                    .slice(0, 3)
                                    .map((transaction) => (
                                      <div key={transaction.id} className="flex justify-between text-xs">
                                        <span className="text-gray-600 truncate">
                                          {transaction.description}
                                        </span>
                                        <span className={`font-medium ${
                                          transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                          {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </>
                            ) : (
                              <div className="text-center py-2">
                                <p className="text-xs text-gray-400 italic">
                                  Aucune transaction pour cette catégorie
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No budget - show recent transactions */}
                    {category.type === 'EXPENSE' && !categoryBudget && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-md">
                        <div className="flex items-center justify-center text-gray-500 mb-2">
                          <ChartBarIcon className="h-4 w-4 mr-1" />
                          <span className="text-sm">Pas de budget défini</span>
                        </div>
                        
                        {/* Afficher les 3 dernières transactions de cette catégorie */}
                        <div className="mt-3">
                          {transactions.filter(t => t.categoryId === category.id).length > 0 ? (
                            <>
                              <p className="text-xs text-gray-500 mb-1">
                                Dernières transactions:
                              </p>
                              <div className="space-y-1">
                                {transactions
                                  .filter(t => t.categoryId === category.id)
                                  .slice(0, 3)
                                  .map((transaction) => (
                                    <div key={transaction.id} className="flex justify-between text-xs">
                                      <span className="text-gray-600 truncate">
                                        {transaction.description}
                                      </span>
                                      <span className={`font-medium ${
                                        transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-2">
                              <p className="text-xs text-gray-400 italic">
                                Aucune transaction pour cette catégorie
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* For INCOME and FIXED categories, show recent transactions */}
                    {(category.type === 'INCOME' || category.type === 'FIXED') && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-md">
                        {/* Afficher les 3 dernières transactions de cette catégorie */}
                        <div>
                          {transactions.filter(t => t.categoryId === category.id).length > 0 ? (
                            <>
                              <p className="text-xs text-gray-500 mb-1">
                                Dernières transactions:
                              </p>
                              <div className="space-y-1">
                                {transactions
                                  .filter(t => t.categoryId === category.id)
                                  .slice(0, 3)
                                  .map((transaction) => (
                                    <div key={transaction.id} className="flex justify-between text-xs">
                                      <span className="text-gray-600 truncate">
                                        {transaction.description}
                                      </span>
                                      <span className={`font-medium ${
                                        transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-2">
                              <p className="text-xs text-gray-400 italic">
                                Aucune transaction pour cette catégorie
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add Category Form Card */}
        {showAddForm ? (
          <div className="bg-white shadow rounded-lg p-4 flex flex-col h-full min-h-[180px]">
            <form onSubmit={handleAddCategory} className="flex flex-col h-full space-y-2">
              <h3 className="text-md font-medium text-gray-900">Ajouter une catégorie</h3>
              
              <div className="space-y-2 flex-1">
                <input
                  type="text"
                  value={editingCategory?.name || ''}
                  onChange={(e) => setEditingCategory(prev => prev ? {...prev, name: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                  placeholder="Nom"
                  required
                />
                
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={editingCategory?.icon || ''}
                    onChange={(e) => setEditingCategory(prev => prev ? {...prev, icon: e.target.value} : null)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                    placeholder="🛒"
                  />
                  
                  <select
                    value={editingCategory?.type || ''}
                    onChange={(e) => setEditingCategory(prev => prev ? {...prev, type: e.target.value as any} : null)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                    required
                  >
                    {categoryTypes.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {predefinedColors.slice(0, 16).map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setEditingCategory(prev => prev ? {...prev, color} : null)}
                      className={`w-4 h-4 rounded-full border ${
                        editingCategory?.color === color ? 'border-gray-900' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {/* Budget section - Only for EXPENSE categories */}
                {editingCategory?.type === 'EXPENSE' && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-medium text-gray-700 mb-1">Budget</p>
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
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1 mb-1"
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
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
                    >
                      <option value="MONTHLY">Mensuel</option>
                      <option value="WEEKLY">Hebdo</option>
                      <option value="QUARTERLY">Trimestre</option>
                      <option value="YEARLY">Annuel</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-2 py-1 border border-transparent rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Ajouter
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div 
            onClick={() => {
              // Fermer le formulaire de modification si ouvert
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
            className="bg-white shadow rounded-lg p-6 flex flex-col items-center justify-center h-full min-h-[280px] cursor-pointer hover:bg-gray-50 transition-colors border-2 border-dashed border-gray-300 hover:border-gray-400"
          >
            <PlusIcon className="h-12 w-12 text-gray-400 mb-2" />
            <p className="text-gray-500 text-sm font-medium">Ajouter une catégorie</p>
          </div>
        )}
      </div>
    </div>
  );
}
