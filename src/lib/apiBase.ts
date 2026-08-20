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
 * La détection est faite à l'exécution et non au build : le même `dist/` sert
 * à la fois au bundle Tauri et au déploiement web, une variable de build les
 * casserait l'un ou l'autre.
 */

/** Port historique, utilisé uniquement pour les anciens bundles Tauri. */
const LEGACY_SIDECAR_PORT = 36321;

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  );
}

function detectApiBase(): string {
  // Une valeur explicite au build reste prioritaire (packaging alternatif).
  const fromEnv = import.meta.env.VITE_API_BASE;
  if (fromEnv) return fromEnv;
  // Boucle IPv4 explicite : le sidecar n'écoute pas sur ::1.
  return isTauriRuntime() ? `http://127.0.0.1:${LEGACY_SIDECAR_PORT}` : '';
}

export let API_BASE = detectApiBase();

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
  // Le port est décidé par le shell Rust : il peut être différent du port
  // historique lorsqu'un autre workspace l'utilise déjà.
  if (isTauriRuntime()) {
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

  const nativeFetch = window.fetch.bind(window);

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
