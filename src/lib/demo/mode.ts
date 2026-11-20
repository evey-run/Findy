/**
 * Mode démo — l'application sans serveur.
 *
 * Findy mobile n'a pas de base à lui : il lit celle d'un serveur Findy. Sans
 * serveur, l'application s'arrête à l'écran « Connecter votre serveur », ce qui
 * laisse sans rien à voir aussi bien la personne qui découvre l'app que
 * l'équipe de revue du Play Store. Le mode démo répond à toutes les requêtes
 * `/api/*` depuis une base fictive en mémoire (`./server.ts`) : rien ne quitte
 * l'appareil, et tout disparaît en quittant la démo.
 *
 * Ce module ne fait que tenir le drapeau. Il est importé dès le démarrage par
 * `apiBase.ts` : il doit rester minuscule, la base de démo elle-même n'est
 * chargée qu'à la première requête.
 */

/** Drapeau persistant : relancer l'application garde la démo ouverte. */
export const DEMO_STORAGE_KEY = 'findy-demo';

/**
 * Jeton de session factice.
 *
 * La restauration de session du magasin ne part que s'il existe un jeton ; en
 * démo, celui-ci ne sort jamais de la mémoire — le jeton réel éventuellement
 * enregistré reste intact pour le jour où l'on quitte la démo.
 */
export const DEMO_TOKEN = 'demo';

/** Message unique des actions qui n'ont pas de sens sans vrai serveur. */
export const DEMO_UNAVAILABLE = 'Indisponible en mode démo';

/**
 * Préfixe de tous les identifiants de la base de démo.
 *
 * Quelques écrans mémorisent des identifiants dans `localStorage` (espace
 * courant, émojis d'objectifs) : le préfixe permet de les retrouver pour n'en
 * laisser aucune trace en sortant.
 */
export const DEMO_ID_PREFIX = 'demo-';

/** Clés de `localStorage` susceptibles de garder un identifiant de démo. */
const SPACE_STORAGE_KEY = 'findy-current-space-id';
const OBJECTIVE_ICONS_KEY = 'findy-objective-icons';

/** Retire de l'appareil tout ce que la démo a pu y écrire. */
function clearDemoLeftovers(): void {
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);

    if (localStorage.getItem(SPACE_STORAGE_KEY)?.startsWith(DEMO_ID_PREFIX)) {
      localStorage.removeItem(SPACE_STORAGE_KEY);
    }

    const rawIcons = localStorage.getItem(OBJECTIVE_ICONS_KEY);
    if (rawIcons) {
      const icons = JSON.parse(rawIcons) as Record<string, string>;
      const kept = Object.fromEntries(
        Object.entries(icons).filter(([id]) => !id.startsWith(DEMO_ID_PREFIX)),
      );
      if (Object.keys(kept).length > 0) localStorage.setItem(OBJECTIVE_ICONS_KEY, JSON.stringify(kept));
      else localStorage.removeItem(OBJECTIVE_ICONS_KEY);
    }
  } catch {
    // Stockage indisponible ou valeur illisible : rien d'autre à nettoyer.
  }
}

/**
 * État initial, lu une seule fois au chargement.
 *
 * `?demo=1` ouvre la démo directement — c'est l'adresse des captures d'écran
 * du Play Store, prises dans un navigateur — et `?demo=0` la referme. Le choix
 * est mémorisé, comme `?mobile=1` dans `platform.ts`.
 */
function readInitialState(): boolean {
  if (typeof window === 'undefined') return false;

  const requested = new URLSearchParams(window.location.search).get('demo');
  try {
    if (requested === '1') localStorage.setItem(DEMO_STORAGE_KEY, '1');
    if (requested === '0') clearDemoLeftovers();
    return localStorage.getItem(DEMO_STORAGE_KEY) === '1';
  } catch {
    // Sans stockage, la démo ne vaut que pour cette session.
    return requested === '1';
  }
}

let demo = readInitialState();

export function isDemoMode(): boolean {
  return demo;
}

/** Ouvre la démo, sans rechargement : l'appelant enchaîne sur la connexion. */
export function enableDemoMode(): void {
  demo = true;
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, '1');
  } catch {
    // La démo tiendra jusqu'à la fermeture de l'application.
  }
}

/**
 * Quitte la démo et repart de zéro.
 *
 * Un rechargement complet est le seul moyen sûr de tout oublier : la base de
 * démo, le magasin zustand et chaque état local d'écran vivent en mémoire. On
 * revient à la racine sans `?demo=` — sans quoi le rechargement rouvrirait
 * aussitôt la démo — et, sur téléphone, l'écran de connexion au serveur
 * reprend la main puisqu'aucune adresse n'est enregistrée.
 */
export function leaveDemoMode(): void {
  demo = false;
  clearDemoLeftovers();

  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('demo');
  url.pathname = '/';
  url.hash = '';
  // `replaceState` puis `reload` : une simple navigation vers la même adresse
  // privée de son fragment pourrait n'être traitée que comme un changement
  // d'ancre, sans rechargement.
  window.history.replaceState(null, '', url.toString());
  window.location.reload();
}
