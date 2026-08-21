/**
 * Tunnel HTTPS public (ngrok) pour le retour d'autorisation PSD2.
 *
 * Deux règles guident ce module :
 *
 * 1. Le tunnel ne sert qu'au *retour* d'autorisation. Les synchronisations
 *    bancaires sont des appels sortants vers api.enablebanking.com et n'en ont
 *    aucun besoin — le fermer ne casse donc pas la sync.
 * 2. L'URL de callback est enregistrée une fois pour toutes dans la console
 *    Enable Banking. Elle ne doit jamais changer entre deux ouvertures : on ne
 *    referme donc le tunnel que si un domaine réservé est configuré, seul cas
 *    où ngrok redonne exactement la même URL.
 */
import fs from 'node:fs';
import ngrok from '@ngrok/ngrok';
import { setPublicBaseUrl, getPublicBaseUrl } from '../publicUrl';
import { ensurePersistenceDir, SYNC_SETTINGS_PATH } from './persistence';
import { describeNgrokFailure, ngrokErrorCode } from './ngrokErrors';

export type TunnelResult = {
  active: boolean;
  publicUrl: string;
  error?: string;
};

/** Délai d'inactivité avant fermeture, quand l'URL est stable (domaine réservé). */
const IDLE_CLOSE_MS = 15 * 60 * 1000;

let listener: any = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let starting: Promise<TunnelResult> | null = null;
/**
 * Raison du dernier échec d'ouverture, conservée pour l'interface.
 *
 * Sans elle, les réglages ne pouvaient qu'afficher « aucun tunnel actif » et
 * conseiller au hasard de vérifier le token — alors que la cause exacte
 * (session déjà utilisée, token refusé, domaine occupé) était connue.
 */
let lastError: string | null = null;

function port(): number {
  return Number(process.env.PORT || 36321);
}

function localBaseUrl(): string {
  return `http://localhost:${port()}`;
}

function readSyncSettings(): Record<string, any> {
  try {
    ensurePersistenceDir();
    if (fs.existsSync(SYNC_SETTINGS_PATH)) return JSON.parse(fs.readFileSync(SYNC_SETTINGS_PATH, 'utf-8'));
  } catch {}
  return {};
}

function credentials(): { authtoken?: string; domain?: string } {
  const settings = readSyncSettings();
  return {
    authtoken: settings?.enablebanking?.ngrokAuthToken || process.env.NGROK_AUTHTOKEN || undefined,
    domain: settings?.enablebanking?.ngrokDomain || process.env.NGROK_DOMAIN || undefined,
  };
}

/** Un domaine réservé garantit la même URL publique à chaque ouverture. */
export function hasStableDomain(): boolean {
  return !!credentials().domain;
}

export function isTunnelOpen(): boolean {
  return !!listener;
}

function cancelIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

export async function closeTunnel(): Promise<void> {
  cancelIdleTimer();
  const current = listener;
  listener = null;
  if (!current) return;

  try {
    await current.close();
    console.log('[Tunnel] Fermé');
  } catch (err: any) {
    console.error('[Tunnel] Close failed:', err.message);
  }
}

