import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { getAuthToken, setAuthToken } from '../lib/apiBase';
import type { User, AuthProfile, Space, Bank, Transaction, Category, Budget, DashboardOverview } from '../types';

const SPACE_STORAGE_KEY = 'findy-current-space-id';

interface AppState {
  // Internal state tracking
  _lastTransactionRequestKey?: string;

  // Auth — le profil connecté est aussi le « Moi » de l'app : toutes les données
  // (banques, dettes, dashboard) sont rattachées à cet utilisateur.
  authUser: User | null;
  authReady: boolean; // true une fois la session restaurée (évite le flash de login)
  loadAuthProfiles: () => Promise<AuthProfile[]>;
  login: (userId: string, password?: string) => Promise<User>;
  register: (name: string, password?: string) => Promise<User>;
  setPassword: (userId: string, newPassword: string | null, currentPassword?: string) => Promise<User>;
  logout: () => void;
  restoreSession: () => Promise<void>;

  // Espaces — le périmètre de partage. On en regarde UN à la fois : son espace
  // personnel, ou un groupe qu'on a explicitement créé. Pas de vue « Tout ».
  spaces: Space[];
  currentSpace: Space | null;
  loadSpaces: () => Promise<void>;
  setCurrentSpace: (space: Space) => void;
  createSpace: (name: string, memberIds: string[]) => Promise<Space>;
  renameSpace: (spaceId: string, name: string) => Promise<void>;
  /** Paramètres de portée à ajouter à toute requête API. */
  scopeParams: () => Record<string, string>;

  // Users
  users: User[];
  selectedUser: User | null;
  setUsers: (users: User[]) => void;
  setSelectedUser: (user: User | null) => void;
  loadUsers: () => Promise<void>;
  setMeUser: (userId: string) => Promise<void>;
  
  // Current bank
  currentBank: Bank | null;
  setCurrentBank: (bank: Bank | null) => void;
  
  // Selected bank (now stored directly)
  selectedBank: Bank | null;
  setSelectedBank: (bank: Bank | null) => void;

  // Banks (filtered by selected user)
  banks: Bank[];
  setBanks: (banks: Bank[]) => void;
  loadBanks: (userId?: string) => Promise<void>;
  
