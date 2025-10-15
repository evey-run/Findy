import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import type { Bank } from '../types';
import Papa from 'papaparse';
import { useLocation } from 'react-router-dom';

// CSS pour les cellules éditables
const editableCellStyle = `
  .editable-cell {
    position: relative;
    transition: background-color 0.15s;
  }
  .editable-cell:hover {
    background-color: #23272b;
  }
`;

// Styles pour la barre de scroll personnalisée
const scrollbarStyles = `
  /* Webkit browsers (Chrome, Safari, Edge) */
  ::-webkit-scrollbar {
    width: 12px;
  }
  
  ::-webkit-scrollbar-track {
    background: #1f2226;
    border-radius: 8px;
  }
  
  ::-webkit-scrollbar-thumb {
    background: #272a2f;
    border-radius: 8px;
    border: 1px solid #1f2226;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: #6227f5;
    border: 1px solid #1f2226;
  }
  
  ::-webkit-scrollbar-thumb:active {
    background: #6227f5;
    border: 1px solid #1f2226;
  }
  
  /* Firefox */
  html {
    scrollbar-width: auto;
    scrollbar-color: #272a2f #1f2226;
  }
  
  /* Styles spécifiques pour les conteneurs avec scroll */
  .custom-scrollbar::-webkit-scrollbar {
    width: 12px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #1f2226;
    border-radius: 8px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #272a2f !important;
    border-radius: 8px;
    border: 1px solid #1f2226;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #6227f5 !important;
    border: 1px solid #1f2226;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:active {
    background: #6227f5 !important;
    border: 1px solid #1f2226;
  }
  
  /* Force pour tous les scrollbars */
  * {
    scrollbar-width: auto;
    scrollbar-color: #272a2f #1f2226;
  }
  
  /* Couleur des séparateurs de lignes */
  .divide-y > * + * {
    border-top-color: #1f2226 !important;
  }
  
  .divide-gray-600 > * + * {
    border-top-color: #1f2226 !important;
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

interface EditingTransaction {
  id: string;
  amount: number;
  description: string;
  date: string;
  checked: boolean;
  categoryId: string;
  bankId?: string;
}

interface InlineEditCell {
  transactionId: string;
  field: 'amount' | 'description' | 'date' | 'category' | 'bank' | 'checked';
}

// Fonction de formatage du montant
const formatAmount = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount);
};

// Fonction de formatage de la date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('fr-FR');
};

interface TransactionsProps {
  pageName?: string;
  showHeader?: boolean;
  showFilters?: boolean;
  showPagination?: boolean;
  showActions?: boolean;
  limit?: number;
  height?: string | number;
  className?: string;
}

export default function Transactions({ 
  pageName = 'transactions', 
  showHeader = true, 
  showFilters = true, 
  showPagination = true, 
  showActions = true, 
  limit = 0, 
  height = 'auto', 
  className = '' 
}: TransactionsProps) {
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
    removeTransaction,
    addTransaction,
    loadMoreTransactions,
    appendTransactions,
    setTransactions,
    pageFilters,
    setPageFilter
  } = useAppStore();
  
  // États pour l'import CSV
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importBankId, setImportBankId] = useState<string>(''); // État séparé pour la banque dans le modal d'import CSV
  const [importProgress, setImportProgress] = useState<{
    isImporting: boolean;
    imported: number;
    total: number;
    errors: string[];
  }>({
    isImporting: false,
    imported: 0,
    total: 0,
    errors: []
  });

  // États pour le scroll infini
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 25; // Reduced for better initial performance
  
  // États pour la sélection multiple
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Vérifie si tous les utilisateurs sont sélectionnés (selectedUser est null)
  // const allUsersSelected = selectedUser === null;
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<EditingTransaction | null>(null);
  
  // Inline editing states
  const [inlineEditCell, setInlineEditCell] = useState<InlineEditCell | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  
  const [filters, setFilters] = useState({
    categoryId: '',
    checked: '',
    startDate: '',
    endDate: '',
    searchText: ''
  });

  // États pour la modification en lot
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditFilters, setBulkEditFilters] = useState({
    searchText: '',
    categoryId: '',
    bankId: '',
    checked: '',
    startDate: '',
    endDate: ''
  });
  const [bulkEditActions, setBulkEditActions] = useState({
    replaceText: { enabled: false, from: '', to: '', replaceAll: false },
    changeCategory: { enabled: false, categoryId: '' },
    changeChecked: { enabled: false, checked: false },
    changeBank: { enabled: false, bankId: '' }
  });
  const [bulkEditTransactions, setBulkEditTransactions] = useState([]);
  const [bulkEditProgress, setBulkEditProgress] = useState({
    isProcessing: false,
    processed: 0,
    total: 0,
    errors: [] as string[]
  });

  // État local pour la saisie du texte de recherche
  const [searchInput, setSearchInput] = useState('');
  
  // Récupérer les paramètres d'URL
  const location = useLocation();

  // Effet pour initialiser les filtres de page depuis le store global
  useEffect(() => {
    // Vérifier si des filtres existent déjà pour cette page
    const pageSpecificFilters = pageFilters?.[pageName];
    if (pageSpecificFilters) {
      // Synchroniser les filtres locaux avec les filtres de page stockés
      setFilters({
        categoryId: pageSpecificFilters.categoryId || '',
        checked: pageSpecificFilters.checked || '',
        startDate: pageSpecificFilters.startDate || '',
        endDate: pageSpecificFilters.endDate || '',
        searchText: pageSpecificFilters.searchText || ''
      });
      
      // Mettre à jour l'input de recherche si nécessaire
      if (pageSpecificFilters.searchText) {
        setSearchInput(pageSpecificFilters.searchText);
      }
    }
  }, [pageFilters, pageName]);

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        // Initialiser les états de pagination pour le scroll infini
        setPage(1);
        setHasMore(true);
        
        // Récupérer le paramètre de recherche depuis l'URL
        const searchParams = new URLSearchParams(location.search);
        const searchFromURL = searchParams.get('search');
        
        // Load categories and banks first for better UX
        await Promise.all([
          loadCategories(),
          loadBanks()
        ]);
        
        // Load initial transactions with proper pagination info
        console.log('🚀 Initial data load with pagination');
        
        if (searchFromURL) {
          // Mettre à jour l'input de recherche avec la valeur de l'URL
          setSearchInput(searchFromURL);
          // Mettre à jour les filtres affichés
          const newFilters = { ...filters, searchText: searchFromURL };
          setFilters(newFilters);
          // Sauvegarder les filtres dans le store pour cette page
          setPageFilter(pageName, newFilters);
        }
        
        // Use loadTransactions for initial load but with limit for pagination
        await loadTransactions({ 
          searchText: searchFromURL || undefined,
          pageName,
          limit: ITEMS_PER_PAGE
        });
        
        // Get the current state after loading to check transaction count
        const currentState = useAppStore.getState();
        const loadedCount = currentState.transactions.length;
        console.log('📦 Initial load result:', { transactionsCount: loadedCount, expectedLimit: ITEMS_PER_PAGE });
        
        // Set hasMore based on whether we got a full page of results
        const hasMoreData = loadedCount >= ITEMS_PER_PAGE;
        setHasMore(hasMoreData);
        
        // Force a check for infinite scroll after initial load
        console.log('🔄 Initial scroll check - hasMore:', hasMoreData, 'loadedCount:', loadedCount, 'ITEMS_PER_PAGE:', ITEMS_PER_PAGE);
        
        // Initialiser le formulaire d'ajout
        setEditingTransaction({
          id: '',
          amount: 0,
          description: '',
          date: new Date().toISOString().split('T')[0],
          checked: false,
          categoryId: categories[0]?.id || '',
          bankId: banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS')[0]?.id || ''
        });
      } catch (error) {
        console.error('Error initializing data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, []);
  
  // Removed transaction logging effect to reduce unnecessary updates

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
  const handleInlineEdit = (transactionId: string, field: 'amount' | 'description' | 'date' | 'category' | 'bank' | 'checked') => {
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
      case 'checked':
        value = transaction.checked.toString();
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
      case 'checked':
        updateData.checked = inlineEditValue === 'true';
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
      // Vérifier que les données requises sont présentes
      if (!editingTransaction.description || !editingTransaction.date || editingTransaction.amount === undefined) {
        console.error('Données de transaction incomplètes');
        return;
      }

      // S'assurer qu'une banque est sélectionnée
      const bankId = editingTransaction.bankId || banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS')[0]?.id;
      if (!bankId) {
        console.error('Aucune banque sélectionnée ou disponible');
        return;
      }

      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editingTransaction,
          bankId: bankId
        }),
      });

      if (response.ok) {
        const newTransaction = await response.json();
        
        // Ajouter la transaction directement au store
        addTransaction(newTransaction);
        
        // Reset du formulaire
        setEditingTransaction({
          id: '',
          amount: 0,
          description: '',
          date: new Date().toISOString().split('T')[0],
          checked: false,
          categoryId: categories[0]?.id || '',
          bankId: banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS')[0]?.id || ''
        });
      } else {
        const errorText = await response.text();
        console.error('Error creating transaction:', errorText);
        alert(`Erreur lors de l'ajout de la transaction: ${errorText}`);
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
      alert(`Erreur lors de l'ajout de la transaction: ${error}`);
    }
  };
  
  // Filtrer les transactions en fonction des critères
  const filteredTransactions = transactions.filter(transaction => {
    // Exclure les transactions liées aux banques de type investissement
    const transactionBank = banks.find(bank => bank.id === transaction.bankId);
    if (transactionBank && transactionBank.accountType === 'INVESTMENT') {
      return false;
    }
    
    // Filtre par banque sélectionnée
    if (selectedBank && String(transaction.bankId) !== String(selectedBank.id)) {
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
    
    // Filtre par statut pointé
    if (filters.checked !== '') {
      // Conversion explicite en booléen pour la comparaison
      const isChecked = filters.checked === 'true';
      if (transaction.checked !== isChecked) {
        return false;
      }
    }
    
    // Filtre par date de début
    if (filters.startDate && transaction.date < filters.startDate) {
      return false;
    }
    
    // Filtre par date de fin
    if (filters.endDate && transaction.date > filters.endDate) {
      return false;
    }
    
    // Filtre par recherche de texte ou montant
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const descriptionMatch = transaction.description.toLowerCase().includes(searchLower);
      
      // Recherche dans le montant (convertir le montant en string pour la recherche)
      const amountStr = transaction.amount.toString();
      const amountMatch = amountStr.includes(searchLower);
      
      // Recherche dans le montant formaté (ex: "123,45 €")
      const formattedAmount = formatAmount(transaction.amount).toLowerCase();
      const formattedAmountMatch = formattedAmount.includes(searchLower);
      
      if (!descriptionMatch && !amountMatch && !formattedAmountMatch) {
        return false;
      }
    }
    
    return true;
  });

  // Fonction pour afficher les avatars des utilisateurs
  const renderUserAvatars = (users: any[], style?: React.CSSProperties) => {
    if (!users || users.length === 0) return <span className="text-gray-400">-</span>;
    return (
      <div className="flex -space-x-2">
        {users.map((user, index) => (
          <div key={user.id || index} className="relative group">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="inline-block h-8 w-8 rounded-full object-cover"
                title={user.name}
                style={{ border: '2px solid #1f2226', ...style }}
              />
            ) : (
              <div
                className="inline-block h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-sm font-medium"
                title={user.name}
                style={{ border: '2px solid #1f2226', ...style }}
              >
                {user.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Fonction pour obtenir les transactions concernées par la modification en lot
  const getBulkEditTargetTransactions = () => {
    return transactions.filter(transaction => {
      // Filtre par recherche de texte
      if (bulkEditFilters.searchText && !transaction.description.toLowerCase().includes(bulkEditFilters.searchText.toLowerCase())) {
        return false;
      }
      
      // Filtre par catégorie
      if (bulkEditFilters.categoryId) {
        if (bulkEditFilters.categoryId === 'undefined') {
          if (transaction.categoryId) return false;
        } else {
          if (transaction.categoryId !== bulkEditFilters.categoryId) return false;
        }
      }
      
      // Filtre par banque
      if (bulkEditFilters.bankId && transaction.bankId !== bulkEditFilters.bankId) {
        return false;
      }
      
      // Filtre par statut pointé
      if (bulkEditFilters.checked !== '' && transaction.checked.toString() !== bulkEditFilters.checked) {
        return false;
      }
      
      // Filtre par date de début
      if (bulkEditFilters.startDate && transaction.date < bulkEditFilters.startDate) {
        return false;
      }
      
      // Filtre par date de fin
      if (bulkEditFilters.endDate && transaction.date > bulkEditFilters.endDate) {
        return false;
      }
      
      return true;
    });
  };

  // Fonction pour appliquer les modifications en lot
  const handleBulkEdit = async () => {
    // Vérifier qu'au moins une action est activée
    const hasActions = bulkEditActions.replaceText.enabled || 
                      bulkEditActions.changeCategory.enabled || 
                      bulkEditActions.changeChecked.enabled || 
                      bulkEditActions.changeBank.enabled;
    
    if (!hasActions) {
      alert('Veuillez sélectionner au moins une action à effectuer.');
      return;
    }

    // Lancer la progression
    setBulkEditProgress({
      isProcessing: true,
      processed: 0,
      total: 0,
      errors: []
    });

    try {
      // Appeler le backend pour appliquer les modifications à TOUTES les transactions correspondantes en base
      const resp = await fetch('/api/transactions/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: bulkEditFilters,
          actions: bulkEditActions
        })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setBulkEditProgress(prev => ({ ...prev, isProcessing: false, errors: [err.error || 'Erreur lors de la modification en lot'] }));
        alert('Erreur lors de la modification en lot');
        return;
      }

      const { matchedCount, updatedCount } = await resp.json();

      if (!matchedCount) {
        setBulkEditProgress(prev => ({ ...prev, isProcessing: false, total: 0, processed: 0 }));
        alert('Aucune transaction ne correspond aux critères de sélection.');
        return;
      }

      // Mettre à jour la progression
      setBulkEditProgress(prev => ({ ...prev, total: matchedCount, processed: updatedCount, isProcessing: false }));

      // Recharger les transactions pour refléter l'état de la base
      try {
        await loadTransactions();
      } catch (e) {
        console.warn('Reload after bulk update failed:', e);
      }

      alert(`✅ Modification en lot terminée!\n${updatedCount}/${matchedCount} transaction(s) modifiée(s).`);
      setShowBulkEditModal(false);
      // Réinitialiser les filtres et actions
      setBulkEditFilters({
        searchText: '',
        categoryId: '',
        bankId: '',
        checked: '',
        startDate: '',
        endDate: ''
      });
      setBulkEditActions({
        replaceText: { enabled: false, from: '', to: '', replaceAll: false },
        changeCategory: { enabled: false, categoryId: '' },
        changeChecked: { enabled: false, checked: false },
        changeBank: { enabled: false, bankId: '' }
      });
    } catch (error: any) {
      console.error('Bulk update error:', error);
      setBulkEditProgress(prev => ({ ...prev, isProcessing: false, errors: [error?.message || 'Erreur inconnue'] }));
      alert('Erreur lors de la modification en lot');
    }
  };

  // Fonction pour ouvrir le modal d'import CSV
  const handleOpenImportModal = () => {
    setShowImportModal(true);
    setCsvFile(null);
    // Initialiser avec la banque actuellement sélectionnée ou vide
    setImportBankId(selectedBank?.id || '');
    setImportProgress({
      isImporting: false,
      imported: 0,
      total: 0,
      errors: []
    });
  };
  
  const handleImportCSV = async () => {
    if (!csvFile || !importBankId) {
      alert('Veuillez sélectionner un fichier CSV et une banque');
      return;
    }
    
    // Récupérer la banque sélectionnée pour l'import
    const selectedImportBank = banks.find(bank => bank.id === importBankId);

    setImportProgress({
      isImporting: true,
      imported: 0,
      total: 0,
      errors: []
    });

    try {
      // Parser le CSV
      Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          console.log('📄 CSV parsed:', results);
          
          const { data, errors } = results;
          let importErrors: string[] = [];
          
          if (errors.length > 0) {
            importErrors = errors.map(err => `Ligne ${err.row}: ${err.message}`);
          }
          
          // Afficher les colonnes détectées pour debugging
          if (data.length > 0) {
            const firstRow = data[0] as any;
            console.log('🔍 Colonnes détectées:', Object.keys(firstRow));
            console.log('🔍 Premier échantillon de données:', firstRow);
          }
          
          setImportProgress(prev => ({ ...prev, total: data.length }));
          
          // Traiter chaque ligne
          for (let i = 0; i < data.length; i++) {
            const row = data[i] as any;
            
            try {
              // Normaliser les noms de colonnes (enlever espaces, accents, casse)
              const normalizedRow: any = {};
              Object.keys(row).forEach(key => {
                // Normalisation standard
                const normalizedKey = key.toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/\s+/g, '');
                normalizedRow[normalizedKey] = row[key];
                
                // Gestion des caractères mal encodés (ex: "libell�" du Crédit Mutuel)
                if (key.includes('libell') || key.includes('Libell')) {
                  normalizedRow['libelle'] = row[key];
                }
                
                // Gestion des colonnes de montant mal encodées
                if (key.includes('debit') || key.includes('débit') || key.includes('d�bit')) {
                  normalizedRow['debit'] = row[key];
                }
                if (key.includes('credit') || key.includes('crédit') || key.includes('cr�dit')) {
                  normalizedRow['credit'] = row[key];
                }
              });
              
              // Détecter les colonnes de date, description et montant
              let dateValue, descriptionValue, amountValue;
              
              // Essayer différents noms de colonnes couramment utilisés par les banques françaises
              const dateKeys = ['date', 'dateoperaton', 'dateval', 'datevaleur', 'date_operation', 'date_valeur', 'date_compta', 'datecomptable', 'dateop', 'datedevaleur'];
              const descriptionKeys = ['description', 'libelle', 'intitule', 'operation', 'designation', 'motif', 'reference', 'communication', 'label'];
              const amountKeys = ['montant', 'amount', 'debit', 'credit', 'somme', 'valeur'];
              
              // Chercher la colonne de date
              for (const key of dateKeys) {
                if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') {
                  dateValue = normalizedRow[key];
                  break;
                }
              }
              
              // Chercher la colonne de description
              for (const key of descriptionKeys) {
                if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') {
                  descriptionValue = normalizedRow[key];
                  break;
                }
              }
              
              // Chercher la colonne de montant
              for (const key of amountKeys) {
                if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') {
                  amountValue = normalizedRow[key];
                  break;
                }
              }
              
              // Si on n'a pas trouvé de montant, essayer de combiner débit et crédit
              if (amountValue === undefined) {
                // Recherche plus poussée pour les colonnes débit/crédit
                let debitValue = null;
                let creditValue = null;
                
                // Chercher les colonnes débit/crédit avec différentes variantes
                for (const key in normalizedRow) {
                  if (key.includes('debit')) {
                    debitValue = normalizedRow[key];
                  }
                  if (key.includes('credit')) {
                    creditValue = normalizedRow[key];
                  }
                }
                
                if (debitValue !== undefined && debitValue !== '') {
                  amountValue = `-${Math.abs(parseFloat(String(debitValue).replace(/[^0-9.,-]/g, '').replace(',', '.')))}`; 
                } else if (creditValue !== undefined && creditValue !== '') {
                  amountValue = Math.abs(parseFloat(String(creditValue).replace(/[^0-9.,-]/g, '').replace(',', '.')));
                }
              }
              
              console.log(`🔍 Ligne ${i + 1} - Date: "${dateValue}", Description: "${descriptionValue}", Montant: "${amountValue}"`);
              
              if (!dateValue || !descriptionValue || amountValue === undefined) {
                const missingFields = [];
                if (!dateValue) missingFields.push('date');
                if (!descriptionValue) missingFields.push('description');
                if (amountValue === undefined) missingFields.push('montant');
                
                importErrors.push(`Ligne ${i + 2}: Données manquantes (${missingFields.join(', ')}) - Colonnes disponibles: ${Object.keys(normalizedRow).join(', ')}`);
                continue;
              }
              
              // Parser la date
              let parsedDate: Date;
              const dateStr = String(dateValue).trim();
              
              // Essayer différents formats de date
              if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // Format YYYY-MM-DD
                parsedDate = new Date(dateStr);
              } else if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
                // Format DD/MM/YYYY
                const [day, month, year] = dateStr.split('/');
                parsedDate = new Date(`${year}-${month}-${day}`);
              } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                // Format DD-MM-YYYY
                const [day, month, year] = dateStr.split('-');
                parsedDate = new Date(`${year}-${month}-${day}`);
              } else {
                importErrors.push(`Ligne ${i + 2}: Format de date non reconnu (${dateStr})`);
                continue;
              }
              
              if (isNaN(parsedDate.getTime())) {
                importErrors.push(`Ligne ${i + 2}: Date invalide (${dateStr})`);
                continue;
              }
              
              // Parser le montant
              let amount: number;
              const amountStr = String(amountValue).trim().replace(/\s/g, '');
              
              // Gérer les différents formats de montant
              if (amountStr.includes(',') && !amountStr.includes('.')) {
                // Format français: 1 234,56
                amount = parseFloat(amountStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
              } else {
                // Format anglais: 1,234.56 ou simple: 1234.56
                amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
              }
              
              if (isNaN(amount)) {
                importErrors.push(`Ligne ${i + 2}: Montant invalide (${amountStr})`);
                continue;
              }
              
              // Créer la transaction
              const transactionData = {
                amount,
                description: String(descriptionValue).trim(),
                date: parsedDate.toISOString(),
                createdAt: parsedDate.toISOString(), // Utiliser la date de la transaction
                bankId: importBankId,
                categoryId: null,
                checked: false
              };
              
              console.log(`📝 Creating transaction ${i + 1}:`, transactionData);
              
              // Appel API pour créer la transaction
              const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(transactionData),
              });
              
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                importErrors.push(`Ligne ${i + 2}: ${errorData.error || 'Erreur lors de la création'}`);
              }
              
            } catch (error) {
              console.error(`Error processing row ${i + 1}:`, error);
              importErrors.push(`Ligne ${i + 2}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
            }
            
            // Mettre à jour le progrès
            setImportProgress(prev => ({ ...prev, imported: i + 1, errors: importErrors }));
          }
          
          // Recharger les transactions
          await loadTransactions();
          
          // Finaliser l'import
          setImportProgress(prev => ({ 
            ...prev, 
            isImporting: false,
            errors: importErrors 
          }));
          
          if (importErrors.length === 0) {
            alert(`✅ Import terminé avec succès!\n${data.length} transaction(s) importée(s).`);
            setShowImportModal(false);
            setCsvFile(null);
          } else {
            alert(`⚠️ Import terminé avec ${importErrors.length} erreur(s).\nConsultez les détails dans la modal.`);
          }
        },
        error: (error) => {
          console.error('CSV parsing error:', error);
          setImportProgress(prev => ({ 
            ...prev, 
            isImporting: false, 
            errors: [`Erreur de parsing CSV: ${error.message}`] 
          }));
        }
      });
      
    } catch (error) {
      console.error('Import error:', error);
      setImportProgress({
        isImporting: false,
        imported: 0,
        total: 0,
        errors: [`Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`]
      });
    }
  };

  // Fonction pour charger plus de transactions
  const loadMoreData = async () => {
    console.log('🔄 loadMoreData called - loadingMore:', loadingMore, 'hasMore:', hasMore, 'page:', page);
    if (loadingMore || !hasMore) {
      console.log('🚫 loadMoreData blocked - loadingMore:', loadingMore, 'hasMore:', hasMore);
      return;
    }
    
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      console.log('📡 Loading page:', nextPage, 'with filters:', { searchText: filters.searchText, categoryId: filters.categoryId, pageName });
      const result = await loadMoreTransactions(nextPage, ITEMS_PER_PAGE, {
        searchText: filters.searchText,
        categoryId: filters.categoryId,
        pageName
      });
      
      console.log('📦 Received result:', { newTransactionsCount: result.newTransactions.length, hasMore: result.hasMore });
      
      if (result.newTransactions.length > 0) {
        appendTransactions(result.newTransactions);
        setPage(nextPage);
        console.log('✅ Page updated to:', nextPage);
      }
      
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error loading more transactions:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Fonction de détection du scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    console.log('📜 Scroll detected:', { scrollTop, scrollHeight, clientHeight, distanceFromBottom, distanceType: typeof distanceFromBottom });
    
    // Si on est proche du bas (4500px), charger plus de données
    console.log('🔍 Checking condition: distanceFromBottom <=', 4500, ':', distanceFromBottom <= 4500, '- distanceFromBottom:', distanceFromBottom);
    if (distanceFromBottom <= 4500) {
      console.log('🎯 Near bottom, triggering loadMoreData - hasMore:', hasMore, 'loadingMore:', loadingMore, 'page:', page);
      loadMoreData();
    }
  };
  
  // Fonctions pour la sélection multiple
  const handleToggleSelect = (id: string) => {
    setSelectedTransactions(prev => {
      if (prev.includes(id)) {
        return prev.filter(transactionId => transactionId !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedTransactions([]);
    } else {
      setSelectedTransactions(filteredTransactions.map(t => t.id));
    }
    setSelectAll(!selectAll);
  };
  
  // États pour suivre la progression de la suppression
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({
    total: 0,
    processed: 0,
    success: 0,
    errors: 0
  });
  
  const handleDeleteSelected = async () => {
    if (selectedTransactions.length === 0) return;
    
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${selectedTransactions.length} transaction(s) ?`)) {
      return;
    }
    
    try {
      // Initialiser l'indicateur de progression
      setDeleteProgress({
        total: selectedTransactions.length,
        processed: 0,
        success: 0,
        errors: 0
      });
      
      // Afficher l'indicateur de progression
      setIsDeleting(true);
      
      // Supprimer chaque transaction sélectionnée
      for (const id of selectedTransactions) {
        try {
          const response = await fetch(`/api/transactions/${id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            removeTransaction(id);
            setDeleteProgress(prev => ({
              ...prev,
              processed: prev.processed + 1,
              success: prev.success + 1
            }));
          } else {
            setDeleteProgress(prev => ({
              ...prev,
              processed: prev.processed + 1,
              errors: prev.errors + 1
            }));
            console.error(`Échec de la suppression de la transaction ${id}:`, response.status);
          }
        } catch (error) {
          setDeleteProgress(prev => ({
            ...prev,
            processed: prev.processed + 1,
            errors: prev.errors + 1
          }));
          console.error(`Erreur lors de la suppression de la transaction ${id}:`, error);
        }
      }
      
      // Réinitialiser la sélection
      setSelectedTransactions([]);
      setSelectAll(false);
      setIsDeleting(false);
      
      // Afficher un message de résultat
      if (deleteProgress.errors === 0) {
        alert(`${deleteProgress.success} transaction(s) supprimée(s) avec succès.`);
      } else {
        alert(`${deleteProgress.success} transaction(s) supprimée(s) avec succès. ${deleteProgress.errors} échec(s).`);
      }
    } catch (error) {
      console.error('Erreur lors de la suppression multiple:', error);
      alert('Une erreur est survenue lors de la suppression multiple.');
      setIsDeleting(false);
    }
  };

  // Réinitialiser la pagination et recharger quand les filtres ou la banque changent
  // useEffect pour charger les transactions quand les filtres changent
  // Mais avec une référence stable pour éviter les boucles infinies
  const filtersRef = useRef(filters);
  const selectedBankRef = useRef(selectedBank);
  const pageNameRef = useRef(pageName);
  
  useEffect(() => {
    // Mettre à jour les refs quand les valeurs changent
    filtersRef.current = filters;
    selectedBankRef.current = selectedBank;
    pageNameRef.current = pageName;
  }, [filters, selectedBank, pageName]);
  
  // Note: fetchWithFilters useEffect removed to avoid conflicts with initializeData
  // All initialization is now handled by the initializeData useEffect
  
  const handleSearch = () => {
    const newFilters = { ...filters, searchText: searchInput };
    setFilters(newFilters);
    setPageFilter(pageName, newFilters);
  };

  // Fonction pour rechercher des transactions dans le formulaire de modification en lot
  const handleBulkSearch = async () => {
    setBulkEditProgress(p => ({ ...p, isProcessing: true }));
    try {
      // Appel à l'API backend pour récupérer toutes les transactions correspondant aux filtres
      const res = await fetch('/api/transactions/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkEditFilters)
      });
      const data = await res.json();
      setBulkEditTransactions(data.transactions || []);
      setBulkEditProgress(p => ({ ...p, isProcessing: false, errors: [] }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la recherche';
      setBulkEditProgress(p => ({ ...p, isProcessing: false, errors: [msg] }));
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 pb-[40px]" style={{ backgroundColor: '#202427' }}>
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between mt-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">
            Transactions
          </h2>
          <p className="text-sm text-gray-300 mt-1">
            Gérez toutes vos transactions et opérations bancaires
          </p>
        </div>
        <div className="flex gap-3 md:mt-0">
          <button
            onClick={() => setShowBulkEditModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-80"
            style={{ backgroundColor: '#6227f5' }}
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Modification en lot
          </button>
          <button
            onClick={handleOpenImportModal}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-80"
            style={{ backgroundColor: '#6227f5' }}
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Importer CSV
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedTransactions.length === 0 || isDeleting}
            className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${selectedTransactions.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
            style={{ backgroundColor: '#dc2626' }}
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {isDeleting ? `Suppression... ${deleteProgress.processed}/${deleteProgress.total}` : `Supprimer (${selectedTransactions.length})`}
          </button>
        </div>
      </div>

      <style>{`
        /* Forcer le style du selecteur de banque dans la section filtre */
        select[name="bank-filter-select"] {
          background-color: #1f2226 !important;
          color: #fff !important;
          min-height: 2.5rem !important;
          border: none !important;
          padding: 0.5rem 0.75rem !important;
          font-weight: 500 !important;
          appearance: none !important;
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
        }
      `}</style>

      {/* Filters */}
      <div className="shadow rounded-lg p-6" style={{ backgroundColor: '#272a2f' }}>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300">Banque</label>
            <select
              name="bank-filter-select"
              value={selectedBank?.id || ''}
              onChange={(e) => {
                const bank = banks.find(b => b.id === e.target.value);
                setSelectedBank(bank || null);
              }}
              className="mt-1 block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
            >
              <option value="" style={{ backgroundColor: '#1f2226' }}>Toutes les banques</option>
              {banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS').map(bank => {
                // Récupérer les utilisateurs associés à cette banque
                const bankUsers = bank.users?.map(u => u.name).filter(Boolean) || [];
                const bankUsersText = bankUsers.length > 0 ? ` (${bankUsers.join(', ')})` : '';
                
                return (
                  <option key={bank.id} value={bank.id} style={{ backgroundColor: '#1f2226' }}>
                    {bank.name}{bankUsersText}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Recherche</label>
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              className="mt-1 block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
              style={{ backgroundColor: '#1f2226', color: 'white', minHeight: '2.5rem', border: 'none', padding: '0.5rem 0.75rem' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Catégorie</label>
            <select
              value={filters.categoryId}
              onChange={(e) => {
                const newFilters = {...filters, categoryId: e.target.value};
                setFilters(newFilters);
                setPageFilter(pageName, newFilters);
              }}
              className="mt-1 block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
              style={{ backgroundColor: '#1f2226', color: 'white', minHeight: '2.5rem', border: 'none', padding: '0.5rem 0.75rem' }}
            >
              <option value="" style={{ backgroundColor: '#1f2226' }}>Toutes</option>
              <option value="undefined" style={{ backgroundColor: '#1f2226' }}>Non défini</option>
              {categories.map(category => (
                <option key={category.id} value={category.id} style={{ backgroundColor: '#1f2226' }}>{category.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Date début</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                const newFilters = {...filters, startDate: e.target.value};
                setFilters(newFilters);
                setPageFilter(pageName, newFilters);
              }}
              className="mt-1 block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
              style={{ backgroundColor: '#1f2226', color: 'white', minHeight: '2.5rem', border: 'none', padding: '0.5rem 0.75rem' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Date fin</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                const newFilters = {...filters, endDate: e.target.value};
                setFilters(newFilters);
                setPageFilter(pageName, newFilters);
              }}
              className="mt-1 block w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
              style={{ backgroundColor: '#1f2226' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Pointé</label>
            <select
              value={filters.checked}
              onChange={(e) => {
                const newFilters = {...filters, checked: e.target.value};
                setFilters(newFilters);
                setPageFilter(pageName, newFilters);
              }}
              className="mt-1 block w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
              style={{ backgroundColor: '#1f2226' }}
            >
              <option value="" style={{ backgroundColor: '#1f2226' }}>Tous</option>
              <option value="true" style={{ backgroundColor: '#1f2226' }}>Oui</option>
              <option value="false" style={{ backgroundColor: '#1f2226' }}>Non</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="shadow rounded-lg overflow-hidden" style={{ backgroundColor: '#272a2f' }}>
        <div 
          className="overflow-y-auto custom-scrollbar"
          style={{ maxHeight: '70vh' }}
          onScroll={handleScroll}
        >
          <table className="w-full divide-y divide-gray-600" style={{ backgroundColor: '#272a2f' }}>
          <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1f2226' }}>
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-8">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleToggleSelectAll}
                  className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                />
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                Date
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-64">
                Description
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-32">
                Catégorie
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-32">
                Banque
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                Propriétaires
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                Montant
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-16">
                Pointé
              </th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-300 uppercase tracking-wider w-16">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-600" style={{ backgroundColor: '#272a2f' }}>
            {/* Add form row - always visible as first row */}
            <tr className="border-l-4" style={{ backgroundColor: '#1f2226', borderLeftColor: '#6226fa' }}>
              {/* Cellule vide pour aligner avec la colonne de checkbox */}
              <td className="px-4 py-2"></td>
              <td className="px-4 py-2">
                <input
                  type="date"
                  value={editingTransaction?.date || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, date: e.target.value} : null)}
              className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3" style={{ backgroundColor: '#1f2226' }}
                  required
                />
              </td>
              <td className="px-4 py-2">
                <input
                  type="text"
                  value={editingTransaction?.description || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, description: e.target.value} : null)}
              className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3" style={{ backgroundColor: '#1f2226' }}
                  placeholder="Description de la transaction"
                  required
                />
              </td>
              <td className="px-4 py-2">
                <select
                  value={editingTransaction?.categoryId || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, categoryId: e.target.value} : null)}
              className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3" style={{ backgroundColor: '#1f2226' }}
                >
                  <option value="" style={{ backgroundColor: '#272a2f' }}>Non défini</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id} style={{ backgroundColor: '#272a2f' }}>{category.name}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-2">
                <select
                  value={editingTransaction?.bankId || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, bankId: e.target.value} : null)}
              className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3" style={{ backgroundColor: '#1f2226' }}
                  required
                >
                  <option value="" style={{ backgroundColor: '#272a2f' }}>Sélectionnez une banque</option>
                  {banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS').map(bank => {
                    const bankUsers = bank.users?.map(u => u.name).filter(Boolean) || [];
                    const bankUsersText = bankUsers.length > 0 ? ` (${bankUsers.join(', ')})` : '';
                    
                    return (
                      <option key={bank.id} value={bank.id} style={{ backgroundColor: '#272a2f' }}>
                        {bank.name}{bankUsersText}
                      </option>
                    );
                  })}
                </select>
              </td>
              <td className="px-4 py-2">
                <span className="text-sm text-gray-300">
                  {editingTransaction?.bankId ? 
                    (() => {
                      const selectedBankObj = banks.find(b => b.id === editingTransaction.bankId);
                      const users = selectedBankObj?.users?.map(u => u.name).filter(Boolean) || [];
                      return users.length > 0 ? users.join(', ') : '-';
                    })()
                    : '-'
                  }
                </span>
              </td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  step="1"
                  value={editingTransaction?.amount || ''}
                  onChange={(e) => setEditingTransaction(prev => prev ? {...prev, amount: parseFloat(e.target.value) || 0} : null)}
                  className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-sm"
                  style={{ backgroundColor: '#272a2f' }}
                  placeholder="0.00"
                  required
                />
              </td>
              <td className="px-4 py-2">
                <label className="flex items-center text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={editingTransaction?.checked || false}
                    onChange={(e) => setEditingTransaction(prev => prev ? {...prev, checked: e.target.checked} : null)}
                    className="h-3 w-3 rounded"
                    style={{ accentColor: '#6226fa' }}
                  />
                  <span className="ml-1 text-gray-300">Pointé</span>
                </label>
              </td>
              <td className="px-4 py-2">
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddTransaction(e);
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
            {filteredTransactions.map((transaction) => (
              <tr
                key={transaction.id}
                className="transition-colors cursor-pointer bg-[#272a2f] group"
                style={{ borderLeft: '4px solid transparent' }}
                onMouseEnter={e => e.currentTarget.style.borderLeft = '4px solid #6226fa'}
                onMouseLeave={e => e.currentTarget.style.borderLeft = '4px solid transparent'}
              >
                <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                  <input
                    type="checkbox"
                    checked={selectedTransactions.includes(transaction.id)}
                    onChange={() => handleToggleSelect(transaction.id)}
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                  {editingId === transaction.id ? (
                    <input
                      type="date"
                      value={editingTransaction?.date || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, date: e.target.value} : null)}
              className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent py-2 px-3" style={{ backgroundColor: '#1f2226' }}
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'date' ? (
                    <input
                      type="date"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                      style={{ backgroundColor: '#1f2226' }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      onClick={() => handleInlineEdit(transaction.id, 'date')}
                      className="cursor-pointer rounded px-1 py-0.5 editable-cell hover:opacity-80"
                      title="Double-cliquez pour éditer"
                    >
                      {formatDate(transaction.date)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                  {editingId === transaction.id ? (
                    <input
                      type="text"
                      value={editingTransaction?.description || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, description: e.target.value} : null)}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                      style={{ backgroundColor: '#1f2226' }}
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'description' ? (
                    <input
                      type="text"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                      style={{ backgroundColor: '#1f2226' }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      onClick={() => handleInlineEdit(transaction.id, 'description')}
                      className="cursor-pointer rounded px-1 py-0.5 editable-cell hover:opacity-80"
                      title="Double-cliquez pour éditer"
                    >
                      {transaction.description}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                  {editingId === transaction.id ? (
                    <select
                      value={editingTransaction?.categoryId || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, categoryId: e.target.value} : null)}
              className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3" style={{ backgroundColor: '#1f2226' }}
                    >
                      {categories.map(category => (
                        <option key={category.id} value={category.id} style={{ backgroundColor: '#1f2226' }}>{category.name}</option>
                      ))}
                    </select>
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'category' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                      style={{ backgroundColor: '#1f2226' }}
                      autoFocus
                    >
                      <option value="">Non défini</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id} style={{ backgroundColor: '#1f2226' }}>{category.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span 
                      onClick={() => handleInlineEdit(transaction.id, 'category')}
                      className="cursor-pointer editable-cell inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium"
                      style={
                        transaction.category
                          ? {
                              backgroundColor: transaction.category.color + '20',
                              color: transaction.category.color
                            }
                          : {
                              backgroundColor: '#2b2f37',
                              color: '#a1a1aa'
                            }
                      }
                      title="Double-cliquez pour éditer"
                    >
                      {transaction.category ? (
                        <>
                          {transaction.category.icon && (
                            <span className="mr-1.5 text-base">{transaction.category.icon}</span>
                          )}
                          {transaction.category.name}
                        </>
                      ) : 'Non défini'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                  {inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'bank' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                      style={{ backgroundColor: '#1f2226' }}
                      autoFocus
                    >
                      {banks
                        .filter((bank: Bank) => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS')
                        .map((bank: Bank) => {
                          // Vérifier si la banque a des utilisateurs
                          const bankWithUsers = bank as Bank & { userBanks?: Array<{ user?: { name: string } }> };
                          const userNames = bankWithUsers.userBanks?.map(ub => ub.user?.name).filter(Boolean).join(', ') || '';
                          const displayText = userNames ? `${bank.name} (${userNames})` : bank.name;
                          
                          return (
                            <option key={bank.id} value={bank.id} style={{ backgroundColor: '#1f2226' }}>
                              {displayText}
                            </option>
                          );
                        })}
                    </select>
                  ) : (
                    <div 
                      onClick={() => handleInlineEdit(transaction.id, 'bank')}
                      className="cursor-pointer rounded px-1 py-0.5 editable-cell flex items-center hover:opacity-80"
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
                      <div className="ml-2">
                        <div className="font-medium text-white">{transaction.bank.name}</div>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-300 text-center">
                  <div className="flex justify-center">
                    {renderUserAvatars(transaction.bank.users || [], { border: '2px solid #1f2226' })}
                  </div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                  {editingId === transaction.id ? (
                    <input
                      type="number"
                      step="1"
                      value={editingTransaction?.amount || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, amount: parseFloat(e.target.value)} : null)}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                      style={{ backgroundColor: '#1f2226' }}
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'amount' ? (
                    <input
                      type="number"
                      step="1"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                      style={{ backgroundColor: '#1f2226' }}
                      autoFocus
                    />
                  ) : (
                    <span 
                      onClick={() => handleInlineEdit(transaction.id, 'amount')}
                      className={`cursor-pointer rounded px-1 py-0.5 editable-cell hover:opacity-80 ${transaction.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      title="Double-cliquez pour éditer"
                    >
                      {formatAmount(transaction.amount)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                  {editingId === transaction.id ? (
                    <label className="flex items-center text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={editingTransaction?.checked || false}
                        onChange={(e) => setEditingTransaction(prev => prev ? {...prev, checked: e.target.checked} : null)}
                        className="h-3 w-3 rounded"
                        style={{ accentColor: '#6226fa' }}
                      />
                      <span className="ml-1 text-gray-300">Pointé</span>
                    </label>
                  ) : (
                    <label className="flex items-center text-xs text-gray-300 cursor-pointer" onClick={() => handleInlineEdit(transaction.id, 'checked')}>
                      <input
                        type="checkbox"
                        checked={transaction.checked}
                        readOnly
                        className="h-3 w-3 rounded"
                        style={{ accentColor: '#6226fa' }}
                      />
                      <span className="ml-1 text-gray-300">Pointé</span>
                    </label>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                  {editingId === transaction.id ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSave}
                        className="transition-colors"
                        style={{ color: '#616875' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#6226fa'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#616875'}
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancel}
                        className="transition-colors"
                        style={{ color: '#616875' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#616875'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#616875'}
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
                        className="transition-colors"
                        style={{ color: '#616875' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#616875'}
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
        </div>
        
        {/* Indicateur de chargement pour le scroll infini */}
        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: '#6226fa' }}></div>
            <span className="ml-2 text-sm text-gray-300">Chargement...</span>
          </div>
        )}
        
        {filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-white">Aucune transaction</h3>
            <p className="mt-1 text-sm text-gray-300">Commencez par ajouter une nouvelle transaction.</p>
          </div>
        )}
      </div>

      {/* Modal d'import CSV */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="p-0 w-80 md:w-[24rem] lg:w-[28rem] xl:w-[32rem] max-h-[80vh] shadow-2xl rounded-xl overflow-y-auto" style={{ background: '#272a2f', maxHeight: '80vh' }}>
            <div className="rounded-t-xl px-6 py-4 flex items-center justify-between" style={{ background: '#1f2226' }}>
              <h3 className="text-lg font-bold text-white">
                Importer des transactions depuis un fichier CSV
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-6">

              {/* Sélection de la banque */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Banque de destination *
                </label>
                <select
                  value={importBankId}
                  onChange={(e) => {
                    setImportBankId(e.target.value);
                  }}
                  className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                  style={{ backgroundColor: '#1f2226' }}
                  required
                >
                  <option value="">Sélectionnez une banque...</option>
                  {banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS').map(bank => {
                    const bankUsers = bank.users?.map(u => u.name).filter(Boolean) || [];
                    const bankUsersText = bankUsers.length > 0 ? ` (${bankUsers.join(', ')})` : '';
                    return (
                      <option key={bank.id} value={bank.id}>{bank.name}{bankUsersText}</option>
                    );
                  })}
                </select>
                {!importBankId && (
                  <p className="mt-1 text-sm text-red-600">
                    Veuillez sélectionner une banque avant d'importer
                  </p>
                )}
              </div>

              {/* Zone de drop de fichier */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Fichier CSV *
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-700 border-dashed rounded-md hover:border-gray-400 transition-colors" style={{ backgroundColor: '#23262b' }}>
                  <div className="space-y-1 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-400">
                      <label htmlFor="csv-upload" className="relative cursor-pointer bg-[#1f2226] rounded-md font-medium hover:text-purple-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-purple-500 px-2 py-1" style={{ color: '#6226fa' }}>
                        <span>Choisir un fichier</span>
                        <input
                          id="csv-upload"
                          name="csv-upload"
                          type="file"
                          accept=".csv"
                          className="sr-only"
                          onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      <p className="pl-1">ou glisser-déposer</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      CSV uniquement (max 10MB)
                    </p>
                  </div>
                </div>
                {csvFile && (
                  <div className="mt-2 text-sm text-green-400">
                    ✓ Fichier sélectionné: {csvFile.name}
                  </div>
                )}
              </div>


              {/* Boutons d'action */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-[#23262b] border border-gray-700 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Annuler
                </button>
                <button
                  onClick={handleImportCSV}
                  disabled={!csvFile || !importBankId || importProgress.isImporting}
                  className="px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#6226fa' }}
                >
                  {importProgress.isImporting ? 'Import en cours...' : 'Importer'}
                </button>
              </div>

              {/* Barre de progression */}
              {importProgress.isImporting && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Import en cours...</span>
                    <span>{importProgress.imported}/{importProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress.total > 0 ? (importProgress.imported / importProgress.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Erreurs */}
              {importProgress.errors.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 rounded-md">
                  <h4 className="text-sm font-medium text-red-900 mb-2">Erreurs rencontrées:</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    {importProgress.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification en lot */}
      {showBulkEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="relative p-0 w-96 md:w-[32rem] lg:w-[36rem] xl:w-[40rem] max-h-[80vh] shadow-2xl rounded-xl overflow-y-auto" style={{ background: '#272a2f', maxHeight: '80vh' }}>
            <div className="rounded-t-xl px-6 py-4 flex items-center justify-between" style={{ background: '#1f2226' }}>
              {/* En-tête */}
              <h3 className="text-lg font-bold text-white">
                Modification en lot des transactions
              </h3>
              <button
                onClick={() => setShowBulkEditModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-6">

              <div className="flex flex-col space-y-8">
                {/* Section 1: Critères de sélection */}
                <div className="space-y-4">
                  <h4 className="text-md font-bold text-white border-b border-gray-700 pb-2">
                    1. Quelles transactions modifier ?
                  </h4>
                  
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Contient le texte</label>
                      <input
                        type="text"
                        placeholder="ex: abonnement"
                        value={bulkEditFilters.searchText}
                        onChange={(e) => setBulkEditFilters({...bulkEditFilters, searchText: e.target.value})}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Catégorie</label>
                      <select
                        value={bulkEditFilters.categoryId}
                        onChange={(e) => setBulkEditFilters({...bulkEditFilters, categoryId: e.target.value})}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      >
                        <option value="">Toutes les catégories</option>
                        <option value="undefined">Non défini</option>
                                               {categories.map(category => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Banque</label>
                      <select
                        value={bulkEditFilters.bankId}
                        onChange={(e) => setBulkEditFilters({...bulkEditFilters, bankId: e.target.value})}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      >
                        <option value="">Toutes les banques</option>
                        {banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS').map(bank => (
                          <option key={bank.id} value={bank.id}>{bank.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Date début</label>
                      <input
                        type="date"
                        value={bulkEditFilters.startDate}
                        onChange={(e) => setBulkEditFilters({...bulkEditFilters, startDate: e.target.value})}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Date fin</label>
                      <input
                        type="date"
                        value={bulkEditFilters.endDate}
                        onChange={(e) => setBulkEditFilters({...bulkEditFilters, endDate: e.target.value})}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Statut pointé</label>
                      <select
                        value={bulkEditFilters.checked}
                        onChange={(e) => setBulkEditFilters({...bulkEditFilters, checked: e.target.value})}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      >
                        <option value="">Tous</option>
                        <option value="true">Pointé</option>
                        <option value="false">Non pointé</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Actions à effectuer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <h4 className="text-md font-bold text-white border-b border-gray-700 pb-2 col-span-1 md:col-span-2">
                    2. Quelles modifications appliquer ?
                  </h4>

                  {/* Remplacement de texte */}
                  <div className="rounded-md p-4" style={{ background: '#23262b' }}>
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="replaceText"
                        checked={bulkEditActions.replaceText.enabled}
                        onChange={(e) => setBulkEditActions({
                          ...bulkEditActions,
                          replaceText: { ...bulkEditActions.replaceText, enabled: e.target.checked }
                        })}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <label htmlFor="replaceText" className="ml-2 text-sm font-medium text-white">
                        Modifier la description
                      </label>
                    </div>
                    {bulkEditActions.replaceText.enabled && (
                      <div className="space-y-3">
                        {/* Mode de remplacement */}
                        <div className="flex items-center space-x-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="replaceMode"
                              checked={!bulkEditActions.replaceText.replaceAll}
                              onChange={() => setBulkEditActions({
                                ...bulkEditActions,
                                replaceText: { ...bulkEditActions.replaceText, replaceAll: false }
                              })}
                              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                            />
                          <span className="ml-2 text-sm text-white">Remplacement partiel</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="replaceMode"
                              checked={bulkEditActions.replaceText.replaceAll}
                              onChange={() => setBulkEditActions({
                                ...bulkEditActions,
                                replaceText: { ...bulkEditActions.replaceText, replaceAll: true }
                              })}
                              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                            />
                          <span className="ml-2 text-sm text-white">Remplacer toute la description</span>
                          </label>
                        </div>

                        {/* Champs de saisie */}
                        {!bulkEditActions.replaceText.replaceAll ? (
                          // Mode remplacement partiel
                          <div className="flex flex-col gap-2">
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-xs text-white mb-1">Remplacer</label>
                              <input
                                type="text"
                                placeholder="abonnement"
                                value={bulkEditActions.replaceText.from}
                                onChange={(e) => setBulkEditActions({
                                  ...bulkEditActions,
                                  replaceText: { ...bulkEditActions.replaceText, from: e.target.value }
                                })}
                                className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white"
                                style={{ backgroundColor: '#1f2226' }}
                              />
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="block text-xs text-white mb-1">Par</label>
                              <input
                                type="text"
                                placeholder="Abonnement Netflix"
                                value={bulkEditActions.replaceText.to}
                                onChange={(e) => setBulkEditActions({
                                  ...bulkEditActions,
                                  replaceText: { ...bulkEditActions.replaceText, to: e.target.value }
                                })}
                                className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white"
                                style={{ backgroundColor: '#1f2226' }}
                              />
                            </div>
                          </div>
                        ) : (
                          // Mode remplacement total
                          <div>
                            <label className="block text-xs text-white mb-1">Nouvelle description</label>
                            <input
                              type="text"
                              placeholder="Abonnement Netflix"
                              value={bulkEditActions.replaceText.to}
                              onChange={(e) => setBulkEditActions({
                                ...bulkEditActions,
                                replaceText: { ...bulkEditActions.replaceText, to: e.target.value }
                              })}
                              className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white"
                              style={{ backgroundColor: '#1f2226' }}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Toutes les descriptions des transactions sélectionnées seront remplacées par ce texte
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Changement de catégorie */}
                  <div className="rounded-md p-4" style={{ background: '#23262b' }}>
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="changeCategory"
                        checked={bulkEditActions.changeCategory.enabled}
                        onChange={(e) => setBulkEditActions({
                          ...bulkEditActions,
                          changeCategory: { ...bulkEditActions.changeCategory, enabled: e.target.checked }
                        })}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <label htmlFor="changeCategory" className="ml-2 text-sm font-medium text-white">
                        Changer la catégorie
                      </label>
                    </div>
                    {bulkEditActions.changeCategory.enabled && (
                      <select
                        value={bulkEditActions.changeCategory.categoryId}
                        onChange={(e) => setBulkEditActions({
                          ...bulkEditActions,
                          changeCategory: { ...bulkEditActions.changeCategory, categoryId: e.target.value }
                        })}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      >
                        <option value="">Non défini</option>
                        {categories.map(category => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Changement de statut pointé */}
                  <div className="rounded-md p-4" style={{ background: '#23262b' }}>
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="changeChecked"
                        checked={bulkEditActions.changeChecked.enabled}
                        onChange={(e) => setBulkEditActions({
                          ...bulkEditActions,
                          changeChecked: { ...bulkEditActions.changeChecked, enabled: e.target.checked }
                        })}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <label htmlFor="changeChecked" className="ml-2 text-sm font-medium text-white">
                        Modifier le statut pointé
                      </label>
                    </div>
                    {bulkEditActions.changeChecked.enabled && (
                      <select
                        value={bulkEditActions.changeChecked.checked.toString()}
                        onChange={(e) => setBulkEditActions({
                          ...bulkEditActions,
                          changeChecked: { ...bulkEditActions.changeChecked, checked: e.target.value === 'true' }
                        })}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      >
                        <option value="true">Pointé</option>
                        <option value="false">Non pointé</option>
                      </select>
                    )}
                  </div>

                  {/* Changement de banque */}
                  <div className="rounded-md p-4" style={{ background: '#23262b' }}>
                    <div className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        id="changeBank"
                        checked={bulkEditActions.changeBank.enabled}
                        onChange={(e) => setBulkEditActions({
                          ...bulkEditActions,
                          changeBank: { ...bulkEditActions.changeBank, enabled: e.target.checked }
                        })}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <label htmlFor="changeBank" className="ml-2 text-sm font-medium text-white">
                        Changer de banque
                      </label>
                    </div>
                    {bulkEditActions.changeBank.enabled && (
                      <select
                        value={bulkEditActions.changeBank.bankId}
                        onChange={(e) => setBulkEditActions({
                          ...bulkEditActions,
                          changeBank: { ...bulkEditActions.changeBank, bankId: e.target.value }
                        })}
                        className="block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 text-white h-10 min-h-[2.5rem]"
                        style={{ backgroundColor: '#1f2226' }}
                      >
                        <option value="">Sélectionner une banque</option>
                        {banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS').map(bank => (
                          <option key={bank.id} value={bank.id}>{bank.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex justify-end space-x-3 mt-6 pt-4">
                <button
                  onClick={() => setShowBulkEditModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Annuler
                </button>
                <button
                  onClick={handleBulkEdit}
                  disabled={bulkEditProgress.isProcessing}
                  className="px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#6226fa' }}
                >
                  {bulkEditProgress.isProcessing ? 'Modification en cours...' : 'Appliquer les modifications'}
                </button>
              </div>

              {/* Barre de progression */}
              {bulkEditProgress.isProcessing && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Modification en cours...</span>
                    <span>{bulkEditProgress.processed}/{bulkEditProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${bulkEditProgress.total > 0 ? (bulkEditProgress.processed / bulkEditProgress.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Erreurs */}
              {bulkEditProgress.errors.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 rounded-md">
                  <h4 className="text-sm font-medium text-red-900 mb-2">Erreurs rencontrées:</h4>
                  <ul className="text-sm text-red-700 space-y-1 max-h-32 overflow-y-auto">
                    {bulkEditProgress.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
