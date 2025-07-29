import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { useLocation } from 'react-router-dom';
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
  bankId?: string;
}

interface InlineEditCell {
  transactionId: string;
  field: 'amount' | 'description' | 'date' | 'bank' | 'checked';
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
  
  // États pour la sélection multiple
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  
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

  // États pour la modification en lot
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
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

  // Filtrer uniquement les transactions liées aux investissements
  const investmentTransactions = transactions.filter(transaction => {
    const bank = banks.find(b => b.id === transaction.bankId);
    return bank?.accountType === 'INVESTMENT';
  });

  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      try {
        // Récupérer le paramètre de recherche depuis l'URL
        const searchParams = new URLSearchParams(location.search);
        const searchFromURL = searchParams.get('search');
        
        if (searchFromURL) {
          // Mettre à jour l'input de recherche avec la valeur de l'URL
          setSearchInput(searchFromURL);
          // Mettre à jour les filtres affichés
          setFilters(prev => ({ ...prev, searchText: searchFromURL }));
          // Charger les transactions avec le filtre de recherche
          await Promise.all([
            loadTransactions({ searchText: searchFromURL }),
            loadBanks()
          ]);
        } else {
          // Chargement normal sans filtre
          await Promise.all([
            loadTransactions(),
            loadBanks()
          ]);
        }
        // Initialiser le formulaire d'ajout
        setEditingTransaction({
          id: '',
          amount: 0,
          description: '',
          date: new Date().toISOString().split('T')[0],
          checked: false,
          bankId: banks.filter(bank => bank.accountType === 'INVESTMENT')[0]?.id || ''
        });
      } catch (error) {
        console.error('Error initializing data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, []);
  
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
  const handleInlineEdit = (transactionId: string, field: 'amount' | 'description' | 'date' | 'bank' | 'checked') => {
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
  
  // Filtrer les transactions en fonction des critères
  const filteredTransactions = investmentTransactions.filter(transaction => {
    // Filtre par banque sélectionnée
    if (localSelectedBank && String(transaction.bankId) !== String(localSelectedBank.id)) {
      return false;
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
      const result = await loadMoreTransactions(nextPage, ITEMS_PER_PAGE);
      
      if (result.newTransactions.length > 0) {
        setPage(nextPage);
      }
      
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error loading more transactions:', error);
    } finally {
      setLoadingMore(false);
    }
  };
  
  // Fonction pour gérer la recherche
  const handleSearch = () => {
    setFilters({...filters, searchText: searchInput});
  };
  
  // Fonction pour gérer la sélection/désélection de toutes les transactions
  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedTransactions([]);
    } else {
      setSelectedTransactions(filteredTransactions.map(t => t.id));
    }
    setSelectAll(!selectAll);
  };
  
  // Fonction pour gérer l'import CSV
  const handleImportCSV = async () => {
    if (!csvFile || !localSelectedBank) {
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
          
          // Détecter si c'est un format Boursobank pour les investissements
          const isBoursobankInvestmentFormat = detectBoursobankInvestmentFormat(data[0]);
          console.log('Format Boursobank pour investissements détecté:', isBoursobankInvestmentFormat);
          
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
              
              let transactionData;
              
              // Traitement spécifique pour le format Boursobank Investissement
              if (isBoursobankInvestmentFormat) {
                transactionData = processBoursobankInvestmentRow(normalizedRow, localSelectedBank.id, importErrors, i);
                if (!transactionData) continue; // Si le traitement a échoué, passer à la ligne suivante
              } else {
                // Traitement standard pour les autres formats
                // Détecter les colonnes de date, description et montant
                let dateValue, descriptionValue, amountValue;
                
                // Essayer différents noms de colonnes couramment utilisés
                const dateKeys = ['date', 'dateoperaton', 'dateval', 'datevaleur', 'date_operation', 'date_valeur', 'date_compta', 'datecomptable', 'dateop', 'lastmovementdate'];
                const descriptionKeys = ['description', 'libelle', 'intitule', 'operation', 'designation', 'motif', 'reference', 'communication', 'label', 'name'];
                const amountKeys = ['montant', 'amount', 'debit', 'credit', 'somme', 'valeur', 'amountvariation'];
                
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
                  const debitValue = normalizedRow['debit'] || normalizedRow['debits'];
                  const creditValue = normalizedRow['credit'] || normalizedRow['credits'];
                  
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
                transactionData = {
                  amount,
                  description: String(descriptionValue).trim(),
                  date: parsedDate.toISOString(),
                  createdAt: parsedDate.toISOString(), // Utiliser la date de la transaction
                  bankId: localSelectedBank.id,
                  checked: false
                };
              }
              
              if (!transactionData) {
                importErrors.push(`Ligne ${i + 2}: Impossible de créer la transaction`);
                continue;
              }
              
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
  
  // Fonction pour détecter si c'est le format Boursobank pour les investissements
  const detectBoursobankInvestmentFormat = (row: any): boolean => {
    if (!row) return false;
    
    // Normaliser les noms de colonnes
    const normalizedKeys = Object.keys(row).map(key => 
      key.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
    );
    
    // Vérifier si les colonnes typiques du format Boursobank sont présentes
    const requiredColumns = ['name', 'isin', 'quantity', 'buyingprice', 'lastprice', 'amount'];
    const hasRequiredColumns = requiredColumns.every(col => 
      normalizedKeys.some(key => key.includes(col))
    );
    
    return hasRequiredColumns;
  };
  
  // Fonction pour traiter une ligne au format Boursobank Investissement
  const processBoursobankInvestmentRow = (row: any, bankId: string, importErrors: string[], rowIndex: number): any => {
    try {
      // Extraire les données pertinentes
      const name = row['name'] || '';
      const isin = row['isin'] || '';
      const quantity = parseFloat(String(row['quantity'] || '0').replace(/[^0-9.,-]/g, '').replace(',', '.'));
      const lastPrice = parseFloat(String(row['lastprice'] || '0').replace(/[^0-9.,-]/g, '').replace(',', '.'));
      const amount = parseFloat(String(row['amount'] || row['amountvariation'] || '0').replace(/[^0-9.,-]/g, '').replace(',', '.'));
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
      
      // Créer la description avec les informations pertinentes
      const description = `${name} (${isin}) - Qté: ${quantity} - Prix: ${lastPrice}€`;
      
      // Créer la transaction
      return {
        amount,
        description,
        date: parsedDate.toISOString(),
        createdAt: parsedDate.toISOString(),
        bankId,
        checked: false,
        metadata: {
          isin,
          quantity,
          buyingPrice: parseFloat(String(row['buyingprice'] || '0').replace(/[^0-9.,-]/g, '').replace(',', '.')),
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
  
  // Fonction pour gérer la sélection/désélection d'une transaction
  const handleToggleSelect = (id: string) => {
    setSelectedTransactions(prev => {
      if (prev.includes(id)) {
        return prev.filter(transactionId => transactionId !== id);
      } else {
        return [...prev, id];
      }
    });
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
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
          <h1 className="text-2xl font-bold text-white">Investissements</h1>
          
          <div className="flex space-x-2">
            <button
              onClick={() => setShowImportModal(true)}
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
                  setLocalSelectedBank(bank || null);
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
                    Banque
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-24">
                    Propriétaires
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
                  value={localSelectedBank?.id || ''}
                  onChange={(e) => {
                    const bank = banks.find(b => b.id === e.target.value);
                    setLocalSelectedBank(bank || null);
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
                {!localSelectedBank && (
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
