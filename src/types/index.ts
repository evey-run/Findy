export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bank {
  id: string;
  name: string;
  shortName?: string;
  color: string;
  iban?: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user?: User;
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
  bankId: string;
  bank: {
    id: string;
    name: string;
    shortName?: string;
    color: string;
    balance: number;
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
  bankId?: string;
  bank?: {
    id: string;
    name: string;
    shortName?: string;
    color: string;
    balance: number;
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
  bankId?: string;
  bank?: {
    id: string;
    name: string;
    shortName?: string;
    color: string;
    balance: number;
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
  bankId: string;
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
  bankId?: string;
  categoryId: string;
}

export interface CreateRecurrenceData {
  amount: number;
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextDue: string;
  description: string;
  shared?: boolean;
  active?: boolean;
  bankId?: string;
  categoryId: string;
}
