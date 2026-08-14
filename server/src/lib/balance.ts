/**
 * Calcul du solde d'un compte — point de vérité unique.
 *
 * `bank.balance` est le solde *initial* stocké ; le solde affiché y ajoute les
 * mouvements. Deux régimes selon le type de compte :
 *
 * - Compte courant / épargne : une transaction négative sort de l'argent, le
 *   solde suit directement la somme des mouvements.
 *
 * - Compte d'investissement : un achat est enregistré en négatif (l'argent
 *   quitte les autres comptes) mais il n'est pas perdu, il est converti en
 *   actif. Sommer tel quel affichait un solde négatif sur un PEA ou un compte
 *   crypto. On sépare donc :
 *     · les mouvements portant une `quantity` (achat/vente d'actif) → capital
 *       déployé, compté positivement (achats − ventes), borné à 0 : quand on a
 *       vendu plus qu'acheté il ne reste rien d'investi, le surplus est du gain
 *       réalisé qui n'est plus sur le compte ;
 *     · les mouvements sans `quantity` (intérêts P2P, frais, dépôts) → comptés
 *       tels quels, comme sur un compte d'épargne.
 *
 * Même convention que `investmentMonthTotal` du dashboard, qui prend déjà la
 * valeur absolue des sorties d'investissement.
 *
 * NB : c'est le capital investi au prix d'achat, pas la valorisation au cours du
 * jour — celle-ci vit sur la page Investissements, qui interroge les cours.
 */

export interface BalanceInputs {
  /** Somme des montants des transactions portant une `quantity`. */
  assetFlow: number;
  /** Somme des montants des transactions sans `quantity`. */
  cashFlow: number;
}

/** Contribution des mouvements au solde, hors solde initial. */
export function movementsTotal(accountType: string, { assetFlow, cashFlow }: BalanceInputs): number {
  if (accountType !== 'INVESTMENT') return assetFlow + cashFlow;
  return Math.max(0, -assetFlow) + cashFlow;
}

/** Solde affiché = solde initial + contribution des mouvements. */
export function computeBalance(
  bank: { balance: number; accountType: string },
  inputs: BalanceInputs
): number {
  return bank.balance + movementsTotal(bank.accountType, inputs);
}

/**
 * Inverse de `computeBalance` : quel solde initial stocker pour qu'un compte
 * affiche `target` ? Utilisé pour caler un compte sur le solde réel renvoyé par
 * la banque (Enable Banking).
 */
export function initialBalanceFor(
  accountType: string,
  target: number,
  inputs: BalanceInputs
): number {
  return target - movementsTotal(accountType, inputs);
}
