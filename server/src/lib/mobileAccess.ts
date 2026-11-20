/**
 * Préférence « accès mobile », persistée à côté de la base.
 *
 * La variable d'environnement `FINDY_LAN_ACCESS` suffit en développement, mais
 * pas dans l'application installée : le serveur y est lancé par le shell Rust,
 * avec un environnement figé que l'utilisateur ne peut pas modifier. Sans ce
 * fichier, activer l'accès mobile depuis les réglages serait impossible partout
 * ailleurs qu'en ligne de commande.
 *
 * Le choix n'est lu qu'au démarrage : ouvrir un port en cours de route
 * demanderait de refermer le serveur HTTP et de le rouvrir, en abandonnant les
 * requêtes en vol. L'interface demande donc un redémarrage, qui est de toute
 * façon la façon dont on relance une application de bureau.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ensurePersistenceDir, PERSISTENCE_DIR } from './persistence';

export const MOBILE_ACCESS_PATH = path.join(PERSISTENCE_DIR, 'mobile-access.json');

export function readMobileAccessPreference(): boolean {
  try {
    if (!fs.existsSync(MOBILE_ACCESS_PATH)) return false;
    const parsed = JSON.parse(fs.readFileSync(MOBILE_ACCESS_PATH, 'utf-8'));
    return parsed?.enabled === true;
  } catch {
    // Fichier corrompu : ne jamais ouvrir le port sur un doute.
    return false;
  }
}

export function writeMobileAccessPreference(enabled: boolean): void {
  ensurePersistenceDir();
  fs.writeFileSync(MOBILE_ACCESS_PATH, JSON.stringify({ enabled }, null, 2));
}
