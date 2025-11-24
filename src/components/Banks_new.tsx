import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Bank } from '../types';

type FormData = {
  name: string;
  shortName: string;
  iban: string;
  balance: number;
  accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT';
  userIds: string[];
  createdAt: string;
};

type BankUser = {
  id: string;
  name: string;
  role: string;
  createdAt: string;
  avatar?: string;
};

type BankWithUsers = Bank & {
  users?: BankUser[];
};

export default function Banks() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBank, setEditingBank] = useState<BankWithUsers | null>(null);
  const [_imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [archivedBanks, setArchivedBanks] = useState<BankWithUsers[]>([]);
  const [showArchivedBanks, setShowArchivedBanks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allBanks, setAllBanks] = useState<BankWithUsers[]>([]);
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    shortName: '',
    iban: '',
    balance: 0,
    accountType: 'CURRENT',
    userIds: [],
    createdAt: new Date().toISOString().split('T')[0]
  });

  const { transactions, users, loadBanks, loadTransactions, setSelectedBank, selectedUser } = useAppStore();

  // Fonction pour filtrer les banques actives selon l'utilisateur sélectionné
  const getActiveBanks = () => {
    const activeBanks = allBanks.filter(bank => !bank.archivedAt);
    
    if (selectedUser) {
      return activeBanks.filter(bank => 
        bank.users?.some(user => user.id === selectedUser.id)
      );
    }
    
    return activeBanks;
  };

  // Utility functions
  const getAccountTypeInfo = (type: string) => {
    switch (type) {
      case 'CURRENT':
        return { 
          label: 'Compte courant',
          color: 'from-blue-600 to-blue-800',
          textColor: 'text-blue-100'
        };
      case 'SAVINGS':
        return { 
          label: 'Livret d\'épargne',
          color: 'from-green-600 to-green-800',
          textColor: 'text-green-100'
        };
      case 'INVESTMENT':
        return { 
          label: 'Compte d\'investissement',
          color: 'from-purple-600 to-purple-800',
          textColor: 'text-purple-100'
        };
      default:
        return { 
          label: 'Compte',
          color: 'from-gray-600 to-gray-800',
          textColor: 'text-gray-100'
        };
    }
  };

  // Data loading
  useEffect(() => {
    loadData();
  }, [selectedUser]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await Promise.all([loadBanks(), loadTransactions()]);
      
      // Charger toutes les banques avec leurs utilisateurs
      const banksResponse = await fetch('http://localhost:3001/api/banks/with-users');
      if (!banksResponse.ok) throw new Error('Erreur lors du chargement des banques');
      const banksData = await banksResponse.json();
      
      setAllBanks(banksData);
      setArchivedBanks(banksData.filter((bank: BankWithUsers) => bank.archivedAt));
      
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      setError('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  // Form handlers
  const resetForm = () => {
    setFormData({
      name: '',
      shortName: '',
      iban: '',
      balance: 0,
      accountType: 'CURRENT',
      userIds: [],
      createdAt: new Date().toISOString().split('T')[0]
    });
    setImagePreview(null);
    setImageFile(null);
    setShowAddForm(false);
    setEditingBank(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = new FormData();
      submitData.append('name', formData.name);
      submitData.append('shortName', formData.shortName);
      submitData.append('iban', formData.iban);
      submitData.append('balance', formData.balance.toString());
      submitData.append('accountType', formData.accountType);
      submitData.append('userIds', JSON.stringify(formData.userIds));
      submitData.append('createdAt', formData.createdAt);
      
      if (imageFile) {
        submitData.append('image', imageFile);
      }

      const url = editingBank 
        ? `http://localhost:3001/api/banks/${editingBank.id}`
        : 'http://localhost:3001/api/banks';
      
      const method = editingBank ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        body: submitData,
      });

      if (!response.ok) throw new Error('Erreur lors de la sauvegarde');

      await loadData();
      resetForm();
    } catch (error) {
      console.error('Erreur:', error);
      setError('Impossible de sauvegarder la banque');
    }
  };

  const handleEdit = (bank: BankWithUsers) => {
    setEditingBank(bank);
    setFormData({
      name: bank.name,
      shortName: bank.shortName || '',
      iban: bank.iban || '',
      balance: bank.balance,
      accountType: bank.accountType as 'CURRENT' | 'SAVINGS' | 'INVESTMENT',
      userIds: bank.users?.map(u => u.id) || [],
      createdAt: bank.createdAt ? bank.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]
    });
    setImagePreview(bank.image ? `http://localhost:3001${bank.image}` : null);
    setShowAddForm(false);
  };

  const handleArchive = async (bankId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir archiver cette banque ?')) return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/banks/${bankId}/archive`, {
        method: 'PUT',
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'archivage');
      
      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      setError('Impossible d\'archiver la banque');
    }
  };

  const handleRestore = async (bankId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/banks/${bankId}/restore`, {
        method: 'PUT',
      });
      
      if (!response.ok) throw new Error('Erreur lors de la restauration');
      
      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      setError('Impossible de restaurer la banque');
    }
  };

  const handlePermanentDelete = async (bankId: string, bankName: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer définitivement "${bankName}" et toutes ses données ? Cette action est irréversible.`)) return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/banks/${bankId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      
      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      setError('Impossible de supprimer la banque');
    }
  };

  const handleBankClick = (bank: BankWithUsers) => {
    if (bank.accountType === 'CURRENT') {
      setSelectedBank(bank);
    }
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    });
  };

  const activeBanks = getActiveBanks();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderBottomColor: '#6226fa' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      {/* Header avec effet glassmorphism */}
      <div className="backdrop-blur-xl bg-white/10 rounded-2xl p-8 mb-8 border border-white/20">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Mes Banques</h1>
            <p className="text-purple-200">Gérez vos comptes bancaires en toute simplicité</p>
          </div>
          
          {/* Statistiques rapides */}
          <div className="flex space-x-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{activeBanks.length}</p>
              <p className="text-purple-200 text-sm">Comptes actifs</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white">
                {formatAmount(activeBanks.reduce((sum: number, bank: BankWithUsers) => sum + bank.balance, 0))}
              </p>
              <p className="text-purple-200 text-sm">Solde total</p>
            </div>
          </div>
        </div>

        {/* Section banques archivées */}
        {archivedBanks.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowArchivedBanks(!showArchivedBanks)}
              className="flex items-center space-x-2 text-purple-300 hover:text-white transition-colors"
            >
              <svg 
                className={`w-5 h-5 transform transition-transform ${showArchivedBanks ? 'rotate-90' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Banques archivées ({archivedBanks.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Banques archivées */}
      {showArchivedBanks && archivedBanks.length > 0 && (
        <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 mb-8 border border-white/10">
          <h3 className="text-xl font-semibold text-white mb-4">Banques archivées</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {archivedBanks.map((bank) => (
              <div key={bank.id} className="backdrop-blur-lg bg-white/10 rounded-xl p-6 border border-white/20 opacity-75">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    {bank.image ? (
                      <img
                        src={`http://localhost:3001${bank.image}`}
                        alt={bank.name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-white/30"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold bg-gradient-to-br from-gray-500 to-gray-700">
                        {bank.shortName}
                      </div>
                    )}
                    <div className="ml-3">
                      <h4 className="text-white font-medium">{bank.name}</h4>
                      <p className="text-purple-200 text-sm">
                        Archivé le {bank.archivedAt ? new Date(bank.archivedAt).toLocaleDateString('fr-FR') : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleRestore(bank.id)}
                      className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
                    >
                      Restaurer
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(bank.id, bank.name)}
                      className="px-3 py-1 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
                <div className="text-white font-bold">
                  {formatAmount(bank.balance)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grille des banques actives */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeBanks.length === 0 ? (
          <div className="col-span-full">
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-12 text-center border border-white/10">
              <svg className="mx-auto h-16 w-16 text-purple-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h4M9 3v18" />
              </svg>
              <p className="text-purple-200 text-lg">Aucune banque trouvée</p>
              <p className="text-purple-300 text-sm mt-2">Ajoutez votre première banque pour commencer</p>
            </div>
          </div>
        ) : (
          // Cartes des banques avec design moderne
          activeBanks.map((bank) => {
            const accountInfo = getAccountTypeInfo(bank.accountType);
            
            return (
              <div key={bank.id}>
                {editingBank?.id === bank.id ? (
                  // Formulaire d'édition avec design moderne
                  <div className="backdrop-blur-xl bg-white/10 rounded-2xl p-6 border border-white/20">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-white">Modifier la banque</h3>
                        <button
                          type="button"
                          onClick={resetForm}
                          className="text-purple-300 hover:text-white"
                        >
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Formulaire simplifié pour l'édition */}
                      <div className="space-y-4">
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Nom de la banque"
                          required
                        />
                        
                        <div className="grid grid-cols-2 gap-4">
                          <input
                            type="text"
                            value={formData.shortName}
                            onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                            className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Nom court"
                            maxLength={3}
                            required
                          />
                          
                          <select
                            value={formData.accountType}
                            onChange={(e) => setFormData({...formData, accountType: e.target.value as any})}
                            className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            <option value="CURRENT" className="bg-gray-800">Compte courant</option>
                            <option value="SAVINGS" className="bg-gray-800">Livret d'épargne</option>
                            <option value="INVESTMENT" className="bg-gray-800">Compte d'investissement</option>
                          </select>
                        </div>
                        
                        <input
                          type="number"
                          step="0.01"
                          value={formData.balance}
                          onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value) || 0})}
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Solde"
                          required
                        />
                        
                        <div className="flex justify-end space-x-3">
                          <button
                            type="button"
                            onClick={resetForm}
                            className="px-6 py-2 bg-white/10 text-purple-300 rounded-xl hover:bg-white/20 transition-colors"
                          >
                            Annuler
                          </button>
                          <button
                            type="submit"
                            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all"
                          >
                            Sauvegarder
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                ) : (
                  // Carte de banque normale avec design moderne
                  <div 
                    className={`group backdrop-blur-xl bg-gradient-to-br ${accountInfo.color} rounded-2xl p-6 border border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer`}
                    onClick={() => handleBankClick(bank)}
                  >
                    {/* Header de la carte */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center">
                        {bank.image ? (
                          <img
                            src={`http://localhost:3001${bank.image}`}
                            alt={bank.name}
                            className="w-14 h-14 rounded-full object-cover border-2 border-white/50"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold bg-white/20 backdrop-blur-sm">
                            {bank.shortName}
                          </div>
                        )}
                        <div className="ml-4">
                          <h3 className="text-xl font-bold text-white">{bank.name}</h3>
                          <p className={`text-sm ${accountInfo.textColor} opacity-90`}>
                            {accountInfo.label}
                          </p>
                        </div>
                      </div>
                      
                      {/* Menu actions */}
                      <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(bank);
                          }}
                          className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        >
                          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(bank.id);
                          }}
                          className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                        >
                          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8l6 6m0 0l6-6m-6 6V3" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Utilisateurs avec avatars */}
                    {!selectedUser && bank.users && bank.users.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-white/80 text-sm">Propriétaires:</span>
                          <div className="flex space-x-1">
                            {bank.users?.slice(0, 3).map((user) => (
                              <div key={user.id} className="relative group/user">
                                {user.avatar ? (
                                  <img
                                    src={`http://localhost:3001${user.avatar}`}
                                    alt={user.name}
                                    className="w-6 h-6 rounded-full object-cover border border-white/50"
                                  />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-white/30 text-white text-xs flex items-center justify-center font-medium">
                                    {user.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-black/80 text-white text-xs rounded opacity-0 group-hover/user:opacity-100 transition-opacity whitespace-nowrap">
                                  {user.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* IBAN */}
                    {bank.iban && (
                      <div className="mb-4">
                        <p className="text-white/60 text-xs font-mono">{bank.iban}</p>
                      </div>
                    )}

                    {/* Solde principal */}
                    <div className="mb-6">
                      <p className="text-white/80 text-sm mb-1">Solde disponible</p>
                      <p className="text-3xl font-bold text-white">
                        {formatAmount(bank.balance)}
                      </p>
                    </div>

                    {/* Transactions récentes */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-white/80 text-sm">Transactions récentes</span>
                        {bank.accountType === 'CURRENT' && (
                          <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                      
                      {transactions.filter(t => t.bankId === bank.id).length > 0 ? (
                        <div className="space-y-1">
                          {transactions
                            .filter(t => t.bankId === bank.id)
                            .slice(0, 3)
                            .map((transaction) => (
                              <div key={transaction.id} className="flex justify-between items-center text-sm">
                                <span className="text-white/70 truncate flex-1 mr-2">
                                  {transaction.description}
                                </span>
                                <span className={`font-semibold ${
                                  transaction.amount > 0 ? 'text-green-300' : 'text-red-300'
                                }`}>
                                  {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                                </span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-white/50 text-sm">Aucune transaction récente</p>
                      )}
                    </div>

                    {/* Statut du compte */}
                    {bank.accountType !== 'CURRENT' && (
                      <div className="mt-4 p-2 bg-white/10 rounded-lg">
                        <p className="text-white/70 text-xs text-center">
                          Consultation seulement
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Carte d'ajout */}
        {!showAddForm && !editingBank ? (
          <div 
            className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 border-2 border-dashed border-white/30 hover:border-white/50 transition-all duration-300 hover:scale-105 cursor-pointer group"
            onClick={() => setShowAddForm(true)}
          >
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-white font-semibold text-lg mb-2">Ajouter une banque</p>
              <p className="text-purple-300 text-sm">Créez un nouveau compte bancaire</p>
            </div>
          </div>
        ) : showAddForm && (
          // Formulaire d'ajout avec design moderne
          <div className="backdrop-blur-xl bg-white/10 rounded-2xl p-6 border border-white/20">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Nouvelle banque</h3>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-purple-300 hover:text-white"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Nom de la banque"
                  required
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={formData.shortName}
                    onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                    className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Nom court (BNP)"
                    maxLength={3}
                    required
                  />
                  
                  <select
                    value={formData.accountType}
                    onChange={(e) => setFormData({...formData, accountType: e.target.value as any})}
                    className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="CURRENT" className="bg-gray-800">Compte courant</option>
                    <option value="SAVINGS" className="bg-gray-800">Livret d'épargne</option>
                    <option value="INVESTMENT" className="bg-gray-800">Compte d'investissement</option>
                  </select>
                </div>
                
                <input
                  type="text"
                  value={formData.iban}
                  onChange={(e) => setFormData({...formData, iban: e.target.value})}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="IBAN (optionnel)"
                />
                
                <input
                  type="number"
                  step="0.01"
                  value={formData.balance}
                  onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value) || 0})}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Solde initial"
                  required
                />
                
                {/* Sélection des utilisateurs */}
                <div className="space-y-2">
                  <label className="text-white text-sm font-medium">Utilisateurs ayant accès</label>
                  <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                    {users.map(user => (
                      <label key={user.id} className="flex items-center space-x-3 p-2 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.userIds.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                userIds: [...formData.userIds, user.id]
                              });
                            } else {
                              setFormData({
                                ...formData,
                                userIds: formData.userIds.filter(id => id !== user.id)
                              });
                            }
                          }}
                          className="w-4 h-4 rounded border-white/30 text-purple-600 focus:ring-purple-500 bg-white/10"
                        />
                        <div className="flex items-center space-x-2">
                          {user.avatar ? (
                            <img
                              src={`http://localhost:3001${user.avatar}`}
                              alt={user.name}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-white">{user.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-6 py-2 bg-white/10 text-purple-300 rounded-xl hover:bg-white/20 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!formData.name.trim() || !formData.shortName.trim() || formData.userIds.length === 0}
                    className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Créer la banque
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Toast d'erreur */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl border border-red-400/50">
          <div className="flex items-center space-x-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
