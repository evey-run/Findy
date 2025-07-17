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

interface EditingTransaction {
  id: string;
  amount: number;
  description: string;
  date: string;
  shared: boolean;
  categoryId: string;
  bankId?: string;
}

interface InlineEditCell {
  transactionId: string;
  field: 'amount' | 'description' | 'date' | 'category' | 'bank' | 'shared';
}

export default function Transactions() {
  const { 
    transactions, 
    categories, 
    banks, 
    loadTransactions, 
    loadCategories, 
    loadBanks,
    selectedBank,
    setSelectedBank,
    updateTransaction,
    removeTransaction 
  } = useAppStore();
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<EditingTransaction | null>(null);
  
  // Inline editing states
  const [inlineEditCell, setInlineEditCell] = useState<InlineEditCell | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  
  const [filters, setFilters] = useState({
    categoryId: '',
    shared: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadTransactions(),
          loadCategories(),
          loadBanks()
        ]);
        // Initialiser le formulaire d'ajout
        setEditingTransaction({
          id: '',
          amount: 0,
          description: '',
          date: new Date().toISOString().split('T')[0],
          shared: false,
          categoryId: categories[0]?.id || '',
          bankId: banks.filter(bank => bank.accountType === 'CURRENT')[0]?.id || ''
        });
      } catch (error) {
        console.error('Error initializing data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, []);

  // Recharger les transactions quand la banque sélectionnée change
  useEffect(() => {
    loadTransactions();
  }, [selectedBank?.id]);
  
  // Log transactions changes
  useEffect(() => {
    console.log('Transactions updated:', transactions.length, 'transactions');
  }, [transactions]);

  const handleSave = async () => {
    if (!editingTransaction) return;

    try {
      const response = await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingTransaction),
      });

      if (response.ok) {
        const updatedTransaction = await response.json();
        updateTransaction(editingTransaction.id, updatedTransaction);
        setEditingId(null);
        setEditingTransaction(null);
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingTransaction(null);
  };

  // Inline editing functions
  const handleInlineEdit = (transactionId: string, field: 'amount' | 'description' | 'date' | 'category' | 'bank' | 'shared') => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;
    
    let value = '';
    switch (field) {
      case 'amount':
        value = transaction.amount.toString();
        break;
      case 'description':
        value = transaction.description;
        break;
      case 'date':
        value = new Date(transaction.date).toISOString().split('T')[0];
        break;
      case 'category':
        value = transaction.categoryId || '';
        break;
      case 'bank':
        value = transaction.bankId;
        break;
      case 'shared':
        value = transaction.shared.toString();
        break;
    }
    
    setInlineEditCell({ transactionId, field });
    setInlineEditValue(value);
  };

  const handleInlineSave = async () => {
    if (!inlineEditCell) return;
    
    const { transactionId, field } = inlineEditCell;
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) return;
    
    // Prepare the update data
    let updateData: any = {};
    switch (field) {
      case 'amount':
        updateData.amount = parseFloat(inlineEditValue);
        if (isNaN(updateData.amount)) return; // Invalid number
        break;
      case 'description':
        updateData.description = inlineEditValue;
        break;
      case 'date':
        updateData.date = inlineEditValue;
        break;
      case 'category':
        updateData.categoryId = inlineEditValue || null;
        break;
      case 'bank':
        updateData.bankId = inlineEditValue;
        break;
      case 'shared':
        updateData.shared = inlineEditValue === 'true';
        break;
    }
    
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const updatedTransaction = await response.json();
        updateTransaction(transactionId, updatedTransaction);
        handleInlineCancel();
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
    }
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

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette transaction ?')) return;

    try {
      console.log('Attempting to delete transaction:', id);
      const response = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE',
      });

      console.log('Delete response status:', response.status);
      
      if (response.ok) {
        console.log('Transaction deleted successfully, updating UI');
        removeTransaction(id);
      } else {
        const errorText = await response.text();
        console.error('Delete failed:', response.status, errorText);
        alert('Erreur lors de la suppression: ' + (errorText || 'Erreur inconnue'));
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Erreur de connexion lors de la suppression');
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction) return;

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editingTransaction,
          bankId: editingTransaction.bankId || banks[0]?.id || ''
        }),
      });

      if (response.ok) {
        await loadTransactions(); // Recharger les transactions
        setEditingTransaction({
          id: '',
          amount: 0,
          description: '',
          date: new Date().toISOString().split('T')[0],
          shared: false,
          categoryId: categories[0]?.id || '',
          bankId: banks.filter(bank => bank.accountType === 'CURRENT')[0]?.id || ''
        });
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
    }
  };

  // Filtrer les transactions selon la banque sélectionnée et autres filtres
  const filteredTransactions = transactions.filter(transaction => {
    // Filtre par banque sélectionnée
    if (selectedBank && transaction.bankId !== selectedBank.id) {
      return false;
    }
    
    // Filtre par catégorie
    if (filters.categoryId) {
      if (filters.categoryId === 'undefined') {
        // Filtre pour les transactions sans catégorie
        if (transaction.categoryId) return false;
      } else {
        // Filtre pour une catégorie spécifique
        if (transaction.categoryId !== filters.categoryId) return false;
      }
    }
    
    // Filtre par type partagé
    if (filters.shared !== '' && transaction.shared.toString() !== filters.shared) {
      return false;
    }
    
    // Filtre par date de début
    if (filters.startDate && transaction.date < filters.startDate) {
      return false;
    }
    
    // Filtre par date de fin
    if (filters.endDate && transaction.date > filters.endDate) {
      return false;
    }
    
    return true;
  });
  
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
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
      <style>{editableCellStyle}</style>
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Transactions
          </h2>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Banque</label>
            <select
              value={selectedBank?.id || ''}
              onChange={(e) => {
                const bank = banks.find(b => b.id === e.target.value);
                setSelectedBank(bank || null);
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Toutes les banques</option>
              {banks.filter(bank => bank.accountType === 'CURRENT').map(bank => (
                <option key={bank.id} value={bank.id}>{bank.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Catégorie</label>
            <select
              value={filters.categoryId}
              onChange={(e) => setFilters({...filters, categoryId: e.target.value})}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Toutes</option>
              <option value="undefined">Non défini</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date début</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date fin</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Partagé</label>
            <select
              value={filters.shared}
              onChange={(e) => setFilters({...filters, shared: e.target.value})}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Tous</option>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Catégorie
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                Banque
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Montant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                Partagé
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
                  type="date"
                  value={editingTransaction?.date || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, date: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  required
                />
              </td>
              <td className="px-6 py-4">
                <input
                  type="text"
                  value={editingTransaction?.description || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, description: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="Description de la transaction"
                  required
                />
              </td>
              <td className="px-6 py-4">
                <select
                  value={editingTransaction?.categoryId || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, categoryId: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                >
                  <option value="">Non défini</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-6 py-4">
                <select
                  value={editingTransaction?.bankId || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, bankId: e.target.value} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  required
                >
                  <option value="">Sélectionnez une banque</option>
                  {banks.filter(bank => bank.accountType === 'CURRENT').map(bank => (
                    <option key={bank.id} value={bank.id}>{bank.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-6 py-4">
                <input
                  type="number"
                  step="0.01"
                  value={editingTransaction?.amount || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, amount: parseFloat(e.target.value) || 0} : null)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  placeholder="0.00"
                  required
                />
              </td>
              <td className="px-6 py-4">
                <label className="flex items-center text-xs">
                  <input
                    type="checkbox"
                    checked={editingTransaction?.shared || false}
                    onChange={(e) => setEditingTransaction(prev => prev ? {...prev, shared: e.target.checked} : null)}
                    className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-1 text-gray-700">Partagé</span>
                </label>
              </td>
              <td className="px-6 py-4">
                <div className="flex space-x-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddTransaction(e);
                    }}
                    className="px-2 py-1 text-xs border border-transparent rounded text-white bg-green-600 hover:bg-green-700"
                    title="Sauvegarder"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTransaction({
                        id: '',
                        amount: 0,
                        description: '',
                        date: new Date().toISOString().split('T')[0],
                        shared: false,
                        categoryId: categories[0]?.id || '',
                        bankId: banks.filter(bank => bank.accountType === 'CURRENT')[0]?.id || ''
                      });
                    }}
                    className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-700 bg-white hover:bg-gray-50"
                    title="Effacer"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
            {filteredTransactions.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingId === transaction.id ? (
                    <input
                      type="date"
                      value={editingTransaction?.date || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, date: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'date' ? (
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
                    <span 
                      onDoubleClick={() => handleInlineEdit(transaction.id, 'date')}
                      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell"
                      title="Double-cliquez pour éditer"
                    >
                      {formatDate(transaction.date)}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingId === transaction.id ? (
                    <input
                      type="text"
                      value={editingTransaction?.description || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, description: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'description' ? (
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
                    <span 
                      onDoubleClick={() => handleInlineEdit(transaction.id, 'description')}
                      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell"
                      title="Double-cliquez pour éditer"
                    >
                      {transaction.description}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingId === transaction.id ? (
                    <select
                      value={editingTransaction?.categoryId || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, categoryId: e.target.value} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    >
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'category' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    >
                      <option value="">Non défini</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span 
                      onDoubleClick={() => handleInlineEdit(transaction.id, 'category')}
                      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" 
                      style={{ 
                        backgroundColor: transaction.category ? transaction.category.color + '20' : '#e5e7eb', 
                        color: transaction.category ? transaction.category.color : '#6b7280' 
                      }}
                      title="Double-cliquez pour éditer"
                    >
                      {transaction.category ? transaction.category.name : 'Non défini'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'bank' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    >
                      {banks.filter(bank => bank.accountType === 'CURRENT').map(bank => (
                        <option key={bank.id} value={bank.id}>{bank.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div 
                      onDoubleClick={() => handleInlineEdit(transaction.id, 'bank')}
                      className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell flex items-center"
                      title="Double-cliquez pour éditer"
                    >
                      {transaction.bank.image ? (
                        <img
                          src={`http://localhost:3001${transaction.bank.image}`}
                          alt={transaction.bank.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: transaction.bank.color }}>
                          {transaction.bank.shortName}
                        </div>
                      )}
                      <span className="ml-2">{transaction.bank.name}</span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingId === transaction.id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editingTransaction?.amount || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, amount: parseFloat(e.target.value)} : null)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'amount' ? (
                    <input
                      type="number"
                      step="0.01"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <span 
                      onDoubleClick={() => handleInlineEdit(transaction.id, 'amount')}
                      className={`cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      title="Double-cliquez pour éditer"
                    >
                      {formatAmount(transaction.amount)}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {editingId === transaction.id ? (
                    <input
                      type="checkbox"
                      checked={editingTransaction?.shared || false}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, shared: e.target.checked} : null)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'shared' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      autoFocus
                    >
                      <option value="true">Oui</option>
                      <option value="false">Non</option>
                    </select>
                  ) : (
                    <span 
                      onDoubleClick={() => handleInlineEdit(transaction.id, 'shared')}
                      className={`cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 editable-cell inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        transaction.shared ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                      title="Double-cliquez pour éditer"
                    >
                      {transaction.shared ? 'Oui' : 'Non'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {editingId === transaction.id ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSave}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancel}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <button
                        onClick={() => handleDelete(transaction.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        
        {filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune transaction</h3>
            <p className="mt-1 text-sm text-gray-500">Commencez par ajouter une nouvelle transaction.</p>
          </div>
        )}
      </div>
    </div>
  );
}
