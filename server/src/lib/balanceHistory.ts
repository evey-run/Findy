/**
 * Évolution du solde d'un compte, mois par mois.
 *
 * Aucun solde historique n'est stocké : la base ne connaît que le solde
 * courant et les mouvements. On remonte donc le temps depuis aujourd'hui en
 * retranchant les transactions au fur et à mesure — le solde à la fin d'un mois
 * donné, c'est le solde d'aujourd'hui moins tout ce qui s'est passé depuis.
 */

export interface HistoryTransaction {
  date: Date;
  amount: number;
}

export interface BalanceHistory {
  /** Soldes de clôture, du plus ancien au plus récent, le dernier étant aujourd'hui. */
  points: number[];
  /** Variation en pourcentage sur la fenêtre, `null` si elle n'a pas de sens. */
  trend: number | null;
}

/** Fin du mois `offset` mois avant celui de `reference` (0 = mois en cours). */
function monthEnd(reference: Date, offset: number): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - offset + 1, 1));
}

export function balanceHistory(
  currentBalance: number,
  transactions: HistoryTransaction[],
  months = 6,
  now: Date = new Date(),
): BalanceHistory {
  const points: number[] = [];
  let running = currentBalance;
  // Le point le plus récent est le solde d'aujourd'hui, tel qu'affiché.
  points.push(round2(running));

  // On démarre à 1 : l'offset 0 désignerait la fin du mois en cours, donc une
  // borne dans le futur, et le point recalculé vaudrait le solde du jour.
  for (let offset = 1; offset < months; offset += 1) {
    const boundary = monthEnd(now, offset);
    // Tout ce qui s'est produit après cette borne n'existait pas encore.
    const after = transactions
      .filter((t) => t.date.getTime() >= boundary.getTime())
      .reduce((sum, t) => sum + t.amount, 0);
    running = currentBalance - after;
    points.push(round2(running));
  }

  points.reverse();

  const first = points[0];
  const last = points[points.length - 1];
  // Une progression depuis zéro n'a pas de pourcentage : on ne l'invente pas.
  const trend = Math.abs(first) < 0.01 ? null : round2(((last - first) / Math.abs(first)) * 100);

  return { points, trend };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Chemin SVG d'une courbe, dans un repère `0 0 width height`.
 *
 * Renvoie une chaîne vide quand il n'y a pas de quoi tracer : une courbe plate
 * inventée à partir d'un seul point serait un mensonge visuel.
 */
export function sparklinePath(points: number[], width: number, height: number): string {
  if (points.length < 2) return '';

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  // Un compte sans mouvement donne une ligne médiane, pas une division par zéro.
  const y = (value: number) => (span === 0 ? height / 2 : height - ((value - min) / span) * height);
  const x = (index: number) => (index / (points.length - 1)) * width;

  return points
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
    .join(' ');
}
