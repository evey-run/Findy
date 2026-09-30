/**
 * Surface exposée publiquement par le tunnel HTTPS.
 *
 * Le tunnel n'existe que pour une chose : recevoir le retour d'autorisation
 * d'Enable Banking. Il publiait pourtant l'application Express entière, donc
 * les quatorze routes `/api/*` — comptes, transactions, dettes — sans la
 * moindre authentification. Tout ce qui n'est pas le callback bancaire doit
 * donc être invisible depuis l'extérieur.
 *
 * L'application mobile a ouvert une troisième provenance possible : le réseau
 * local. Le téléphone joint le Mac par son adresse privée (`192.168.…`), un
 * `Host` qui n'est pas la boucle locale et que la règle ci-dessus rejetait donc
 * comme « venu d'Internet ». Ce cas est distingué explicitement, et uniquement
 * quand l'utilisateur a activé l'accès mobile : le réseau local reste un
 * périmètre de confiance étroit, et l'authentification par jeton s'applique de
 * toute façon à chaque route.
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
 * Adresse IPv4 privée (RFC 1918) ou lien-local, avec le `.local` du Bonjour.
 *
 * Un nom d'hôte quelconque ne passe pas : seule une adresse dont la forme
 * garantit qu'elle n'est pas routable depuis Internet est acceptée.
 */
export function isPrivateNetworkHost(hostHeader: string | undefined): boolean {
  const host = hostname(hostHeader);
  if (!host) return false;
  if (host.endsWith('.local')) return true;

  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;

  const [a, b] = parts.map(Number);
  if (parts.map(Number).some((n) => n > 255)) return false;

  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 169 && b === 254) return true;         // 169.254.0.0/16 (lien-local)
  return false;
}

/** Vrai quand l'utilisateur a explicitement ouvert le serveur à ses appareils. */
export function isLanAccessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FINDY_LAN_ACCESS === '1' || env.FINDY_LAN_ACCESS === 'true';
}

/**
 * Vrai si la requête vient de l'extérieur (tunnel) et non de la webview locale.
 *
 * L'agent ngrok tourne dans le processus du serveur : l'adresse TCP source est
 * donc toujours loopback et ne distingue rien. Ce sont les en-têtes proxy et
 * l'hôte demandé qui trahissent une requête venue d'Internet.
 */
export function isPublicRequest(
  headers: Record<string, unknown>,
  options: { allowLan?: boolean } = {},
): boolean {
  const forwardedMarkers = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'ngrok-trace-id'];
  // Un en-tête de proxy est un aveu : la requête a traversé le tunnel, quelle
  // que soit l'adresse qu'elle prétend viser. Ce test passe avant tout le
  // reste, y compris avant l'exception réseau local.
  if (forwardedMarkers.some((header) => headers[header])) return true;

  if (isLoopbackHost(headers.host as string | undefined)) return false;
  if (options.allowLan && isPrivateNetworkHost(headers.host as string | undefined)) return false;

  return true;
}

/** Vrai si ce chemin fait partie du strict nécessaire au callback bancaire. */
export function isPubliclyAllowedPath(path: string): boolean {
  // `path` peut porter la query string selon l'appelant.
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
  return PUBLIC_PATHS.has(clean);
}

/** Décision finale pour une requête entrante. */
export function shouldBlockRequest(
  headers: Record<string, unknown>,
  path: string,
  options: { allowLan?: boolean } = {},
): boolean {
  return isPublicRequest(headers, options) && !isPubliclyAllowedPath(path);
}
