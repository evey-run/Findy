import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';

// CSS pour les cellules éditables
const editableCellStyle = `
  .editable-cell {
    position: relative;
    transition: background-color 0.15s ease-in-out;
  }
  
  .editable-cell:hover {
    background-color: #f3f4f6;
  }
`;

interface NewRecurrence {
  amount: number | string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextDue: string;
  description: string;
  active: boolean;
  bankId?: string;
  categoryId: string;
}

interface InlineEditCell {
  recurrenceId: string;
  field: 'amount' | 'description' | 'nextDue' | 'frequency' | 'category' | 'bank' | 'active';
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
  
  // New recurrence form state
  const [newRecurrence, setNewRecurrence] = useState<NewRecurrence>({
    amount: '',
    frequency: 'MONTHLY',
    nextDue: '',
    description: '',
    active: true,
    bankId: '',
    categoryId: ''
  });
  
  // Inline editing states
  const [inlineEditCell, setInlineEditCell] = useState<InlineEditCell | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  
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
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, [loadRecurrences, loadBanks, loadCategories]);

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

    try {
      const response = await fetch('/api/recurrences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: typeof newRecurrence.amount === 'string' ? parseFloat(newRecurrence.amount) : newRecurrence.amount,
          frequency: newRecurrence.frequency,
          nextDue: newRecurrence.nextDue,
          description: newRecurrence.description,
          active: newRecurrence.active,
          bankId: newRecurrence.bankId,
          categoryId: newRecurrence.categoryId === '' ? undefined : newRecurrence.categoryId
        }),
      });

      if (response.ok) {
        const addedRecurrence = await response.json();
        addRecurrence(addedRecurrence);
        // Reset form
        setNewRecurrence({
          amount: '',
          frequency: 'MONTHLY',
          nextDue: '',
          description: '',
          active: true,
          bankId: '',
          categoryId: ''
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

  // Inline editing functions
  const handleInlineEdit = (recurrenceId: string, field: 'amount' | 'description' | 'nextDue' | 'frequency' | 'category' | 'bank' | 'active') => {
    const recurrence = recurrences.find(r => r.id === recurrenceId);
    if (!recurrence) return;
    
    let value = '';
    switch (field) {
      case 'amount':
        value = recurrence.amount.toString();
        break;
      case 'description':
        value = recurrence.description;
        break;
      case 'nextDue':
        value = recurrence.nextDue.split('T')[0];
        break;
      case 'frequency':
        value = recurrence.frequency;
        break;
      case 'category':
        value = recurrence.categoryId;
        break;
      case 'bank':
        value = recurrence.bankId || '';
        break;
      case 'active':
        value = recurrence.active.toString();
        break;
    }
    
    setInlineEditCell({ recurrenceId, field });
    setInlineEditValue(value);
  };

  const handleInlineSave = async () => {
    if (!inlineEditCell) return;
    
    const { recurrenceId, field } = inlineEditCell;
    const updateData: any = {};
    
    switch (field) {
      case 'amount':
        updateData.amount = parseFloat(inlineEditValue);
        break;
      case 'description':
        updateData.description = inlineEditValue;
        break;
      case 'nextDue':
        updateData.nextDue = inlineEditValue;
        break;
      case 'frequency':
        updateData.frequency = inlineEditValue;
        break;
      case 'category':
        updateData.categoryId = inlineEditValue || null;
        break;
      case 'bank':
        updateData.bankId = inlineEditValue || null;
        break;
      case 'active':
        updateData.active = inlineEditValue === 'true';
        break;
    }
    
    try {
      const response = await fetch(`/api/recurrences/${recurrenceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const updatedRecurrence = await response.json();
        updateRecurrence(recurrenceId, updatedRecurrence);
      }
    } catch (error) {
      console.error('Error updating recurrence:', error);
    }
    
    setInlineEditCell(null);
    setInlineEditValue('');
  };

  const handleInlineCancel = () => {
    setInlineEditCell(null);
    setInlineEditValue('');
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInlineSave();
    } else if (e.key === 'Escape') {
      handleInlineCancel();
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
    <div className="space-y-6 min-h-screen p-6" style={{ backgroundColor: '#202427' }}>
      <style>{`
        .editable-cell { position: relative; transition: background-color 0.15s; }
        .editable-cell:hover { background-color: #23272b; }
        select, input[type='text'], input[type='number'], input[type='date'] {
          background-color: #1f2226 !important;
          color: #fff !important;
          border: none !important;
          padding: 0.5rem 0.75rem !important;
          font-weight: 500 !important;
          border-radius: 0.5rem !important;
        }
        th, td { color: #fff !important; }
      `}</style>
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
            Récurrences
          </h2>
        </div>
      </div>
      <div className="shadow rounded-lg overflow-hidden" style={{ backgroundColor: '#272a2f' }}>
        <table className="min-w-full divide-y divide-gray-600 table-fixed" style={{ backgroundColor: '#272a2f' }}>
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1f2226' }}>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/5">Description</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">Montant</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-32">Fréquence</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-36">Prochaine échéance</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-32">Catégorie</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-32">Banque</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-32">Statut</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-300 uppercase tracking-wider w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600" style={{ backgroundColor: '#272a2f' }}>
            {/* Add form row - always visible as first row */}
            <tr className="border-l-4" style={{ backgroundColor: '#1f2226', borderLeftColor: '#6226fa' }}>
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={newRecurrence.description}
                  onChange={(e) => setNewRecurrence(prev => ({...prev, description: e.target.value}))}
                  className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3"
                  style={{ backgroundColor: '#1f2226' }}
                  placeholder="Description de la récurrence"
                  required
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  step="1"
                  value={newRecurrence.amount}
                  onChange={(e) => setNewRecurrence(prev => ({...prev, amount: e.target.value}))}
                  className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3"
                  style={{ backgroundColor: '#1f2226' }}
                  placeholder="0.00"
                  required
                />
              </td>
              <td className="px-4 py-2">
                <select
                  value={newRecurrence.frequency}
                  onChange={(e) => setNewRecurrence(prev => ({...prev, frequency: e.target.value as any}))}
                  className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3"
                  style={{ backgroundColor: '#1f2226' }}
                  required
                >
                  {frequencies.map(freq => (
                    <option key={freq.value} value={freq.value} style={{ backgroundColor: '#1f2226' }}>{freq.label}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2">
                <input
                  type="date"
                  value={newRecurrence.nextDue}
                  onChange={(e) => setNewRecurrence(prev => ({...prev, nextDue: e.target.value}))}
                  className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3"
                  style={{ backgroundColor: '#1f2226' }}
                  required
                />
              </td>
              <td className="px-4 py-2">
                <select
                  value={newRecurrence.categoryId}
                  onChange={(e) => setNewRecurrence(prev => ({...prev, categoryId: e.target.value}))}
                  className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3"
                  style={{ backgroundColor: '#1f2226' }}
                >
                  <option value="" style={{ backgroundColor: '#1f2226' }}>Non défini</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id} style={{ backgroundColor: '#1f2226' }}>{category.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2">
                <select
                  value={newRecurrence.bankId}
                  onChange={(e) => setNewRecurrence(prev => ({...prev, bankId: e.target.value}))}
                  className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3"
                  style={{ backgroundColor: '#1f2226' }}
                >
                  <option value="" style={{ backgroundColor: '#1f2226' }}>Aucune banque</option>
                  {banks.filter(bank => bank.accountType === 'CURRENT').map(bank => (
                    <option key={bank.id} value={bank.id} style={{ backgroundColor: '#1f2226' }}>{bank.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2">
                <label className="flex items-center text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={newRecurrence.active}
                    onChange={(e) => setNewRecurrence(prev => ({...prev, active: e.target.checked}))}
                    className="h-3 w-3 rounded"
                    style={{ accentColor: '#6226fa' }}
                  />
                  <span className="ml-1 text-gray-300">Active</span>
                </label>
              </td>
              <td className="px-4 py-2">
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddRecurrence(e);
                    }}
                    className="px-2 py-1 text-xs font-medium text-white border border-transparent rounded-md hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 flex items-center gap-1"
                    style={{ backgroundColor: '#6226fa', minWidth: '0' }}
                    title="Ajouter"
                  >
                    <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3.5v9m4.5-4.5h-9" />
                    </svg>
                    Ajouter
                  </button>
                </div>
              </td>
            </tr>
            {recurrences.map((recurrence) => (
              <tr
                key={recurrence.id}
                className={`border-l-4 transition-opacity ${!recurrence.active ? 'opacity-50' : ''}`}
                style={{ backgroundColor: '#23272b', borderLeftColor: '#23272b' }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderLeftColor = '#6226fa';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderLeftColor = '#23272b';
                }}
              >
                <td className="px-6 py-4 whitespace-nowrap text-white">
                  {inlineEditCell?.recurrenceId === recurrence.id && inlineEditCell?.field === 'description' ? (
                    <input
                      type="text"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center">
                      <div 
                        className="text-sm font-medium text-white cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell"
                        onDoubleClick={() => handleInlineEdit(recurrence.id, 'description')}
                        title="Double-cliquez pour éditer"
                      >
                        {recurrence.description}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {inlineEditCell?.recurrenceId === recurrence.id && inlineEditCell?.field === 'amount' ? (
                    <input
                      type="number"
                      step="1"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <div 
                      className={`text-sm font-medium cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell ${recurrence.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      onDoubleClick={() => handleInlineEdit(recurrence.id, 'amount')}
                      title="Double-cliquez pour éditer"
                    >
                      {formatAmount(recurrence.amount)}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {inlineEditCell?.recurrenceId === recurrence.id && inlineEditCell?.field === 'frequency' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    >
                      {frequencies.map(freq => (
                        <option key={freq.value} value={freq.value}>{freq.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div 
                      className="text-sm text-white cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell"
                      onDoubleClick={() => handleInlineEdit(recurrence.id, 'frequency')}
                      title="Double-cliquez pour éditer"
                    >
                      {getFrequencyLabel(recurrence.frequency)}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {inlineEditCell?.recurrenceId === recurrence.id && inlineEditCell?.field === 'nextDue' ? (
                    <input
                      type="date"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center space-x-2">
                      <div 
                        className="text-sm text-white cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell"
                        onDoubleClick={() => handleInlineEdit(recurrence.id, 'nextDue')}
                        title="Double-cliquez pour éditer"
                      >
                        {formatDate(recurrence.nextDue)}
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getNextDueStatus(recurrence.nextDue).color}`}>
                        {getNextDueStatus(recurrence.nextDue).label}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {inlineEditCell?.recurrenceId === recurrence.id && inlineEditCell?.field === 'category' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    >
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span 
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:bg-gray-100 editable-cell text-white" 
                      style={{ backgroundColor: recurrence.category.color + '20', color: recurrence.category.color }}
                      onDoubleClick={() => handleInlineEdit(recurrence.id, 'category')}
                      title="Double-cliquez pour éditer"
                    >
                      {recurrence.category.icon && (
                        <span className="mr-1">{recurrence.category.icon}</span>
                      )}
                      {recurrence.category.name}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {inlineEditCell?.recurrenceId === recurrence.id && inlineEditCell?.field === 'bank' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    >
                      <option value="">Aucune banque</option>
                      {banks.filter(bank => bank.accountType === 'CURRENT').map(bank => (
                        <option key={bank.id} value={bank.id}>{bank.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div 
                      className="flex items-center text-sm text-white cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell"
                      onDoubleClick={() => handleInlineEdit(recurrence.id, 'bank')}
                      title="Double-cliquez pour éditer"
                    >
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
                  {inlineEditCell?.recurrenceId === recurrence.id && inlineEditCell?.field === 'active' ? (
                    <input
                      type="checkbox"
                      checked={inlineEditValue === 'true' || inlineEditValue === true}
                      onChange={e => setInlineEditValue(e.target.checked ? 'true' : 'false')}
                      onBlur={handleInlineSave}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: '#6226fa' }}
                      autoFocus
                    />
                  ) : (
                    <input
                      type="checkbox"
                      checked={recurrence.active}
                      onChange={e => handleInlineEdit(recurrence.id, 'active')}
                      className="h-4 w-4 rounded cursor-pointer"
                      style={{ accentColor: '#6226fa' }}
                      title="Double-cliquez pour éditer"
                    />
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                  <div className="flex justify-center">
                    <button
                      onClick={() => handleDelete(recurrence.id)}
                      className="transition-colors"
                      style={{ color: '#616875' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#616875'}
                      title="Supprimer"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
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
