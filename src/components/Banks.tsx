import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Bank } from '../types';
import { getAllBankBalances } from '../api/bankBalance';

// Styles pour la barre de scroll personnalisée
const scrollbarStyles = `
  /* Webkit browsers (Chrome, Safari, Edge) */
  ::-webkit-scrollbar {
    width: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: #1f2226;
    border-radius: 8px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #6226fa;
    border-radius: 8px;
    border: 1px solid #1f2226;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #7c3aed;
    border: 1px solid #1f2226;
  }
  
  ::-webkit-scrollbar-thumb:active {
    background: #6226fa;
    border: 1px solid #1f2226;
  }
  
  /* Firefox */
  html {
    scrollbar-width: thin;
    scrollbar-color: #6226fa #1f2226;
  }
  
  /* Styles spécifiques pour les conteneurs avec scroll */
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #1f2226;
    border-radius: 8px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #6226fa !important;
    border-radius: 8px;
    border: 1px solid #1f2226;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #7c3aed !important;
    border: 1px solid #1f2226;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:active {
    background: #6226fa !important;
    border: 1px solid #1f2226;
  }
  
  /* Force pour tous les scrollbars */
  * {
    scrollbar-width: thin;
    scrollbar-color: #6226fa #1f2226;
  }
`;

// Injecter les styles dans le document
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = scrollbarStyles;
  if (!document.head.querySelector('style[data-scrollbar-custom]')) {
    styleElement.setAttribute('data-scrollbar-custom', 'true');
    document.head.appendChild(styleElement);
  }
}

// Helper function pour formater l'IBAN avec un espace tous les 4 caractères
const formatIBAN = (iban: string): string => {
  // Supprimer tous les espaces existants
  const cleanIban = iban.replace(/\s+/g, '');
  
  // Ajouter un espace tous les 4 caractères
  return cleanIban.replace(/(.{4})(?=.)/g, '$1 ');
};

// Helper function pour obtenir les informations du type de compte
const getAccountTypeInfo = (accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT') => {
  switch (accountType) {
    case 'CURRENT':
      return {
        label: 'Compte courant',
        color: 'text-white'
      };
    case 'SAVINGS':
      return {
        label: 'Livret d\'épargne',
        color: 'bg-violet-900 text-violet-200'
      };
    case 'INVESTMENT':
      return {
        label: 'Compte d\'investissement',
        color: 'bg-purple-900 text-purple-200'
      };
    default:
      return {
        label: 'Compte courant',
        color: 'text-white'
      };
  }
};

// Définition de l'interface User pour éviter les erreurs de typage
interface User {
  id: string;
  name: string;
}

