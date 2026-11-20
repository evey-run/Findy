/**
 * Le calque de verre de l'en-tête (marge négative + sticky) ne sert que
 * lorsque des lignes défilent dessous. Liste vide (filtre catégorie/portefeuille
 * sans résultat) : on l'omet et les cellules portent leur propre fond, pour que
 * l'en-tête et ses filtres restent toujours visibles.
 */
export function showHeaderGlass(rowCount: number): boolean {
  return rowCount > 0;
}

/** Fond propre aux cellules d'en-tête quand le calque de verre est absent. */
export function headerCellBackground(rowCount: number): string {
  return showHeaderGlass(rowCount) ? '' : 'bg-zinc-800/95';
}
