/**
 * Tracé d'une courbe d'évolution, dans un repère `0 0 width height`.
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
