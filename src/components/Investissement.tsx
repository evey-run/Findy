import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { useLocation, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';

// Styles pour les cellules éditables sont intégrés directement dans les classes CSS

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
  unitPrice?: number;
  quantity?: number;
  bankId?: string;
}

interface InlineEditCell {
  transactionId: string;
  field: 'amount' | 'description' | 'date' | 'bank' | 'checked' | 'unitPrice' | 'quantity';
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

export default function Investissement() {
  const { 
    transactions, 
    banks, 
    loadTransactions, 
    loadBanks,
    updateTransaction,
    removeTransaction,
    addTransaction,
    loadMoreTransactions
  } = useAppStore();
  
  // État local pour la banque sélectionnée (au lieu d'utiliser l'état global)
  const [localSelectedBank, setLocalSelectedBank] = useState<any>(null);
  
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
  const ITEMS_PER_PAGE = 50;
  
  
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<EditingTransaction | null>(null);
  
  // Inline editing states
  const [inlineEditCell, setInlineEditCell] = useState<InlineEditCell | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');
  
  const [filters, setFilters] = useState({
    checked: '',
    startDate: '',
    endDate: '',
    searchText: ''
  });

  // États pour la modification en masse
  const [bulkEditFilters, setBulkEditFilters] = useState({
    searchText: '',
    bankId: '',
    checked: '',
    startDate: '',
    endDate: ''
  });
  const [bulkEditActions, setBulkEditActions] = useState({
    replaceText: { enabled: false, from: '', to: '', replaceAll: false },
    changeChecked: { enabled: false, checked: false },
    changeBank: { enabled: false, bankId: '' }
  });
  const [bulkEditTransactions, setBulkEditTransactions] = useState([]);


  // État local pour la saisie du texte de recherche
  const [searchInput, setSearchInput] = useState('');
  
  // Récupérer les paramètres d'URL
  const location = useLocation();

  // Nous n'avons plus besoin de filtrer les transactions côté client
  // car nous les chargeons déjà filtrées par type de compte
  const investmentTransactions = transactions;

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        // Récupérer le paramètre de recherche depuis l'URL
        const searchParams = new URLSearchParams(location.search);
        const searchFromURL = searchParams.get('search');
        
        // Charger d'abord les banques pour pouvoir filtrer les transactions
        await loadBanks();
        
        // Récupérer les IDs des banques de type INVESTMENT
        const investmentBankIds = banks
          .filter(bank => bank.accountType === 'INVESTMENT')
          .map(bank => bank.id);
        
        // Nous utilisons uniquement localSelectedBank pour la page Investissements
        
        // Initialiser la banque locale avec la première banque d'investissement
        const firstInvestmentBank = banks.find(bank => bank.accountType === 'INVESTMENT');
        setLocalSelectedBank(firstInvestmentBank || null);
        
        if (searchFromURL) {
          // Mettre à jour l'input de recherche avec la valeur de l'URL
          setSearchInput(searchFromURL);
          // Mettre à jour les filtres affichés
          setFilters(prev => ({ ...prev, searchText: searchFromURL }));
          // Charger les transactions avec le filtre de recherche et les banques d'investissement
          if (investmentBankIds.length > 0) {
            await loadTransactions({ 
              searchText: searchFromURL,
              accountType: 'INVESTMENT',
              forceIgnoreSelectedBank: true
            } as any);
          }
        } else {
          // Chargement normal avec filtre par type de compte
          if (investmentBankIds.length > 0) {
            // Forcer le rechargement complet des transactions d'investissement
            // en ignorant le filtre global de banque sélectionnée
            await loadTransactions({ 
              accountType: 'INVESTMENT',
              forceIgnoreSelectedBank: true,
              // Si une banque locale est déjà sélectionnée, l'utiliser comme filtre
              ...(firstInvestmentBank ? { bankId: firstInvestmentBank.id } : {})
            } as any);
          }
        }
        
        // Initialiser le formulaire d'ajout
        setEditingTransaction({
          id: '',
          amount: 0,
          description: '',
          date: new Date().toISOString().split('T')[0],
          checked: false,
          bankId: firstInvestmentBank?.id || ''
        });
      } catch (error) {
        console.error('Error initializing data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
    
    // Pas besoin de nettoyer l'état global car nous utilisons uniquement localSelectedBank
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
  const handleInlineEdit = (transactionId: string, field: 'amount' | 'description' | 'date' | 'bank' | 'checked' | 'unitPrice' | 'quantity') => {
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
      case 'bank':
        value = transaction.bankId;
        break;
      case 'checked':
        value = transaction.checked.toString();
        break;
      case 'unitPrice':
        value = transaction.unitPrice?.toString() || '';
        break;
      case 'quantity':
        value = transaction.quantity?.toString() || '';
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
      case 'bank':
        updateData.bankId = inlineEditValue;
        break;
      case 'checked':
        updateData.checked = inlineEditValue === 'true';
        break;
      case 'unitPrice':
        updateData.unitPrice = parseFloat(inlineEditValue);
        if (isNaN(updateData.unitPrice)) updateData.unitPrice = null; // Allow null for empty value
        break;
      case 'quantity':
        updateData.quantity = parseFloat(inlineEditValue);
        if (isNaN(updateData.quantity)) updateData.quantity = null; // Allow null for empty value
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
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...editingTransaction,
          bankId: editingTransaction.bankId || banks.filter(bank => bank.accountType === 'INVESTMENT')[0]?.id || ''
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
          bankId: banks.filter(bank => bank.accountType === 'INVESTMENT')[0]?.id || ''
        });
      } else {
        console.error('Error creating transaction:', await response.text());
      }
    } catch (error) {
      console.error('Error creating transaction:', error);
    }
  };

  // Fonction pour filtrer les transactions en fonction des filtres appliqués
  const filteredTransactions = useMemo(() => {
    return investmentTransactions.filter(transaction => {
      // Filtre par banque (utiliser uniquement localSelectedBank, pas selectedBank du store)
      if (localSelectedBank && transaction.bankId !== localSelectedBank.id) {
        return false;
      }
      
      // Filtre par statut pointé
      if (filters.checked) {
        const isChecked = transaction.checked === true;
        if (filters.checked === 'true' && !isChecked) return false;
        if (filters.checked === 'false' && isChecked) return false;
      }
      
      // Filtre par date de début
      if (filters.startDate && new Date(transaction.date) < new Date(filters.startDate)) {
        return false;
      }
      
      // Filtre par date de fin
      if (filters.endDate && new Date(transaction.date) > new Date(filters.endDate)) {
        return false;
      }
      
      // Filtre par texte de recherche
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        const descriptionLower = transaction.description.toLowerCase();
        if (!descriptionLower.includes(searchLower)) {
          return false;
        }
      }
      
      return true;
    });
  }, [investmentTransactions, localSelectedBank, filters]);

  // Fonction pour gérer le scroll infini
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && !loadingMore && hasMore) {
      loadMoreData();
    }
  };
  
  // Fonction pour charger plus de données
  const loadMoreData = async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      
      // Nous utilisons uniquement localSelectedBank pour la page Investissements
      
      // Ajouter le paramètre accountType pour charger uniquement les transactions d'investissement
      // Forcer l'ignorance de la banque globale sélectionnée
      const options: any = { 
        accountType: 'INVESTMENT',
        forceIgnoreSelectedBank: true
      };
      
      // Si une banque locale est sélectionnée, ajouter son ID aux options
      if (localSelectedBank) {
        options.bankId = localSelectedBank.id;
      }
      
      const result = await loadMoreTransactions(nextPage, ITEMS_PER_PAGE, options as any);
      
      if (result.newTransactions.length > 0) {
        setPage(nextPage);
      }
      
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error loading more data:', error);
    } finally {
      setLoadingMore(false);
    }
  };
  
  // Fonction pour gérer la sélection d'une banque
  const handleBankSelect = async (bank: any) => {
    setLocalSelectedBank(bank);
    setPage(1);
    setHasMore(true);
    
    // Recharger les transactions avec la banque sélectionnée
    // Toujours filtrer par type de compte INVESTMENT, même si aucune banque n'est sélectionnée
    await loadTransactions({
      accountType: 'INVESTMENT', // Toujours filtrer par type INVESTMENT
      forceIgnoreSelectedBank: true,
      bankId: bank ? bank.id : undefined // Si bank est null, on affiche toutes les banques de type INVESTMENT
    } as any);
  };

  // Fonction pour gérer la recherche
  const navigate = useNavigate();
  
  const handleSearch = () => {
    setFilters(prev => ({ ...prev, searchText: searchInput }));
    
    // Nous utilisons uniquement localSelectedBank pour la page Investissements
    
    // Mettre à jour l'URL avec le paramètre de recherche
    const searchParams = new URLSearchParams(location.search);
    if (searchInput) {
      searchParams.set('search', searchInput);
    } else {
      searchParams.delete('search');
    }
    navigate(`${location.pathname}?${searchParams.toString()}`);
  };
  
  // Fonction pour ouvrir le modal d'import CSV
  const handleOpenImportModal = () => {
    setShowImportModal(true);
    setCsvFile(null);
    // Initialiser avec la banque actuellement sélectionnée ou vide
    setImportBankId(localSelectedBank?.id || '');
    setImportProgress({
      isImporting: false,
      imported: 0,
      total: 0,
      errors: []
    });
  };

  // Fonction pour gérer l'import CSV
  const handleImportCSV = async () => {
    if (!csvFile || !importBankId) {
      alert('Veuillez sélectionner un fichier CSV et un compte d\'investissement');
      return;
    }

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

          // Déterminer l'ID de banque à utiliser pour l'import (fallbacks)
          const chosenBankId = importBankId || localSelectedBank?.id || (banks.find(b => b.accountType === 'INVESTMENT')?.id || '');

          // Si aucune banque valide, arrêter proprement et demander à l'utilisateur d'en choisir une
          if (!chosenBankId) {
            const errMsg = 'Aucun compte d\'investissement sélectionné. Veuillez choisir une banque avant d\'importer.';
            console.error(errMsg);
            setImportProgress(prev => ({ ...prev, isImporting: false, errors: [errMsg] }));
            return;
          }
          
          // Détecter le format du fichier CSV
          const isBoursobankInvestmentFormat = detectBoursobankInvestmentFormat(data[0]);
          const isBinanceFormat = detectBinanceFormat(data[0]);
          const isPeerBerryFormat = detectPeerBerryFormat(data[0]);
          console.log('Format Boursobank pour investissements détecté:', isBoursobankInvestmentFormat);
          console.log('Format Binance détecté:', isBinanceFormat);
          console.log('Format PeerBerry détecté:', isPeerBerryFormat);
          
          // Traiter chaque ligne
          for (let i = 0; i < data.length; i++) {
            const row = data[i] as any;
            
            try {
              // Normaliser les noms de colonnes (enlever espaces, accents, casse)
              const normalizedRow: any = {};
              Object.keys(row).forEach(key => {
                const normalizedKey = key.toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/\s+/g, '');
                normalizedRow[normalizedKey] = row[key];
              });
              
              // Ignorer les lignes vides (toutes colonnes vides)
              const allEmpty = Object.values(normalizedRow).every(v => v === null || v === undefined || String(v).trim() === '');
              if (allEmpty) {
                // Avancer le compteur mais ne pas créer d'erreur
                setImportProgress(prev => ({ ...prev, imported: i + 1 }));
                continue;
              }
              
              let transactionData;
              
              // Traitement spécifique selon le format détecté
              if (isBoursobankInvestmentFormat) {
                transactionData = processBoursobankInvestmentRow(normalizedRow, chosenBankId, importErrors, i);
                if (!transactionData) continue; // Si le traitement a échoué, passer à la ligne suivante
              } else if (isBinanceFormat) {
                transactionData = processBinanceRow(normalizedRow, chosenBankId, importErrors, i);
                if (!transactionData) continue; // Si le traitement a échoué, passer à la ligne suivante
              } else if (isPeerBerryFormat) {
                transactionData = processPeerBerryRow(normalizedRow, chosenBankId, importErrors, i);
                if (!transactionData) continue; // Si le traitement a échoué, passer à la ligne suivante
              } else {
                // Traitement standard pour les autres formats
                // Détecter les colonnes de date, description et montant
                let dateValue, descriptionValue, amountValue;
                
                // Essayer différents noms de colonnes couramment utilisés
                const dateKeys = ['date', 'dateoperaton', 'dateval', 'datevaleur', 'date_operation', 'date_valeur', 'date_compta', 'datecomptable', 'dateop', 'lastmovementdate'];
                const descriptionKeys = ['description', 'libelle', 'intitule', 'operation', 'designation', 'motif', 'reference', 'communication', 'label', 'name', 'title', 'project', 'type'];
                const amountKeys = ['montant', 'amount', 'debit', 'credit', 'somme', 'valeur', 'amountvariation', 'sum', 'cashflow', 'paymentamount'];
                const unitPriceKeys = ['unitprice', 'prixunitaire', 'prix_unitaire', 'prix', 'price', 'lastprice', 'coursunitaire', 'cours'];
                const quantityKeys = ['quantity', 'quantite', 'nombre', 'nombre_parts', 'parts', 'qte', 'qty'];
                
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
                // Support des colonnes concaténées PeerBerry (ex: projecttitle)
                if (!descriptionValue) {
                  const keyWithProject = Object.keys(normalizedRow).find(k => k.includes('projecttitle') || k.includes('projectname'));
                  if (keyWithProject && normalizedRow[keyWithProject]) {
                    descriptionValue = normalizedRow[keyWithProject];
                  }
                }
                
                // Chercher la colonne de montant
                for (const key of amountKeys) {
                  if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') {
                    amountValue = normalizedRow[key];
                    break;
                  }
                }
                
                // Chercher la colonne de prix unitaire
                let unitPriceValue;
                for (const key of unitPriceKeys) {
                  if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') {
                    unitPriceValue = normalizedRow[key];
                    break;
                  }
                }
                
                // Chercher la colonne de quantité
                let quantityValue;
                for (const key of quantityKeys) {
                  if (normalizedRow[key] !== undefined && normalizedRow[key] !== '') {
                    quantityValue = normalizedRow[key];
                    break;
                  }
                }
                
                // Si on n'a pas trouvé de montant, essayer de combiner débit et crédit
                if (amountValue === undefined) {
                  const debitValue = normalizedRow['debit'] || normalizedRow['debits'];
                  const creditValue = normalizedRow['credit'] || normalizedRow['credits'];
                  
                  if (debitValue !== undefined && debitValue !== '') {
                    amountValue = `-${Math.abs(parseFloat(String(debitValue).replace(/[^0-9.,-]/g, '').replace(',', '.')))}`;  
                  } else if (creditValue !== undefined && creditValue !== '') {
                    amountValue = Math.abs(parseFloat(String(creditValue).replace(/[^0-9.,-]/g, '').replace(',', '.')));
                  }
                }
                
                console.log(`🔍 Ligne ${i + 1} - Date: "${dateValue}", Description: "${descriptionValue}", Montant: "${amountValue}"`);
                
                // Si description absente, essayer de la construire à partir de type/title/project/comment
                if (!descriptionValue) {
                  const typeVal = normalizedRow['type'] || normalizedRow['operation'] || normalizedRow['category'];
                  const projectVal = normalizedRow['project'] || normalizedRow['title'] || normalizedRow['loanname'] || normalizedRow['name'];
                  const commentVal = normalizedRow['comment'] || normalizedRow['note'] || normalizedRow['details'];
                  const parts = [typeVal, projectVal, commentVal].map(v => (v !== undefined && v !== null ? String(v).trim() : '')).filter(Boolean);
                  if (parts.length > 0) descriptionValue = parts.join(' - ').replace(/\s+-\s+/g, ' - ');
                }

                if (!dateValue || amountValue === undefined) {
                  const missingFields = [] as string[];
                  if (!dateValue) missingFields.push('date');
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
                // Si libellé = INVESTEMENT/INVESTMENT, forcer signe négatif
                const upperDesc = String(descriptionValue || '').trim().toUpperCase();
                if ((upperDesc === 'INVESTEMENT' || upperDesc === 'INVESTMENT') && amount > 0) {
                  amount = -amount;
                }
                
                // Parser le prix unitaire
                let unitPrice: number | null = null;
                if (unitPriceValue !== undefined) {
                  const unitPriceStr = String(unitPriceValue).trim().replace(/\s/g, '');
                  if (unitPriceStr.includes(',') && !unitPriceStr.includes('.')) {
                    // Format français: 1 234,56
                    unitPrice = parseFloat(unitPriceStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
                  } else {
                    // Format anglais: 1,234.56 ou simple: 1234.56
                    unitPrice = parseFloat(unitPriceStr.replace(/[^0-9.-]/g, ''));
                  }
                  if (isNaN(unitPrice)) unitPrice = null;
                }
                
                // Parser la quantité
                let quantity: number | null = null;
                if (quantityValue !== undefined) {
                  const quantityStr = String(quantityValue).trim().replace(/\s/g, '');
                  if (quantityStr.includes(',') && !quantityStr.includes('.')) {
                    // Format français: 1 234,56
                    quantity = parseFloat(quantityStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
                  } else {
                    // Format anglais: 1,234.56 ou simple: 1234.56
                    quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, ''));
                  }
                  if (isNaN(quantity)) quantity = null;
                }
                
                // Créer la transaction
                transactionData = {
                  amount,
                  description: String(descriptionValue || 'Import CSV').trim(),
                  date: parsedDate.toISOString(),
                  createdAt: parsedDate.toISOString(), // Utiliser la date de la transaction
                  bankId: chosenBankId,
                  checked: false,
                  unitPrice,
                  quantity
                };
              }
              
              if (!transactionData) {
                importErrors.push(`Ligne ${i + 2}: Impossible de créer la transaction`);
                continue;
              }
              
              // Vérification finale des champs requis avant envoi à l'API
              if (!transactionData.amount && transactionData.amount !== 0) {
                importErrors.push(`Ligne ${i + 2}: Montant manquant dans la transaction`);
                continue;
              }
              
              if (!transactionData.description || transactionData.description.trim() === '') {
                importErrors.push(`Ligne ${i + 2}: Description manquante dans la transaction`);
                continue;
              }
              
              if (!transactionData.bankId) {
                importErrors.push(`Ligne ${i + 2}: ID de compte manquant dans la transaction`);
                continue;
              }
              
              console.log(`📝 Creating transaction ${i + 1}:`, transactionData);
              console.log(`🔍 DEBUG - unitPrice: ${transactionData.unitPrice}, type: ${typeof transactionData.unitPrice}`);
              console.log(`🔍 DEBUG - quantity: ${transactionData.quantity}, type: ${typeof transactionData.quantity}`);
              
              // Sérialiser les données pour l'API
              const jsonData = JSON.stringify(transactionData);
              console.log(`🔍 DEBUG - JSON envoyé à l'API:`, jsonData);
              
              // Appel API pour créer la transaction
              const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: jsonData,
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
  

    // Fonction pour détecter si c'est un format Boursobank pour les investissements
  const detectBoursobankInvestmentFormat = (row: any): boolean => {
    if (!row) return false;
    
    // Normaliser les noms de colonnes
    const normalizedKeys = Object.keys(row).map(key => 
      key.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
    );
    
    console.log('Colonnes normalisées pour détection format:', normalizedKeys);
    
    // Vérifier si les colonnes exactes du format fourni sont présentes
    // Format attendu: name;isin;quantity;buyingPrice;lastPrice;intradayVariation;amount;amountVariation;variation;lastMovementDate;compensation
    const requiredColumns = ['name', 'isin', 'quantity', 'buyingprice', 'lastprice', 'amount'];
    const hasRequiredColumns = requiredColumns.every(col => 
      normalizedKeys.some(key => key === col || key.includes(col))
    );
    
    // Format spécifique fourni par l'utilisateur
    const userFormatColumns = ['name', 'isin', 'quantity', 'buyingprice', 'lastprice', 'intradayvariation', 'amount', 'amountvariation', 'variation', 'lastmovementdate', 'compensation'];
    const isUserFormat = userFormatColumns.every(col => 
      normalizedKeys.some(key => key === col || key.includes(col))
    );
    
    console.log('Détection format Boursobank:', hasRequiredColumns);
    console.log('Détection format utilisateur:', isUserFormat);
    
    return hasRequiredColumns || isUserFormat;
  };

  // Fonction pour détecter si c'est le format Binance
  const detectBinanceFormat = (row: any): boolean => {
    if (!row) return false;
    
    // Normaliser les noms de colonnes
    const normalizedKeys = Object.keys(row).map(key => 
      key.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
    );
    
    console.log('Colonnes normalisées pour détection format Binance:', normalizedKeys);
    
    // Vérifier si les colonnes correspondent au format Binance
    const requiredColumns = [
      'dateutc',
      'date(utc)',
      'orderno',
      'pair',
      'type',
      'side',
      'tradingtotal',
      'trading_total'
    ];
    
    // Vérifier si au moins 4 des colonnes requises sont présentes
    const matchCount = requiredColumns.filter(col => 
      normalizedKeys.some(key => key === col || key.includes(col))
    ).length;
    
    console.log('Détection format Binance - colonnes correspondantes:', matchCount);
    
    return matchCount >= 4;
  };

  // Détection du format PeerBerry
  const detectPeerBerryFormat = (row: any): boolean => {
    if (!row) return false;

    const normalizedKeys = Object.keys(row).map(key =>
      key
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
    );

    // Colonnes typiques PeerBerry (extraits depuis export: Date, Type, Project/Title, Amount, Currency, Balance, Comment)
    const candidates = [
      'date',
      'type',
      'project',
      'title',
      'loanname',
      'loanid',
      'amount',
      'sum',
      'cashflow',
      'paymentamount',
      'currency',
      'comment',
      'note',
      'balance',
      'id'
    ];

    // Doit contenir au moins date et amount et au moins l'un de type/project/title
    const hasDate = normalizedKeys.some(k => k === 'date' || k.includes('date'));
    const hasAmount = normalizedKeys.some(k => k === 'amount' || k.includes('amount') || k === 'sum' || k.includes('cashflow') || k.includes('paymentamount'));
    const hasDescriptor = normalizedKeys.some(k => ['type', 'project', 'title', 'loanname'].some(t => k === t || k.includes(t)));

    const matchCount = candidates.filter(col => normalizedKeys.some(k => k === col || k.includes(col))).length;

    const isPeerBerry = hasDate && hasAmount && hasDescriptor && matchCount >= 3;
    if (isPeerBerry) {
      console.log('Détection format PeerBerry - colonnes:', normalizedKeys);
    }
    return isPeerBerry;
  };

  // Traitement d'une ligne PeerBerry
  const processPeerBerryRow = (row: any, bankId: string, importErrors: string[], rowIndex: number): any => {
    try {
      if (!bankId) {
        importErrors.push(`Ligne ${rowIndex + 2}: Compte d'investissement non spécifié`);
        return null;
      }

      // Extraire valeurs possibles
      const dateValue = row['date'] || row['transactiondate'] || row['dateoperation'] || row['dateop'];
      const amountValue = row['amount'] || row['montant'] || row['sum'] || row['cashflow'] || row['paymentamount'];
      const currency = row['currency'] || row['devise'];
      const type = row['type'] || row['operation'] || row['category'];
      const project = row['project'] || row['title'] || row['loanname'] || row['projet'] || row['name'];
      const comment = row['comment'] || row['note'] || row['description'] || row['details'];

      if (!dateValue || amountValue === undefined) {
        importErrors.push(`Ligne ${rowIndex + 2}: Données manquantes (date ou montant)`);
        return null;
      }

      // Parser la date (PeerBerry utilise souvent dd.MM.yyyy hh:mm ou dd.MM.yyyy)
      let parsedDate: Date | null = null;
      const rawDate = String(dateValue).trim();

      // Essais multiples
      if (/^\d{2}\.\d{2}\.\d{4}(\s+\d{2}:\d{2}(:\d{2})?)?$/.test(rawDate)) {
        const [dpart, tpart] = rawDate.split(/\s+/);
        const [d, m, y] = dpart.split('.');
        parsedDate = new Date(`${y}-${m}-${d}${tpart ? 'T' + tpart : ''}`);
      } else if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        parsedDate = new Date(rawDate);
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
        const [d, m, y] = rawDate.split('/');
        parsedDate = new Date(`${y}-${m}-${d}`);
      }

      if (!parsedDate || isNaN(parsedDate.getTime())) {
        importErrors.push(`Ligne ${rowIndex + 2}: Format de date PeerBerry non reconnu (${rawDate})`);
        return null;
      }

      // Parser le montant (euros, peut inclure signe, virgule)
      let amount: number;
      const amountStr = String(amountValue).trim().replace(/\s/g, '');
      if (amountStr.includes(',') && !amountStr.includes('.')) {
        amount = parseFloat(amountStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
      } else {
        amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
      }
      if (isNaN(amount)) {
        importErrors.push(`Ligne ${rowIndex + 2}: Montant PeerBerry invalide (${amountStr})`);
        return null;
      }

      // Ajustement de signe selon type/libellé demandé (INVESTEMENT/INVESTMENT)
      const upperType = String(type || '').trim().toUpperCase();
      if ((upperType === 'INVESTEMENT' || upperType === 'INVESTMENT') && amount > 0) {
        amount = -amount;
      }

      // Construire la description si manquante: "<Type> - <Project> <Comment>"
      const parts = [type, project, comment].map(v => (v !== undefined && v !== null ? String(v).trim() : '')).filter(Boolean);
      const description = parts.length > 0 ? parts.join(' - ').replace(/\s+-\s+/g, ' - ') : 'PeerBerry';
      // Si description finit par un séparateur accidentel, nettoyer
      const cleanDescription = description.replace(/\s*-\s*$/,'').trim();

      return {
        amount,
        description: cleanDescription,
        date: parsedDate.toISOString(),
        createdAt: parsedDate.toISOString(),
        bankId,
        checked: false,
        unitPrice: null,
        quantity: null,
        metadata: {
          platform: 'PeerBerry',
          currency: currency || 'EUR',
          type: type || undefined,
          project: project || undefined
        }
      };
    } catch (e) {
      console.error(`Error processing PeerBerry row ${rowIndex + 1}:`, e);
      importErrors.push(`Ligne ${rowIndex + 2}: Erreur traitement PeerBerry`);
      return null;
    }
  };

  // Fonction pour traiter une ligne au format Binance
  const processBinanceRow = (row: any, bankId: string, importErrors: string[], rowIndex: number): any => {
    try {
      console.log('Traitement ligne CSV format Binance:', row);
      
      // Vérifier que bankId est valide
      if (!bankId) {
        importErrors.push(`Ligne ${rowIndex + 2}: Compte d'investissement non spécifié`);
        return null;
      }
      
      // Extraire les données nécessaires avec gestion des différentes variantes de noms de colonnes
      const dateValue = row['date(utc)'] || row['dateutc'] || row['date'] || row['utcdate'] || row['time'] || row['timestamp'];
      const orderNo = row['orderno'] || row['order_no'] || row['orderid'] || row['order_id'] || row['id'] || row['transaction_id'];
      const pair = row['pair'] || row['symbol'] || row['market'] || row['coin'] || row['asset'];
      const type = row['type'] || row['ordertype'] || row['order_type'] || row['operation'] || row['operation_type'];
      const side = row['side'] || row['direction'] || row['tradeside'] || row['trade_side'] || row['operation'];
      
      // Recherche plus approfondie pour le montant
      let amountValue;
      const possibleAmountFields = ['tradingtotal', 'trading_total', 'total', 'amount', 'value', 'eur', 'usd', 'fiat_amount', 'fiat', 'cost', 'total_cost'];
      
      for (const field of possibleAmountFields) {
        // Vérifier les variantes de casse (majuscules, minuscules, camelCase)
        const variants = [field, field.toLowerCase(), field.toUpperCase(), field.charAt(0).toUpperCase() + field.slice(1)];
        
        for (const variant of variants) {
          if (row[variant] !== undefined && row[variant] !== '') {
            amountValue = row[variant];
            break;
          }
        }
        
        if (amountValue !== undefined) break;
      }
      
      // Si toujours pas de montant, essayer de le calculer à partir du prix et de la quantité
      if ((!amountValue && amountValue !== 0) || amountValue === '') {
        const priceValue = row['averageprice'] || row['average_price'] || row['price'] || row['unitprice'] || row['unit_price'] || row['price_eur'] || row['price_usd'];
        const quantityValue = row['executed'] || row['quantity'] || row['qty'] || row['size'] || row['volume'] || row['amount'];
        
        if (priceValue && quantityValue) {
          try {
            const price = parseFloat(String(priceValue).replace(/[^0-9.-]/g, '').replace(',', '.'));
            const qty = parseFloat(String(quantityValue).replace(/[^0-9.-]/g, '').replace(',', '.'));
            amountValue = price * qty;
            console.log(`Calculated amount from price (${price}) * quantity (${qty}) = ${amountValue}`);
          } catch (e) {
            console.warn('Failed to calculate amount from price and quantity:', e);
          }
        }
      }
      
      // Parser la date (format Binance: YYYY-MM-DD HH:MM:SS)
      let parsedDate: Date;
      try {
        if (dateValue) {
          parsedDate = new Date(dateValue);
          if (isNaN(parsedDate.getTime())) {
            // Essayer d'autres formats de date
            const formats = [
              // Format timestamp (millisecondes)
              (val: string) => new Date(parseInt(val)),
              // Format DD/MM/YYYY
              (val: string) => {
                const parts = val.split('/');
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
              },
              // Format MM/DD/YYYY
              (val: string) => {
                const parts = val.split('/');
                return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
              }
            ];
            
            for (const format of formats) {
              try {
                const date = format(dateValue);
                if (!isNaN(date.getTime())) {
                  parsedDate = date;
                  break;
                }
              } catch (e) {
                // Continuer avec le prochain format
              }
            }
            
            if (isNaN(parsedDate.getTime())) {
              // Si toujours pas valide, utiliser la date actuelle
              console.warn(`Format de date non reconnu (${dateValue}), utilisation de la date actuelle`);
              parsedDate = new Date();
            }
          }
        } else {
          // Si pas de date, utiliser la date actuelle
          parsedDate = new Date();
        }
      } catch (error) {
        console.warn(`Erreur de parsing de la date (${dateValue}), utilisation de la date actuelle`);
        parsedDate = new Date();
      }
      
      // Parser le montant
      let amount: number;
      try {
        if (amountValue !== undefined && amountValue !== null && amountValue !== '') {
          // Nettoyer la valeur du montant
          const amountStr = String(amountValue).trim().replace(/\s/g, '');
          amount = parseFloat(amountStr.replace(/[^0-9.-]/g, '').replace(',', '.'));
          
          if (isNaN(amount)) {
            console.warn(`Montant invalide (${amountValue}), utilisation de 0`);
            amount = 0;
          }
        } else {
          // Si pas de montant, utiliser 0
          console.warn('Aucun montant trouvé, utilisation de 0');
          amount = 0;
        }
        
        // Si c'est une vente (SELL), le montant est positif, sinon c'est un achat (BUY) et le montant est négatif
        if (side) {
          const upperSide = side.toUpperCase();
          if (upperSide === 'BUY' || upperSide === 'PURCHASE' || upperSide === 'ACHAT') {
            amount = -Math.abs(amount); // Achat = sortie d'argent = montant négatif
          } else if (upperSide === 'SELL' || upperSide === 'SALE' || upperSide === 'VENTE') {
            amount = Math.abs(amount); // Vente = entrée d'argent = montant positif
          }
        }
      } catch (error) {
        console.warn(`Erreur de parsing du montant (${amountValue}), utilisation de 0`);
        amount = 0;
      }
      
      // Parser le prix unitaire
      let unitPrice: number | null = null;
      const priceValue = row['averageprice'] || row['average_price'] || row['price'] || row['unitprice'] || row['unit_price'] || row['price_eur'] || row['price_usd'];
      if (priceValue) {
        try {
          const priceStr = String(priceValue).trim().replace(/\s/g, '');
          unitPrice = parseFloat(priceStr.replace(/[^0-9.-]/g, '').replace(',', '.'));
          if (isNaN(unitPrice)) unitPrice = null;
        } catch (error) {
          // Ne pas bloquer l'import si le prix unitaire est invalide
          console.warn(`Warning: Invalid unit price at row ${rowIndex + 2}: ${priceValue}`);
        }
      }
      
      // Parser la quantité
      let quantity: number | null = null;
      const quantityValue = row['executed'] || row['quantity'] || row['qty'] || row['size'] || row['volume'] || row['amount'];
      if (quantityValue) {
        try {
          const quantityStr = String(quantityValue).trim().replace(/\s/g, '');
          quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, '').replace(',', '.'));
          if (isNaN(quantity)) quantity = null;
        } catch (error) {
          // Ne pas bloquer l'import si la quantité est invalide
          console.warn(`Warning: Invalid quantity at row ${rowIndex + 2}: ${quantityValue}`);
        }
      }
      
      // Créer une description significative
      let description = '';
      
      if (side && pair) {
        description = `${side || ''} ${pair || ''} ${type || ''}`.trim();
        if (orderNo) {
          description += ` (${orderNo})`;
        }
      } else if (pair) {
        description = `Transaction ${pair} ${type || ''}`.trim();
      } else {
        // Fallback description
        description = 'Transaction Binance';
      }
      
      // S'assurer que la description n'est pas vide
      if (!description || description.trim() === '') {
        description = 'Transaction Binance';
      }
      
      // Créer la transaction avec tous les champs requis
      const transaction = {
        amount,
        description: description.trim(),
        date: parsedDate.toISOString(),
        createdAt: parsedDate.toISOString(),
        bankId,
        checked: false,
        unitPrice,
        quantity
      };
      
      // Vérification finale des champs obligatoires - toujours valide maintenant car nous avons des valeurs par défaut
      return transaction;
    } catch (error) {
      console.error('Erreur lors du traitement de la ligne Binance:', error);
      importErrors.push(`Ligne ${rowIndex + 2}: Erreur lors du traitement de la ligne Binance: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      
      // En cas d'erreur, créer une transaction par défaut avec les informations minimales requises
      return {
        amount: 0,
        description: `Transaction Binance (ligne ${rowIndex + 2})`,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        bankId,
        checked: false
      };
    }
  };
  
  // Fonction pour traiter une ligne au format Boursobank Investissement
  const processBoursobankInvestmentRow = (row: any, bankId: string, importErrors: string[], rowIndex: number): any => {
    try {
      console.log('Traitement ligne CSV format utilisateur:', row);
      
      // Extraire les données pertinentes
      const name = row['name'] || '';
      const isin = row['isin'] || '';
      
      // Traiter la quantité (convertir les formats numériques)
      let quantity = 0;
      if (row['quantity'] !== undefined && row['quantity'] !== '') {
        const quantityStr = String(row['quantity']).trim().replace(/\s/g, '');
        if (quantityStr.includes(',') && !quantityStr.includes('.')) {
          // Format français: 1 234,56
          quantity = parseFloat(quantityStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          // Format anglais: 1,234.56 ou simple: 1234.56
          quantity = parseFloat(quantityStr.replace(/[^0-9.-]/g, ''));
        }
      }
      
      // Traiter le prix unitaire (lastPrice)
      let lastPrice = 0;
      if (row['lastprice'] !== undefined && row['lastprice'] !== '') {
        const priceStr = String(row['lastprice']).trim().replace(/\s/g, '');
        if (priceStr.includes(',') && !priceStr.includes('.')) {
          lastPrice = parseFloat(priceStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          lastPrice = parseFloat(priceStr.replace(/[^0-9.-]/g, ''));
        }
      }
      
      // Traiter le montant (amount ou amountvariation)
      let amount = 0;
      const amountValue = row['amount'] || row['amountvariation'];
      if (amountValue !== undefined && amountValue !== '') {
        const amountStr = String(amountValue).trim().replace(/\s/g, '');
        if (amountStr.includes(',') && !amountStr.includes('.')) {
          amount = parseFloat(amountStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ''));
        }
      }
      
      // Traiter la date du dernier mouvement
      const lastMovementDate = row['lastmovementdate'] || new Date().toISOString().split('T')[0];
      
      // Vérifier les données obligatoires
      if (!name || !isin || isNaN(quantity) || isNaN(lastPrice) || isNaN(amount)) {
        const missingFields = [];
        if (!name) missingFields.push('name');
        if (!isin) missingFields.push('isin');
        if (isNaN(quantity)) missingFields.push('quantity');
        if (isNaN(lastPrice)) missingFields.push('lastPrice');
        if (isNaN(amount)) missingFields.push('amount');
        
        importErrors.push(`Ligne ${rowIndex + 2}: Données manquantes ou invalides (${missingFields.join(', ')})`);
        return null;
      }
      
      // Parser la date
      let parsedDate: Date;
      const dateStr = String(lastMovementDate).trim();
      
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
        // Si pas de date valide, utiliser la date du jour
        parsedDate = new Date();
      }
      
      // Traiter le prix d'achat (buyingPrice)
      let buyingPrice = 0;
      if (row['buyingprice'] !== undefined && row['buyingprice'] !== '') {
        const buyingPriceStr = String(row['buyingprice']).trim().replace(/\s/g, '');
        if (buyingPriceStr.includes(',') && !buyingPriceStr.includes('.')) {
          buyingPrice = parseFloat(buyingPriceStr.replace(/[^0-9,-]/g, '').replace(',', '.'));
        } else {
          buyingPrice = parseFloat(buyingPriceStr.replace(/[^0-9.-]/g, ''));
        }
      }
      
      // Créer la description avec uniquement le nom et l'ISIN (sans quantité ni prix)
      const description = `${name} (${isin})`;
      
      console.log(`CSV import: Création transaction pour ${name}, unitPrice=${lastPrice}, quantity=${quantity}`);
      
      // Créer la transaction
      return {
        amount,
        description,
        date: parsedDate.toISOString(),
        createdAt: parsedDate.toISOString(),
        bankId,
        checked: false,
        // Ajouter unitPrice et quantity directement dans la transaction
        unitPrice: lastPrice,
        quantity: quantity,
        metadata: {
          isin,
          buyingPrice,
          lastPrice,
          type: 'investment'
        }
      };
    } catch (error) {
      console.error(`Error processing Boursobank row ${rowIndex + 1}:`, error);
      importErrors.push(`Ligne ${rowIndex + 2}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      return null;
    }
  };
  

  
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
  
  // Rendu du composant
  return (
    <div className="w-full pb-6">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-white sm:text-3xl sm:truncate">Investissements</h2>
            <p className="text-sm text-gray-300 mt-1">Suivez et gérez vos investissements et leurs opérations associées</p>
          </div>
          <div className="flex space-x-2 md:mt-0">
            <button
              onClick={handleOpenImportModal}
              className="px-3 py-2 text-sm font-medium text-white border border-transparent rounded-md hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 flex items-center"
              style={{ backgroundColor: '#6226fa' }}
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Importer CSV
            </button>
            

          </div>
        </div>
        
        {/* Filtres */}
        <div className="p-4 rounded-lg" style={{ backgroundColor: '#272a2f' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Banque</label>
              <select
                value={localSelectedBank?.id || ''}
                onChange={(e) => {
                  const bank = banks.find(b => b.id === e.target.value);
                  handleBankSelect(bank || null);
                }}
                className="mt-1 block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
                style={{ backgroundColor: '#1f2226', color: 'white', minHeight: '2.5rem', border: 'none', padding: '0.5rem 0.75rem' }}
              >
                <option value="" style={{ backgroundColor: '#1f2226' }}>Toutes</option>
                {banks.filter(bank => bank.accountType === 'INVESTMENT').map(bank => {
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
              <label className="block text-sm font-medium text-gray-300">Date début</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                className="mt-1 block w-full rounded-md border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
                style={{ backgroundColor: '#1f2226', color: 'white', minHeight: '2.5rem', border: 'none', padding: '0.5rem 0.75rem' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Date fin</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                className="mt-1 block w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent py-2 px-3 h-10 min-h-[2.5rem]"
                style={{ backgroundColor: '#1f2226' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Pointé</label>
              <select
                value={filters.checked}
                onChange={(e) => setFilters({...filters, checked: e.target.value})}
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

        {/* Tableau des transactions d'investissement */}
        <div className="shadow rounded-lg overflow-hidden" style={{ backgroundColor: '#272a2f' }}>
          <div 
            className="overflow-y-auto custom-scrollbar"
            style={{ maxHeight: '70vh' }}
            onScroll={handleScroll}
          >
            <table className="w-full divide-y divide-gray-600" style={{ backgroundColor: '#272a2f' }}>
              <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1f2226' }}>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-64">
                    Description
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-32">
                    Banque
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                    Propriétaires
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                    Prix unitaire
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                    Quantité
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                    Montant
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-300 uppercase tracking-wider w-16">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-600" style={{ backgroundColor: '#272a2f' }}>
                {/* Add form row - always visible as first row */}
                <tr className="border-l-4" style={{ backgroundColor: '#1f2226', borderLeftColor: '#6226fa' }}>
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
                      value={editingTransaction?.bankId || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, bankId: e.target.value} : null)}
                      className="w-full rounded-md text-white border-none focus:ring-0 bg-transparent text-sm py-2 px-3" style={{ backgroundColor: '#1f2226' }}
                      required
                    >
                      <option value="" style={{ backgroundColor: '#272a2f' }}>Sélectionnez une banque</option>
                      {banks.filter(bank => bank.accountType === 'INVESTMENT').map(bank => {
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
                      step="0.01"
                      value={editingTransaction?.unitPrice || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, unitPrice: parseFloat(e.target.value) || 0} : null)}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-sm"
                      style={{ backgroundColor: '#272a2f' }}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editingTransaction?.quantity || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, quantity: parseFloat(e.target.value) || 0} : null)}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-sm"
                      style={{ backgroundColor: '#272a2f' }}
                      placeholder="0"
                    />
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
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={handleAddTransaction}
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
                            .filter((bank) => bank.accountType === 'INVESTMENT')
                            .map((bank) => {
                              const bankUsers = bank.users?.map(u => u.name).filter(Boolean) || [];
                              const bankUsersText = bankUsers.length > 0 ? ` (${bankUsers.join(', ')})` : '';
                              
                              return (
                                <option key={bank.id} value={bank.id} style={{ backgroundColor: '#1f2226' }}>
                                  {bank.name}{bankUsersText}
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
                          step="0.01"
                          value={editingTransaction?.unitPrice || ''}
                          onChange={(e) => setEditingTransaction(prev => prev ? {...prev, unitPrice: parseFloat(e.target.value) || 0} : null)}
                          className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                          style={{ backgroundColor: '#1f2226' }}
                        />
                      ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'unitPrice' ? (
                        <input
                          type="number"
                          step="0.01"
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
                          onClick={() => handleInlineEdit(transaction.id, 'unitPrice')}
                          className="cursor-pointer rounded px-1 py-0.5 editable-cell hover:opacity-80"
                          title="Double-cliquez pour éditer"
                        >
                          {transaction.unitPrice ? formatAmount(transaction.unitPrice) : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                      {editingId === transaction.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editingTransaction?.quantity || ''}
                          onChange={(e) => setEditingTransaction(prev => prev ? {...prev, quantity: parseFloat(e.target.value) || 0} : null)}
                          className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                          style={{ backgroundColor: '#1f2226' }}
                        />
                      ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'quantity' ? (
                        <input
                          type="number"
                          step="0.01"
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
                          onClick={() => handleInlineEdit(transaction.id, 'quantity')}
                          className="cursor-pointer rounded px-1 py-0.5 editable-cell hover:opacity-80"
                          title="Double-cliquez pour éditer"
                        >
                          {transaction.quantity ? transaction.quantity : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-white">
                      {editingId === transaction.id ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editingTransaction?.amount || ''}
                          onChange={(e) => setEditingTransaction(prev => prev ? {...prev, amount: parseFloat(e.target.value) || 0} : null)}
                          className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent"
                          style={{ backgroundColor: '#1f2226' }}
                        />
                      ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'amount' ? (
                        <input
                          type="number"
                          step="0.01"
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
              <h3 className="mt-2 text-sm font-medium text-white">Aucune transaction d'investissement</h3>
              <p className="mt-1 text-sm text-gray-300">Commencez par ajouter une nouvelle transaction.</p>
            </div>
          )}
        </div>
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
                  Compte d'investissement de destination *
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
                  <option value="">Sélectionnez un compte...</option>
                  {banks.filter(bank => bank.accountType === 'INVESTMENT').map(bank => {
                    const bankUsers = bank.users?.map(u => u.name).filter(Boolean) || [];
                    const bankUsersText = bankUsers.length > 0 ? ` (${bankUsers.join(', ')})` : '';
                    return (
                      <option key={bank.id} value={bank.id}>{bank.name}{bankUsersText}</option>
                    );
                  })}
                </select>
                {!importBankId && (
                  <p className="mt-1 text-sm text-red-600">
                    Veuillez sélectionner un compte avant d'importer
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
                  disabled={!csvFile || !localSelectedBank || importProgress.isImporting}
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
    </div>
  );
}
