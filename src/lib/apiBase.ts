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

/** Port du sidecar Express, fixé par src-tauri/src/lib.rs. */
const SIDECAR_PORT = 36321;

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
  return isTauriRuntime() ? `http://localhost:${SIDECAR_PORT}` : '';
}

export const API_BASE = detectApiBase();

/** Chemins servis par le backend et non par le bundle front. */
const BACKEND_PREFIXES = ['/api/', '/uploads/'];

function needsRewrite(url: string): boolean {
  return BACKEND_PREFIXES.some((prefix) => url.startsWith(prefix));
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
export function installApiBase(): void {
  if (!API_BASE || typeof window === 'undefined') return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && needsRewrite(input)) {
      return nativeFetch(API_BASE + input, init);
    }
    if (input instanceof Request && needsRewrite(new URL(input.url).pathname)) {
      const { pathname, search } = new URL(input.url);
      return nativeFetch(new Request(API_BASE + pathname + search, input), init);
    }
    return nativeFetch(input, init);
  };

  console.log(`[API] Appels backend redirigés vers ${API_BASE}`);
}
