import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Category } from '../types';

interface EditingCategory {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'FIXED';
  color: string;
  icon?: string;
}

export default function Categories() {
  const { 
    categories, 
    loadCategories, 
    addCategory, 
    updateCategory, 
    removeCategory 
  } = useAppStore();
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
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
      } catch (error) {
        console.error('Error loading categories:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, [loadCategories]);

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
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Catégories
          </h2>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
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
            <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Ajouter une catégorie
          </button>
        </div>
      </div>

      {/* Add Category Form */}
      {showAddForm && (
        <div className="bg-white shadow rounded-lg p-6">
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
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
          {categories.map((category) => (
            <div key={category.id} className="border rounded-lg p-4">
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
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Supprimer"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
