export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'FIXED';
  color: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  date: string;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user: {
    id: string;
    name: string;
    color: string;
  };
  categoryId: string;
  category: {
    id: string;
    name: string;
    type: 'INCOME' | 'EXPENSE' | 'FIXED';
    color: string;
    icon?: string;
  };
}

export interface Budget {
  id: string;
  amount: number;
  period: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  startDate: string;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  user?: {
    id: string;
    name: string;
    color: string;
  };
  categoryId: string;
  category: {
    id: string;
    name: string;
    type: 'INCOME' | 'EXPENSE' | 'FIXED';
    color: string;
    icon?: string;
  };
}

export interface Recurrence {
  id: string;
  amount: number;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextDue: string;
  description: string;
  shared: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  user?: {
    id: string;
    name: string;
    color: string;
  };
  categoryId: string;
  category: {
    id: string;
    name: string;
    type: 'INCOME' | 'EXPENSE' | 'FIXED';
    color: string;
    icon?: string;
  };
}

export interface DashboardSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  transactionCount: number;
  totalUsers: number;
  totalCategories: number;
}

export interface ExpenseByCategory {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon?: string;
  amount: number;
}

export interface DashboardOverview {
  summary: DashboardSummary;
  recentTransactions: Transaction[];
  expensesByCategory: ExpenseByCategory[];
  upcomingRecurrences: Recurrence[];
}

export interface CreateTransactionData {
  amount: number;
  description: string;
  date?: string;
  shared?: boolean;
  userId: string;
  categoryId: string;
}

export interface CreateCategoryData {
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'FIXED';
  color?: string;
  icon?: string;
}

export interface CreateBudgetData {
  amount: number;
  period?: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  startDate?: string;
  shared?: boolean;
  userId?: string;
  categoryId: string;
}

export interface CreateRecurrenceData {
  amount: number;
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextDue: string;
  description: string;
  shared?: boolean;
  active?: boolean;
  userId?: string;
  categoryId: string;
}