  // Categories
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: string, category: Partial<Category>) => void;
  removeCategory: (id: string) => void;
  loadCategories: () => Promise<void>;
  
  // Transactions
  transactions: Transaction[];
  allTransactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  setAllTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  loadTransactions: (options?: { searchText?: string; forceLoadAll?: boolean; accountType?: string; excludeAccountType?: string; forceIgnoreSelectedBank?: boolean; ignoreDateRange?: boolean; categoryId?: string; pageName?: string; forceRefresh?: boolean; limit?: number; startDate?: string; endDate?: string; checked?: string }) => Promise<void>;
  loadMoreTransactions: (page: number, itemsPerPage: number, options?: { accountType?: string; excludeAccountType?: string; forceIgnoreSelectedBank?: boolean; searchText?: string; categoryId?: string; pageName?: string; startDate?: string; endDate?: string; checked?: string }) => Promise<{ hasMore: boolean; newTransactions: Transaction[] }>;
  loadAllTransactions: (options?: { accountType?: string; forceIgnoreSelectedBank?: boolean; ignoreDateRange?: boolean; pageName?: string }) => Promise<void>;
  appendTransactions: (newTransactions: Transaction[]) => void;
  
  // Budgets
  budgets: Budget[];
  setBudgets: (budgets: Budget[]) => void;
  addBudget: (budget: Budget) => void;
  updateBudget: (id: string, budget: Partial<Budget>) => void;
  removeBudget: (id: string) => void;
  loadBudgets: (forceLoadAll?: boolean) => Promise<void>;
  
  // Recurrences section removed
  
  // Dashboard
  dashboardData: DashboardOverview | null;
  setDashboardData: (data: DashboardOverview | null) => void;
  loadDashboardOverview: () => Promise<void>;
  
  // UI State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Confirmation dialog (remplace window.confirm, non fiable dans la WebView Tauri)
  confirmDialog: {
    open: boolean;
    message: string;
    title?: string;
    confirmLabel?: string;
    danger?: boolean;
  };
  _confirmResolver?: (value: boolean) => void;
  requestConfirm: (
    message: string,
    opts?: { title?: string; confirmLabel?: string; danger?: boolean }
  ) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
  
  // Filters globaux (pour compatibilité)
  dateRange: {
    startDate: string;
    endDate: string;
  };
  setDateRange: (range: { startDate: string; endDate: string }) => void;
  
  // Filtres spécifiques par page
  pageFilters: {
    [pageName: string]: {
      startDate: string;
      endDate: string;
      categoryId?: string;
      searchText?: string;
      checked?: string;
    };
  };
  setPageFilter: (pageName: string, filter: { startDate?: string; endDate?: string; categoryId?: string; searchText?: string; checked?: string }) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Auth
      authUser: null,
      authReady: false,

      loadAuthProfiles: async () => {
        // Le sidecar peut être en train d'achever une migration au tout premier
        // lancement. Réessayer brièvement évite de figer l'écran de connexion
        // sur une erreur réseau transitoire.
        let response: Response | undefined;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          try {
            response = await fetch('/api/auth/profiles');
            break;
          } catch {
            if (attempt === 19) {
              throw new Error('Serveur injoignable. Vérifie que le backend tourne.');
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        if (!response) {
          throw new Error('Serveur injoignable. Vérifie que le backend tourne.');
        }
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw new Error(
            `Le serveur répond mais renvoie une erreur (HTTP ${response.status}). ${detail.slice(0, 160)}`.trim()
          );
        }
        return (await response.json()) as AuthProfile[];
      },

      login: async (userId: string, password?: string) => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Connexion impossible');

        // Le jeton est la seule preuve d'identité acceptée par l'API.
        setAuthToken(data.token ?? null);
        // Le profil connecté devient le filtre courant : on ne voit que ses données.
        set({ authUser: data, authReady: true, selectedUser: data, selectedBank: null });
        await get().loadSpaces();
        await get().loadUsers();
        return data as User;
      },

      register: async (name: string, password?: string) => {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, password: password || undefined })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Création impossible');

        setAuthToken(data.token ?? null);
        set({ authUser: data, authReady: true, selectedUser: data, selectedBank: null });
        await get().loadSpaces();
        await get().loadUsers();
        return data as User;
      },

      setPassword: async (userId: string, newPassword: string | null, currentPassword?: string) => {
        const response = await fetch('/api/auth/password', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, newPassword, currentPassword })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Modification impossible');

        if (get().authUser?.id === userId) set({ authUser: data });
        return data as User;
      },

      logout: () => {
        setAuthToken(null);
        set({ authUser: null, authReady: true, selectedUser: null, selectedBank: null, spaces: [], currentSpace: null });
      },

      restoreSession: async () => {
        // La session repose sur le jeton, plus sur l'id de profil mémorisé :
        // un id seul ne prouvait rien et suffisait à « restaurer » n'importe qui.
        if (!getAuthToken()) {
          set({ authUser: null, authReady: true });
          return;
        }
        try {
          const response = await fetch('/api/auth/session');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const user = await response.json();
          set({ authUser: user, authReady: true, selectedUser: user });
          await get().loadSpaces();
        } catch (error) {
          // Jeton expiré, profil supprimé ou serveur injoignable : retour à l'écran de connexion.
          console.error('Failed to restore session:', error);
          setAuthToken(null);
          set({ authUser: null, authReady: true });
        }
      },

      // Espaces
      spaces: [],
      currentSpace: null,

      loadSpaces: async () => {
        const authUser = get().authUser;
        if (!authUser) {
          set({ spaces: [], currentSpace: null });
          return;
        }
        try {
          // La portée vient du jeton côté serveur : plus besoin de l'envoyer.
          const response = await fetch('/api/spaces');
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const spaces: Space[] = await response.json();

          // Un espace est toujours sélectionné : celui mémorisé s'il est
          // toujours accessible, sinon l'espace personnel, sinon le premier.
          const savedId = localStorage.getItem(SPACE_STORAGE_KEY);
          const current =
            spaces.find((s) => s.id === savedId) ??
            spaces.find((s) => s.kind === 'PERSONAL') ??
            spaces[0] ??
            null;
          if (current) localStorage.setItem(SPACE_STORAGE_KEY, current.id);
          set({ spaces, currentSpace: current });
        } catch (error) {
          console.error('Failed to load spaces:', error);
          set({ spaces: [] });
        }
      },

      setCurrentSpace: (space: Space) => {
        localStorage.setItem(SPACE_STORAGE_KEY, space.id);
        set({ currentSpace: space, selectedBank: null });
        // Toutes les vues dépendent de la portée : on recharge.
        get().loadBanks();
        get().loadCategories();
        get().loadBudgets();
        get().loadDashboardOverview();
      },

      createSpace: async (name: string, memberIds: string[]) => {
        const response = await fetch('/api/spaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, memberIds })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Création impossible');
        await get().loadSpaces();
        return data as Space;
      },

      renameSpace: async (spaceId: string, name: string) => {
        const response = await fetch(`/api/spaces/${spaceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Renommage impossible');
        await get().loadSpaces();
      },

      scopeParams: () => {
        const { currentSpace, authUser } = get();
        // On regarde toujours un espace précis. Le repli sur `userId` ne sert
        // que le court instant entre la connexion et le chargement des espaces.
        if (currentSpace) return { spaceId: currentSpace.id };
        if (authUser) return { userId: authUser.id };
        return {};
      },

      // Users
      users: [],
      selectedUser: null,

      // Filtres spécifiques par page
      pageFilters: {},
      setPageFilter: (pageName: string, filter: { startDate?: string; endDate?: string; categoryId?: string; searchText?: string }) => {
        set((state) => ({
          pageFilters: {
            ...state.pageFilters,
            [pageName]: {
              ...state.pageFilters[pageName] || { startDate: '', endDate: '', categoryId: '', searchText: '' },
              ...filter
            }
          }
        }));
      },
      setUsers: (users: User[]) => set({ users }),
      setSelectedUser: (user: User | null) => {
        set({ selectedUser: user, selectedBank: null });
        // Reload banks when user changes
        get().loadBanks();
      },

      // Charger toutes les transactions en plusieurs lots pour les pages analytiques (Catégories, Objectifs)
      loadAllTransactions: async (options?: { accountType?: string; forceIgnoreSelectedBank?: boolean; ignoreDateRange?: boolean }) => {
        try {
          const state = get();
          const batchSize = 500;
          const maxBatches = 50;
          let offset = 0;
          let hasMore = true;
          let batchCount = 0;
          const all: Transaction[] = [];

          while (hasMore && batchCount < maxBatches) {
            const params = new URLSearchParams({
              limit: batchSize.toString(),
              offset: offset.toString(),
            });

            // Filtres de dates sauf si ignorés
            if (!options?.ignoreDateRange) {
              if (state.dateRange.startDate && state.dateRange.startDate !== '') params.append('startDate', state.dateRange.startDate);
              if (state.dateRange.endDate && state.dateRange.endDate !== '') params.append('endDate', state.dateRange.endDate);
            }

            // Ignorer le filtre banque si demandé (par défaut pour pages analytiques)
            if (state.selectedBank && !options?.forceIgnoreSelectedBank) {
              params.append('bankId', state.selectedBank.id);
            }

            // Portée : espace courant, ou l'union des espaces de l'utilisateur.
            for (const [key, value] of Object.entries(state.scopeParams())) {
              params.append(key, value);
            }

            if (options?.accountType) params.append('accountType', options.accountType);

            const resp = await fetch(`/api/transactions?${params}`);
            if (!resp.ok) {
              console.error(`loadAllTransactions: HTTP ${resp.status}`);
              break;
            }
            const data = await resp.json();
            const batch: Transaction[] = Array.isArray(data)
              ? data
              : Array.isArray(data?.transactions)
              ? data.transactions
              : [];
            all.push(...batch);
            batchCount++;

            const serverHasMore: boolean | undefined = typeof data?.hasMore === 'boolean' ? data.hasMore : undefined;
            if (serverHasMore !== undefined) {
              hasMore = serverHasMore;
            } else {
              hasMore = batch.length === batchSize;
            }
            offset += batchSize;
          }

          set({ allTransactions: all });
        } catch (error) {
          console.error('Failed to load all transactions:', error);
          set({ allTransactions: [] });
        }
      },
      loadUsers: async () => {
        try {
          console.log('Loading users...');
          const response = await fetch('/api/users');
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const users = await response.json();
          console.log('Users loaded:', users);
          set({ users });
          // Load all banks by default (no user selected)
          get().loadBanks();
        } catch (error) {
          console.error('Failed to load users:', error);
          set({ users: [] }); // Set empty array on error
        }
      },
      setMeUser: async (userId: string) => {
        try {
          const response = await fetch(`/api/users/${userId}/set-me`, { method: 'PUT' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const users = await response.json();
          set({ users });
        } catch (error) {
          console.error('Failed to set "me" user:', error);
          // Recharge par sécurité pour rester cohérent
          get().loadUsers();
        }
      },
      
      // Current bank
      currentBank: null,
      setCurrentBank: (bank: Bank | null) => set({ currentBank: bank }),
      
      // Selected bank (stored directly)
      selectedBank: null,
      setSelectedBank: (bank: Bank | null) => {
        set({ selectedBank: bank });
      },

      // Banks
      banks: [],
      setBanks: (banks: Bank[]) => {
        set({ banks });
      },
      loadBanks: async () => {
        try {
          console.log('Loading banks...');
          const params = new URLSearchParams({ ...get().scopeParams(), archived: 'false' });
          const response = await fetch(`/api/banks?${params}`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const banks = await response.json();
          console.log('Banks loaded:', banks.length, 'banks');
          set({ banks });
        } catch (error) {
          console.error('Failed to load banks:', error);
          set({ banks: [] }); // Set empty array on error
        }
      },
      
      // Categories
      categories: [],
      setCategories: (categories: Category[]) => set({ categories }),
      addCategory: (category: Category) =>
        set((state) => ({ 
          categories: [category, ...state.categories] 
        })),
      updateCategory: (id: string, updatedCategory: Partial<Category>) =>
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === id ? { ...c, ...updatedCategory } : c
          ),
        })),
      removeCategory: (id: string) =>
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
        })),
      loadCategories: async () => {
        try {
          console.log('Loading categories...');
          const params = new URLSearchParams(get().scopeParams());
          const response = await fetch(`/api/categories?${params}`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const categories = await response.json();
          console.log('Categories loaded:', categories.length, 'categories');
          set({ categories });
        } catch (error) {
          console.error('Failed to load categories:', error);
          set({ categories: [] }); // Set empty array on error
        }
      },
      
      // Transactions
      transactions: [],
      allTransactions: [],
      setTransactions: (transactions: Transaction[]) => set({ transactions }),
      setAllTransactions: (transactions: Transaction[]) => set({ allTransactions: transactions }),
      addTransaction: (transaction: Transaction) =>
        set((state) => ({
          transactions: [transaction, ...state.transactions],
        })),
      updateTransaction: (id: string, updatedTransaction: Partial<Transaction>) =>
        set((state) => ({
          transactions: state.transactions.map((t) => {
            if (t.id === id) {
              // Préserver les informations des utilisateurs de la banque si elles ne sont pas fournies
              const updatedBank = updatedTransaction.bank 
                ? {
                    ...updatedTransaction.bank,
                    // Si la banque est mise à jour mais que les utilisateurs ne sont pas fournis, conserver les utilisateurs existants
                    users: updatedTransaction.bank.users || (t.bank ? t.bank.users : [])
                  }
                : t.bank;
              
              return { 
                ...t, 
                ...updatedTransaction,
                // S'assurer que les informations de la banque sont correctement fusionnées
                bank: updatedBank
              };
            }
            return t;
          })
        })),
      
      removeTransaction: (id: string) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),
      
      loadTransactions: async (options?: { searchText?: string; forceLoadAll?: boolean; accountType?: string; excludeAccountType?: string; forceIgnoreSelectedBank?: boolean; ignoreDateRange?: boolean; categoryId?: string; pageName?: string; forceRefresh?: boolean; limit?: number; startDate?: string; endDate?: string; checked?: string }) => {
        // Create a unique key for this request based on the options
        const requestKey = JSON.stringify({
          categoryId: options?.categoryId || null,
          bankId: options?.forceIgnoreSelectedBank ? null : get().selectedBank?.id,
          accountType: options?.accountType || null,
          excludeAccountType: options?.excludeAccountType || null,
          searchText: options?.searchText || null,
          startDate: options?.startDate || null,
          endDate: options?.endDate || null,
          checked: options?.checked || null,
          pageName: options?.pageName || null,
          limit: options?.limit || null
        });
        
        // Store the last request key to prevent duplicate requests
        const state = get();
        const lastRequestKey = state._lastTransactionRequestKey;
        
        // Skip loading if not explicitly requested via forceRefresh and we have data
        // Also skip if this is the same request we just made (prevents loops)
        if (!options?.forceRefresh && 
            state.transactions.length > 0 && 
            requestKey === lastRequestKey) {
          console.log('Skipping duplicate transaction load - using cached data');
          return;
        }

        try {
          const params = new URLSearchParams();
          
          // Filtre par catégorie s'il est fourni
          if (options?.categoryId && options.categoryId !== '') {
            // On n'envoie pas de filtre spécial pour 'undefined' ici faute de spécification backend
            // Seules les catégories avec un id explicite sont transmises
            if (options.categoryId !== 'undefined') {
              params.append('categoryId', options.categoryId);
            }
          }
          
          // Ajouter le filtre de banque si une banque est sélectionnée
          // et si on ne force pas l'ignorance de ce filtre
          if (state.selectedBank && !options?.forceIgnoreSelectedBank) {
            params.append('bankId', state.selectedBank.id);
          }
          
          // Ajouter le filtre par type de compte si spécifié
          if (options?.accountType) {
            params.append('accountType', options.accountType);
          }

          // Exclure un type de compte (ex: investissement sur la page Transactions)
          if (options?.excludeAccountType) {
            params.append('excludeAccountType', options.excludeAccountType);
          }

          // Ajouter le filtre de recherche si fourni
          if (options?.searchText && options.searchText.trim() !== '') {
            params.append('search', options.searchText);
          }
          
          // Ajouter les filtres de dates si fournis
          if (options?.startDate && options.startDate !== '') {
            params.append('startDate', options.startDate);
          }
          if (options?.endDate && options.endDate !== '') {
            params.append('endDate', options.endDate);
          }
          
          // Ajouter le filtre checked (pointé) si fourni
          if (options?.checked && options.checked !== '') {
            params.append('checked', options.checked);
          }
          
          // Add pagination limit to reduce initial data load
          // Default to 50 items if not specified
          const limit = options?.limit || 50;
          params.append('limit', limit.toString());
          
          // Portée : espace courant, ou l'union des espaces de l'utilisateur.
          for (const [key, value] of Object.entries(get().scopeParams())) {
            params.append(key, value);
          }

          // Save this request key before making the request
          set({ _lastTransactionRequestKey: requestKey });

          console.log(`Loading transactions with limit: ${limit}`);
          const response = await fetch(`/api/transactions?${params}`);
          if (!response.ok) {
            console.error(`loadTransactions: HTTP ${response.status}`);
            return;
          }
          const data = await response.json();
          const batch: Transaction[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.transactions)
            ? data.transactions
            : [];
          set({ transactions: batch });
        } catch (error) {
          console.error('Failed to load transactions:', error);
        }
      },
       
      loadMoreTransactions: async (page: number, itemsPerPage: number, options?: { accountType?: string; excludeAccountType?: string; forceIgnoreSelectedBank?: boolean; searchText?: string; categoryId?: string; pageName?: string; startDate?: string; endDate?: string; checked?: string }) => {
        try {
          const state = get();
          const params = new URLSearchParams({
            limit: itemsPerPage.toString(),
          });
          // Backend expects 'offset' for pagination
          const offset = Math.max(0, (page - 1) * itemsPerPage);
          params.append('offset', offset.toString());
          
          // Filtres de dates : UNIQUEMENT ceux passés en options (les filtres de la
          // page). NE PAS retomber sur state.dateRange : ce dernier est piloté par le
          // Dashboard (mois courant) et le chargement initial de la page Transactions
          // l'ignore. Y retomber ici filtrait la page suivante sur un mois souvent vide
          // → « charger plus » ne ramenait aucune ligne et la liste restait à 25.
          const startDate = options?.startDate;
          const endDate = options?.endDate;
          if (startDate && startDate !== '') {
            params.append('startDate', startDate);
          }
          if (endDate && endDate !== '') {
            params.append('endDate', endDate);
          }
          // Ajouter le filtre checked si fourni
          if (options?.checked && options.checked !== '') {
            params.append('checked', options.checked);
          }
          // Ajouter le filtre de banque si une banque est sélectionnée
          // et si on ne force pas l'ignorance de ce filtre
          if (state.selectedBank && !options?.forceIgnoreSelectedBank) {
            params.append('bankId', state.selectedBank.id);
          }
          // Filtre de recherche si fourni (pour cohérence avec le chargement initial)
          if (options?.searchText) {
            params.append('search', options.searchText);
          }
          // Filtre par catégorie si fourni
          if (options?.categoryId && options.categoryId !== '') {
            if (options.categoryId !== 'undefined') {
              params.append('categoryId', options.categoryId);
            }
          }
          
          // Ajouter le filtre par type de compte si spécifié
          if (options?.accountType) {
            params.append('accountType', options.accountType);
          }

          // Exclure un type de compte (cohérence avec le chargement initial)
          if (options?.excludeAccountType) {
            params.append('excludeAccountType', options.excludeAccountType);
          }

          // Portée : espace courant, ou l'union des espaces de l'utilisateur.
          for (const [key, value] of Object.entries(get().scopeParams())) {
            params.append(key, value);
          }

          const response = await fetch(`/api/transactions?${params}`);
          const data = await response.json();

          // Normalize backend response: it may be either { transactions, hasMore } or a plain array
          const newTransactions: Transaction[] = Array.isArray(data)
            ? data
            : Array.isArray(data?.transactions)
            ? data.transactions
            : [];
          const hasMore: boolean = typeof data?.hasMore === 'boolean'
            ? data.hasMore
            : newTransactions.length === itemsPerPage;

          return {
            hasMore,
            newTransactions
          };
        } catch (error) {
          console.error('Failed to load more transactions:', error);
          return { hasMore: false, newTransactions: [] };
        }
      },
      
      appendTransactions: (newTransactions: Transaction[]) =>
        set((state) => {
          // Filtrer les transactions qui n'existent pas déjà pour éviter les doublons
          const existingIds = new Set(state.transactions.map(t => t.id));
          const uniqueNewTransactions = newTransactions.filter(t => !existingIds.has(t.id));
          
          console.log('📝 appendTransactions - existing:', state.transactions.length, 'new:', newTransactions.length, 'unique new:', uniqueNewTransactions.length);
          
          // Fusionner et trier par date décroissante pour maintenir l'ordre cohérent
          const allTransactions = [...state.transactions, ...uniqueNewTransactions];
          allTransactions.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateB - dateA; // Tri décroissant (les plus récentes en premier)
          });
          
          return {
            transactions: allTransactions
          };
        }),
      
      // Budgets
      budgets: [],
      setBudgets: (budgets: Budget[]) => set({ budgets }),
      addBudget: (budget: Budget) =>
        set((state) => ({ 
          budgets: [budget, ...state.budgets] 
        })),
      updateBudget: (id: string, updatedBudget: Partial<Budget>) =>
        set((state) => ({
          budgets: state.budgets.map((b) =>
            b.id === id ? { ...b, ...updatedBudget } : b
          ),
        })),
      removeBudget: (id: string) =>
        set((state) => ({
          budgets: state.budgets.filter((b) => b.id !== id),
        })),
      loadBudgets: async () => {
        try {
          const params = new URLSearchParams(get().scopeParams());
          const response = await fetch(`/api/budgets?${params}`);
          if (!response.ok) {
            console.error(`loadBudgets: HTTP ${response.status}`);
            set({ budgets: [] });
            return;
          }
          const data = await response.json();
          set({ budgets: Array.isArray(data) ? data : [] });
        } catch (error) {
          console.error('Failed to load budgets:', error);
          set({ budgets: [] });
        }
      },
      
      // Dashboard
      dashboardData: null,
      setDashboardData: (data: DashboardOverview | null) => set({ dashboardData: data }),
      loadDashboardOverview: async () => {
        try {
          console.log('Loading dashboard overview...');
          const state = get();
          const params = new URLSearchParams();
          if (state.dateRange.startDate && state.dateRange.startDate !== '') {
            params.append('startDate', state.dateRange.startDate);
          }
          if (state.dateRange.endDate && state.dateRange.endDate !== '') {
            params.append('endDate', state.dateRange.endDate);
          }
          if (state.selectedBank) {
            params.append('bankId', state.selectedBank.id);
          }
          for (const [key, value] of Object.entries(state.scopeParams())) {
            params.append(key, value);
          }
          console.log(`Fetching dashboard data from: /api/dashboard/overview?${params}`);
          const response = await fetch(`/api/dashboard/overview?${params}`);
          if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }
          const dashboardData = await response.json();
          console.log('Dashboard data loaded:', dashboardData);
          set({ dashboardData });
        } catch (error) {
          console.error('Failed to load dashboard overview:', error);
          set({ dashboardData: null });
        }
      },
      
      // UI State
      isLoading: false,
      setIsLoading: (loading: boolean) => set({ isLoading: loading }),

      // Confirmation dialog
      confirmDialog: { open: false, message: '' },
      requestConfirm: (message, opts) =>
        new Promise<boolean>((resolve) => {
          // Si une confirmation était déjà ouverte, on l'annule proprement.
          const prev = get()._confirmResolver;
          if (prev) prev(false);
          set({
            confirmDialog: {
              open: true,
              message,
              title: opts?.title,
              confirmLabel: opts?.confirmLabel,
              danger: opts?.danger
            },
            _confirmResolver: resolve
          });
        }),
      resolveConfirm: (value: boolean) => {
        const resolver = get()._confirmResolver;
        set({ confirmDialog: { open: false, message: '' }, _confirmResolver: undefined });
        if (resolver) resolver(value);
      },
      
      // Filters
      dateRange: {
        startDate: '',
        endDate: '',
      },
      setDateRange: (range: { startDate: string; endDate: string }) => set({ dateRange: range }),
    }),
    {
      name: 'finance-app-store',
    }
  )
);
