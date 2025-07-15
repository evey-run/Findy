import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Bank, Transaction, Category, Budget, Recurrence, DashboardOverview } from '../types';

interface AppState {
  // Current bank
  currentBank: Bank | null;
  setCurrentBank: (bank: Bank | null) => void;
  
  // Selected bank (computed from selectedBankId)
  selectedBank: Bank | null;
  setSelectedBank: (bank: Bank | null) => void;

  // Banks
  banks: Bank[];
  setBanks: (banks: Bank[]) => void;
  loadBanks: () => Promise<void>;
  
  // Categories
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  loadCategories: () => Promise<void>;
  
  // Transactions
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  loadTransactions: () => Promise<void>;
  
  // Budgets
  budgets: Budget[];
  setBudgets: (budgets: Budget[]) => void;
  addBudget: (budget: Budget) => void;
  updateBudget: (id: string, budget: Partial<Budget>) => void;
  removeBudget: (id: string) => void;
  loadBudgets: () => Promise<void>;
  
  // Recurrences
  recurrences: Recurrence[];
  setRecurrences: (recurrences: Recurrence[]) => void;
  addRecurrence: (recurrence: Recurrence) => void;
  updateRecurrence: (id: string, recurrence: Partial<Recurrence>) => void;
  removeRecurrence: (id: string) => void;
  loadRecurrences: () => Promise<void>;
  
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
  
  selectedBankId: string | null;
  setSelectedBankId: (bankId: string | null) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // Current bank
        currentBank: null,
        setCurrentBank: (bank: Bank | null) => set({ currentBank: bank }),
        
        // Selected bank (computed)
        get selectedBank() {
          const state = get();
          return state.banks.find(b => b.id.toString() === state.selectedBankId) || null;
        },
        setSelectedBank: (bank: Bank | null) => set({ selectedBankId: bank?.id.toString() || null }),

        // Banks
        banks: [],
        setBanks: (banks: Bank[]) => set({ banks }),
        loadBanks: async () => {
          try {
            const response = await fetch('/api/banks');
            const banks = await response.json();
            set({ banks });
          } catch (error) {
            console.error('Failed to load banks:', error);
          }
        },
        
        // Categories
        categories: [],
        setCategories: (categories: Category[]) => set({ categories }),
        loadCategories: async () => {
          try {
            const response = await fetch('/api/categories');
            const categories = await response.json();
            set({ categories });
          } catch (error) {
            console.error('Failed to load categories:', error);
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
            transactions: state.transactions.map((t) =>
              t.id === id ? { ...t, ...updatedTransaction } : t
            ),
          })),
        removeTransaction: (id: string) =>
          set((state) => ({
            transactions: state.transactions.filter((t) => t.id !== id),
          })),
        loadTransactions: async () => {
          try {
            const state = get();
            const params = new URLSearchParams({
              startDate: state.dateRange.startDate,
              endDate: state.dateRange.endDate,
            });
            if (state.selectedBankId) {
              params.append('bankId', state.selectedBankId);
            }
            const response = await fetch(`/api/transactions?${params}`);
            const transactions = await response.json();
            set({ transactions });
          } catch (error) {
            console.error('Failed to load transactions:', error);
          }
        },
        
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
            const state = get();
            const params = new URLSearchParams();
            if (state.selectedBankId) {
              params.append('bankId', state.selectedBankId);
            }
            const response = await fetch(`/api/budgets?${params}`);
            const budgets = await response.json();
            set({ budgets });
          } catch (error) {
            console.error('Failed to load budgets:', error);
          }
        },
        
        // Recurrences
        recurrences: [],
        setRecurrences: (recurrences: Recurrence[]) => set({ recurrences }),
        addRecurrence: (recurrence: Recurrence) =>
          set((state) => ({ 
            recurrences: [recurrence, ...state.recurrences] 
          })),
        updateRecurrence: (id: string, updatedRecurrence: Partial<Recurrence>) =>
          set((state) => ({
            recurrences: state.recurrences.map((r) =>
              r.id === id ? { ...r, ...updatedRecurrence } : r
            ),
          })),
        removeRecurrence: (id: string) =>
          set((state) => ({
            recurrences: state.recurrences.filter((r) => r.id !== id),
          })),
        loadRecurrences: async () => {
          try {
            const state = get();
            const params = new URLSearchParams();
            if (state.selectedBankId) {
              params.append('bankId', state.selectedBankId);
            }
            const response = await fetch(`/api/recurrences?${params}`);
            const recurrences = await response.json();
            set({ recurrences });
          } catch (error) {
            console.error('Failed to load recurrences:', error);
          }
        },
        
        // Dashboard
        dashboardData: null,
        setDashboardData: (data: DashboardOverview | null) => set({ dashboardData: data }),
        loadDashboardOverview: async () => {
          try {
            const state = get();
            const params = new URLSearchParams({
              startDate: state.dateRange.startDate,
              endDate: state.dateRange.endDate,
            });
            if (state.selectedBankId) {
              params.append('bankId', state.selectedBankId);
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
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
        },
        setDateRange: (range: { startDate: string; endDate: string }) => set({ dateRange: range }),
        
        selectedBankId: null,
        setSelectedBankId: (bankId: string | null) => set({ selectedBankId: bankId }),
      }),
      {
        name: 'finance-app-store',
        partialize: (state) => ({
          currentBank: state.currentBank,
          dateRange: state.dateRange,
          selectedBankId: state.selectedBankId,
        }),
      }
    ),
    {
      name: 'finance-app-store',
    }
  )
);
