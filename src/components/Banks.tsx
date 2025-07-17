import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Bank } from '../types/index.js';

// Helper function pour obtenir les informations du type de compte
const getAccountTypeInfo = (accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT') => {
  switch (accountType) {
    case 'CURRENT':
      return {
        label: 'Compte courant',
        color: 'bg-blue-100 text-blue-800'
      };
    case 'SAVINGS':
      return {
        label: 'Livret d\'épargne',
        color: 'bg-green-100 text-green-800'
      };
    case 'INVESTMENT':
      return {
        label: 'Compte d\'investissement',
        color: 'bg-purple-100 text-purple-800'
      };
    default:
      return {
        label: 'Compte courant',
        color: 'bg-blue-100 text-blue-800'
      };
  }
};

// Modal pour partager un compte
interface ShareBankModalProps {
  bank: Bank;
  isOpen: boolean;
  onClose: () => void;
  onShare: (userId: string) => void;
}

function ShareBankModal({ bank, isOpen, onClose, onShare }: ShareBankModalProps) {
  const { users } = useAppStore();
  const [selectedUserId, setSelectedUserId] = useState('');
  
  if (!isOpen) return null;

  const availableUsers = users.filter(user => 
    !bank.users?.some(bankUser => bankUser.id === user.id)
  );

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Partager le compte "{bank.name}"
          </h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sélectionner un utilisateur
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="">Choisir un utilisateur</option>
              {availableUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => {
                if (selectedUserId) {
                  onShare(selectedUserId);
                  setSelectedUserId('');
                }
              }}
              disabled={!selectedUserId}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Partager
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Banks() {
  const { banks, transactions, loadBanks, loadTransactions, setSelectedBank, selectedUser } = useAppStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [bankToShare, setBankToShare] = useState<Bank | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedBanks, setArchivedBanks] = useState<Bank[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    iban: '',
    balance: 0,
    accountType: 'CURRENT' as 'CURRENT' | 'SAVINGS' | 'INVESTMENT',
    isShared: false,
    sharedUserIds: [] as string[],
    createdAt: new Date().toISOString().split('T')[0] // Date au format YYYY-MM-DD
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    // Forcer le rechargement des banques
    const initBanks = async () => {
      setLoading(true);
      try {
        await loadBanks();
        await loadTransactions();
        if (showArchived) {
          await loadArchivedBanks();
        }
      } catch (error) {
        console.error('Error loading banks:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initBanks();
  }, [loadBanks, loadTransactions, showArchived]);

  const loadArchivedBanks = async () => {
    try {
      const url = selectedUser 
        ? `/api/banks?userId=${selectedUser.id}&archived=true`
        : '/api/banks?archived=true';
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setArchivedBanks(data);
      }
    } catch (error) {
      console.error('Error loading archived banks:', error);
    }
  };

  const handleRestore = async (bankId: string) => {
    try {
      const response = await fetch(`/api/banks/${bankId}/restore`, {
        method: 'PUT',
      });

      if (response.ok) {
        await loadBanks();
        await loadArchivedBanks();
      }
    } catch (error) {
      console.error('Error restoring bank:', error);
    }
  };

  const handleBankClick = (bank: Bank) => {
    console.log('🏦 Bank clicked:', bank.name);
    
    // Empêcher la sélection des comptes qui ne sont pas des comptes courants
    if (bank.accountType !== 'CURRENT') {
      alert(`Ce compte "${bank.name}" est un ${getAccountTypeInfo(bank.accountType).label.toLowerCase()}. Seuls les comptes courants peuvent être sélectionnés pour voir les transactions.`);
      return;
    }
    
    setSelectedBank(bank);
    console.log('🏦 Selected bank set, navigating to transactions...');
    navigate('/transactions');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔧 handleSubmit called');
    console.log('🔧 selectedUser:', selectedUser);
    console.log('🔧 formData:', formData);
    
    if (!selectedUser) {
      alert('Veuillez sélectionner un utilisateur');
      return;
    }
    
    try {
      const url = editingBank ? `/api/banks/${editingBank.id}` : '/api/banks';
      const method = editingBank ? 'PUT' : 'POST';
      
      console.log('🔧 Making request to:', url, 'with method:', method);
      
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('shortName', formData.shortName);
      formDataToSend.append('iban', formData.iban);
      formDataToSend.append('balance', formData.balance.toString());
      formDataToSend.append('accountType', formData.accountType);
      formDataToSend.append('userId', selectedUser.id);
      formDataToSend.append('createdAt', formData.createdAt);
      
      if (imageFile) {
        formDataToSend.append('image', imageFile);
      }
      
      const response = await fetch(url, {
        method,
        body: formDataToSend,
      });

      console.log('🔧 Response status:', response.status);
      console.log('🔧 Response ok:', response.ok);

      if (response.ok) {
        console.log('🔧 Bank saved successfully, reloading banks...');
        await loadBanks(); // Recharger les données depuis le store
        resetForm();
        console.log('🔧 Banks reloaded and form reset');
      } else {
        const errorData = await response.json().catch(() => null);
        console.error('🔧 Error response:', errorData);
        const errorMessage = errorData?.details || errorData?.error || 'Erreur lors de l\'enregistrement de la banque';
        alert(`Erreur: ${errorMessage}`);
      }
    } catch (error) {
      console.error('🔧 Error saving bank:', error);
      alert('Erreur lors de l\'enregistrement de la banque');
    }
  };

  const handleShare = async (userId: string) => {
    if (!bankToShare) return;
    
    try {
      const response = await fetch(`/api/banks/${bankToShare.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        await loadBanks();
        setShowShareModal(false);
        setBankToShare(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors du partage');
      }
    } catch (error) {
      console.error('Error sharing bank:', error);
      alert('Erreur lors du partage');
    }
  };

  const handleEdit = (bank: Bank) => {
    setEditingBank(bank);
    setShowAddForm(false); // Fermer le formulaire d'ajout si ouvert
    setFormData({
      name: bank.name,
      shortName: bank.shortName || '',
      iban: bank.iban || '',
      balance: bank.balance,
      accountType: bank.accountType,
      isShared: bank.isShared,
      sharedUserIds: bank.sharedUsers?.map(u => u.id) || [],
      createdAt: bank.createdAt ? new Date(bank.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    });
    
    // Set image preview if bank has an image
    if (bank.image) {
      setImagePreview(`http://localhost:3001${bank.image}`);
    } else {
      setImagePreview(null);
    }
    setImageFile(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette banque ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/banks/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.archived) {
          alert(`Banque archivée car elle contient ${result.transactionCount} transaction(s). Vous pouvez la restaurer depuis les archives.`);
        } else {
          alert('Banque supprimée définitivement.');
        }
        
        await loadBanks(); // Recharger les données depuis le store
        await loadArchivedBanks(); // Recharger les archives
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting bank:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handlePermanentDelete = async (bankId: string, bankName: string) => {
    if (!confirm(`⚠️ ATTENTION ⚠️\n\nÊtes-vous sûr de vouloir supprimer définitivement la banque "${bankName}" ?\n\nCette action supprimera :\n- La banque elle-même\n- TOUTES ses transactions\n- Tous ses budgets associés\n- Toutes ses récurrences associées\n\nCette action est IRRÉVERSIBLE !`)) {
      return;
    }

    try {
      const response = await fetch(`/api/banks/${bankId}/permanent`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✅ Banque "${result.bankName}" supprimée définitivement.\n\n${result.deletedTransactions} transaction(s) supprimée(s).`);
        
        await loadArchivedBanks(); // Recharger les archives
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la suppression définitive');
      }
    } catch (error) {
      console.error('Error permanently deleting bank:', error);
      alert('Erreur lors de la suppression définitive');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      shortName: '',
      iban: '',
      balance: 0,
      accountType: 'CURRENT',
      isShared: false,
      sharedUserIds: [],
      createdAt: new Date().toISOString().split('T')[0]
    });
    setImageFile(null);
    setImagePreview(null);
    setEditingBank(null);
    setShowAddForm(false);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Vérifier le type de fichier
      if (!file.type.startsWith('image/')) {
        alert('Veuillez sélectionner un fichier image');
        return;
      }
      
      // Vérifier la taille (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('L\'image doit faire moins de 5MB');
        return;
      }
      
      setImageFile(file);
      
      // Créer une prévisualisation
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
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
            {selectedUser ? `Banques de ${selectedUser.name}` : 'Toutes les banques'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {showArchived 
              ? 'Gérer les banques archivées - Cliquez sur "Restaurer" pour remettre une banque en service'
              : 'Cliquez sur une banque pour voir ses transactions'
            }
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
          {selectedUser && (
            <>
              <button
                onClick={() => {
                  setShowArchived(!showArchived);
                  if (!showArchived) {
                    loadArchivedBanks();
                  }
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8l6 6m0 0l6-6m-6 6V3" />
                </svg>
                {showArchived ? 'Masquer les archives' : 'Voir les archives'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Archived Banks */}
      {showArchived && (
        <div className="space-y-4">
          <div className="border-t pt-6">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Attention :</strong> La suppression définitive d'une banque archivée effacera également toutes ses transactions, budgets et récurrences associés. Cette action est irréversible.
                  </p>
                </div>
              </div>
            </div>
            
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Banques archivées ({archivedBanks.length})
            </h3>
            
            {archivedBanks.length === 0 ? (
              <div className="text-center py-8">
                <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8l6 6m0 0l6-6m-6 6V3" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">Aucune banque archivée</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
                {archivedBanks.slice().reverse().map((bank) => (
                  <div key={bank.id} className="bg-gray-50 shadow rounded-lg overflow-hidden opacity-75 flex flex-col h-full min-h-[300px]">
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {bank.image ? (
                            <img
                              src={`http://localhost:3001${bank.image}`}
                              alt={bank.name}
                              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200 opacity-50"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gray-400">
                              {bank.shortName}
                            </div>
                          )}
                          <div className="ml-3">
                            <h4 className="text-sm font-medium text-gray-900">{bank.name}</h4>
                            <p className="text-xs text-gray-500">
                              Archivé le {bank.archivedAt ? new Date(bank.archivedAt).toLocaleDateString('fr-FR') : 'N/A'}
                            </p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleRestore(bank.id)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            title="Restaurer cette banque"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Restaurer
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(bank.id, bank.name)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            title="Supprimer définitivement cette banque et toutes ses données"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Supprimer
                          </button>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="text-sm font-medium text-gray-900">
                          {formatAmount(bank.balance)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Solde lors de l'archivage
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regular Banks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
        {banks.slice().reverse().map((bank) => (
          <div key={bank.id}>
            {/* Si la banque est en cours d'édition, afficher le formulaire d'édition */}
            {editingBank?.id === bank.id ? (
              <div className="bg-white shadow rounded-lg border-2 border-blue-300 flex flex-col h-full min-h-[400px]">
                <div className="flex flex-col h-full">
                  <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    {/* Section principale - même structure qu'une vraie carte */}
                    <div className="p-6 flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center">
                          {/* Logo/Image ou nom court - cliquable pour choisir photo */}
                          <div 
                            className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-100 border-2 border-dashed border-blue-300 flex-shrink-0 cursor-pointer hover:bg-blue-200 transition-colors"
                            onClick={() => document.getElementById('imageInput-edit')?.click()}
                            title="Cliquez pour choisir une image"
                          >
                            {imagePreview ? (
                              <img
                                src={imagePreview}
                                alt="Prévisualisation"
                                className="w-full h-full rounded-full object-cover"
                              />
                            ) : (
                              <div className="text-blue-600 text-xs font-bold">
                                {formData.shortName || 'LOGO'}
                              </div>
                            )}
                          </div>
                          {/* Input file caché */}
                          <input
                            id="imageInput-edit"
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                          />
                          <div className="ml-4 flex-1">
                            {/* Nom de la banque */}
                            <input
                              type="text"
                              value={formData.name}
                              onChange={(e) => setFormData({...formData, name: e.target.value})}
                              className="text-lg font-medium text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                              placeholder="Nom de la banque"
                              required
                            />
                            {/* Type de compte */}
                            <select
                              value={formData.accountType}
                              onChange={(e) => setFormData({...formData, accountType: e.target.value as 'CURRENT' | 'SAVINGS' | 'INVESTMENT'})}
                              className="text-sm text-gray-500 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full mt-1"
                              required
                            >
                              <option value="CURRENT">Compte courant</option>
                              <option value="SAVINGS">Livret d'épargne</option>
                              <option value="INVESTMENT">Compte d'investissement</option>
                            </select>
                          </div>
                        </div>
                        {/* Bouton fermer */}
                        <button
                          type="button"
                          onClick={resetForm}
                          className="text-gray-400 hover:text-gray-600 ml-2"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Champs supplémentaires */}
                      <div className="space-y-3 mb-4">
                        <div>
                          <input
                            type="text"
                            value={formData.shortName}
                            onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Nom court (ex: BNP, CA, LCL)"
                            required
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            value={formData.iban}
                            onChange={(e) => setFormData({...formData, iban: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="IBAN (ex: FR76 1234 5678 9012 3456 789)"
                          />
                        </div>
                        <div>
                          <input
                            type="date"
                            value={formData.createdAt}
                            onChange={(e) => setFormData({...formData, createdAt: e.target.value})}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                      </div>

                      {/* Solde - même position qu'une vraie carte */}
                      <div className="mt-4">
                        <div className="text-sm text-gray-500 mb-1">
                          Solde
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.balance}
                          onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value)})}
                          className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                          placeholder="0.00"
                          required
                        />
                      </div>
                    </div>
                    
                    {/* Footer - même structure qu'une vraie carte */}
                    <div className="bg-gray-50 px-6 py-3">
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-500">
                          Modification
                        </div>
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={resetForm}
                            className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                          >
                            Annuler
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1 text-xs border border-transparent rounded text-white bg-blue-600 hover:bg-blue-700"
                          >
                            Sauvegarder
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              /* Carte normale de banque */
              <div className="bg-white shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-full min-h-[400px]">
                <div 
                  className={`p-6 transition-colors flex-1 ${
                    bank.accountType === 'CURRENT' 
                      ? 'cursor-pointer hover:bg-gray-50' 
                      : 'cursor-not-allowed opacity-75 bg-gray-50'
                  }`}
                  onClick={() => handleBankClick(bank)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {bank.image ? (
                        <img
                          src={`http://localhost:3001${bank.image}`}
                          alt={bank.name}
                          className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 flex-shrink-0"
                        />
                      ) : (
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold bg-blue-600 flex-shrink-0"
                        >
                          {bank.shortName}
                        </div>
                      )}
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">{bank.name}</h3>
                        <p className="text-sm text-gray-500">
                          {getAccountTypeInfo(bank.accountType).label}
                          {bank.accountType !== 'CURRENT' && (
                            <span className="ml-2 text-orange-600 font-medium">(Non sélectionnable)</span>
                          )}
                          {!selectedUser && bank.users && bank.users.length > 0 && (
                            <span className="ml-2 text-blue-600">
                              • {bank.users.map(u => u.name).join(', ')}
                            </span>
                          )}
                          {selectedUser && bank.isShared && (
                            <span className="ml-2 text-green-600">(Partagé)</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {selectedUser && (
                      <div className="flex space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(bank);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                          title="Modifier"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setBankToShare(bank);
                            setShowShareModal(true);
                          }}
                          className="text-green-600 hover:text-green-900"
                          title="Partager"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(bank.id);
                          }}
                          className="text-red-600 hover:text-red-900"
                          title="Supprimer"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <div className="text-sm text-gray-500 mb-1">
                      Solde actuel
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatAmount(bank.balance)}
                    </div>
                  </div>
                </div>
                <div 
                  className="bg-gray-50 px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleBankClick(bank)}
                >
                  {/* Afficher les 3 dernières transactions de cette banque */}
                  {transactions.filter(t => t.bankId === bank.id).length > 0 ? (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">
                        Dernières transactions:
                      </p>
                      <div className="space-y-1">
                        {transactions
                          .filter(t => t.bankId === bank.id)
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
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      Aucune transaction récente
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {/* Carte d'ajout de banque */}
        {selectedUser && (
          <div className="bg-white shadow rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors flex flex-col h-full min-h-[400px]">
            {!showAddForm ? (
              <div 
                className="cursor-pointer flex flex-col items-center justify-center h-full p-6"
                onClick={() => {
                  setShowAddForm(true);
                  setEditingBank(null); // Annuler l'édition si en cours
                }}
              >
                <div className="text-gray-400 mb-4">
                  <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <p className="text-gray-500 text-center">
                  Ajouter un compte
                </p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                  {/* Section principale - même structure qu'une vraie carte */}
                  <div className="p-6 flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        {/* Logo/Image ou nom court - cliquable pour choisir photo */}
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-100 border-2 border-dashed border-blue-300 flex-shrink-0 cursor-pointer hover:bg-blue-200 transition-colors"
                          onClick={() => document.getElementById('imageInput-2')?.click()}
                          title="Cliquez pour choisir une image"
                        >
                          {imagePreview ? (
                            <img
                              src={imagePreview}
                              alt="Prévisualisation"
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="text-blue-600 text-xs font-bold">
                              {formData.shortName || 'LOGO'}
                            </div>
                          )}
                        </div>
                        {/* Input file caché */}
                        <input
                          id="imageInput-2"
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                        <div className="ml-4 flex-1">
                          {/* Nom de la banque */}
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="text-lg font-medium text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                            placeholder="Nom de la banque"
                            required
                          />
                          {/* Type de compte */}
                          <select
                            value={formData.accountType}
                            onChange={(e) => setFormData({...formData, accountType: e.target.value as 'CURRENT' | 'SAVINGS' | 'INVESTMENT'})}
                            className="text-sm text-gray-500 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full mt-1"
                            required
                          >
                            <option value="CURRENT">Compte courant</option>
                            <option value="SAVINGS">Livret d'épargne</option>
                            <option value="INVESTMENT">Compte d'investissement</option>
                          </select>
                        </div>
                      </div>
                      {/* Bouton fermer */}
                      <button
                        type="button"
                        onClick={resetForm}
                        className="text-gray-400 hover:text-gray-600 ml-2"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Champs supplémentaires */}
                    <div className="space-y-3 mb-4">
                      <div>
                        <input
                          type="text"
                          value={formData.shortName}
                          onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Nom court (ex: BNP, CA, LCL)"
                          required
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={formData.iban}
                          onChange={(e) => setFormData({...formData, iban: e.target.value})}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="IBAN (ex: FR76 1234 5678 9012 3456 789)"
                        />
                      </div>
                      <div>
                        <input
                          type="date"
                          value={formData.createdAt}
                          onChange={(e) => setFormData({...formData, createdAt: e.target.value})}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>

                    {/* Solde - même position qu'une vraie carte */}
                    <div className="mt-4">
                      <div className="text-sm text-gray-500 mb-1">
                        Solde initial
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.balance}
                        onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value)})}
                        className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>
                  
                  {/* Footer - même structure qu'une vraie carte */}
                  <div className="bg-gray-50 px-6 py-3">
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        Nouveau compte
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={resetForm}
                          className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 text-xs border border-transparent rounded text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Créer
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {banks.length === 0 && !selectedUser && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a1 1 0 011-1h1a1 1 0 011 1v2M7 19h10" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune banque</h3>
          <p className="mt-1 text-sm text-gray-500">Sélectionnez un utilisateur pour voir ses banques.</p>
        </div>
      )}
      
      {banks.length === 0 && selectedUser && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">                {/* Carte d'ajout de banque quand il n'y a pas de banques */}
                <div className="bg-white shadow rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors flex flex-col h-full min-h-[400px]">
                  {!showAddForm ? (
                    <div 
                      className="cursor-pointer flex flex-col items-center justify-center h-full p-6"
                      onClick={() => {
                        setShowAddForm(true);
                        setEditingBank(null); // Annuler l'édition si en cours
                      }}
                    >
                      <div className="text-gray-400 mb-4">
                        <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-center">
                        Ajouter un compte
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full">
                      <form onSubmit={handleSubmit} className="flex flex-col h-full">
                        {/* Section principale - même structure qu'une vraie carte */}
                        <div className="p-6 flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center">
                              {/* Logo/Image ou nom court - cliquable pour choisir photo */}
                              <div 
                                className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-100 border-2 border-dashed border-blue-300 flex-shrink-0 cursor-pointer hover:bg-blue-200 transition-colors"
                                onClick={() => document.getElementById('imageInput-3')?.click()}
                                title="Cliquez pour choisir une image"
                              >
                                {imagePreview ? (
                                  <img
                                    src={imagePreview}
                                    alt="Prévisualisation"
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="text-blue-600 text-xs font-bold">
                                    {formData.shortName || 'LOGO'}
                                  </div>
                                )}
                              </div>
                              {/* Input file caché */}
                              <input
                                id="imageInput-3"
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="hidden"
                              />
                              <div className="ml-4 flex-1">
                                {/* Nom de la banque */}
                                <input
                                  type="text"
                                  value={formData.name}
                                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                                  className="text-lg font-medium text-gray-900 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                                  placeholder="Nom de la banque"
                                  required
                                />
                                {/* Type de compte */}
                                <select
                                  value={formData.accountType}
                                  onChange={(e) => setFormData({...formData, accountType: e.target.value as 'CURRENT' | 'SAVINGS' | 'INVESTMENT'})}
                                  className="text-sm text-gray-500 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full mt-1"
                                  required
                                >
                                  <option value="CURRENT">Compte courant</option>
                                  <option value="SAVINGS">Livret d'épargne</option>
                                  <option value="INVESTMENT">Compte d'investissement</option>
                                </select>
                              </div>
                            </div>
                            {/* Bouton fermer */}
                            <button
                              type="button"
                              onClick={resetForm}
                              className="text-gray-400 hover:text-gray-600 ml-2"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          
                          {/* Champs supplémentaires */}
                          <div className="space-y-3 mb-4">
                            <div>
                              <input
                                type="text"
                                value={formData.shortName}
                                onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Nom court (ex: BNP, CA, LCL)"
                                required
                              />
                            </div>
                            <div>
                              <input
                                type="text"
                                value={formData.iban}
                                onChange={(e) => setFormData({...formData, iban: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="IBAN (ex: FR76 1234 5678 9012 3456 789)"
                              />
                            </div>
                            <div>
                              <input
                                type="date"
                                value={formData.createdAt}
                                onChange={(e) => setFormData({...formData, createdAt: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                              />
                            </div>
                          </div>

                          {/* Solde - même position qu'une vraie carte */}
                          <div className="mt-4">
                            <div className="text-sm text-gray-500 mb-1">
                              Solde initial
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              value={formData.balance}
                              onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value)})}
                              className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                              placeholder="0.00"
                              required
                            />
                          </div>
                        </div>
                        
                        {/* Footer - même structure qu'une vraie carte */}
                        <div className="bg-gray-50 px-6 py-3">
                          <div className="flex justify-between items-center">
                            <div className="text-sm text-gray-500">
                              Première banque
                            </div>
                            <div className="flex space-x-2">
                              <button
                                type="button"
                                onClick={resetForm}
                                className="px-3 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                              >
                                Annuler
                              </button>
                              <button
                                type="submit"
                                className="px-3 py-1 text-xs border border-transparent rounded text-white bg-blue-600 hover:bg-blue-700"
                              >
                                Créer
                              </button>
                            </div>
                          </div>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
        </div>
      )}

      {/* Share Bank Modal */}
      {showShareModal && bankToShare && (
        <ShareBankModal
          bank={bankToShare}
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setBankToShare(null);
          }}
          onShare={handleShare}
        />
      )}
    </div>
  );
}