async function openTunnel(): Promise<TunnelResult> {
  const { authtoken, domain } = credentials();

  if (!authtoken) {
    const publicUrl = localBaseUrl();
    setPublicBaseUrl(publicUrl);
    console.log('[Tunnel] Aucun token ngrok — pas de callback HTTPS disponible');
    lastError = 'Ajoutez un token ngrok valide : Enable Banking n’accepte pas les URL localhost.';
    return { active: false, publicUrl, error: lastError };
  }

  try {
    const forwardOpts: any = { addr: port(), authtoken };
    if (domain) forwardOpts.domain = domain;

    let opened: any;
    try {
      opened = await ngrok.forward(forwardOpts);
    } catch (error) {
      // Le forfait gratuit n'autorise qu'une session simultanée, et celle qui
      // vient d'être fermée met un instant à être libérée côté ngrok. Une
      // seule nouvelle tentative suffit à absorber ce délai ; si une *autre*
      // application détient réellement la session, l'échec est définitif et le
      // message le dira.
      if (ngrokErrorCode(error) !== 'ERR_NGROK_108') throw error;
      console.warn('[Tunnel] Session ngrok encore occupée, nouvelle tentative dans 3 s…');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      opened = await ngrok.forward(forwardOpts);
    }
    listener = opened;
    const url = opened.url();
    if (!url.startsWith('https://')) {
      await closeTunnel();
      const publicUrl = localBaseUrl();
      setPublicBaseUrl(publicUrl);
      lastError = 'ngrok n’a pas fourni de tunnel HTTPS utilisable par Enable Banking.';
      return { active: false, publicUrl, error: lastError };
    }
    setPublicBaseUrl(url);
    lastError = null;
    console.log(`[Tunnel] Ouvert: ${url}${domain ? ` (domaine réservé: ${domain})` : ''}`);
    return { active: true, publicUrl: url };
  } catch (err: any) {
    // Le message brut du SDK est conservé dans le journal ; l'utilisateur reçoit
    // la cause traduite, qui diffère selon le code renvoyé par ngrok.
    console.error('[Tunnel] Ouverture impossible:', err?.errorCode ?? '', err?.message ?? err);
    const publicUrl = localBaseUrl();
    setPublicBaseUrl(publicUrl);
    lastError = describeNgrokFailure(err);
    return { active: false, publicUrl, error: lastError };
  }
}

/** Ouvre le tunnel s'il ne l'est pas déjà (les appels concurrents partagent la même ouverture). */
export async function ensureTunnel(): Promise<TunnelResult> {
  cancelIdleTimer();
  if (listener) return { active: true, publicUrl: getPublicBaseUrl() };
  if (starting) return starting;

  starting = openTunnel().finally(() => { starting = null; });
  return starting;
}

export async function restartTunnel(): Promise<TunnelResult> {
  await closeTunnel();
  return ensureTunnel();
}

/**
 * Repousse la fermeture du tunnel après une étape de liaison bancaire.
 * Sans domaine réservé, on ne referme jamais : la prochaine URL serait
 * différente de celle enregistrée chez Enable Banking.
 */
export function keepTunnelWarm(): void {
  if (!listener || !hasStableDomain()) return;

  cancelIdleTimer();
  idleTimer = setTimeout(() => {
    console.log('[Tunnel] Inactif depuis 15 min — fermeture (l’URL réservée sera réutilisée telle quelle)');
    void closeTunnel();
  }, IDLE_CLOSE_MS);
  // Ne pas retenir la boucle d'événements pour ce simple minuteur.
  idleTimer.unref?.();
}

/**
 * Au démarrage : sans domaine réservé, l'URL change à chaque ouverture, donc on
 * ouvre tout de suite et on garde le tunnel pour toute la session. Avec un
 * domaine réservé, on connaît l'URL sans rien ouvrir.
 */
export async function initTunnel(): Promise<TunnelResult> {
  const { authtoken, domain } = credentials();

  if (authtoken && domain) {
    const publicUrl = `https://${domain}`;
    setPublicBaseUrl(publicUrl);
    console.log(`[Tunnel] Domaine réservé ${domain} — ouverture à la demande`);
    return { active: false, publicUrl };
  }

  return ensureTunnel();
}

export function tunnelStatus() {
  const url = getPublicBaseUrl();
  const isHttps = url.startsWith('https://');
  const isLocalhost = url.includes('localhost');
  const reachable = isHttps && !isLocalhost && (!!listener || hasStableDomain());

  return {
    publicUrl: url,
    isHttps,
    isNgrok: url.includes('ngrok'),
    isLocalhost,
    open: !!listener,
    onDemand: hasStableDomain(),
    status: reachable ? 'ready' : 'no_tunnel',
    // `null` quand tout va bien : l'interface peut alors distinguer « pas
    // encore configuré » de « configuré mais refusé, et voici pourquoi ».
    error: reachable ? null : lastError,
  };
}