export default function Banks() {
  const { banks, transactions, loadBanks, loadTransactions, selectedUser, users, loadUsers } = useAppStore();
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
  
  // État pour les soldes des banques
  // Suppression de la redéclaration de bankBalances qui est déjà définie plus loin

  // Effet pour charger les données initiales (banques, transactions, utilisateurs)
  useEffect(() => {
    const initBanks = async () => {
      setLoading(true);
      try {
        await loadUsers(); // Charger les utilisateurs
        await loadBanks();
        await loadTransactions();
      } catch (error) {
        console.error('Error loading banks:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initBanks();
  }, [loadBanks, loadTransactions, loadUsers]); // Retirer banks des dépendances
  
  // Effet séparé pour mettre à jour les banques archivées quand banks change
  useEffect(() => {
    if (banks) {
      const archived = banks.filter(bank => bank.archived);
      setArchivedBanks(archived);
    }
  }, [banks]);



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

  // Stocker les soldes calculés pour éviter des recalculs inutiles
  const [bankBalances, setBankBalances] = useState<{[key: string]: number}>({});
  
  // Charger les soldes pour toutes les banques en utilisant l'API dédiée
  const loadAllBankBalances = async () => {
    try {
      if (banks.length > 0) {
        const balances = await getAllBankBalances(banks);
        setBankBalances(balances);
      }
    } catch (error) {
      console.error('Failed to load bank balances:', error);
    }
  };
  
  // Charger les soldes au chargement du composant et quand les banques changent
  useEffect(() => {
    loadAllBankBalances();
  }, [banks]);
  
  const getCurrentBalance = (bankId: string, initialBalance: number) => {
    // Utiliser le solde précalculé s'il existe, sinon utiliser le solde initial
    return bankBalances[bankId] !== undefined ? bankBalances[bankId] : initialBalance;
  };
  
  // Fonction pour forcer le rechargement des soldes (utile après ajout/modification de transaction)
  const refreshBalances = () => {
    loadAllBankBalances();
  };
  
  // Recharger les soldes quand les transactions changent
  useEffect(() => {
    refreshBalances();
  }, [transactions.length]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderBottomColor: '#6226fa' }}></div>
      </div>
    );
  }
  
  // Calculer les statistiques pour le bandeau récapitulatif
  const calculateBankStats = () => {
    if (!banks || banks.length === 0) return {
      totalBalance: 0,
      accountCount: 0,
      lastUpdate: '',
      totalAccounts: 0,
      currentAccounts: 0,
      savingsAccounts: 0,
      investmentAccounts: 0
    };

    // Calculer le solde total
    const totalBalance = banks.reduce((total, bank) => {
      const currentBalance = getCurrentBalance(bank.id, bank.balance);
      return total + currentBalance;
    }, 0);

    // Nombre de comptes
    const accountCount = banks.length;
    const totalAccounts = accountCount;
    
    // Compter les différents types de comptes
    const currentAccounts = banks.filter(bank => bank.accountType === 'CURRENT').length;
    const savingsAccounts = banks.filter(bank => bank.accountType === 'SAVINGS').length;
    const investmentAccounts = banks.filter(bank => bank.accountType === 'INVESTMENT').length;

    // Dernière mise à jour (utiliser la date la plus récente des transactions)
    let lastUpdate = '';
    if (transactions && transactions.length > 0) {
      // Trier les transactions par date décroissante
      const sortedTransactions = [...transactions].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      // Prendre la date de la transaction la plus récente
      if (sortedTransactions[0]) {
        lastUpdate = new Date(sortedTransactions[0].date).toLocaleDateString('fr-FR');
      }
    }

    return {
      totalBalance,
      accountCount,
      lastUpdate,
      totalAccounts,
      currentAccounts,
      savingsAccounts,
      investmentAccounts
    };
  };
  
  const bankStats = calculateBankStats();
  
  return (
    <div className="space-y-6 min-h-screen p-6" style={{ backgroundColor: '#202427' }}>
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
            {selectedUser ? `Banques de ${selectedUser.name}` : 'Toutes les banques'}
          </h2>
          <p className="text-sm text-gray-300 mt-1">
            {showArchived 
              ? 'Gérer les banques archivées - Cliquez sur "Restaurer" pour remettre une banque en service'
              : 'Cliquez sur une banque pour voir ses transactions'
            }
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
          >
            {showArchived ? 'Voir les banques actives' : 'Voir les banques archivées'}
          </button>
        </div>
      </div>
      
      {/* Bandeau récapitulatif */}
      {!showArchived && banks.length > 0 && (
        <div className="p-6 rounded-lg shadow-lg mb-6 mt-4" style={{ backgroundColor: '#272a2f', borderLeft: '4px solid #6226fa' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Solde total */}
            <div className="flex flex-col">
              <span className="text-sm text-gray-400 mb-1">Solde total</span>
              <span className="text-2xl font-bold text-white">{formatAmount(bankStats.totalBalance)}</span>
            </div>
            
            {/* Nombre de comptes */}
            <div className="flex flex-col">
              <span className="text-sm text-gray-400 mb-1">Nombre de comptes</span>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-white">{bankStats.totalAccounts}</span>
                <div className="flex flex-col text-xs">
                  <span className="text-gray-300">{bankStats.currentAccounts} courants</span>
                  <span className="text-violet-300">{bankStats.savingsAccounts} épargne</span>
                  <span className="text-purple-300">{bankStats.investmentAccounts} investissement</span>
                </div>
              </div>
            </div>
            
            {/* Dernière mise à jour */}
            <div className="flex flex-col">
              <span className="text-sm text-gray-400 mb-1">Dernière mise à jour</span>
              <div className="flex items-center space-x-2">
                <span className="text-white">{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <button 
                  onClick={refreshBalances}
                  className="p-1 rounded hover:bg-gray-700 transition-colors"
                  title="Rafraîchir les soldes"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        {/* Grille des banques */}
      {!showArchived && banks && banks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
          {banks.slice().reverse().map((bank: Bank) => (
            <div key={bank.id}>
              {/* Si la banque est en cours d'édition, afficher le formulaire d'édition */}
              {editingBank?.id === bank.id ? (
              <div className="shadow rounded-lg border-2 flex flex-col h-80" style={{ backgroundColor: '#272a2f', borderColor: '#6226fa' }}>
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                  {/* Section principale - même structure qu'une carte de banque */}
                  <div className="p-6 flex-1">
                    {/* Header avec logo et nom - même position que les cartes */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        {/* Logo/Image - même taille que les cartes (w-12 h-12) */}
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-dashed flex-shrink-0 cursor-pointer transition-colors"
                          style={{ borderColor: '#6226fa', backgroundColor: '#f0f0ff' }}
                          onClick={() => document.getElementById('imageInput-edit')?.click()}
                          title="Cliquez pour choisir une image"
                        >
                          {imagePreview ? (
                            <img 
                              src={imagePreview} 
                              alt="Preview" 
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-lg font-bold" style={{ color: '#6226fa' }}>
                              {formData.shortName || 'LOGO'}
                            </span>
                          )}
                        </div>
                        <input
                          id="imageInput-edit"
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                        
                        {/* Nom et informations - même position */}
                        <div className="ml-4 flex-1">
                          {/* Nom de la banque */}
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="text-lg font-medium text-white border-none focus:ring-0 p-0 bg-transparent w-full mb-1 placeholder-gray-300"
                            placeholder="Nom de la banque"
                            required
                          />
                          
                          {/* Type de compte et nom court - même ligne */}
                          <div className="flex items-center space-x-2 mb-1">
                            <select
                              value={formData.accountType}
                              onChange={(e) => {
                                console.log('🔧 Selected account type:', e.target.value);
                                setFormData({...formData, accountType: e.target.value as any});
                              }}
                              className="text-xs border-none focus:ring-0 rounded-md text-white bg-gray-800 border-gray-600 focus:ring-violet-500"
                              style={{ padding: '0.25rem 0.5rem', height: '1.75rem' }}
                            >
                              <option value="CURRENT">Compte courant</option>
                              <option value="SAVINGS">Livret d'épargne</option>
                              <option value="INVESTMENT">Compte d'investissement</option>
                            </select>

                          </div>
                          
                          {/* IBAN - même position que sur les cartes */}
                          <input
                            type="text"
                            value={formData.iban}
                            onChange={(e) => setFormData({...formData, iban: e.target.value.replace(/\s+/g, '')})}
                            className="text-xs text-gray-300 font-mono border-none focus:ring-0 p-0 bg-transparent w-full placeholder-gray-400"
                            placeholder="IBAN (ex: FR76 1234 5678 9012 3456 789)"
                          />
                        </div>
                      </div>
                      
                      {/* Bouton fermer - même position que sur les cartes */}
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={resetForm}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                          title="Annuler"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Champs supplémentaires en mode compact */}
                    <div className="space-y-2 mb-4">
                      {/* Nom court, Date et Solde sur la même ligne */}
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={formData.shortName}
                          onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                          className="px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 text-white bg-gray-800 border-gray-600 focus:ring-violet-500"
                          style={{ '--tw-ring-color': '#6226fa' } as any}
                          placeholder="Nom court (BNP)"
                          maxLength={3}
                          required
                        />
                        <input
                          type="date"
                          value={formData.createdAt}
                          onChange={(e) => setFormData({...formData, createdAt: e.target.value})}
                          className="px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 text-white bg-gray-800 border-gray-600 focus:ring-violet-500"
                          style={{ '--tw-ring-color': '#6226fa' } as any}
                          required
                        />
                        <input
                          type="number"
                          step="1"
                          value={formData.balance}
                          onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value) || 0})}
                          className="px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 font-bold text-white bg-gray-800 border-gray-600 focus:ring-violet-500"
                          style={{ '--tw-ring-color': '#6226fa' } as any}
                          placeholder="Solde initial"
                          required
                        />
                      </div>
                      
                      {/* Sélection utilisateurs - 2 utilisateurs par ligne */}
                      {(
                        <div>
                          <label className="block text-xs font-medium text-gray-300 mb-1">
                            Utilisateurs ayant accès *
                          </label>
                          <div className="flex flex-wrap gap-1 p-2 rounded max-h-16 overflow-y-auto custom-scrollbar" style={{ backgroundColor: '#1f2226', border: '1px solid #272a2f' }}>
                            {users.map(user => (
                              <label key={user.id} className="flex items-center space-x-1 cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded text-xs">
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
                                  className="w-3 h-3 rounded border-gray-600 focus:ring-2"
                                  style={{ color: '#6226fa', accentColor: '#6226fa' }}
                                />
                                <div className="flex items-center space-x-1">
                                  {user.avatar ? (
                                    <img
                                      src={`http://localhost:3001${user.avatar}`}
                                      alt={user.name}
                                      className="w-3 h-3 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-3 h-3 rounded-full text-white text-xs flex items-center justify-center" style={{ backgroundColor: '#6226fa' }}>
                                      {user.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <span className="text-xs text-gray-300">{user.name}</span>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                  
                  {/* Footer - même style que les cartes */}
                  <div className="px-6 py-3 rounded-b-lg" style={{ backgroundColor: '#1f2226' }}>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-400">
                        Modification
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={resetForm}
                          className="px-3 py-1 text-xs border rounded hover:opacity-80 text-gray-300"
                          style={{ backgroundColor: '#1f2226', borderColor: '#3a3d42' }}
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          disabled={!formData.name.trim() || !formData.shortName.trim() || formData.userIds.length === 0}
                          className="px-3 py-1 text-xs border border-transparent rounded text-white hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: '#6227f5' }}
                        >
                          Sauvegarder
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              /* Carte normale de banque */
              <div className="shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-80" style={{ backgroundColor: '#272a2f' }}>
                <div className="p-6 flex-1 flex flex-col">

                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {bank.image ? (
                        <img
                          src={`http://localhost:3001${bank.image}`}
                          alt={bank.name}
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                          style={{ backgroundColor: '#6226fa' }}
                        >
                          {bank.shortName}
                        </div>
                      )}
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-medium text-white">{bank.name}</h3>
                          <span className="text-xs text-gray-400">
                            Créé le {new Date(bank.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">
                          {getAccountTypeInfo(bank.accountType).label}
                          {!selectedUser && bank.users && bank.users.length > 0 && (
                            <span className="ml-2 text-violet-300">
                              • {bank.users.map(u => u.name).join(', ')}
                            </span>
                          )}
                        </p>
                        {bank.iban && (
                          <p className="text-xs text-gray-400 mt-1 font-mono">
                            {formatIBAN(bank.iban)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(bank);
                          }}
                          className="transition-colors text-gray-400"
                          onMouseEnter={(e) => e.currentTarget.className = 'transition-colors text-violet-300'}
                          onMouseLeave={(e) => e.currentTarget.className = 'transition-colors text-gray-400'}
                          title="Modifier"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(bank.id);
                          }}
                          className="transition-colors text-gray-400"
                          onMouseEnter={(e) => e.currentTarget.className = 'transition-colors text-red-400'}
                          onMouseLeave={(e) => e.currentTarget.className = 'transition-colors text-gray-400'}
                          title="Supprimer"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-sm text-gray-300 mb-1">
                      Solde actuel
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {formatAmount(getCurrentBalance(bank.id, bank.balance))}
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4" style={{ backgroundColor: '#1f2226' }}>
                  {/* Section des transactions agrandie */}
                  {transactions.filter(t => t.bankId === bank.id).length > 0 ? (
                    <div>
                      <div 
                        className="flex items-center justify-between mb-3"
                      >
                        <p className="text-sm font-medium text-gray-300">
                          Dernières transactions
                        </p>

                      </div>
                      <div className="space-y-2 mb-4">
                        {transactions
                          .filter(t => t.bankId === bank.id)
                          .slice(0, 3)
                          .map((transaction) => (
                            <div 
                              key={transaction.id} 
                              className="flex justify-between items-center text-sm"
                            >
                              <span className="text-gray-400 truncate flex-1 mr-2 text-xs">
                                {transaction.description}
                              </span>
                              <div className="flex items-center space-x-2">
                                <span className={`font-semibold text-xs ${
                                  transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('fr-FR')} €
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div 
                        className="flex items-center justify-between mb-3"
                      >
                        <p className="text-sm font-medium text-gray-300">
                          Transactions
                        </p>

                      </div>
                      <div className="text-sm text-gray-400 mb-4">
                        Aucune transaction récente
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        
        {/* Carte d'ajout de banque - toujours visible */}
        {!showAddForm ? (
          <div 
            className="shadow rounded-lg border-2 border-dashed transition-colors flex flex-col h-80 cursor-pointer group"
            style={{ 
              borderColor: '#616875' // couleur intermédiaire
            } as React.CSSProperties}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#6226fa';
              const icon = e.currentTarget.querySelector('.icon-plus') as HTMLElement;
              const text = e.currentTarget.querySelector('.text-add') as HTMLElement;
              if (icon) icon.style.color = '#6226fa';
              if (text) text.style.color = '#6226fa';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#616875';
              const icon = e.currentTarget.querySelector('.icon-plus') as HTMLElement;
              const text = e.currentTarget.querySelector('.text-add') as HTMLElement;
              if (icon) icon.style.color = '#616875';
              if (text) text.style.color = '#616875';
            }}
            onClick={() => {
              setShowAddForm(true);
              setEditingBank(null); // Annuler l'édition si en cours
            }}
          >
            <div className="flex flex-col items-center justify-center h-full p-6">
              <div className="mb-4 transition-colors icon-plus" style={{ color: '#616875' }}>
                <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <p className="text-center font-medium transition-colors text-add" style={{ color: '#616875' }}>
                Ajouter une banque
              </p>
            </div>
          </div>
        ) : (
          <div className="shadow rounded-lg border-2 flex flex-col h-80" style={{ backgroundColor: '#272a2f', borderColor: '#6226fa' }}>
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
              {/* Section principale - même structure qu'une carte de banque */}
              <div className="p-6 flex-1">
                {/* Header avec logo et nom - même position que les cartes */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    {/* Logo/Image - même taille que les cartes (w-12 h-12) */}
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-dashed flex-shrink-0 cursor-pointer transition-colors"
                      style={{ borderColor: '#6226fa', backgroundColor: '#f0f0ff' }}
                      onClick={() => document.getElementById('imageInput-add')?.click()}
                      title="Cliquez pour choisir une image"
                    >
                      {imagePreview ? (
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-lg font-bold" style={{ color: '#6226fa' }}>
                          {formData.shortName || '+'}
                        </span>
                      )}
                    </div>
                    <input
                      id="imageInput-add"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    
                    {/* Nom et informations - même position */}
                    <div className="ml-4 flex-1">
                      {/* Nom de la banque */}
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="text-lg font-medium text-white border-none focus:ring-0 p-0 bg-transparent w-full mb-1"
                        placeholder="Nom de la banque"
                        required
                      />
                      
                      {/* Type de compte et nom court - même ligne */}
                      <div className="flex items-center space-x-2 mb-1">
                        <select
                          value={formData.accountType}
                          onChange={(e) => setFormData({...formData, accountType: e.target.value as any})}
                          className="text-xs border-none focus:ring-0 bg-transparent rounded-md"
                          style={{ backgroundColor: '#1f2226', color: 'white', border: 'none', padding: '0.25rem 0.5rem', height: '1.75rem' }}
                        >
                          <option value="CURRENT">Compte courant</option>
                          <option value="SAVINGS">Livret d'épargne</option>
                          <option value="INVESTMENT">Compte d'investissement</option>
                        </select>

                      </div>
                      
                      {/* IBAN - même position que sur les cartes */}
                      <input
                        type="text"
                        value={formData.iban}
                        onChange={(e) => setFormData({...formData, iban: e.target.value.replace(/\s+/g, '')})}
                        className="text-xs text-gray-300 font-mono border-none focus:ring-0 p-0 bg-transparent w-full placeholder-gray-400"
                        placeholder="IBAN (ex: FR76 1234 5678 9012 3456 789)"
                      />
                    </div>
                  </div>
                  
                  {/* Boutons d'action - même position que sur les cartes */}
                  <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
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
                        }}
                        className="text-gray-400 hover:text-gray-600"
                        title="Annuler"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                
                {/* Champs supplémentaires en mode compact */}
                <div className="space-y-2 mb-4">
                  {/* Nom court, Date et Solde sur la même ligne */}
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={formData.shortName}
                      onChange={(e) => setFormData({...formData, shortName: e.target.value})}
                      className="px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1"
                      style={{ backgroundColor: '#1f2226', color: 'white', borderColor: '#3a3d42', '--tw-ring-color': '#6226fa' } as any}
                      placeholder="Nom court (BNP)"
                      maxLength={3}
                      required
                    />
                    <input
                      type="date"
                      value={formData.createdAt}
                      onChange={(e) => setFormData({...formData, createdAt: e.target.value})}
                      className="px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1"
                      style={{ backgroundColor: '#1f2226', color: 'white', borderColor: '#3a3d42', '--tw-ring-color': '#6226fa' } as any}
                      required
                    />
                    <input
                      type="number"
                      step="1"
                      value={formData.balance}
                      onChange={(e) => setFormData({...formData, balance: parseFloat(e.target.value) || 0})}
                      className="px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 font-bold"
                      style={{ backgroundColor: '#1f2226', color: 'white', borderColor: '#3a3d42', '--tw-ring-color': '#6226fa' } as any}
                      placeholder="Solde initial"
                      required
                    />
                  </div>
                  
                  {/* Sélection utilisateurs - format horizontal compact */}
                  {(
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1">
                        Utilisateurs ayant accès *
                      </label>
                      <div className="flex flex-wrap gap-1 p-2 rounded max-h-16 overflow-y-auto custom-scrollbar" style={{ backgroundColor: '#1f2226', border: '1px solid #272a2f' }}>
                        {users.map(user => (
                          <label key={user.id} className="flex items-center space-x-1 cursor-pointer hover:bg-white/10 px-1 py-0.5 rounded text-xs">
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
                              className="w-3 h-3 rounded border-gray-600 focus:ring-2"
                              style={{ color: '#6226fa', accentColor: '#6226fa' }}
                            />
                            <div className="flex items-center space-x-1">
                              {user.avatar ? (
                                <img
                                  src={`http://localhost:3001${user.avatar}`}
                                  alt={user.name}
                                  className="w-3 h-3 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-3 h-3 rounded-full text-white text-xs flex items-center justify-center" style={{ backgroundColor: '#6226fa' }}>
                                  {user.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-xs text-gray-300 truncate max-w-16">{user.name}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>
              
              {/* Footer - même style que les cartes */}
              <div className="px-6 py-3 rounded-b-lg" style={{ backgroundColor: '#1f2226' }}>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    Nouveau compte
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
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
                      }}
                      className="px-3 py-1 text-xs border rounded hover:opacity-80"
                      style={{ backgroundColor: '#1f2226', color: '#a0aec0', borderColor: '#3a3d42' }}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={!formData.name.trim() || !formData.shortName.trim() || formData.userIds.length === 0}
                      className="px-3 py-1 text-xs border border-transparent rounded text-white hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#6227f5' }}
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}
        </div>
      )}

      {/* Archived Banks Section - Moved below the main banks list */}
      {showArchived && archivedBanks && archivedBanks.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-bold text-white mb-4">Banques archivées</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
            {archivedBanks.map((bank: Bank) => (
              <div key={bank.id} className="shadow rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col h-80" style={{ backgroundColor: '#272a2f', opacity: '0.85' }}>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {bank.image ? (
                        <img
                          src={`http://localhost:3001${bank.image}`}
                          alt={bank.name}
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                          style={{ opacity: '0.7' }}
                        />
                      ) : (
                        <div 
                          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
                          style={{ backgroundColor: '#6226fa', opacity: '0.7' }}
                        >
                          {bank.shortName}
                        </div>
                      )}
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-medium text-white">{bank.name}</h3>
                          <span className="text-xs text-gray-400">
                            Archivé le {bank.archivedAt ? new Date(bank.archivedAt).toLocaleDateString('fr-FR') : 'N/A'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300">
                          {getAccountTypeInfo(bank.accountType).label}
                          {!selectedUser && bank.users && bank.users.length > 0 && (
                            <span className="ml-2 text-violet-300">
                              • {bank.users.map((u: {name: string}) => u.name).join(', ')}
                            </span>
                          )}
                        </p>
                        {bank.iban && (
                          <p className="text-xs text-gray-400 mt-1 font-mono">
                            {formatIBAN(bank.iban)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleRestore(bank.id)}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-violet-700 hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                        title="Remettre cette banque en service"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Restaurer
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(bank.id, bank.name)}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-red-700 hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        title="Supprimer définitivement cette banque et toutes ses données"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Supprimer
                      </button>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <div className="text-xl font-bold text-white">
                      {formatAmount(bank.balance)}
                    </div>
                    <div className="text-xs text-gray-400">
                      Solde lors de l'archivage
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
