/** Valeur affichable par un <input type="date"> : AAAA-MM-JJ (les ISO complets sont tronqués). */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}
