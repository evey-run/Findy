/**
 * Utilitaires partagés pour la détection de virements internes.
 *
 * Ce module centralise la logique de reconnaissance des descriptions
 * de virement, utilisée à la fois par la détection de transferts
 * pour les stats et par le trajet de l'argent.
 */

/**
 * Détecte si une description de transaction évoque un virement interne
 * (entre les comptes de l'utilisateur).
 *
 * Couvre les termes bancaires classiques (virement, vir, transfer, vers)
 * ainsi que les termes spécifiques aux places de marché (solde Leboncoin).
 *
 * Note : "remboursement" et "paiement" ne sont PAS inclus car ce sont
 * des transactions avec des parties externes, pas des virements internes.
 */
export const looksLikeTransfer = (desc: string) =>
  /vir(?:ement|\b)|transfer|transfert|\bvers\b|\bsolde\b/i.test(desc || '');

/** Fenêtre de 5 jours pour l'appariement de virements. */
export const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
