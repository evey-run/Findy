import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { User, Bank, Transaction, Category, Budget, DashboardOverview } from '../types';

interface AppState {
  // Users
  users: User[];
  selectedUser: User | null;
  setUsers: (users: User[]) => void;
  setSelectedUser: (user: User | null) => void;
  loadUsers: () => Promise<void>;
  
  // Current bank
  currentBank: Bank | null;
  setCurrentBank: (bank: Bank | null) => void;
  
  // Selected bank (now stored directly)
  selectedBank: Bank | null;
  setSelectedBank: (bank: Bank | null) => void;

  // Banks (filtered by selected user)
  banks: Bank[];
  setBanks: (banks: Bank[]) => void;
  loadBanks: () => Promise<void>;
  
  // Categories
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: string, category: Partial<Category>) => void;
  removeCategory: (id: string) => void;
  loadCategories: () => Promise<void>;
  
  // Transactions
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  loadTransactions: (options?: { searchText?: string; forceLoadAll?: boolean }) => Promise<void>;
  loadMoreTransactions: (page: number, itemsPerPage: number) => Promise<{ hasMore: boolean; newTransactions: Transaction[] }>;
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
  
  // Filters
  dateRange: {
    startDate: string;
    endDate: string;
  };
  setDateRange: (range: { startDate: string; endDate: string }) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Users
      users: [],
      selectedUser: null,
      setUsers: (users: User[]) => set({ users }),
      setSelectedUser: (user: User | null) => {
        set({ selectedUser: user, selectedBank: null });
        // Reload banks when user changes
        get().loadBanks();
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
          const selectedUser = get().selectedUser;
          const url = selectedUser 
            ? `/api/banks?userId=${selectedUser.id}&archived=false`
            : '/api/banks?archived=false';
          
          const response = await fetch(url);
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
          const response = await fetch('/api/categories');
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
      setTransactions: (transactions: Transaction[]) => set({ transactions }),
      addTransaction: (transaction: Transaction) => 
        set((state) => ({ 
          transactions: [transaction, ...state.transactions] 
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
          }),
        })),
      removeTransaction: (id: string) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),
      loadTransactions: async (options?: { searchText?: string; forceLoadAll?: boolean }) => {
        try {
          const state = get();
          const params = new URLSearchParams({
            page: '1',
            limit: options?.forceLoadAll ? '1000' : '50' // Limiter à 50 transactions par défaut
          });
          // Ajouter les filtres de dates
          if (state.dateRange.startDate && state.dateRange.startDate !== '') {
            params.append('startDate', state.dateRange.startDate);
          }
          if (state.dateRange.endDate && state.dateRange.endDate !== '') {
            params.append('endDate', state.dateRange.endDate);
          }
          // Ne jamais filtrer par banque pour les transactions dans les pages catégories et objectifs
          // Le filtrage par banque est conservé uniquement dans la page Transactions
          if (options?.searchText) {
            params.append('search', options.searchText);
          }
          
          // Ajouter le filtre de banque si une banque est sélectionnée
          if (state.selectedBank) {
            params.append('bankId', state.selectedBank.id);
          }
          const response = await fetch(`/api/transactions?${params}`);
          const data = await response.json();
          if (data.transactions) {
            set({ transactions: data.transactions });
          } else {
            set({ transactions: data });
          }
        } catch (error) {
          console.error('Failed to load transactions:', error);
        }
      },
      
      loadMoreTransactions: async (page: number, itemsPerPage: number) => {
        try {
          const state = get();
          const params = new URLSearchParams({
            page: page.toString(),
            limit: itemsPerPage.toString()
          });
          
          // Ajouter les filtres de dates
          if (state.dateRange.startDate && state.dateRange.startDate !== '') {
            params.append('startDate', state.dateRange.startDate);
          }
          if (state.dateRange.endDate && state.dateRange.endDate !== '') {
            params.append('endDate', state.dateRange.endDate);
          }
          
          if (state.selectedBank) {
            params.append('bankId', state.selectedBank.id);
          }
          
          const response = await fetch(`/api/transactions?${params}`);
          const data = await response.json();
          
          return {
            hasMore: data.hasMore,
            newTransactions: data.transactions
          };
        } catch (error) {
          console.error('Failed to load more transactions:', error);
          return { hasMore: false, newTransactions: [] };
        }
      },
      
      appendTransactions: (newTransactions: Transaction[]) =>
        set((state) => ({
          transactions: [...state.transactions, ...newTransactions]
        })),
      
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
          // Pas besoin de filtres pour les budgets
          const params = new URLSearchParams();
          
          // Ne jamais filtrer par banque pour les budgets
          // Même si une banque est sélectionnée
          
          const response = await fetch(`/api/budgets?${params}`);
          const budgets = await response.json();
          set({ budgets });
        } catch (error) {
          console.error('Failed to load budgets:', error);
        }
      },
      
      // Dashboard
      dashboardData: null,
      setDashboardData: (data: DashboardOverview | null) => set({ dashboardData: data }),
      loadDashboardOverview: async () => {
        try {
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
          const response = await fetch(`/api/dashboard?${params}`);
          const dashboardData = await response.json();
          set({ dashboardData });
        } catch (error) {
          console.error('Failed to load dashboard overview:', error);
        }
      },
      
      // UI State
      isLoading: false,
      setIsLoading: (loading: boolean) => set({ isLoading: loading }),
      
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
