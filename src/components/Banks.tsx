import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Bank } from '../types/index.js';

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
  const { banks, loadBanks, setSelectedBank, selectedUser, users } = useAppStore();
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
    sharedUserIds: [] as string[]
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    // Forcer le rechargement des banques
    const initBanks = async () => {
      setLoading(true);
      try {
        await loadBanks();
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
  }, [loadBanks, showArchived]);

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

  const handleRemoveSharedAccess = async (bankId: string, userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir retirer l\'accès à ce compte ?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/banks/${bankId}/share/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadBanks();
      }
    } catch (error) {
      console.error('Error removing shared access:', error);
    }
  };

  const handleEdit = (bank: Bank) => {
    setEditingBank(bank);
    setFormData({
      name: bank.name,
      shortName: bank.shortName || '',
      iban: bank.iban || '',
      balance: bank.balance,
      accountType: bank.accountType,
      isShared: bank.isShared,
      sharedUserIds: bank.sharedUsers?.map(u => u.id) || []
    });
    
    // Set image preview if bank has an image
    if (bank.image) {
      setImagePreview(`http://localhost:3001${bank.image}`);
    } else {
      setImagePreview(null);
    }
    setImageFile(null);
    
    setShowAddForm(true);
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
      sharedUserIds: []
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

  const getAccountTypeInfo = (accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT') => {
    switch (accountType) {
      case 'CURRENT':
        return { label: 'Compte courant', color: 'bg-blue-100 text-blue-800' };
      case 'SAVINGS':
        return { label: 'Livret d\'épargne', color: 'bg-green-100 text-green-800' };
      case 'INVESTMENT':
        return { label: 'Compte d\'investissement', color: 'bg-purple-100 text-purple-800' };
      default:
        return { label: 'Compte courant', color: 'bg-blue-100 text-blue-800' };
    }
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

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
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
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Ajouter une banque
              </button>
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

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {editingBank ? 'Modifier la banque' : 'Ajouter une banque'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nom</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nom court</label>
              <input
                type="text"
                value={formData.shortName}
                onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Ex: BNP, CA, LCL"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Solde</label>
              <input
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value)})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type de compte</label>
              <select
                value={formData.accountType}
                onChange={(e) => setFormData({...formData, accountType: e.target.value as 'CURRENT' | 'SAVINGS' | 'INVESTMENT'})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                required
              >
                <option value="CURRENT">Compte courant</option>
                <option value="SAVINGS">Livret d'épargne</option>
                <option value="INVESTMENT">Compte d'investissement</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">IBAN</label>
              <input
                type="text"
                value={formData.iban}
                onChange={(e) => setFormData({...formData, iban: e.target.value})}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Ex: FR76 1234 5678 9012 3456 789"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Logo de la banque</label>
              {imagePreview && (
                <div className="mb-4">
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Prévisualisation"
                      className="h-20 w-20 object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-sm text-gray-500 mt-1">
                Formats acceptés: PNG, JPG, GIF, WebP. Taille max: 5MB
              </p>
            </div>
            <div className="md:col-span-2 flex justify-end space-x-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {editingBank ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      )}

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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedBanks.map((bank) => (
                  <div key={bank.id} className="bg-gray-50 shadow rounded-lg overflow-hidden opacity-75">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {banks.map((bank) => (
          <div key={bank.id} className="bg-white shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
            <div 
              className="p-6 cursor-pointer hover:bg-gray-50 transition-colors flex-1"
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
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-gray-900">{bank.name}</h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAccountTypeInfo(bank.accountType).color}`}>
                        {getAccountTypeInfo(bank.accountType).label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {bank.iban || 'Aucun IBAN'}
                      {!selectedUser && bank.users && bank.users.length > 0 && (
                        <span className="ml-2 text-blue-600">
                          • {bank.users.map(u => u.name).join(', ')}
                          {bank.isShared && <span className="ml-1 text-green-600">(Partagé)</span>}
                        </span>
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
              <div className="text-sm text-gray-500">
                Créé le {new Date(bank.createdAt).toLocaleDateString('fr-FR')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {banks.length === 0 && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a1 1 0 011-1h1a1 1 0 011 1v2M7 19h10" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune banque</h3>
          <p className="mt-1 text-sm text-gray-500">Commencez par ajouter une nouvelle banque.</p>
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
