/**
 * Résolution de l'origine de l'API selon le contexte d'exécution.
 *
 * En dev, le proxy Vite renvoie `/api` et `/uploads` vers localhost:36321 : les
 * URLs relatives suffisent. Sur le web (Vercel), le front et l'API partagent la
 * même origine : idem.
 *
 * En application packagée, la webview Tauri sert le front depuis
 * `tauri://localhost`. Une URL relative part alors sur le protocole d'assets de
 * Tauri et n'atteint jamais le serveur Express lancé en sidecar — d'où un 404
 * sur chaque appel. Il faut viser explicitement le port du sidecar.
 *
 * Sur iOS et Android, il n'y a pas de sidecar : ni Node ni Prisma ne tournent
 * sur le téléphone. L'API vit ailleurs — le Mac de l'utilisateur sur le réseau
 * local, ou un déploiement — et son adresse est saisie une fois puis conservée.
 *
 * La détection est faite à l'exécution et non au build : le même `dist/` sert
 * à la fois au bundle Tauri, au bundle mobile et au déploiement web, une
 * variable de build les casserait l'un ou l'autre.
 */

import { isNativeMobile, isTauri } from './platform';
import { normalizeServerUrl } from './serverUrl';

// Réexportée : les écrans mobiles la prennent au même endroit que le reste de
// la configuration serveur, sans avoir à connaître le découpage interne.
export { normalizeServerUrl };

/** Port historique, utilisé uniquement pour les anciens bundles Tauri. */
const LEGACY_SIDECAR_PORT = 36321;

/** Adresse du serveur saisie sur mobile — la seule chose à configurer. */
const SERVER_URL_STORAGE_KEY = 'findy-server-url';

function isTauriRuntime(): boolean {
  return isTauri();
}

export function getServerUrl(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? '';
}

/** Enregistre l'adresse et la prend en compte immédiatement. */
export function setServerUrl(url: string): void {
  const normalized = normalizeServerUrl(url);
  if (typeof localStorage !== 'undefined') {
    if (normalized) localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
    else localStorage.removeItem(SERVER_URL_STORAGE_KEY);
  }
  API_BASE = normalized;
}

/**
 * Vérifie qu'une adresse répond bien comme un serveur Findy.
 *
 * `/api/health` est la seule route ouverte sans jeton : elle permet de
 * distinguer « adresse fautive » de « mot de passe refusé » au moment où
 * l'utilisateur peut encore corriger sa saisie.
 */
export async function probeServer(url: string, timeoutMs = 5_000): Promise<{ ok: boolean; error?: string }> {
  const base = normalizeServerUrl(url);
  if (!base) return { ok: false, error: 'Adresse invalide.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // `nativeFetch` : la réécriture globale installée plus bas viserait
    // l'ancienne adresse et testerait donc le mauvais serveur.
    const response = await nativeFetch(`${base}/api/health`, { signal: controller.signal });
    if (!response.ok) return { ok: false, error: `Le serveur a répondu ${response.status}.` };
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === 'object' && 'status' in payload) return { ok: true };
    return { ok: false, error: "Cette adresse ne répond pas comme un serveur Findy." };
  } catch {
    if (controller.signal.aborted) return { ok: false, error: 'Le serveur n’a pas répondu à temps.' };
    return { ok: false, error: 'Serveur injoignable. Vérifiez l’adresse et le réseau.' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vrai quand l'origine de la page est le protocole d'assets de Tauri.
 *
 * `tauri://localhost` sur iOS, `http://tauri.localhost` sur Android. Ces deux
 * origines sont servies par un gestionnaire de protocole interne : une URL
 * relative n'en sort jamais pour atteindre un serveur. Pire, côté Android
 * l'interception passe par `shouldInterceptRequest`, qui n'expose pas le corps
 * de la requête — un POST y arrive avec `Content-Length: 0`, et le serveur
 * répond « champ manquant » sur une requête pourtant bien formée.
 *
 * Toute adresse d'API doit donc être absolue dans ce contexte.
 */
function isInterceptedOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  return protocol === 'tauri:' || hostname === 'tauri.localhost';
}

function detectApiBase(): string {
  // Une valeur explicite au build reste prioritaire (packaging alternatif).
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return fromEnv;

  if (isNativeMobile()) {
    // L'adresse saisie par l'utilisateur prime toujours.
    const stored = getServerUrl();
    if (stored) return stored;

    // En développement, le serveur Vite est joignable en absolu — par
    // `adb reverse` sur l'émulateur, par l'adresse LAN avec `--host`. Sans
    // cela, `tauri android dev` obligerait à saisir une adresse à chaque
    // lancement pour contourner l'interception du protocole d'assets.
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL) {
      return import.meta.env.VITE_DEV_SERVER_URL;
    }

    // Rien de configuré : l'écran de connexion au serveur prend la main.
    return '';
  }

  // Boucle IPv4 explicite : le sidecar n'écoute pas sur ::1.
  return isTauriRuntime() ? `http://127.0.0.1:${LEGACY_SIDECAR_PORT}` : '';
}

export let API_BASE = detectApiBase();

/**
 * Vrai quand la page est servie par un vrai serveur HTTP.
 *
 * C'est le cas en `tauri ios dev` / `android dev` — la webview charge Vite
 * depuis le Mac — et celui d'un bundle mobile pointé sur un déploiement. Les
 * URLs relatives atteignent alors leur destination sans configuration.
 *
 * En application packagée, l'origine est `tauri://localhost` (iOS) ou
 * `http://tauri.localhost` (Android) : un chemin relatif y part sur le
 * protocole d'assets et n'atteint aucun serveur.
 */
