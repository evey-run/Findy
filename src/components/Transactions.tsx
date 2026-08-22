import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../store';
import { assetUrl } from '../lib/url';
import { otherBankOwnersSuffix } from '../lib/bankOwners';
import { merchantColor, merchantInitials, merchantName } from '../lib/merchant';
import type { Bank } from '../types';
import { useLocation } from 'react-router-dom';


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
/**
 * Libellé d'un jour, relatif quand c'est utile.
 *
 * Le tableau n'a plus de colonne date : les transactions sont rangées sous
 * l'en-tête de leur journée. « Aujourd'hui » et « Hier » situent tout de suite,
 * au-delà la date suffit.
 */
const dayLabel = (dateString: string): string => {
  const date = new Date(dateString);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((midnight.getTime() - day.getTime()) / 86400000);

  const full = day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (diff === 0) return `Aujourd'hui — ${full}`;
  if (diff === 1) return `Hier — ${full}`;
  return full.charAt(0).toUpperCase() + full.slice(1);
};

/** Clé de regroupement : le jour civil, indépendant de l'heure. */
const dayKey = (dateString: string): string => new Date(dateString).toISOString().slice(0, 10);

/** Intitulé de colonne : la référence typographique de l'en-tête. */
const HEADER_LABEL = 'text-[11px] font-medium uppercase tracking-wider text-zinc-400';

/**
 * Contrôle d'en-tête — recherche et sélecteurs.
 *
 * Ils reprennent exactement la typographie des intitulés et la même hauteur :
 * une rangée où chaque cellule a sa propre taille se lit mal.
 */
const HEADER_CONTROL =
  // Hauteur fixe plutôt que dérivée du texte : un `select` s'octroie sinon
  // quelques pixels de plus qu'un `input`, et la barre s'épaissit pour rien.
  'h-6 w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0 text-[11px] font-medium '
  + 'uppercase leading-none tracking-wider text-zinc-400 placeholder:text-zinc-600 transition-colors '
  + 'hover:border-white/15 focus:border-violet-500/60 focus:text-zinc-200 focus:outline-none';

/**
 * Cellule d'en-tête, collée en haut du tableau.
 *
 * Hauteur imposée plutôt que déduite du contenu : le calque de verre est un
 * bloc séparé (voir `HeaderGlass`) et doit couvrir exactement la même bande.
 * Une seule valeur pour les deux, et ils ne peuvent pas diverger.
 */
const HEADER_HEIGHT = 'h-9';
/** Tire le tableau vers le haut d'exactement `HEADER_HEIGHT` : à changer ensemble. */
const HEADER_PULL = '-mb-9';
const HEADER_CELL = `sticky top-0 z-10 px-3 ${HEADER_HEIGHT}`;

/**
 * Fond en verre dépoli de l'en-tête.
 *
 * Trois raisons à cette forme, chacune tirée d'un essai raté.
 *
 * C'est un bloc, pas le `thead` ni un `th` : WebKit applique `backdrop-filter`
 * de façon fiable sur une boîte de bloc, beaucoup moins sur une boîte de
 * tableau.
 *
 * C'est un seul calque, pas un par cellule : `backdrop-filter` est rogné à la
 * boîte qui le porte, donc six calques échantillonnent six voisinages
 * différents et laissent une couture verticale à chaque frontière de colonne.
 *
 * C'est un frère du tableau et non son enfant : un calque assez large pour
 * couvrir toutes les colonnes depuis l'intérieur d'une cellule débordait du
 * conteneur, qui devenait défilable latéralement. Ici la largeur est celle du
 * conteneur, sans débordement. La marge négative annule la place qu'il prend
 * dans le flux : le tableau démarre où il démarrait, et l'en-tête se pose
 * dessus — les cellules viennent après dans le document, donc au-dessus.
 *
 * Reste que rien de tout cela n'opérait tant que la carte englobante portait un
 * `backdrop-blur` : elle formait une racine d'arrière-plan et ce flou-ci ne
 * remplaçait plus rien (voir le commentaire sur la carte, plus bas).
 */
