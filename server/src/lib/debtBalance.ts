/**
 * Solde net d'un tricount entre deux personnes.
 *
 * Convention, du point de vue de « moi » :
 *   balance > 0 → l'autre me doit de l'argent
 *   balance < 0 → je dois de l'argent à l'autre
 *
 * Les dettes réglées sortent du calcul : c'est ce qui distingue un solde d'un
 * historique.
 */
export interface DebtEntry {
  fromUserId: string;
  toUserId: string;
  amount: number;
  settled: boolean;
}

export function netBalance(debts: DebtEntry[], meId: string, otherId: string): number {
  let balance = 0;

  for (const debt of debts) {
    if (debt.settled) continue;
    // Une dette portant sur un tiers ne doit pas polluer ce tricount.
    const concernsPair =
      (debt.fromUserId === meId && debt.toUserId === otherId) ||
      (debt.fromUserId === otherId && debt.toUserId === meId);
    if (!concernsPair) continue;

    if (debt.fromUserId === otherId) balance += debt.amount;
    else balance -= debt.amount;
  }

  // Les montants viennent de saisies en euros : on évite les 0.30000000000004.
  return Math.round(balance * 100) / 100;
}
