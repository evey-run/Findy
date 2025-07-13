import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { User, Transaction, Category, Budget, Recurrence, DashboardOverview } from '../types';

interface AppState {
  // Current user
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  
  // Selected user (computed from selectedUserId)
  selectedUser: User | null;
  setSelectedUser: (user: User | null) => void;

  // Users
  users: User[];
  setUsers: (users: User[]) => void;
  loadUsers: () => Promise<void>;
  
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
  
  selectedUserId: string | null;
  setSelectedUserId: (userId: string | null) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // Current user
        currentUser: null,
        setCurrentUser: (user) => set({ currentUser: user }),
        
        // Selected user (computed)
        get selectedUser() {
          const state = get();
          return state.users.find(u => u.id.toString() === state.selectedUserId) || null;
        },
        setSelectedUser: (user) => set({ selectedUserId: user?.id.toString() || null }),

        // Users
        users: [],
        setUsers: (users) => set({ users }),
        loadUsers: async () => {
          try {
            const response = await fetch('http://localhost:3001/api/users');
            const users = await response.json();
            set({ users });
          } catch (error) {
            console.error('Failed to load users:', error);
          }
        },
        
        // Categories
        categories: [],
        setCategories: (categories) => set({ categories }),
        loadCategories: async () => {
          try {
            const response = await fetch('http://localhost:3001/api/categories');
            const categories = await response.json();
            set({ categories });
          } catch (error) {
            console.error('Failed to load categories:', error);
          }
        },
        
        // Transactions
        transactions: [],
        setTransactions: (transactions) => set({ transactions }),
        addTransaction: (transaction) => 
          set((state) => ({ 
            transactions: [transaction, ...state.transactions] 
          })),
        updateTransaction: (id, updatedTransaction) =>
          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === id ? { ...t, ...updatedTransaction } : t
            ),
          })),
        removeTransaction: (id) =>
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
            if (state.selectedUserId) {
              params.append('userId', state.selectedUserId);
            }
            const response = await fetch(`http://localhost:3001/api/transactions?${params}`);
            const transactions = await response.json();
            set({ transactions });
          } catch (error) {
            console.error('Failed to load transactions:', error);
          }
        },
        
        // Budgets
        budgets: [],
        setBudgets: (budgets) => set({ budgets }),
        addBudget: (budget) =>
          set((state) => ({ 
            budgets: [budget, ...state.budgets] 
          })),
        updateBudget: (id, updatedBudget) =>
          set((state) => ({
            budgets: state.budgets.map((b) =>
              b.id === id ? { ...b, ...updatedBudget } : b
            ),
          })),
        removeBudget: (id) =>
          set((state) => ({
            budgets: state.budgets.filter((b) => b.id !== id),
          })),
        loadBudgets: async () => {
          try {
            const state = get();
            const params = new URLSearchParams();
            if (state.selectedUserId) {
              params.append('userId', state.selectedUserId);
            }
            const response = await fetch(`http://localhost:3001/api/budgets?${params}`);
            const budgets = await response.json();
            set({ budgets });
          } catch (error) {
            console.error('Failed to load budgets:', error);
          }
        },
        
        // Recurrences
        recurrences: [],
        setRecurrences: (recurrences) => set({ recurrences }),
        addRecurrence: (recurrence) =>
          set((state) => ({ 
            recurrences: [recurrence, ...state.recurrences] 
          })),
        updateRecurrence: (id, updatedRecurrence) =>
          set((state) => ({
            recurrences: state.recurrences.map((r) =>
              r.id === id ? { ...r, ...updatedRecurrence } : r
            ),
          })),
        removeRecurrence: (id) =>
          set((state) => ({
            recurrences: state.recurrences.filter((r) => r.id !== id),
          })),
        loadRecurrences: async () => {
          try {
            const state = get();
            const params = new URLSearchParams();
            if (state.selectedUserId) {
              params.append('userId', state.selectedUserId);
            }
            const response = await fetch(`http://localhost:3001/api/recurrences?${params}`);
            const recurrences = await response.json();
            set({ recurrences });
          } catch (error) {
            console.error('Failed to load recurrences:', error);
          }
        },
        
        // Dashboard
        dashboardData: null,
        setDashboardData: (data) => set({ dashboardData: data }),
        loadDashboardOverview: async () => {
          try {
            const state = get();
            const params = new URLSearchParams({
              startDate: state.dateRange.startDate,
              endDate: state.dateRange.endDate,
            });
            if (state.selectedUserId) {
              params.append('userId', state.selectedUserId);
            }
            const response = await fetch(`http://localhost:3001/api/dashboard?${params}`);
            const dashboardData = await response.json();
            set({ dashboardData });
          } catch (error) {
            console.error('Failed to load dashboard overview:', error);
          }
        },
        
        // UI State
        isLoading: false,
        setIsLoading: (loading) => set({ isLoading: loading }),
        
        // Filters
        dateRange: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
        },
        setDateRange: (range) => set({ dateRange: range }),
        
        selectedUserId: null,
        setSelectedUserId: (userId) => set({ selectedUserId: userId }),
      }),
      {
        name: 'finance-app-store',
        partialize: (state) => ({
          currentUser: state.currentUser,
          dateRange: state.dateRange,
          selectedUserId: state.selectedUserId,
        }),
      }
    ),
    {
      name: 'finance-app-store',
    }
  )
);
