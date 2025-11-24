import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Bank, User } from '../types/index.js';

// Helper function pour obtenir les informations du type de compte
const getAccountTypeInfo = (accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT') => {
  switch (accountType) {
    case 'CURRENT':
      return {
        label: 'Compte courant',
        color: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        icon: '🏛️'
      };
    case 'SAVINGS':
      return {
        label: 'Livret d\'épargne',
        color: 'bg-gradient-to-r from-green-500 to-emerald-500',
        icon: '💰'
      };
    case 'INVESTMENT':
      return {
        label: 'Compte d\'investissement',
        color: 'bg-gradient-to-r from-purple-500 to-pink-500',
        icon: '📈'
      };
    default:
      return {
        label: 'Compte courant',
        color: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        icon: '🏛️'
      };
  }
};

export default function Banks() {
  const { banks, transactions, users, loadBanks, loadTransactions, setSelectedBank, selectedUser } = useAppStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedBanks, setArchivedBanks] = useState<Bank[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    shortName: '',
    iban: '',
    balance: 0,
    accountType: 'CURRENT' as 'CURRENT' | 'SAVINGS' | 'INVESTMENT',
    userIds: [] as string[], // Utilisateurs qui auront accès à ce compte
    createdAt: new Date().toISOString().split('T')[0] // Date au format YYYY-MM-DD
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Filter visible banks (non-archived)
  const visibleBanks = banks.filter(bank => !bank.archived);

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
  }, [loadBanks, loadTransactions, showArchived, selectedUser]);

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

  const handleRestoreBank = async (bankId: string) => {
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
    console.log('🔧 formData:', formData);
    console.log('🔧 accountType value:', formData.accountType);
    
    // Vérifier qu'au moins un utilisateur est sélectionné
    if (formData.userIds.length === 0) {
      alert('Veuillez sélectionner au moins un utilisateur pour ce compte');
      return;
    }
    
    try {
      const url = editingBank ? `/api/banks/${editingBank.id}` : '/api/banks';
      const method = editingBank ? 'PUT' : 'POST';
      
      console.log('🔧 Making request to:', url, 'with method:', method);
      
      // Créer un objet avec toutes les données du formulaire
      const bankData = {
        name: formData.name,
        shortName: formData.shortName,
        iban: formData.iban,
        balance: parseFloat(formData.balance.toString()),
        accountType: formData.accountType,
        createdAt: formData.createdAt,
        userIds: formData.userIds // Envoyer directement le tableau d'IDs
      };
      
      // Créer le FormData
      const formDataToSend = new FormData();
      
      // Ajouter les données JSON
      formDataToSend.append('data', JSON.stringify(bankData));
      
      // Ajouter le fichier image s'il y en a un
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
        const responseData = await response.json();
        console.log('🔧 API Response data:', responseData);
        
        // Vérifier si la réponse contient la banque mise à jour
        if (responseData && responseData.accountType) {
          console.log('🔧 Updated bank data from API:', responseData);
        }
        
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

  const handleEdit = (bank: Bank) => {
    console.log('🔧 Editing bank:', bank);
    console.log('🔧 Bank account type:', bank.accountType);
    setEditingBank(bank);
    setShowAddForm(false); // Fermer le formulaire d'ajout si ouvert
    setFormData({
      name: bank.name,
      shortName: bank.shortName || '',
      iban: bank.iban || '',
      balance: bank.balance,
      accountType: bank.accountType,
      userIds: bank.users?.map(u => u.id) || [],
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

  const handleArchive = async (id: string) => {
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

  const handleDeletePermanently = async (bankId: string, bankName?: string) => {
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
        
        // Recharger à la fois les banques normales et les archives
        await Promise.all([
          loadBanks(),
          loadArchivedBanks()
        ]);
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
      userIds: [],
      createdAt: new Date().toISOString().split('T')[0]
    });
    setImageFile(null);
    setImagePreview(null);
    setEditingBank(null);
    setShowAddForm(false);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 to-blue-600 shadow-xl">
        <div className="absolute inset-0 bg-black opacity-20"></div>
        <div className="relative px-6 py-12">
          <div className="max-w-7xl mx-auto">
            <div className="md:flex md:items-center md:justify-between">
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold text-white sm:text-4xl">
                  {selectedUser ? `Banques de ${selectedUser.name}` : 'Mes Banques'}
                </h1>
                <p className="mt-2 text-lg text-purple-100">
                  {showArchived 
                    ? 'Gérer les banques archivées' 
                    : 'Gérez vos comptes bancaires et visualisez vos finances'
                  }
                </p>
              </div>
              <div className="mt-6 flex space-x-3 md:mt-0">
                <button
                  onClick={() => {
                    setShowArchived(!showArchived);
                    if (!showArchived) {
                      loadArchivedBanks();
                    }
                  }}
                  className="inline-flex items-center px-6 py-3 border border-purple-300 rounded-xl text-sm font-medium text-white bg-purple-600 bg-opacity-20 backdrop-blur-sm hover:bg-opacity-30 transition-all duration-200"
                >
                  <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8l6 6m0 0l6-6m-6 6V3" />
                  </svg>
                  {showArchived ? 'Vue principale' : 'Archives'}
                </button>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-lg"
                >
                  <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Nouvelle banque
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {showArchived ? (
            /* Section Archives */
            <div className="space-y-6">
              <div className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-yellow-500 bg-opacity-20 rounded-lg">
                    <svg className="h-6 w-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Banques archivées</h3>
                    <p className="text-slate-300">La suppression définitive effacera toutes les données associées</p>
                  </div>
                </div>
              </div>
              
              {archivedBanks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto h-24 w-24 text-slate-400 mb-4">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-slate-300 mb-2">Aucune banque archivée</h3>
                  <p className="text-slate-400">Les banques archivées apparaîtront ici</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {archivedBanks.map((bank) => (
                    <div key={bank.id} className="bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-xl p-6 border border-slate-600 hover:border-slate-500 transition-all duration-200">
                      <div className="flex items-center space-x-4 mb-4">
                        {bank.image ? (
                          <img src={`http://localhost:3001${bank.image}`} alt={bank.name} className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: bank.color }}>
                            {bank.shortName}
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="font-semibold text-white">{bank.name}</h3>
                          <p className="text-slate-400 text-sm">{getAccountTypeInfo(bank.accountType).label}</p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRestoreBank(bank.id)}
                          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Restaurer
                        </button>
                        <button
                          onClick={() => handleDeletePermanently(bank.id)}
                          className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Section Banques Principales */
            <div className="space-y-8">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-6 text-white shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100 text-sm font-medium">Total Comptes</p>
                      <p className="text-3xl font-bold">{visibleBanks.length}</p>
                    </div>
                    <div className="p-3 bg-white bg-opacity-20 rounded-xl">
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl p-6 text-white shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100 text-sm font-medium">Solde Total</p>
                      <p className="text-3xl font-bold">
                        {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
                          visibleBanks.reduce((sum, bank) => sum + bank.balance, 0)
                        )}
                      </p>
                    </div>
                    <div className="p-3 bg-white bg-opacity-20 rounded-xl">
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100 text-sm font-medium">Dernière Transaction</p>
                      <p className="text-lg font-semibold">
                        {transactions.length > 0 ? 'Aujourd\'hui' : 'Aucune'}
                      </p>
                    </div>
                    <div className="p-3 bg-white bg-opacity-20 rounded-xl">
                      <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Banks Grid */}
              {visibleBanks.length === 0 ? (
                <div className="text-center py-16">
                  <div className="mx-auto h-24 w-24 text-slate-400 mb-6">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-slate-300 mb-2">Aucune banque trouvée</h3>
                  <p className="text-slate-400 mb-6">Commencez par ajouter votre première banque</p>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Ajouter une banque
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visibleBanks.map((bank) => {
                    const accountTypeInfo = getAccountTypeInfo(bank.accountType);
                    const bankUsers = bank.users?.map((u: User) => u.name).filter(Boolean) || [];
                    
                    return (
                      <div
                        key={bank.id}
                        onClick={() => handleBankClick(bank)}
                        className="group bg-slate-800 bg-opacity-50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 hover:border-purple-500 hover:shadow-2xl hover:shadow-purple-500/25 transition-all duration-300 cursor-pointer transform hover:scale-[1.02]"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center space-x-4">
                            {bank.image ? (
                              <img
                                src={`http://localhost:3001${bank.image}`}
                                alt={bank.name}
                                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-slate-600 group-hover:ring-purple-500 transition-all duration-300"
                              />
                            ) : (
                              <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold ring-2 ring-slate-600 group-hover:ring-purple-500 transition-all duration-300"
                                style={{ backgroundColor: bank.color }}
                              >
                                {bank.shortName}
                              </div>
                            )}
                            <div>
                              <h3 className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors">
                                {bank.name}
                              </h3>
                              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white ${accountTypeInfo.color}`}>
                                <span className="mr-1">{accountTypeInfo.icon}</span>
                                {accountTypeInfo.label}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(bank);
                            }}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all duration-200"
                          >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </button>
                        </div>

                        {/* Balance */}
                        <div className="mb-6">
                          <p className="text-slate-400 text-sm mb-1">Solde disponible</p>
                          <p className="text-3xl font-bold text-white">
                            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(bank.balance)}
                          </p>
                        </div>

                        {/* Users */}
                        {bankUsers.length > 0 && (
                          <div className="mb-4">
                            <p className="text-slate-400 text-sm mb-2">Propriétaires</p>
                            <div className="flex -space-x-2">
                              {bank.users?.slice(0, 3).map((user) => (
                                <div key={user.id} className="relative">
                                  {user.avatar ? (
                                    <img
                                      src={user.avatar}
                                      alt={user.name}
                                      className="w-8 h-8 rounded-full ring-2 ring-slate-800 object-cover"
                                      title={user.name}
                                    />
                                  ) : (
                                    <div
                                      className="w-8 h-8 rounded-full ring-2 ring-slate-800 bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold"
                                      title={user.name}
                                    >
                                      {user.name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {bank.users && bank.users.length > 3 && (
                                <div className="w-8 h-8 rounded-full ring-2 ring-slate-800 bg-slate-600 flex items-center justify-center text-white text-xs font-bold">
                                  +{bank.users.length - 3}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                          <div className="text-slate-400 text-sm">
                            {bank.iban ? `****${bank.iban.slice(-4)}` : 'Pas d\'IBAN'}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchive(bank.id);
                              }}
                              className="p-2 text-slate-400 hover:text-yellow-400 hover:bg-slate-700 rounded-lg transition-all duration-200"
                              title="Archiver"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8l6 6m0 0l6-6m-6 6V3" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal d'ajout/modification */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  {editingBank ? 'Modifier la banque' : 'Ajouter une nouvelle banque'}
                </h3>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingBank(null);
                    resetForm();
                  }}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all duration-200"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Nom de la banque *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="ex: Crédit Agricole"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Nom court *
                    </label>
                    <input
                      type="text"
                      value={formData.shortName}
                      onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="ex: CA"
                      maxLength={4}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      IBAN
                    </label>
                    <input
                      type="text"
                      value={formData.iban}
                      onChange={(e) => setFormData({...formData, iban: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="FR76 1234 5678 9012 3456 7890 123"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Solde initial
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.balance}
                      onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Type de compte
                    </label>
                    <select
                      value={formData.accountType}
                      onChange={(e) => setFormData({...formData, accountType: e.target.value as 'CURRENT' | 'SAVINGS' | 'INVESTMENT'})}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="CURRENT">🏛️ Compte courant</option>
                      <option value="SAVINGS">💰 Livret d'épargne</option>
                      <option value="INVESTMENT">📈 Compte d'investissement</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Date d'ouverture
                    </label>
                    <input
                      type="date"
                      value={formData.createdAt}
                      onChange={(e) => setFormData({...formData, createdAt: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Propriétaires * (sélectionnez au moins un utilisateur)
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {users.map(user => (
                      <label key={user.id} className="flex items-center space-x-3 p-3 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.userIds.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({...formData, userIds: [...formData.userIds, user.id]});
                            } else {
                              setFormData({...formData, userIds: formData.userIds.filter(id => id !== user.id)});
                            }
                          }}
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-slate-500 rounded bg-slate-600"
                        />
                        <div className="flex items-center space-x-3">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold">
                              {user.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                          )}
                          <span className="text-white font-medium">{user.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  {formData.userIds.length === 0 && (
                    <p className="text-red-400 text-sm mt-2">Veuillez sélectionner au moins un propriétaire</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Logo de la banque
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                      id="bank-image"
                    />
                    <label
                      htmlFor="bank-image"
                      className="flex items-center px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white hover:bg-slate-600 transition-colors cursor-pointer"
                    >
                      <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Choisir une image
                    </label>
                    {imagePreview && (
                      <img src={imagePreview} alt="Aperçu" className="w-16 h-16 rounded-xl object-cover" />
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-4 pt-6 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingBank(null);
                      resetForm();
                    }}
                    className="px-6 py-3 border border-slate-600 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700 transition-all duration-200"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!formData.name.trim() || !formData.shortName.trim() || formData.userIds.length === 0}
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {editingBank ? 'Modifier' : 'Ajouter'}
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
