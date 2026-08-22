/**
 * Catégories par défaut d'un compte vierge (issue #36).
 *
 * Sur une base neuve, aucune catégorie n'existe : les écrans de saisie et le
 * dashboard restent vides et l'utilisateur doit tout créer à la main avant de
 * pouvoir classer la moindre dépense. On sème donc, à la création du tout
 * premier profil, ce jeu de catégories de base dans le catalogue commun
 * (`spaceId = null`, visible par tous les espaces — cf. lib/scope.ts).
 *
 * La liste reprend celle du seed de développement (`prisma/seed.ts`) pour que
 * l'app installée et l'app de dev partent du même vocabulaire.
 */
import prisma from '../prisma';

export type CategoryType = 'INCOME' | 'EXPENSE' | 'FIXED';

export interface DefaultCategory {
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Revenus
  { name: 'Salaire', type: 'INCOME', color: '#22c55e', icon: '💰' },
  { name: 'Freelance', type: 'INCOME', color: '#16a34a', icon: '💻' },
  // Charges fixes
  { name: 'Loyer', type: 'FIXED', color: '#dc2626', icon: '🏠' },
  { name: 'Électricité', type: 'FIXED', color: '#f59e0b', icon: '⚡' },
  { name: 'Internet/Box', type: 'FIXED', color: '#6366f1', icon: '📶' },
  // Dépenses
  { name: 'Alimentation', type: 'EXPENSE', color: '#059669', icon: '🛒' },
  { name: 'Transport', type: 'EXPENSE', color: '#0ea5e9', icon: '🚗' },
  { name: 'Loisirs', type: 'EXPENSE', color: '#8b5cf6', icon: '🎬' },
  { name: 'Santé', type: 'EXPENSE', color: '#ef4444', icon: '⚕️' },
  { name: 'Vêtements', type: 'EXPENSE', color: '#f97316', icon: '👕' }
];

/**
 * Crée le jeu de catégories par défaut si — et seulement si — la base n'en
 * contient encore aucune. Idempotent et sans effet de bord une fois la base
 * peuplée : on ne veut surtout pas ressusciter une catégorie que l'utilisateur
 * aurait volontairement supprimée. Renvoie le nombre de catégories créées.
 */
export async function seedDefaultCategories(): Promise<number> {
  const existing = await prisma.category.count();
  if (existing > 0) return 0;

  // `spaceId` laissé à null : ces catégories rejoignent le catalogue commun,
  // visible depuis tous les espaces (personnels comme partagés).
  const result = await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c }))
  });
  return result.count;
}
