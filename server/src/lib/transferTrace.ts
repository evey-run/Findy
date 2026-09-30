/**
 * Le « trajet de l'argent » d'une opération.
 *
 * Chaque opération vit dans un compte. L'argent qu'elle représente n'y est pas
 * né : il a été versé (salaire, dépôt), viré d'un autre de vos comptes, puis
 * peut être reparti ailleurs ou avoir été dépensé. Pour une opération donnée,
 * ce module reconstitue la chaîne de mouvements qui a porté cet argent
 * jusqu'à elle, puis ce qu'il est devenu.
 *
 * La chaîne n'est pas stockée en base : elle se recompute à la volée à partir
 * des virements internes, détectés comme le reste de l'application (deux
 * opérations de signes opposés, de même montant au centime près, à moins de
 * cinq jours, dont l'un des libellés évoque un virement).
 *
 * Le résultat est un `steps` ordonné que l'UI rend tel quel :
 *
 *   [entry salaire] → [carry compteA] → [focus la dépense] → [leg A→B] → …
 *
 * Les fonctions pures (`buildTransferLinks`, `buildTrace`) ne touchent pas à
 * la base : elles sont testées avec des jeux de données. `getTransactionTrace`
 * orchestre la requête et fournit les métadonnées (comptes, catégories).
 */

import { looksLikeTransfer, FIVE_DAYS } from './transferUtils';

/** Fenêtre autour de l'opération choisie pour chercher les liens de virement. */
export const TRACE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

/** Garde-fou : une chaîne se résout en bien moins d'étapes que cela. */
const MAX_STEPS = 32;

export interface TraceTxn {
  id: string;
  amount: number;
  date: Date;
  description: string;
  bankId: string;
  categoryId: string | null;
  checked: boolean;
}

/** Lien dirigé de virement interne : `outId` (montant négatif) = le compte qui
 *  envoie, `inId` (montant positif) = le compte qui reçoit. */
export interface TraceLink {
  outId: string;
  inId: string;
  amount: number;
  outDate: Date;
  inDate: Date;
}

export type TraceStep =
  /** L'argent entre dans le suivi : un revenu sans lien d'entrée (salaire, dépôt). */
  | { kind: 'entry'; txnId: string }
  /** L'argent quitte le suivi : une dépense sans lien de sortie. */
  | { kind: 'exit'; txnId: string }
  /** L'opération sur laquelle on a appuyé. */
  | { kind: 'focus'; txnId: string }
  /** Un virement entre deux comptes : de `outId` vers `inId`. */
  | { kind: 'leg'; outId: string; inId: string }
  /** L'argent est resté sur le compte `bankId` entre deux étapes. */
  | { kind: 'carry'; bankId: string }
  /** La chaîne commence sur un argent déjà présent avant la fenêtre de traçage. */
  | { kind: 'unexplained'; bankId: string }
  /** L'argent (revenu ou virement entrant) reste sur le compte `bankId`. */
  | { kind: 'remain'; bankId: string };

export interface TransactionTrace {
  /** L'opération interrogée. */
  focusId: string;
  /** Opérations évoquées par le trajet, avec ce qu'il faut pour les afficher. */
  nodes: TraceTxn[];
  /** Le trajet, ordonné de la source vers la destination. */
  steps: TraceStep[];
  /** Revenus d'origine rencontrés en amont de l'opération. */
  sources: string[];
  /** Dépenses finales rencontrées en aval. */
  sinks: string[];
  /** Vrai si l'origine (revenu ou argent antérieur) a pu être qualifiée. */
  accounted: boolean;
}

/** Apparie les opérations en virements internes, comme le reste de l'app. */
export function buildTransferLinks(transactions: TraceTxn[]): TraceLink[] {
  const key = (amount: number) => Math.round(Math.abs(amount) * 100);
  const byAmount = new Map<number, TraceTxn[]>();
  for (const txn of transactions) {
    if (txn.amount === 0) continue;
    const k = key(txn.amount);
    const bucket = byAmount.get(k);
    if (bucket) bucket.push(txn);
    else byAmount.set(k, [txn]);
  }

  const used = new Set<string>();
  const links: TraceLink[] = [];

  for (const txn of transactions) {
    if (txn.amount === 0 || used.has(txn.id)) continue;

    const candidates = byAmount.get(key(txn.amount)) || [];
    const match = candidates.find(
      (other) =>
        other.id !== txn.id &&
        !used.has(other.id) &&
        Math.sign(other.amount) === -Math.sign(txn.amount) &&
        Math.abs(new Date(other.date).getTime() - new Date(txn.date).getTime()) <= FIVE_DAYS &&
        (looksLikeTransfer(txn.description) || looksLikeTransfer(other.description)),
    );

    if (match) {
      used.add(txn.id);
      used.add(match.id);
      const out = txn.amount < 0 ? txn : match;
      const input = txn.amount < 0 ? match : txn;
      links.push({
        outId: out.id,
        inId: input.id,
        amount: Math.abs(input.amount),
        outDate: out.date,
        inDate: input.date,
      });
    }
  }

  return links;
}

