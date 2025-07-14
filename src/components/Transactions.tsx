import { useState, useEffect } from 'react';
import { PlusIcon, CheckIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAppStore } from '../store';
import type { Transaction } from '../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TransactionFormData {
  amount: string;
  description: string;
  date: string;
  categoryId: string;
  shared: boolean;
}

export default function Transactions() {
  const { 
    transactions, 
    categories, 
    users, 
    currentUser,
    loadTransactions, 
    loadCategories,
    loadUsers,
    addTransaction,
    updateTransaction,
    removeTransaction,
    dateRange
  } = useAppStore();

  const [showForm, setShowForm] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<TransactionFormData>({
    amount: '',
    description: '',
    date: '',
    categoryId: '',
    shared: false
  });
  const [formData, setFormData] = useState<TransactionFormData>({
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    categoryId: '',
    shared: false
  });

  useEffect(() => {
    console.log('🔄 Transactions useEffect triggered with dateRange:', dateRange);
    loadTransactions();
    loadCategories();
    loadUsers();
  }, [dateRange.startDate, dateRange.endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const effectiveUser = currentUser || users[0];
    
    if (!effectiveUser || !formData.amount || !formData.description || !formData.categoryId) {
      return;
    }

    const transactionData = {
      amount: parseFloat(formData.amount),
      description: formData.description,
      date: formData.date,
      categoryId: formData.categoryId,
      shared: formData.shared,
      userId: effectiveUser.id
    };

    try {
      const response = await fetch('http://localhost:3001/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transactionData),
      });
      
      if (response.ok) {
        const newTransaction = await response.json();
        addTransaction(newTransaction);
      }
      
      setFormData({
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        categoryId: '',
        shared: false
      });
      setShowForm(false);
    } catch (error) {
      console.error('Error saving transaction:', error);
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
    setEditingData({
      amount: Math.abs(transaction.amount).toString(), // Toujours positif pour l'édition
      description: transaction.description,
      date: transaction.date.split('T')[0],
      categoryId: transaction.categoryId,
      shared: transaction.shared
    });
  };

  const handleSaveEdit = async (transactionId: string) => {
    console.log('Tentative de sauvegarde:', { transactionId, editingData });
    
    // Validation des données
    if (!editingData.amount || !editingData.description || !editingData.categoryId || !editingData.date) {
      console.error('Tous les champs sont requis', editingData);
      return;
    }

    try {
      // Trouver la catégorie pour déterminer le type
      const category = categories.find(c => c.id === editingData.categoryId);
      if (!category) {
        console.error('Catégorie non trouvée');
        return;
      }
      
      // Calculer le montant selon le type de catégorie
      let amount = parseFloat(editingData.amount);
      if (category.type === 'EXPENSE' && amount > 0) {
        amount = -amount; // Les dépenses sont négatives
      }
      
      const dataToSend = {
        amount: amount,
        description: editingData.description,
        date: editingData.date,
        categoryId: editingData.categoryId,
        shared: editingData.shared
      };
      
      console.log('Données envoyées:', dataToSend);
      
      const response = await fetch(`http://localhost:3001/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });
      
      console.log('Réponse du serveur:', response.status);
      
      if (response.ok) {
        const updatedTransaction = await response.json();
        console.log('Transaction mise à jour:', updatedTransaction);
        updateTransaction(transactionId, updatedTransaction);
        setEditingTransactionId(null);
        setEditingData({
          amount: '',
          description: '',
          date: '',
          categoryId: '',
          shared: false
        });
        // Recharger les transactions pour être sûr
        loadTransactions();
      } else {
        const errorData = await response.text();
        console.error('Erreur lors de la mise à jour:', response.status, errorData);
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
    setEditingData({
      amount: '',
      description: '',
      date: '',
      categoryId: '',
      shared: false
    });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette transaction ?')) {
      try {
        const response = await fetch(`http://localhost:3001/api/transactions/${id}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          removeTransaction(id);
        }
      } catch (error) {
        console.error('Error deleting transaction:', error);
      }
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({
      amount: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      categoryId: '',
      shared: false
    });
  };

  const formatAmount = (amount: number, categoryType: string) => {
    const formattedAmount = new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
    
    if (categoryType === 'EXPENSE') {
      return `-${formattedAmount}`;
    }
    return formattedAmount;
  };

  const getAmountColor = (categoryType: string) => {
    switch (categoryType) {
      case 'INCOME':
        return 'text-green-600';
      case 'EXPENSE':
        return 'text-red-600';
      case 'FIXED':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Debug info */}
      <div className="text-sm text-gray-500 bg-gray-100 p-2 rounded">
        Transactions chargées: {transactions.length} | Période: {dateRange.startDate} à {dateRange.endDate}
        <button 
          onClick={() => { console.log('🔄 Force reload'); loadTransactions(); }}
          className="ml-2 px-2 py-1 bg-blue-500 text-white rounded text-xs"
        >
          Forcer rechargement
        </button>
      </div>
      
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Transactions
          </h2>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
            Ajouter une transaction
          </button>
        </div>
      </div>

      {/* Formulaire d'ajout/modification */}
      {showForm && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Nouvelle transaction
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
                  Montant (€)
                </label>
                <input
                  type="number"
                  id="amount"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input
                  type="date"
                  id="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <input
                type="text"
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">
                Catégorie
              </label>
              <select
                id="categoryId"
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                <option value="">Sélectionner une catégorie</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="shared"
                checked={formData.shared}
                onChange={(e) => setFormData({ ...formData, shared: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="shared" className="ml-2 block text-sm text-gray-900">
                Transaction partagée
              </label>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Ajouter
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tableau des transactions */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Transactions récentes ({transactions.length})
          </h3>
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Aucune transaction trouvée. Ajoutez votre première transaction !
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Catégorie
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Utilisateur
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Montant
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {editingTransactionId === transaction.id ? (
                          <input
                            type="date"
                            value={editingData.date}
                            onChange={(e) => setEditingData({ ...editingData, date: e.target.value })}
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        ) : (
                          format(new Date(transaction.date), 'dd/MM/yyyy', { locale: fr })
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {editingTransactionId === transaction.id ? (
                          <input
                            type="text"
                            value={editingData.description}
                            onChange={(e) => setEditingData({ ...editingData, description: e.target.value })}
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          />
                        ) : (
                          <>
                            {transaction.description}
                            {transaction.shared && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                Partagé
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {editingTransactionId === transaction.id ? (
                          <select
                            value={editingData.categoryId}
                            onChange={(e) => setEditingData({ ...editingData, categoryId: e.target.value })}
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          >
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center">
                            <span
                              className="w-3 h-3 rounded-full mr-2"
                              style={{ backgroundColor: transaction.category.color }}
                            />
                            {transaction.category.name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <span
                            className="w-3 h-3 rounded-full mr-2"
                            style={{ backgroundColor: transaction.user.color }}
                          />
                          {transaction.user.name}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getAmountColor(transaction.category.type)}`}>
                        {editingTransactionId === transaction.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              step="0.01"
                              value={editingData.amount}
                              onChange={(e) => setEditingData({ ...editingData, amount: e.target.value })}
                              className="w-24 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                            <label className="flex items-center text-sm">
                              <input
                                type="checkbox"
                                checked={editingData.shared}
                                onChange={(e) => setEditingData({ ...editingData, shared: e.target.checked })}
                                className="mr-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              Partagé
                            </label>
                          </div>
                        ) : (
                          formatAmount(transaction.amount, transaction.category.type)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {editingTransactionId === transaction.id ? (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleSaveEdit(transaction.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-gray-600 hover:text-gray-900"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleEdit(transaction)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(transaction.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
