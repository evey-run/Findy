import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Category, Budget } from '../types';
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CalendarIcon,
  TagIcon
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
    shared: boolean;
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
        await loadBudgets();
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

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingCategory({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon
    });
  };

  const handleSave = async () => {
    if (!editingCategory) return;

    try {
      const response = await fetch(`/api/categories/${editingCategory.id}`, {
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

      if (response.ok) {
        const updatedCategory = await response.json();
        updateCategory(editingCategory.id, updatedCategory);
        setEditingId(null);
        setEditingCategory(null);
      }
    } catch (error) {
      console.error('Error updating category:', error);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingCategory(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette catégorie ?')) return;

    try {
      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        removeCategory(id);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    try {
      const response = await fetch('/api/categories', {
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

      if (response.ok) {
        const newCategory = await response.json();
        addCategory(newCategory);
        setShowAddForm(false);
        setEditingCategory(null);
      }
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

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
        startDate: categoryBudget.startDate.split('T')[0],
        shared: categoryBudget.shared
      } : undefined
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
        if (editingCategory.budget && editingCategory.budget.amount) {
          const existingBudget = getCategoryBudget(editingCategory.id);
          const budgetData = {
            amount: parseFloat(editingCategory.budget.amount),
            period: editingCategory.budget.period,
            startDate: editingCategory.budget.startDate,
            shared: editingCategory.budget.shared,
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

        // Créer le budget si présent
        if (editingCategory.budget && editingCategory.budget.amount) {
          const budgetData = {
            amount: parseFloat(editingCategory.budget.amount),
            period: editingCategory.budget.period,
            startDate: editingCategory.budget.startDate,
            shared: editingCategory.budget.shared,
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

  // Effet pour recalculer les budgets
  useEffect(() => {
    if (budgets.length > 0 && transactions.length > 0) {
      calculateBudgetSpending();
    }
  }, [budgets, transactions]);

  // Gestion des formulaires de budget
  const handleBudgetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetFormData.amount || !budgetFormData.categoryId) return;

    try {
      const budgetData = {
        ...budgetFormData,
        amount: parseFloat(budgetFormData.amount),
        bankId: budgetFormData.shared ? null : budgetFormData.bankId,
        shared: budgetFormData.shared
      };

      if (editingBudget) {
        const response = await fetch(`/api/budgets/${editingBudget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(budgetData)
        });

        if (response.ok) {
          const updatedBudget = await response.json();
          updateBudget(editingBudget.id, updatedBudget);
          toast.success('Budget modifié avec succès');
        }
      } else {
        const response = await fetch('/api/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(budgetData)
        });

        if (response.ok) {
          const newBudget = await response.json();
          addBudget(newBudget);
          toast.success('Budget créé avec succès');
        }
      }

      // Reset form
      setBudgetFormData({
        amount: '',
        period: 'MONTHLY',
        startDate: new Date().toISOString().split('T')[0],
        shared: false,
        bankId: '',
        categoryId: ''
      });
      setEditingBudget(null);
      setShowBudgetModal(false);
    } catch (error) {
      console.error('Error saving budget:', error);
      toast.error('Erreur lors de la sauvegarde du budget');
    }
  };

  const handleEditBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setBudgetFormData({
      amount: budget.amount.toString(),
      period: budget.period,
      startDate: budget.startDate.split('T')[0],
      shared: budget.shared,
      bankId: budget.bankId || '',
      categoryId: budget.categoryId
    });
    setShowBudgetModal(true);
  };

  const handleDeleteBudget = async (budgetId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce budget ?')) return;

    try {
      const response = await fetch(`/api/budgets/${budgetId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        removeBudget(budgetId);
        toast.success('Budget supprimé avec succès');
      }
    } catch (error) {
      console.error('Error deleting budget:', error);
      toast.error('Erreur lors de la suppression du budget');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
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
      {/* Header avec onglets */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Catégories & Budgets
          </h2>
        </div>
      </div>

      {/* Navigation par onglets */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('categories')}
              className={`${
                activeTab === 'categories'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <TagIcon className="h-5 w-5 inline-block mr-2" />
              Catégories
            </button>
            <button
              onClick={() => setActiveTab('budgets')}
              className={`${
                activeTab === 'budgets'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              <ChartBarIcon className="h-5 w-5 inline-block mr-2" />
              Budgets par catégorie
            </button>
          </nav>
        </div>

        {/* Contenu des onglets */}
        <div className="p-6">
          {activeTab === 'categories' && (
            <div className="space-y-6">
              {/* Bouton ajouter catégorie */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingCategory({
                      id: '',
                      name: '',
                      type: 'EXPENSE',
                      color: predefinedColors[0],
                      icon: ''
                    });
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Ajouter une catégorie
                </button>
              </div>

              {/* Add Category Form */}
              {showAddForm && (
                <div className="bg-gray-50 border rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Ajouter une catégorie</h3>
                  <form onSubmit={handleAddCategory} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Nom</label>
                        <input
                          type="text"
                          value={editingCategory?.name || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, name: e.target.value} : null)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Type</label>
                        <select
                          value={editingCategory?.type || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, type: e.target.value as any} : null)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          required
                        >
                          {categoryTypes.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Icône (optionnel)</label>
                        <input
                          type="text"
                          value={editingCategory?.icon || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, icon: e.target.value} : null)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder="🛒"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Couleur</label>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {predefinedColors.map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditingCategory(prev => prev ? {...prev, color} : null)}
                              className={`w-8 h-8 rounded-full border-2 ${
                                editingCategory?.color === color ? 'border-gray-900' : 'border-gray-300'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
                          setEditingCategory(null);
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Ajouter
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Categories List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((category) => (
                  <div key={category.id} className="border rounded-lg p-4 bg-white">
                    {editingId === category.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editingCategory?.name || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, name: e.target.value} : null)}
                          className="w-full text-lg font-medium border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500"
                        />
                        <select
                          value={editingCategory?.type || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, type: e.target.value as any} : null)}
                          className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        >
                          {categoryTypes.map(type => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editingCategory?.icon || ''}
                          onChange={(e) => setEditingCategory(prev => prev ? {...prev, icon: e.target.value} : null)}
                          className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          placeholder="🛒"
                        />
                        <div className="flex flex-wrap gap-1">
                          {predefinedColors.map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditingCategory(prev => prev ? {...prev, color} : null)}
                              className={`w-6 h-6 rounded-full border ${
                                editingCategory?.color === color ? 'border-gray-900' : 'border-gray-300'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={handleSave}
                            className="flex-1 px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                          >
                            Sauvegarder
                          </button>
                          <button
                            onClick={handleCancel}
                            className="flex-1 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {category.icon && (
                              <span className="text-lg">{category.icon}</span>
                            )}
                            <h3 className="text-lg font-medium text-gray-900">{category.name}</h3>
                          </div>
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ 
                              backgroundColor: getTypeColor(category.type) + '20', 
                              color: getTypeColor(category.type) 
                            }}
                          >
                            {getTypeLabel(category.type)}
                          </span>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEdit(category)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Modifier"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(category.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Supprimer"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'budgets' && (
            <div className="space-y-6">
              {/* Bouton ajouter budget */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setEditingBudget(null);
                    setBudgetFormData({
                      amount: '',
                      period: 'MONTHLY',
                      startDate: new Date().toISOString().split('T')[0],
                      shared: false,
                      bankId: '',
                      categoryId: ''
                    });
                    setShowBudgetModal(true);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Ajouter un budget
                </button>
              </div>

              {/* Liste des budgets avec progression */}
              <div className="space-y-4">
                {budgets.length === 0 ? (
                  <div className="text-center py-12">
                    <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun budget</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Commencez par créer un budget pour une catégorie.
                    </p>
                  </div>
                ) : (
                  budgets.map((budget) => {
                    const spending = budgetSpending[budget.id];
                    if (!spending) return null;

                    return (
                      <div key={budget.id} className="bg-white border rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            {budget.category.icon && (
                              <span className="text-xl">{budget.category.icon}</span>
                            )}
                            <div>
                              <h3 className="text-lg font-medium text-gray-900">
                                {budget.category.name}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {budget.period === 'MONTHLY' ? 'Mensuel' : 
                                 budget.period === 'WEEKLY' ? 'Hebdomadaire' :
                                 budget.period === 'QUARTERLY' ? 'Trimestriel' : 'Annuel'}
                                {budget.shared && ' • Partagé'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleEditBudget(budget)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Modifier"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteBudget(budget.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Supprimer"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Barre de progression */}
                        <div className="mb-4">
                          <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <span>Dépensé: {formatCurrency(spending.totalSpent)}</span>
                            <span>Budget: {formatCurrency(budget.amount)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                spending.isOverBudget
                                  ? 'bg-red-500'
                                  : spending.percentage > 80
                                  ? 'bg-yellow-500'
                                  : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(spending.percentage, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>{spending.percentage.toFixed(1)}% utilisé</span>
                            <span className={spending.isOverBudget ? 'text-red-600' : 'text-green-600'}>
                              {spending.isOverBudget ? 'Dépassé' : `Reste ${formatCurrency(spending.remaining)}`}
                            </span>
                          </div>
                        </div>

                        {/* Statut */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {spending.isOverBudget ? (
                              <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                            ) : (
                              <CheckCircleIcon className="h-5 w-5 text-green-500" />
                            )}
                            <span className={`text-sm font-medium ${
                              spending.isOverBudget ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {spending.isOverBudget ? 'Budget dépassé' : 'Dans les limites'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500">
                            <CalendarIcon className="h-4 w-4 inline mr-1" />
                            {new Date(spending.periodStart).toLocaleDateString('fr-FR')} - {new Date(spending.periodEnd).toLocaleDateString('fr-FR')}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal pour ajouter/modifier un budget */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingBudget ? 'Modifier le budget' : 'Ajouter un budget'}
              </h3>
              <form onSubmit={handleBudgetSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Catégorie</label>
                  <select
                    value={budgetFormData.categoryId}
                    onChange={(e) => setBudgetFormData({...budgetFormData, categoryId: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {categories.filter(cat => cat.type === 'EXPENSE').map(category => (
                      <option key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Montant (€)</label>
                  <input
                    type="number"
                    step="1"
                    value={budgetFormData.amount}
                    onChange={(e) => setBudgetFormData({...budgetFormData, amount: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Période</label>
                  <select
                    value={budgetFormData.period}
                    onChange={(e) => setBudgetFormData({...budgetFormData, period: e.target.value as Budget['period']})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="WEEKLY">Hebdomadaire</option>
                    <option value="MONTHLY">Mensuel</option>
                    <option value="QUARTERLY">Trimestriel</option>
                    <option value="YEARLY">Annuel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Date de début</label>
                  <input
                    type="date"
                    value={budgetFormData.startDate}
                    onChange={(e) => setBudgetFormData({...budgetFormData, startDate: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="shared"
                    checked={budgetFormData.shared}
                    onChange={(e) => setBudgetFormData({...budgetFormData, shared: e.target.checked})}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="shared" className="ml-2 block text-sm text-gray-900">
                    Budget partagé
                  </label>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowBudgetModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  >
                    {editingBudget ? 'Modifier' : 'Ajouter'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