/**
 * Vrai quand l'application mobile n'a pas encore d'adresse de serveur.
 *
 * `API_BASE` couvre déjà les trois façons d'en avoir une : figée au build,
 * saisie par l'utilisateur, ou déduite du serveur de développement. Reste le
 * cas où la page est servie par un vrai serveur HTTP — un déploiement ouvert
 * dans le navigateur du téléphone — où les URLs relatives suffisent.
 */
export function needsServerSetup(): boolean {
  return isNativeMobile() && !API_BASE && isInterceptedOrigin();
}

/** Chemins servis par le backend et non par le bundle front. */
const BACKEND_PREFIXES = ['/api/', '/uploads/'];

function needsRewrite(url: string): boolean {
  return BACKEND_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// ─── Jeton de session ───────────────────────────────────────────────────────
// L'API n'accepte plus d'appel anonyme. Plutôt que d'ajouter l'en-tête aux ~65
// `fetch('/api/…')` disséminés dans le store et les composants, on l'injecte au
// même endroit que la réécriture d'origine : un oubli deviendrait sinon un 401
// silencieux sur une seule page.

const TOKEN_STORAGE_KEY = 'findy-auth-token';

let authToken: string | null =
  typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_STORAGE_KEY);

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Fusionne les en-têtes d'origine puis ceux de `init`, et n'ajoute
 * `Authorization` que s'il n'a pas été fourni explicitement par l'appelant.
 */
function withAuth(base: HeadersInit | undefined, init: RequestInit | undefined): RequestInit | undefined {
  if (!authToken) return init;

  const headers = new Headers(base);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${authToken}`);

  return { ...init, headers };
}

let expiryHandled = false;

/**
 * Un 401 signifie que le jeton n'est plus valable (expiré, ou données de
 * l'application réinitialisées). On revient à l'écran de connexion une seule
 * fois, même si dix requêtes échouent en parallèle.
 *
 * Les routes `/api/auth/*` sont exclues : un mot de passe refusé y répond 401
 * sans que la session en cours soit en cause.
 */
async function watchExpiry(path: string, pending: Promise<Response>): Promise<Response> {
  const response = await pending;
  if (response.status !== 401 || path.startsWith('/api/auth/') || expiryHandled) return response;

  expiryHandled = true;
  setAuthToken(null);
  console.warn('[API] Session expirée — retour à l’écran de connexion.');
  window.location.reload();
  return response;
}

/**
 * `fetch` d'origine, capturé avant toute réécriture.
 *
 * Le test d'adresse (`probeServer`) et la sonde de disponibilité doivent viser
 * l'URL qu'on leur donne, pas celle qui est configurée : sans cette référence,
 * tester une nouvelle adresse interrogerait l'ancienne.
 */
const nativeFetch: typeof fetch =
  typeof window === 'undefined' ? (globalThis.fetch as typeof fetch) : window.fetch.bind(window);

/**
 * Réécrit globalement les appels backend vers `API_BASE`.
 *
 * Le code applicatif compte ~65 `fetch('/api/…')` relatifs répartis dans le
 * store et les composants. Les préfixer un par un serait à la fois bruyant et
 * fragile — un oubli casse silencieusement une page en packagé seulement.
 * On intercepte donc en un seul endroit, et uniquement les chemins backend.
 *
 * No-op quand `API_BASE` est vide (dev et web) : le fetch natif est conservé.
 */
export async function installApiBase(): Promise<void> {
  // Sur mobile natif il n'y a pas de sidecar à interroger : l'adresse vient
  // du stockage local, déjà lue par `detectApiBase`.
  if (isTauriRuntime() && !isNativeMobile()) {
    // Le port est décidé par le shell Rust : il peut être différent du port
    // historique lorsqu'un autre workspace l'utilise déjà.
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // Une permission ou un bridge IPC défectueux ne doit jamais empêcher le
      // rendu de toute l'application. Après deux secondes, on utilise le port
      // historique et l'écran peut au moins afficher une erreur exploitable.
      API_BASE = await Promise.race([
        invoke<string>('api_base'),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Délai d’attente du bridge Tauri')), 2_000);
        }),
      ]);
    } catch (error) {
      // Compatibilité avec un shell plus ancien : conserver le port historique
      // donne un échec réseau explicite plutôt qu'un crash du frontend.
      console.warn('[API] Port sidecar dynamique indisponible, fallback historique.', error);
    }
  }

  if (typeof window === 'undefined') return;

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && needsRewrite(input)) {
      return watchExpiry(input, nativeFetch(API_BASE + input, withAuth(undefined, init)));
    }
    if (input instanceof Request && needsRewrite(new URL(input.url).pathname)) {
      const { pathname, search } = new URL(input.url);
      // Les en-têtes de la Request d'origine sont conservés : les repasser via
      // `init` les remplacerait entièrement.
      return watchExpiry(
        pathname,
        nativeFetch(new Request(API_BASE + pathname + search, input), withAuth(input.headers, init)),
      );
    }
    return nativeFetch(input, init);
  };

  if (API_BASE) console.log(`[API] Appels backend redirigés vers ${API_BASE}`);
}
