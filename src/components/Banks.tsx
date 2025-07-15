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
  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    color: '#3b82f6',
    iban: '',
    balance: 0,
    isShared: false,
    sharedUserIds: [] as string[]
  });

  useEffect(() => {
    // Forcer le rechargement des banques
    const initBanks = async () => {
      setLoading(true);
      try {
        await loadBanks();
      } catch (error) {
        console.error('Error loading banks:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initBanks();
  }, [loadBanks]);

  const handleBankClick = (bank: Bank) => {
    console.log('🏦 Bank clicked:', bank.name);
    setSelectedBank(bank);
    console.log('🏦 Selected bank set, navigating to transactions...');
    navigate('/transactions');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUser) {
      alert('Veuillez sélectionner un utilisateur');
      return;
    }
    
    try {
      const url = editingBank ? `/api/banks/${editingBank.id}` : '/api/banks';
      const method = editingBank ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          userId: selectedUser.id
        }),
      });

      if (response.ok) {
        await loadBanks(); // Recharger les données depuis le store
        resetForm();
      }
    } catch (error) {
      console.error('Error saving bank:', error);
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
      color: bank.color,
      iban: bank.iban || '',
      balance: bank.balance,
      isShared: bank.isShared,
      sharedUserIds: bank.sharedUsers?.map(u => u.id) || []
    });
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
        await loadBanks(); // Recharger les données depuis le store
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting bank:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      shortName: '',
      color: '#3b82f6',
      iban: '',
      balance: 0,
      isShared: false,
      sharedUserIds: []
    });
    setEditingBank(null);
    setShowAddForm(false);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
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
          <p className="text-sm text-gray-500 mt-1">Cliquez sur une banque pour voir ses transactions</p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          {selectedUser && (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Ajouter une banque
            </button>
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
              <label className="block text-sm font-medium text-gray-700">Couleur</label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({...formData, color: e.target.value})}
                className="mt-1 block w-full h-10 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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

      {/* Banks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {banks.map((bank) => (
          <div key={bank.id} className="bg-white shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
            <div 
              className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => handleBankClick(bank)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
                    style={{ backgroundColor: bank.color }}
                  >
                    {bank.shortName}
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">{bank.name}</h3>
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setBankToShare(bank);
                        setShowShareModal(true);
                      }}
                      className="text-green-600 hover:text-green-900"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h8m-4-4v8m8-8v8m-4-4H4" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold text-gray-900">
                  {formatAmount(bank.balance)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Solde actuel
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
