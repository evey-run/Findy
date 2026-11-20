import { PrismaClient } from '@prisma/client';
import { resolveScope } from './scope';
import { looksLikeTransfer, FIVE_DAYS } from './transferUtils';

const prisma = new PrismaClient();

/**
 * Identifies transaction IDs that are part of internal transfers (between user's own accounts)
 * Returns a Set of transaction IDs to exclude from income/expense calculations
 */
export async function getInternalTransferIds(
  userId: string,
  startDate?: Date,
  endDate?: Date,
  bankIds?: string[]
): Promise<Set<string>> {
  // Get user's accessible bank IDs if not provided
  const accessibleBankIds = bankIds ?? await getUserBankIds(userId);

  if (accessibleBankIds.length === 0) {
    return new Set();
  }

  // Build date filter
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate) dateFilter.lte = endDate;

  // Get transactions from user's banks within date range
  const transactions = await prisma.transaction.findMany({
    where: {
      bankId: { in: accessibleBankIds },
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      amount: { not: 0 }, // Exclude zero-amount transactions
    },
    select: {
      id: true,
      amount: true,
      date: true,
      description: true,
      bankId: true,
    },
    orderBy: { date: 'desc' },
  });

  // Index transactions by rounded absolute amount (to nearest cent)
  const key = (amt: number) => Math.round(Math.abs(amt) * 100);
  const byAmount = new Map<number, Array<typeof transactions[0]>>();

  for (const tx of transactions) {
    const k = key(tx.amount);
    if (!byAmount.has(k)) {
      byAmount.set(k, []);
    }
    byAmount.get(k)!.push(tx);
  }

  // Transfer detection constants
  const used = new Set<string>();
  const internalTransferIds = new Set<string>();

  // Look for matching pairs (opposite amounts, close dates)
  for (const tx of transactions) {
    if (tx.amount === 0 || used.has(tx.id)) continue;

    const candidates = byAmount.get(key(tx.amount)) || [];
    const match = candidates.find(
      (ot) =>
        ot.id !== tx.id &&
        !used.has(ot.id) &&
        Math.sign(ot.amount) === -Math.sign(tx.amount) && // Opposite signs
        Math.abs(new Date(ot.date).getTime() - new Date(tx.date).getTime()) <= FIVE_DAYS && // Within 5 days
        (looksLikeTransfer(tx.description) || looksLikeTransfer(ot.description)) // Transfer-like description
    );

    if (match) {
      used.add(tx.id);
      used.add(match.id);
      internalTransferIds.add(tx.id);
      internalTransferIds.add(match.id);
    }
  }

  return internalTransferIds;
}

/**
 * Gets all bank IDs accessible to a user (through their space memberships)
 */
async function getUserBankIds(userId: string): Promise<string[]> {
  const banks = await prisma.bank.findMany({
    where: {
      space: {
        members: {
          some: {
            userId: userId
          }
        }
      }
    },
    select: { id: true }
  });

  return banks.map(b => b.id);
}