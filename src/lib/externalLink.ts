import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from './platform';

/**
 * Politique de confidentialité, publiée hors de l'application.
 *
 * Google Play exige qu'elle soit accessible depuis l'application elle-même :
 * elle est donc proposée sur l'écran de connexion au serveur et dans « Plus ».
 */
export const PRIVACY_POLICY_URL = 'https://findy.evey.run/privacy';

/**
 * Ouvre une adresse web dans le navigateur du système.
 *
 * Dans la webview de Tauri, `window.open` n'ouvre rien d'utilisable : la page
 * s'afficherait sans barre d'adresse, ou pas du tout sur Android. Le greffon
 * Opener (permission `opener:default`, commune à toutes les plateformes) confie
 * l'adresse au navigateur du téléphone ; hors Tauri, un nouvel onglet suffit.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const target = new URL(url);
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error('Adresse non prise en charge.');
  }

  if (isTauri()) {
    await openUrl(target.toString());
    return;
  }

  // Pas d'option `noopener` : avec elle, `window.open` renvoie toujours `null`
  // et l'on ne saurait plus distinguer un onglet ouvert d'un onglet bloqué. On
  // coupe donc le lien avec la page d'origine à la main.
  const opened = window.open(target.toString(), '_blank');
  if (!opened) throw new Error('Le navigateur a bloqué l’ouverture du lien.');
  opened.opener = null;
}
