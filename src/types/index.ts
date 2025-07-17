export interface User {
  id: string;
  name: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
  userBanks?: UserBank[];
}

export interface UserBank {
  id: string;
  userId: string;
  bankId: string;
  user?: User;
  bank?: Bank;
}

export interface Bank {
  id: string;
  name: string;
  shortName?: string;
  color: string;
  image?: string;
  iban?: string;
  balance: number;
  accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT';
  isShared: boolean;
  archived: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  userBanks?: UserBank[];
  // Computed fields for convenience
  users?: User[];
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
  checked: boolean;
  createdAt: string;
  updatedAt: string;
  bankId: string;
  bank: {
    id: string;
    name: string;
    shortName?: string;
    color: string;
    image?: string;
    balance: number;
  };
  categoryId?: string;
  category?: {
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
    image?: string;
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
    image?: string;
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

export interface Objective {
  id: string;
  title: string;
  description?: string;
  targetAmount: number;
  deadline?: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
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
