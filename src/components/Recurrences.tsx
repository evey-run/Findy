import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Recurrence } from '../types';

interface EditingRecurrence {
  id: string;
  amount: number;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextDue: string;
  description: string;
  active: boolean;
  bankId?: string;
  categoryId: string;
}

export default function Recurrences() {
  const { 
    recurrences, 
    banks,
    categories,
    loadRecurrences, 
    loadBanks,
    loadCategories,
    addRecurrence, 
    updateRecurrence, 
    removeRecurrence 
  } = useAppStore();
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurrence, setEditingRecurrence] = useState<EditingRecurrence | null>(null);
  
  // Fréquences disponibles
  const frequencies = [
    { value: 'DAILY', label: 'Quotidienne' },
    { value: 'WEEKLY', label: 'Hebdomadaire' },
    { value: 'MONTHLY', label: 'Mensuelle' },
    { value: 'QUARTERLY', label: 'Trimestrielle' },
    { value: 'YEARLY', label: 'Annuelle' }
  ];

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadRecurrences(),
          loadBanks(),
          loadCategories()
        ]);
        // Initialiser le formulaire d'ajout
        setEditingRecurrence({
          id: '',
          amount: 0,
          frequency: 'MONTHLY',
          nextDue: new Date().toISOString().split('T')[0],
          description: '',
          active: true,
          bankId: banks.filter(b => b.accountType === 'CURRENT')[0]?.id || '',
          categoryId: categories[0]?.id || ''
        });
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, [loadRecurrences, loadBanks, loadCategories]);

  const handleEdit = (recurrence: Recurrence) => {
    setEditingId(recurrence.id);
    setEditingRecurrence({
      id: recurrence.id,
      amount: recurrence.amount,
      frequency: recurrence.frequency,
      nextDue: new Date(recurrence.nextDue).toISOString().split('T')[0],
      description: recurrence.description,
      active: recurrence.active,
      bankId: recurrence.bankId,
      categoryId: recurrence.categoryId
    });
  };

  const handleSave = async () => {
    if (!editingRecurrence) return;

    try {
      const response = await fetch(`/api/recurrences/${editingRecurrence.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: editingRecurrence.amount,
          frequency: editingRecurrence.frequency,
          nextDue: editingRecurrence.nextDue,
          description: editingRecurrence.description,
          active: editingRecurrence.active,
          bankId: editingRecurrence.bankId,
          categoryId: editingRecurrence.categoryId
        }),
      });

      if (response.ok) {
        const updatedRecurrence = await response.json();
        updateRecurrence(editingRecurrence.id, updatedRecurrence);
        setEditingId(null);
        setEditingRecurrence(null);
      }
    } catch (error) {
      console.error('Error updating recurrence:', error);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingRecurrence(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette récurrence ?')) return;

    try {
      const response = await fetch(`/api/recurrences/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        removeRecurrence(id);
      }
    } catch (error) {
      console.error('Error deleting recurrence:', error);
    }
  };

  const handleAddRecurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecurrence) return;

    try {
      const response = await fetch('/api/recurrences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: editingRecurrence.amount,
          frequency: editingRecurrence.frequency,
          nextDue: editingRecurrence.nextDue,
          description: editingRecurrence.description,
          active: editingRecurrence.active,
          bankId: editingRecurrence.bankId,
          categoryId: editingRecurrence.categoryId
        }),
      });

      if (response.ok) {
        const newRecurrence = await response.json();
        addRecurrence(newRecurrence);
        setEditingRecurrence({
          id: '',
          amount: 0,
          frequency: 'MONTHLY',
          nextDue: new Date().toISOString().split('T')[0],
          description: '',
          active: true,
          bankId: banks.filter(b => b.accountType === 'CURRENT')[0]?.id || '',
          categoryId: categories[0]?.id || ''
        });
      }
    } catch (error) {
      console.error('Error adding recurrence:', error);
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const freq = frequencies.find(f => f.value === frequency);
    return freq ? freq.label : frequency;
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const getNextDueStatus = (nextDue: string) => {
    const now = new Date();
    const dueDate = new Date(nextDue);
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return { label: 'En retard', color: 'bg-red-100 text-red-800' };
    } else if (diffDays === 0) {
      return { label: 'Aujourd\'hui', color: 'bg-yellow-100 text-yellow-800' };
    } else if (diffDays <= 7) {
      return { label: `Dans ${diffDays} jours`, color: 'bg-orange-100 text-orange-800' };
    } else {
      return { label: `Dans ${diffDays} jours`, color: 'bg-green-100 text-green-800' };
    }
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
            Récurrences
          </h2>
        </div>
      </div>

      {/* Add Recurrence Form - Removed as it will be integrated in the table */}

      {/* Recurrences List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Montant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Fréquence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                Prochaine échéance
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Catégorie
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Banque
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Statut
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Add form row - always visible as first row */}
            <tr className="bg-blue-50 border-l-4 border-blue-400">
              <td className="px-6 py-4">
                <input
                  type="text"
                  value={editingRecurrence?.description || ''}
                  onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, description: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="Description de la récurrence"
                  required
                />
              </td>
              <td className="px-6 py-4">
                <input
                  type="number"
                  step="0.01"
                  value={editingRecurrence?.amount || ''}
                  onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, amount: parseFloat(e.target.value) || 0} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="0.00"
                  required
                />
              </td>
              <td className="px-6 py-4">
                <select
                  value={editingRecurrence?.frequency || ''}
                  onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, frequency: e.target.value as any} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  required
                >
                  {frequencies.map(freq => (
                    <option key={freq.value} value={freq.value}>{freq.label}</option>
                  ))}
                </select>
              </td>
              <td className="px-6 py-4">
                <input
                  type="date"
                  value={editingRecurrence?.nextDue || ''}
                  onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, nextDue: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  required
                />
              </td>
              <td className="px-6 py-4">
                <select
                  value={editingRecurrence?.categoryId || ''}
                  onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, categoryId: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  required
                >
                  <option value="">Sélectionnez une catégorie</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-6 py-4">
                <select
                  value={editingRecurrence?.bankId || ''}
                  onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, bankId: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                >
                  <option value="">Aucune banque</option>
                  {banks.filter(bank => bank.accountType === 'CURRENT').map(bank => (
                    <option key={bank.id} value={bank.id}>{bank.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col space-y-1">
                  <label className="flex items-center text-xs">
                    <input
                      type="checkbox"
                      checked={editingRecurrence?.active !== false}
                      onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, active: e.target.checked} : null)}
                      className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-1 text-gray-700">Active</span>
                  </label>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddRecurrence(e);
                    }}
                    className="px-2 py-1 text-xs border border-transparent rounded text-white bg-green-600 hover:bg-green-700"
                    title="Sauvegarder"
                  >
                    ✓
                  </button>
                </div>
              </td>
            </tr>
            {recurrences.map((recurrence) => (
              <tr key={recurrence.id} className={`hover:bg-gray-50 ${!recurrence.active ? 'opacity-50' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === recurrence.id ? (
                    <input
                      type="text"
                      value={editingRecurrence?.description || ''}
                      onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, description: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">{recurrence.description}</div>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === recurrence.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editingRecurrence?.amount || ''}
                      onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, amount: parseFloat(e.target.value) || 0} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  ) : (
                    <div className={`text-sm font-medium ${recurrence.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatAmount(recurrence.amount)}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === recurrence.id ? (
                    <select
                      value={editingRecurrence?.frequency || ''}
                      onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, frequency: e.target.value as any} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      {frequencies.map(freq => (
                        <option key={freq.value} value={freq.value}>{freq.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-gray-900">{getFrequencyLabel(recurrence.frequency)}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === recurrence.id ? (
                    <input
                      type="date"
                      value={editingRecurrence?.nextDue || ''}
                      onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, nextDue: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="text-sm text-gray-900">{formatDate(recurrence.nextDue)}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === recurrence.id ? (
                    <select
                      value={editingRecurrence?.categoryId || ''}
                      onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, categoryId: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span 
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" 
                      style={{ backgroundColor: recurrence.category.color + '20', color: recurrence.category.color }}
                    >
                      {recurrence.category.icon && (
                        <span className="mr-1">{recurrence.category.icon}</span>
                      )}
                      {recurrence.category.name}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === recurrence.id ? (
                    <select
                      value={editingRecurrence?.bankId || ''}
                      onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, bankId: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      <option value="">Aucune banque</option>
                      {banks.filter(bank => bank.accountType === 'CURRENT').map(bank => (
                        <option key={bank.id} value={bank.id}>{bank.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center text-sm text-gray-900">
                      {recurrence.bank ? (
                        <>
                          {recurrence.bank.image ? (
                            <img
                              src={`http://localhost:3001${recurrence.bank.image}`}
                              alt={recurrence.bank.name}
                              className="w-6 h-6 rounded-full object-cover mr-2"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium mr-2" style={{ backgroundColor: recurrence.bank.color }}>
                              {recurrence.bank.shortName}
                            </div>
                          )}
                          <span>{recurrence.bank.name}</span>
                        </>
                      ) : (
                        'Aucune banque'
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === recurrence.id ? (
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={editingRecurrence?.active !== false}
                          onChange={(e) => setEditingRecurrence(prev => prev ? {...prev, active: e.target.checked} : null)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-1 text-xs text-gray-700">Active</span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        recurrence.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {recurrence.active ? 'Active' : 'Inactive'}
                      </span>
                      {recurrence.active && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          getNextDueStatus(recurrence.nextDue).color
                        }`}>
                          {getNextDueStatus(recurrence.nextDue).label}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                  {editingId === recurrence.id ? (
                    <div className="flex justify-center space-x-2">
                      <button
                        onClick={handleSave}
                        className="text-green-600 hover:text-green-800"
                        title="Sauvegarder"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancel}
                        className="text-gray-600 hover:text-gray-800"
                        title="Annuler"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-center space-x-2">
                      <button
                        onClick={() => handleEdit(recurrence)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Modifier"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(recurrence.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Supprimer"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {recurrences.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">Aucune récurrence trouvée.</p>
          </div>
        )}
      </div>
    </div>
  );
}