function HeaderGlass() {
  return (
    <div
      aria-hidden
      className={`pointer-events-none sticky top-0 z-10 ${HEADER_HEIGHT} ${HEADER_PULL} bg-zinc-800/95 shadow-[0_1px_0_0_rgba(255,255,255,0.08),0_8px_20px_-14px_rgba(0,0,0,0.9)] backdrop-blur-lg backdrop-saturate-150 supports-[backdrop-filter]:bg-zinc-800/85`}
    />
  );
}

/**
 * Pastille d'un commerçant.
 *
 * Aucun logo n'est téléchargé : récupérer les vraies marques supposerait
 * d'envoyer le nom de chaque commerçant à un service tiers, ce qui contredirait
 * la promesse de l'application — les données ne quittent pas la machine. Les
 * initiales sur une couleur stable remplissent le même rôle de repère visuel,
 * hors ligne et pour toutes les transactions.
 */
function MerchantAvatar({ description }: { description: string }) {
  const name = merchantName(description);
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
      style={{ backgroundColor: merchantColor(name) }}
    >
      {merchantInitials(name)}
    </span>
  );
}

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
  showHeader: _showHeader = true, 
  showFilters: _showFilters = true, 
  showPagination: _showPagination = true, 
  showActions: _showActions = true, 
  limit: _limit = 0, 
  height: _height = 'auto', 
  className: _className = '' 
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
    loadMoreTransactions,
    appendTransactions,
    setTransactions,
    pageFilters,
    setPageFilter,
    requestConfirm,
    authUser,
  } = useAppStore();
  
  // États pour le scroll infini
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 25; // Reduced for better initial performance
  // Références pour un scroll infini robuste (IntersectionObserver + auto-remplissage)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});
  // Empêche le chargement de la page suivante tant que la page 1 n'est pas chargée
  // (évite une course entre le chargement initial et l'auto-remplissage → trou d'offset).
  const initialLoadDoneRef = useRef(false);
  
  // États pour la sélection multiple
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Vérifie si tous les utilisateurs sont sélectionnés (selectedUser est null)
  // const allUsersSelected = selectedUser === null;
  
  const [_loading, setLoading] = useState(true);
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

  // États pour la modification des transactions sélectionnées
  const [showEditSelectedModal, setShowEditSelectedModal] = useState(false);
  const [editSelectedActions, setEditSelectedActions] = useState({
    description: { enabled: false, value: '' },
    categoryId: { enabled: false, value: '' },
    bankId: { enabled: false, value: '' },
    amount: { enabled: false, value: '' },
    checked: { enabled: false, value: false },
  });
  const [editSelectedProgress, setEditSelectedProgress] = useState({
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
      initialLoadDoneRef.current = false;
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
        
        // Récupérer les filtres sauvegardés pour cette page
        const pageSpecificFilters = pageFilters?.[pageName];
        let activeFilters = { ...filters };
        
        if (searchFromURL) {
          // Mettre à jour l'input de recherche avec la valeur de l'URL
          setSearchInput(searchFromURL);
          activeFilters = { ...activeFilters, searchText: searchFromURL };
        } else if (pageSpecificFilters) {
          // Utiliser les filtres sauvegardés s'il n'y a pas de recherche dans l'URL
          // Note: Les dates et checked ne sont pas restaurés pour qu'ils se réinitialisent à chaque visite
          activeFilters = {
            categoryId: pageSpecificFilters.categoryId || '',
            checked: '', // Réinitialisé à chaque visite
            startDate: '', // Réinitialisé à chaque visite
            endDate: '', // Réinitialisé à chaque visite
            searchText: pageSpecificFilters.searchText || ''
          };
          if (pageSpecificFilters.searchText) {
            setSearchInput(pageSpecificFilters.searchText);
          }
        }
        
        // Mettre à jour les filtres dans l'état local
        setFilters(activeFilters);
        
        // Use loadTransactions for initial load but with limit for pagination.
        // forceRefresh: true est essentiel — sans cela, revenir sur la page
        // (navigation SPA) réutilise la liste en cache (potentiellement agrandie
        // par le scroll infini) alors que la pagination locale repart à 1, ce qui
        // désynchronise l'offset et empêche de charger la suite des transactions.
        await loadTransactions({
          searchText: activeFilters.searchText || undefined,
          categoryId: activeFilters.categoryId || undefined,
          startDate: activeFilters.startDate || undefined,
          endDate: activeFilters.endDate || undefined,
          checked: activeFilters.checked || undefined,
          excludeAccountType: 'INVESTMENT',
          pageName,
          limit: ITEMS_PER_PAGE,
          forceRefresh: true
        });
        
        // Get the current state after loading to check transaction count
        const currentState = useAppStore.getState();
        const loadedCount = currentState.transactions.length;
        console.log('📦 Initial load result:', { transactionsCount: loadedCount, expectedLimit: ITEMS_PER_PAGE });
        
        // Set hasMore based on whether we got a full page of results
        const hasMoreData = loadedCount >= ITEMS_PER_PAGE;
        setHasMore(hasMoreData);

        // Page 1 chargée : on autorise désormais le chargement des pages suivantes.
        setPage(1);
        initialLoadDoneRef.current = true;

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

  const filteredTransactions = transactions.filter(transaction => {
    // Filet de sécurité si des transactions d'investissement traînent dans le cache
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
    
    // Les filtres par dates, statut pointé et recherche de texte sont gérés côté serveur
    // via loadTransactions. Ne pas re-filtrer ici pour permettre la recherche sur toute
    // la base de données et éviter un double filtrage qui donnerait zéro résultat.
    
    return true;
  });

  // Les transactions sont rangées sous l'en-tête de leur journée : la colonne
  // date disparaît du tableau, l'information reste.
  const groupedTransactions = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: typeof filteredTransactions }> = [];
    for (const transaction of filteredTransactions) {
      const key = dayKey(transaction.date);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(transaction);
      else groups.push({ key, label: dayLabel(transaction.date), items: [transaction] });
    }
    return groups;
  }, [filteredTransactions]);

  // Ouvre la fenêtre de modification des transactions sélectionnées
  const openEditSelected = () => {
    if (selectedTransactions.length === 0) return;
    setEditSelectedActions({
      description: { enabled: false, value: '' },
      categoryId: { enabled: false, value: '' },
      bankId: { enabled: false, value: '' },
      amount: { enabled: false, value: '' },
      checked: { enabled: false, value: false },
    });
    setEditSelectedProgress({ isProcessing: false, processed: 0, total: 0, errors: [] });
    setShowEditSelectedModal(true);
  };

  // Applique les champs cochés à toutes les transactions sélectionnées
  const handleEditSelected = async () => {
    const updateData: any = {};
    if (editSelectedActions.description.enabled) updateData.description = editSelectedActions.description.value;
    if (editSelectedActions.categoryId.enabled) updateData.categoryId = editSelectedActions.categoryId.value || null;
    if (editSelectedActions.bankId.enabled) updateData.bankId = editSelectedActions.bankId.value;
    if (editSelectedActions.amount.enabled) {
      const amt = parseFloat(String(editSelectedActions.amount.value).replace(',', '.'));
      if (isNaN(amt)) {
        alert('Veuillez saisir un prix valide.');
        return;
      }
      updateData.amount = amt;
    }
    if (editSelectedActions.checked.enabled) updateData.checked = editSelectedActions.checked.value;

    if (Object.keys(updateData).length === 0) {
      alert('Veuillez sélectionner au moins un champ à modifier.');
      return;
    }

    const ids = [...selectedTransactions];
    setEditSelectedProgress({ isProcessing: true, processed: 0, total: ids.length, errors: [] });

    const errors: string[] = [];
    let processed = 0;
    for (const id of ids) {
      try {
        const response = await fetch(`/api/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        if (response.ok) {
          const updated = await response.json();
          updateTransaction(id, updated);
        } else {
          const errorText = await response.text();
          errors.push(`Transaction ${id}: ${errorText || 'échec'}`);
        }
      } catch (error) {
        errors.push(`Transaction ${id}: ${error instanceof Error ? error.message : 'erreur'}`);
      }
      processed++;
      setEditSelectedProgress(prev => ({ ...prev, processed, errors }));
    }

    setEditSelectedProgress(prev => ({ ...prev, isProcessing: false }));

    if (errors.length === 0) {
      setShowEditSelectedModal(false);
      setSelectedTransactions([]);
      setSelectAll(false);
      alert(`✅ ${ids.length} transaction(s) modifiée(s).`);
    } else {
      alert(`⚠️ Modification terminée avec ${errors.length} erreur(s).`);
    }
  };

  // Fonction pour charger plus de transactions
  const loadMoreData = async () => {
    if (!initialLoadDoneRef.current || loadingMore || !hasMore) {
      return;
    }
    
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      console.log('📡 Loading page:', nextPage, 'with filters:', { searchText: filters.searchText, categoryId: filters.categoryId, pageName });
      const result = await loadMoreTransactions(nextPage, ITEMS_PER_PAGE, {
        searchText: filters.searchText,
        categoryId: filters.categoryId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        checked: filters.checked,
        excludeAccountType: 'INVESTMENT',
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

  // Fonction de détection du scroll (repli si l'IntersectionObserver ne suffit pas)
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    if (distanceFromBottom <= 800) {
      loadMoreData();
    }
  };

  // Garde une référence fraîche vers loadMoreData pour l'IntersectionObserver.
  loadMoreRef.current = loadMoreData;

  // IntersectionObserver : déclenche le chargement quand le bas de liste approche.
  // Bien plus fiable que l'évènement scroll (qui peut ne pas se déclencher dans
  // la WebView Tauri ou quand le conteneur défile peu).
  useEffect(() => {
    const root = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current();
      },
      { root, rootMargin: '800px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-remplissage : si la liste ne remplit pas le conteneur (grande fenêtre,
  // pas de barre de défilement), on charge la page suivante jusqu'à ce qu'il y ait
  // de quoi défiler. Sans ça, une fenêtre haute reste bloquée sur 25 lignes.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (hasMore && !loadingMore && el.scrollHeight <= el.clientHeight + 4) {
      loadMoreData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTransactions.length, hasMore, loadingMore]);


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
    
    if (!(await requestConfirm(`Êtes-vous sûr de vouloir supprimer ${selectedTransactions.length} transaction(s) ?`, { title: 'Supprimer les transactions', confirmLabel: 'Supprimer', danger: true }))) {
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

  // Ne pas sélectionner de banque par défaut sur la page Transactions
  useEffect(() => {
    setSelectedBank(null);
  }, []);
  
  useEffect(() => {
    // Mettre à jour les refs quand les valeurs changent
    filtersRef.current = filters;
    selectedBankRef.current = selectedBank;
    pageNameRef.current = pageName;
  }, [filters, selectedBank, pageName]);

  // Applique les filtres côté serveur (réinitialise la pagination et recharge page 1)
  const applyFilters = async (newFilters: typeof filters) => {
    setFilters(newFilters);
    setPageFilter(pageName, newFilters);

    setPage(1);
    setHasMore(true);
    setLoading(true);
    initialLoadDoneRef.current = false;
    try {
      await loadTransactions({
        searchText: newFilters.searchText || undefined,
        categoryId: newFilters.categoryId || undefined,
        startDate: newFilters.startDate || undefined,
        endDate: newFilters.endDate || undefined,
        checked: newFilters.checked || undefined,
        excludeAccountType: 'INVESTMENT',
        pageName,
        limit: ITEMS_PER_PAGE,
        forceRefresh: true
      });
      // Après loadTransactions, récupérer l'état courant
      const currentState = useAppStore.getState();
      setTransactions(currentState.transactions);
      setHasMore((currentState.transactions?.length || 0) >= ITEMS_PER_PAGE);
      initialLoadDoneRef.current = true;
    } catch (err) {
      console.error('Erreur lors du chargement des transactions filtrées:', err);
    } finally {
      setLoading(false);
    }
  };

  // Déclenche la recherche côté serveur à partir du champ texte
  const handleSearch = () => {
    const newFilters = { ...filters, searchText: searchInput };
    applyFilters(newFilters);
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between mt-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-50">
            Transactions
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Gérez toutes vos transactions et opérations bancaires
          </p>
        </div>
        <div className="flex gap-3 md:mt-0">
          {selectedTransactions.length > 0 && (
            <>
              <button
                onClick={openEditSelected}
                disabled={isDeleting}
                className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#7c3aed' }}
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Modifier ({selectedTransactions.length})
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#dc2626' }}
              >
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {isDeleting ? `Suppression... ${deleteProgress.processed}/${deleteProgress.total}` : `Supprimer (${selectedTransactions.length})`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      {/* La carte ne porte volontairement aucun `backdrop-blur` : un ancêtre
          filtré devient une racine d'arrière-plan, et le `backdrop-filter` de
          l'en-tête cesse alors de remplacer ce qu'il recouvre — il n'ajoute
          plus qu'un halo par-dessus des lignes restées nettes. Le fond derrière
          la carte est uni : le flou n'y produisait rien de toute façon. */}
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex flex-col">
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
          onScroll={handleScroll}
        >
          <HeaderGlass />
          <table className="w-full divide-y divide-zinc-800">
          {/* En-tête en verre dépoli : il reste lisible pendant que les lignes
              défilent dessous, sans les masquer complètement. La saturation
              rattrape la désaturation qu'un flou seul provoque. */}
          <thead>
            <tr>
              <th className={`${HEADER_CELL} text-left w-8`}>
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleToggleSelectAll}
                  className="h-4 w-4 text-violet-500 focus:ring-violet-500 border-zinc-700 rounded bg-zinc-900"
                />
              </th>
              {/* Toutes les cellules d'en-tête partagent la même typographie et
                  la même hauteur : contrôles et intitulés se ressemblent. */}
              <th className={`${HEADER_CELL} w-64 text-left`}>
                <input
                  type="text"
                  placeholder="Rechercher…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  className={HEADER_CONTROL}
                />
              </th>
              <th className={`${HEADER_CELL} w-32 text-left`}>
                <select
                  value={filters.categoryId}
                  onChange={(e) => applyFilters({ ...filters, categoryId: e.target.value })}
                  className={`${HEADER_CONTROL} appearance-none`}
                >
                  <option value="" style={{ backgroundColor: '#18191c' }}>Catégorie</option>
                  <option value="undefined" style={{ backgroundColor: '#18191c' }}>Non défini</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id} style={{ backgroundColor: '#18191c' }}>{category.name}</option>
                  ))}
                </select>
              </th>
              <th className={`${HEADER_CELL} w-56 text-left`}>
                <select
                  value={selectedBank?.id || ''}
                  onChange={(e) => {
                    setSelectedBank(banks.find((b) => b.id === e.target.value) || null);
                    applyFilters({ ...filters });
                  }}
                  className={`${HEADER_CONTROL} appearance-none`}
                >
                  <option value="" style={{ backgroundColor: '#18191c' }}>Portefeuille</option>
                  {banks.filter((b) => b.accountType === 'CURRENT' || b.accountType === 'SAVINGS').map((bank) => (
                    <option key={bank.id} value={bank.id} style={{ backgroundColor: '#18191c' }}>
                      {bank.name}{otherBankOwnersSuffix(bank.users, authUser?.id)}
                    </option>
                  ))}
                </select>
              </th>
              <th className={`${HEADER_CELL} w-28 text-right ${HEADER_LABEL}`}>Montant</th>
              <th className={`${HEADER_CELL} w-16 text-center ${HEADER_LABEL}`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {groupedTransactions.map((group) => (
              <React.Fragment key={group.key}>
                <tr>
                  <td colSpan={6} className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                    {group.label}
                  </td>
                </tr>
                {group.items.map((transaction) => (
              <tr
                key={transaction.id}
                className="transition-colors cursor-pointer group"
                style={{ borderLeft: '4px solid transparent' }}
                onMouseEnter={e => e.currentTarget.style.borderLeft = '4px solid #7c3aed'}
                onMouseLeave={e => e.currentTarget.style.borderLeft = '4px solid transparent'}
              >
                <td className="px-3 py-2 whitespace-nowrap text-xs text-white">
                  <input
                    type="checkbox"
                    checked={selectedTransactions.includes(transaction.id)}
                    onChange={() => handleToggleSelect(transaction.id)}
                    className="h-4 w-4 text-violet-500 focus:ring-violet-500 border-zinc-700 rounded bg-zinc-900"
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="w-64 max-w-[16rem] px-3 py-2 text-xs text-white">
                  {editingId === transaction.id ? (
                    <input
                      type="text"
                      value={editingTransaction?.description || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, description: e.target.value} : null)}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-xs"
                      style={{ backgroundColor: '#18191c' }}
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'description' ? (
                    <input
                      type="text"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-xs"
                      style={{ backgroundColor: '#18191c' }}
                      autoFocus
                    />
                  ) : (
                    <span
                      onClick={() => handleInlineEdit(transaction.id, 'description')}
                      className="flex min-w-0 max-w-full cursor-pointer items-center gap-2.5 rounded px-1 py-0.5 editable-cell hover:opacity-80"
                      // Le libellé brut de la banque reste accessible : rien n'est perdu.
                      title={transaction.description}
                    >
                      <MerchantAvatar description={transaction.description} />
                      <span className="truncate">{merchantName(transaction.description)}</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-white">
                  {editingId === transaction.id ? (
                    <select
                      value={editingTransaction?.categoryId || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, categoryId: e.target.value} : null)}
              className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-xs py-1.5 px-2.5" style={{ backgroundColor: '#18191c' }}
                    >
                      {categories.map(category => (
                        <option key={category.id} value={category.id} style={{ backgroundColor: '#18191c' }}>{category.name}</option>
                      ))}
                    </select>
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'category' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-xs"
                      style={{ backgroundColor: '#18191c' }}
                      autoFocus
                    >
                      <option value="">Non défini</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id} style={{ backgroundColor: '#18191c' }}>{category.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span 
                      onClick={() => handleInlineEdit(transaction.id, 'category')}
                      className="cursor-pointer editable-cell inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
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
                <td className="px-3 py-2 whitespace-nowrap text-xs text-white">
                  {inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'bank' ? (
                    <select
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-xs"
                      style={{ backgroundColor: '#18191c' }}
                      autoFocus
                    >
                      {banks
                        .filter((bank: Bank) => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS')
                        .map((bank: Bank) => {
                          const bankWithUsers = bank as Bank & { userBanks?: Array<{ user?: { name: string } }> };
                          const userNames = bankWithUsers.userBanks?.map(ub => ub.user?.name).filter(Boolean).join(', ') || '';
                          const displayText = userNames ? `${bank.name} (${userNames})` : bank.name;
                          
                          return (
                            <option key={bank.id} value={bank.id} style={{ backgroundColor: '#18191c' }}>
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
                          src={assetUrl(transaction.bank.image)}
                          alt={transaction.bank.name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        // Sans code court — c'est le cas de plusieurs comptes —
                        // le cercle restait vide : on retombe sur les initiales.
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: transaction.bank.color || '#3b82f6' }}
                        >
                          {transaction.bank.shortName || merchantInitials(transaction.bank.name)}
                        </div>
                      )}
                      <div className="ml-2">
                        <div className="font-medium text-white text-xs">
                          {transaction.bank.name}
                          {otherBankOwnersSuffix(transaction.bank.users, authUser?.id) && (
                            <span className="text-xs text-zinc-400 ml-2">
                              {otherBankOwnersSuffix(transaction.bank.users, authUser?.id)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right text-xs tabular-nums text-white">
                  {editingId === transaction.id ? (
                    <input
                      type="number"
                      step="1"
                      value={editingTransaction?.amount || ''}
                      onChange={(e) => setEditingTransaction(prev => prev ? {...prev, amount: parseFloat(e.target.value)} : null)}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-xs"
                      style={{ backgroundColor: '#18191c' }}
                    />
                  ) : inlineEditCell?.transactionId === transaction.id && inlineEditCell?.field === 'amount' ? (
                    <input
                      type="number"
                      step="1"
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={handleInlineSave}
                      onKeyDown={handleInlineKeyDown}
                      className="w-full rounded-md shadow-sm text-white border-none focus:ring-0 bg-transparent text-xs"
                      style={{ backgroundColor: '#18191c' }}
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
                <td className="px-3 py-1.5 whitespace-nowrap text-xs font-medium">
                  {editingId === transaction.id ? (
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSave}
                        className="transition-colors"
                        style={{ color: '#616875' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#7c3aed'}
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
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* Indicateur de chargement pour le scroll infini */}
        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: '#7c3aed' }}></div>
            <span className="ml-2 text-sm text-zinc-300">Chargement...</span>
          </div>
        )}

        {/* Bouton « Charger plus » — repli garanti si la détection de scroll
            ne se déclenche pas (WebView Tauri). Toujours atteignable en bas de liste. */}
        {!loadingMore && hasMore && filteredTransactions.length > 0 && (
          <div className="flex justify-center py-4">
            <button
              type="button"
              onClick={() => loadMoreData()}
              className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-zinc-200 text-sm font-medium px-4 py-2 transition-colors"
            >
              Charger plus de transactions
            </button>
          </div>
        )}

        {!hasMore && filteredTransactions.length > 0 && (
          <div className="text-center py-4 text-xs text-zinc-600">Fin de la liste</div>
        )}

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-white">Aucune transaction</h3>
            <p className="mt-1 text-sm text-zinc-300">Commencez par ajouter une nouvelle transaction.</p>
          </div>
        )}
        {/* Sentinelle observée pour le chargement infini */}
        <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
        </div>
      </div>

      {/* Modal de modification des transactions sélectionnées */}
      {showEditSelectedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="relative p-0 w-96 md:w-[32rem] max-h-[85vh] shadow-2xl rounded-xl overflow-y-auto bg-white/5 backdrop-blur-xl border border-white/10" style={{ maxHeight: '85vh' }}>
            <div className="rounded-t-xl px-6 py-4 flex items-center justify-between bg-zinc-900/60">
              <h3 className="text-lg font-bold text-white">
                Modifier {selectedTransactions.length} transaction(s)
              </h3>
              <button
                onClick={() => setShowEditSelectedModal(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm text-zinc-400 mb-4">
                Cochez les champs à appliquer à toutes les transactions sélectionnées.
              </p>

              <div className="space-y-4">
                {/* Nom / description */}
                <div className="rounded-md p-4" style={{ background: '#18191c' }}>
                  <label className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      checked={editSelectedActions.description.enabled}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, description: { ...prev.description, enabled: e.target.checked } }))}
                      className="h-4 w-4 text-violet-500 focus:ring-violet-500 border-zinc-700 rounded bg-zinc-900"
                    />
                    <span className="ml-2 text-sm font-medium text-white">Nom</span>
                  </label>
                  {editSelectedActions.description.enabled && (
                    <input
                      type="text"
                      placeholder="Nouveau nom"
                      value={editSelectedActions.description.value}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, description: { ...prev.description, value: e.target.value } }))}
                      className="block w-full rounded-md border-none focus:ring-0 py-2 px-3 text-white h-10"
                      style={{ backgroundColor: '#0f1013' }}
                    />
                  )}
                </div>

                {/* Catégorie */}
                <div className="rounded-md p-4" style={{ background: '#18191c' }}>
                  <label className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      checked={editSelectedActions.categoryId.enabled}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, categoryId: { ...prev.categoryId, enabled: e.target.checked } }))}
                      className="h-4 w-4 text-violet-500 focus:ring-violet-500 border-zinc-700 rounded bg-zinc-900"
                    />
                    <span className="ml-2 text-sm font-medium text-white">Catégorie</span>
                  </label>
                  {editSelectedActions.categoryId.enabled && (
                    <select
                      value={editSelectedActions.categoryId.value}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, categoryId: { ...prev.categoryId, value: e.target.value } }))}
                      className="block w-full rounded-md border-none focus:ring-0 py-2 px-3 text-white h-10"
                      style={{ backgroundColor: '#0f1013' }}
                    >
                      <option value="">Non défini</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Banque / portefeuille */}
                <div className="rounded-md p-4" style={{ background: '#18191c' }}>
                  <label className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      checked={editSelectedActions.bankId.enabled}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, bankId: { ...prev.bankId, enabled: e.target.checked } }))}
                      className="h-4 w-4 text-violet-500 focus:ring-violet-500 border-zinc-700 rounded bg-zinc-900"
                    />
                    <span className="ml-2 text-sm font-medium text-white">Banque</span>
                  </label>
                  {editSelectedActions.bankId.enabled && (
                    <select
                      value={editSelectedActions.bankId.value}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, bankId: { ...prev.bankId, value: e.target.value } }))}
                      className="block w-full rounded-md border-none focus:ring-0 py-2 px-3 text-white h-10"
                      style={{ backgroundColor: '#0f1013' }}
                    >
                      <option value="">Sélectionner une banque</option>
                      {banks.filter(bank => bank.accountType === 'CURRENT' || bank.accountType === 'SAVINGS').map(bank => (
                        <option key={bank.id} value={bank.id}>{bank.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Prix / montant */}
                <div className="rounded-md p-4" style={{ background: '#18191c' }}>
                  <label className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      checked={editSelectedActions.amount.enabled}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, amount: { ...prev.amount, enabled: e.target.checked } }))}
                      className="h-4 w-4 text-violet-500 focus:ring-violet-500 border-zinc-700 rounded bg-zinc-900"
                    />
                    <span className="ml-2 text-sm font-medium text-white">Prix</span>
                  </label>
                  {editSelectedActions.amount.enabled && (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={editSelectedActions.amount.value}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, amount: { ...prev.amount, value: e.target.value } }))}
                      className="block w-full rounded-md border-none focus:ring-0 py-2 px-3 text-white h-10"
                      style={{ backgroundColor: '#0f1013' }}
                    />
                  )}
                </div>

                {/* Pointage */}
                <div className="rounded-md p-4" style={{ background: '#18191c' }}>
                  <label className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      checked={editSelectedActions.checked.enabled}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, checked: { ...prev.checked, enabled: e.target.checked } }))}
                      className="h-4 w-4 text-violet-500 focus:ring-violet-500 border-zinc-700 rounded bg-zinc-900"
                    />
                    <span className="ml-2 text-sm font-medium text-white">Pointage</span>
                  </label>
                  {editSelectedActions.checked.enabled && (
                    <select
                      value={editSelectedActions.checked.value.toString()}
                      onChange={(e) => setEditSelectedActions(prev => ({ ...prev, checked: { ...prev.checked, value: e.target.value === 'true' } }))}
                      className="block w-full rounded-md border-none focus:ring-0 py-2 px-3 text-white h-10"
                      style={{ backgroundColor: '#0f1013' }}
                    >
                      <option value="true">Pointé</option>
                      <option value="false">Non pointé</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex justify-end space-x-3 mt-6 pt-4">
                <button
                  onClick={() => setShowEditSelectedModal(false)}
                  disabled={editSelectedProgress.isProcessing}
                  className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-md hover:bg-zinc-700 focus:outline-none disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleEditSelected}
                  disabled={editSelectedProgress.isProcessing}
                  className="px-3 py-1.5 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#7c3aed' }}
                >
                  {editSelectedProgress.isProcessing ? `Modification... ${editSelectedProgress.processed}/${editSelectedProgress.total}` : 'Appliquer'}
                </button>
              </div>

              {/* Barre de progression */}
              {editSelectedProgress.isProcessing && (
                <div className="mt-4">
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div
                      className="bg-violet-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${editSelectedProgress.total > 0 ? (editSelectedProgress.processed / editSelectedProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Erreurs */}
              {editSelectedProgress.errors.length > 0 && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Erreurs rencontrées :</h4>
                  <ul className="text-sm text-red-300 space-y-1 max-h-32 overflow-y-auto">
                    {editSelectedProgress.errors.map((error, index) => (
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
