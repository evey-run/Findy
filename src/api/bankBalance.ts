// API pour calculer les soldes des banques indépendamment des filtres
import type { Bank } from '../types';

/**
 * Récupère toutes les transactions pour une banque spécifique
 * @param bankId ID de la banque
 * @returns Les transactions de la banque
 */
export const getBankTransactions = async (bankId: string) => {
  try {
    // Utiliser une limite plus élevée pour s'assurer d'obtenir toutes les transactions
    const response = await fetch(`/api/transactions?bankId=${bankId}&limit=5000`);
    const data = await response.json();
    return data.transactions || data;
  } catch (error) {
    console.error(`Failed to load transactions for bank ${bankId}:`, error);
    return [];
  }
};

/**
 * Calcule le solde actuel d'une banque en utilisant son solde initial et toutes ses transactions
 * @param bankId ID de la banque
 * @param initialBalance Solde initial de la banque
 * @param accountType Type de compte (CURRENT, SAVINGS, INVESTMENT)
 * @returns Le solde actuel calculé
 */
export const calculateBankBalance = async (bankId: string, initialBalance: number, accountType: string) => {
  try {
    const transactions = await getBankTransactions(bankId);
    
    // Afficher des informations de débogage pour les comptes courants
    if (accountType === 'CURRENT') {
      console.log(`Calcul du solde pour compte courant ${bankId}:`);
      console.log(`- Solde initial: ${initialBalance}`);
      console.log(`- Nombre de transactions: ${transactions.length}`);
    }
    
    // Vérifier que les transactions sont bien un tableau
    if (!Array.isArray(transactions)) {
      console.error(`Transactions for bank ${bankId} is not an array:`, transactions);
      return initialBalance;
    }
    
    // Calculer la somme des transactions avec vérification des montants
    const transactionsSum = transactions.reduce((sum: number, t: any) => {
      // Vérifier que le montant est bien un nombre
      const amount = typeof t.amount === 'number' ? t.amount : parseFloat(t.amount);
      if (isNaN(amount)) {
        console.error(`Invalid amount in transaction:`, t);
        return sum;
      }
      return sum + amount;
    }, 0);
    
    // Afficher le résultat du calcul pour les comptes courants
    if (accountType === 'CURRENT') {
      console.log(`- Somme des transactions: ${transactionsSum}`);
      console.log(`- Solde final: ${initialBalance + transactionsSum}`);
    }
    
    return initialBalance + transactionsSum;
  } catch (error) {
    console.error(`Failed to calculate balance for bank ${bankId}:`, error);
    return initialBalance; // En cas d'erreur, retourne le solde initial
  }
};

/**
 * Récupère et calcule les soldes pour toutes les banques
 * @param banks Liste des banques
 * @returns Un objet avec les soldes calculés pour chaque banque
 */
export const getAllBankBalances = async (banks: Bank[]) => {
  try {
    const balances: {[key: string]: number} = {};
    
    // Utiliser Promise.all pour paralléliser les requêtes
    await Promise.all(banks.map(async (bank) => {
      const balance = await calculateBankBalance(bank.id, bank.balance, bank.accountType);
      balances[bank.id] = balance;
    }));
    
    return balances;
  } catch (error) {
    console.error('Failed to calculate all bank balances:', error);
    return {};
  }
};