function latestPositiveInBankBefore(txns: Map<string, TraceTxn>, txn: TraceTxn): TraceTxn | null {
  let best: TraceTxn | null = null;
  for (const other of txns.values()) {
    if (
      other.id === txn.id ||
      other.bankId !== txn.bankId ||
      other.amount <= 0 ||
      other.date.getTime() > txn.date.getTime()
    ) {
      continue;
    }
    if (!best || other.date.getTime() > best.date.getTime()) best = other;
  }
  return best;
}

function firstNegativeInBankAfter(txns: Map<string, TraceTxn>, txn: TraceTxn): TraceTxn | null {
  let best: TraceTxn | null = null;
  for (const other of txns.values()) {
    if (
      other.id === txn.id ||
      other.bankId !== txn.bankId ||
      other.amount >= 0 ||
      other.date.getTime() < txn.date.getTime()
    ) {
      continue;
    }
    if (!best || other.date.getTime() < best.date.getTime()) best = other;
  }
  return best;
}

function buildUpstream(
  focus: TraceTxn,
  txns: Map<string, TraceTxn>,
  inMap: Map<string, string>,
): TraceStep[] {
  const reversed: TraceStep[] = [];
  const visited = new Set<string>();
  let cur = focus;

  while (reversed.length < MAX_STEPS && !visited.has(cur.id)) {
    visited.add(cur.id);

    if (cur.amount < 0) {
      // Une sortie d'argent : il venait d'un apport antérieur du même compte.
      const funder = latestPositiveInBankBefore(txns, cur);
      if (funder && !visited.has(funder.id)) {
        reversed.push({ kind: 'carry', bankId: cur.bankId });
        cur = funder;
        continue;
      }
      reversed.push({ kind: 'unexplained', bankId: cur.bankId });
      break;
    }

    // Un apport : s'il arrive par un virement, on remonte au compte émetteur.
    const outId = inMap.get(cur.id);
    if (outId && !visited.has(outId)) {
      reversed.push({ kind: 'leg', outId, inId: cur.id });
      cur = txns.get(outId)!;
      continue;
    }

    reversed.push({ kind: 'entry', txnId: cur.id });
    break;
  }

  return reversed.reverse();
}

function buildDownstream(
  focus: TraceTxn,
  txns: Map<string, TraceTxn>,
  outMap: Map<string, string>,
): TraceStep[] {
  const forward: TraceStep[] = [];
  const visited = new Set<string>();
  let cur = focus;

  while (forward.length < MAX_STEPS && !visited.has(cur.id)) {
    visited.add(cur.id);

    if (cur.amount < 0) {
      // Une sortie : soit elle alimente un virement, soit l'argent est dépensé.
      const inId = outMap.get(cur.id);
      if (inId && !visited.has(inId)) {
        forward.push({ kind: 'leg', outId: cur.id, inId });
        cur = txns.get(inId)!;
        continue;
      }
      forward.push({ kind: 'exit', txnId: cur.id });
      break;
    }

    // Un apport : l'argent s'immobilise jusqu'à la prochaine sortie du compte.
    const spender = firstNegativeInBankAfter(txns, cur);
    if (spender && !visited.has(spender.id)) {
      forward.push({ kind: 'carry', bankId: cur.bankId });
      cur = spender;
      continue;
    }
    forward.push({ kind: 'remain', bankId: cur.bankId });
    break;
  }

  return forward;
}

/** Construit le trajet complet d'une opération, en s'appuyant sur ses liens. */
export function buildTrace(
  focusId: string,
  transactions: TraceTxn[],
  links: TraceLink[],
): TransactionTrace {
  const txns = new Map(transactions.map((txn) => [txn.id, txn]));
  const focus = txns.get(focusId);
  if (!focus) {
    return { focusId, nodes: [], steps: [], sources: [], sinks: [], accounted: false };
  }

  const outMap = new Map<string, string>();
  const inMap = new Map<string, string>();
  for (const link of links) {
    outMap.set(link.outId, link.inId);
    inMap.set(link.inId, link.outId);
  }

  let upstream = buildUpstream(focus, txns, inMap);
  let downstream = buildDownstream(focus, txns, outMap);

  // L'opération choisie est la source elle-même (ou la toute fin) : l'étape
  // de la source ferait double emploi avec l'étape `focus`.
  const firstDown = downstream[0];
  if (firstDown?.kind === 'exit' && firstDown.txnId === focus.id) downstream = [];
  const lastUp = upstream[upstream.length - 1];
  if (lastUp?.kind === 'entry' && lastUp.txnId === focus.id) upstream = [];

  const steps: TraceStep[] = [
    ...upstream,
    { kind: 'focus', txnId: focus.id },
    ...downstream,
  ];

  // Le revenu choisi est sa propre origine — il ne fait pas doublon dans la
  // liste amont, qui est vide, mais ce n'est pas pour autant un trajet sans
  // réponse.
  const focusIsSource = focus.amount > 0 && !inMap.has(focus.id);

  const sources = focusIsSource
    ? [focus.id]
    : upstream
        .filter((step): step is Extract<TraceStep, { kind: 'entry' }> => step.kind === 'entry')
        .map((step) => step.txnId);
  const sinks = downstream
    .filter((step): step is Extract<TraceStep, { kind: 'exit' }> => step.kind === 'exit')
    .map((step) => step.txnId);

  const accounted =
    focusIsSource ||
    upstream.some((step) => step.kind === 'entry' || step.kind === 'unexplained');

  return { focusId, nodes: [...txns.values()], steps, sources, sinks, accounted };
}