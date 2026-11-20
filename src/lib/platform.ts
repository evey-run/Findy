/**
 * Détection de la plateforme d'exécution.
 *
 * Findy tourne dans quatre contextes qui n'ont pas les mêmes contraintes :
 *
 *   • macOS (Tauri desktop)  — sidecar Express local, fenêtre redimensionnable ;
 *   • iOS / Android (Tauri mobile) — aucun sidecar possible, l'API est distante ;
 *   • navigateur mobile      — même interface tactile, mais l'origine sert l'API ;
 *   • navigateur desktop     — la version web historique.
 *
 * Deux questions distinctes en découlent, et les confondre a un coût :
 *   1. « Suis-je sur un appareil natif mobile ? » décide de la connectivité
 *      (adresse du serveur à demander) et des ajustements natifs (zones sûres,
 *      pas de sélection de texte).
 *   2. « Dois-je afficher l'interface mobile ? » ne dépend que de la largeur
 *      utile : une fenêtre desktop étroite mérite la même interface.
 */

function ua(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

/** Vrai dans une webview Tauri, quelle que soit la plateforme. */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost'
  );
}

/** iOS : iPhone, iPod, et iPad qui se déclare « Macintosh » depuis iPadOS 13. */
export function isIOS(): boolean {
  const agent = ua();
  if (/iPad|iPhone|iPod/.test(agent)) return true;
  // iPadOS en mode « bureau » : seul le tactile le distingue d'un Mac.
  return /Macintosh/.test(agent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
}

export function isAndroid(): boolean {
  return /Android/.test(ua());
}

/** Application native installée sur un téléphone ou une tablette. */
export function isNativeMobile(): boolean {
  return isTauri() && (isIOS() || isAndroid());
}

/** Navigateur mobile (Safari iOS, Chrome Android) hors application native. */
export function isMobileBrowser(): boolean {
  return !isTauri() && (isIOS() || isAndroid());
}

export type PlatformName = 'ios' | 'android' | 'desktop' | 'web';

export function platformName(): PlatformName {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return isTauri() ? 'desktop' : 'web';
}

/**
 * Forçage manuel de l'interface mobile.
 *
 * Indispensable au développement : construire les écrans mobiles en
 * redimensionnant sans cesse la fenêtre desktop est intenable, et la simulation
 * d'un iPhone dans les outils de développement ne reproduit pas le store réel.
 * `?mobile=1` bascule, `?mobile=0` revient — le choix est mémorisé.
 */
const FORCE_KEY = 'findy-force-mobile';

function readForcedPreference(): boolean | null {
  if (typeof window === 'undefined') return null;

  const fromQuery = new URLSearchParams(window.location.search).get('mobile');
  if (fromQuery === '1' || fromQuery === '0') {
    const forced = fromQuery === '1';
    try {
      localStorage.setItem(FORCE_KEY, forced ? '1' : '0');
    } catch {
      /* stockage indisponible : le forçage ne vaut que pour cette session */
    }
    return forced;
  }

  try {
    const stored = localStorage.getItem(FORCE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    /* idem */
  }
  return null;
}

/** Largeur au-delà de laquelle la mise en page desktop reprend la main. */
export const MOBILE_BREAKPOINT = 768;

/** Décision d'affichage, évaluée à l'instant T (cf. `useIsMobile` pour le suivi). */
export function shouldUseMobileUI(): boolean {
  const forced = readForcedPreference();
  if (forced !== null) return forced;

  // Sur un téléphone natif, la réponse ne dépend pas de la largeur : même une
  // tablette en paysage doit rester sur l'interface tactile.
  if (isNativeMobile()) return true;

  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}
