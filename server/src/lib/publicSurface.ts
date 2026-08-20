/**
 * Surface exposée publiquement par le tunnel HTTPS.
 *
 * Le tunnel n'existe que pour une chose : recevoir le retour d'autorisation
 * d'Enable Banking. Il publiait pourtant l'application Express entière, donc
 * les quatorze routes `/api/*` — comptes, transactions, dettes — sans la
 * moindre authentification. Tout ce qui n'est pas le callback bancaire doit
 * donc être invisible depuis l'extérieur.
 */

/** Les seules routes qu'un navigateur extérieur a besoin d'atteindre. */
const PUBLIC_PATHS = new Set([
  '/api/enablebanking/callback',
  '/api/enablebanking/select-account',
]);

function hostname(hostHeader: string | undefined): string {
  if (!hostHeader) return '';
  // `host` peut valoir « localhost:36321 » ou « [::1]:36321 ».
  const value = hostHeader.trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  return value.split(':')[0];
}

function isLoopbackHost(hostHeader: string | undefined): boolean {
  const host = hostname(hostHeader);
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

/**
 * Vrai si la requête vient de l'extérieur (tunnel) et non de la webview locale.
 *
 * L'agent ngrok tourne dans le processus du serveur : l'adresse TCP source est
 * donc toujours loopback et ne distingue rien. Ce sont les en-têtes proxy et
 * l'hôte demandé qui trahissent une requête venue d'Internet.
 */
export function isPublicRequest(headers: Record<string, unknown>): boolean {
  const forwardedMarkers = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'ngrok-trace-id'];
  if (forwardedMarkers.some((header) => headers[header])) return true;

  return !isLoopbackHost(headers.host as string | undefined);
}

/** Vrai si ce chemin fait partie du strict nécessaire au callback bancaire. */
export function isPubliclyAllowedPath(path: string): boolean {
  // `path` peut porter la query string selon l'appelant.
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  return PUBLIC_PATHS.has(clean);
}

/** Décision finale pour une requête entrante. */
export function shouldBlockRequest(headers: Record<string, unknown>, path: string): boolean {
  return isPublicRequest(headers) && !isPubliclyAllowedPath(path);
}
