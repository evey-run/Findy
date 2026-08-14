export interface User {
  id: string;
  name: string;
  avatar?: string;
  email?: string; // Optional field for future use
  isMe?: boolean; // Marque l'utilisateur « Moi »
  hasPassword?: boolean; // Profil protégé par un mot de passe (optionnel)
  spaces?: Space[];      // Espaces dont l'utilisateur est membre
  createdAt: string;
  updatedAt: string;
  userBanks?: UserBank[];
}

/** Un Espace : le périmètre de partage des données (perso ou partagé). */
export interface Space {
  id: string;
  name: string;
  kind: 'PERSONAL' | 'SHARED';
  color?: string | null;
  members?: User[];
  memberIds?: string[];
}

/** Profil léger affiché sur l'écran de connexion. */
export interface AuthProfile {
  id: string;
  name: string;
  avatar?: string | null;
  isMe?: boolean;
  hasPassword: boolean;
}

// Dette « tricount » : fromUser doit `amount` à toUser.
export interface Debt {
  id: string;
  amount: number;
  description: string;
  date: string;
  settled: boolean;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
  updatedAt: string;
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
  /** Solde affiché, recalculé depuis les mouvements (cf. server/lib/balance.ts). */
  balance: number;
  /** Solde initial stocké — c'est lui qu'édite le formulaire, pas `balance`. */
  initialBalance?: number;
  accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT';
  archived: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  userBanks?: UserBank[];
  // Computed fields for convenience
  users?: User[];
  // Enable Banking integration
  ebStatus?: 'PENDING' | 'LINKED' | 'EXPIRED' | null;
  ebLinkedAt?: string | null;
  ebExpiresAt?: string | null;
  ebLastSyncAt?: string | null;
  ebAccountUid?: string | null;
  ebAspspName?: string | null;
}

export interface Category {
  /** null = catalogue commun visible par tous ; sinon privée à un espace. */
  spaceId?: string | null;
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'FIXED';
  color: string;
  icon?: string;
  keywords?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  date: string;
  checked: boolean;
  unitPrice?: number;
  quantity?: number;
  ticker?: string;
  assetType?: 'CRYPTO' | 'ETF' | 'ACTION';
  status?: 'BOOK' | 'PENDING';
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
    users?: User[];
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
  /** Espace propriétaire : c'est lui qui définit si le budget est partagé. */
  spaceId?: string | null;
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
  // Nouvelles statistiques par type de compte
  currentMonthIncome: number;
  currentMonthExpense: number;
  savingsTotal: number;
  investmentMonthTotal: number;
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
  icon?: string;
  isCompleted: boolean;
  archived: boolean;
  /** Espace propriétaire : perso = privé, partagé = visible par ses membres. */
  spaceId?: string | null;
  space?: { id: string; name: string; kind: 'PERSONAL' | 'SHARED' };
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
  keywords?: string[];
}

export interface CreateBudgetData {
  amount: number;
  period?: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  startDate?: string;
  spaceId?: string;
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
