import toast from 'react-hot-toast';
import { DEMO_UNAVAILABLE, isDemoMode } from '../lib/demo/mode';

/**
 * Coupe court, en démo, aux actions qui ont besoin d'un vrai serveur.
 *
 * Le serveur de démo les refuse déjà (403 et `DEMO_UNAVAILABLE`), mais
 * certaines s'annoncent avant tout appel — un sélecteur de fichier qui s'ouvre,
 * un parcours bancaire qui démarre — et d'autres traduisent l'échec en
 * « Vérifiez la connexion au serveur », hors de propos ici. On le dit donc
 * avant, d'une seule phrase, et l'action s'arrête là.
 *
 * Renvoie vrai quand l'appelant doit s'arrêter.
 */
export function blockedInDemo(): boolean {
  if (!isDemoMode()) return false;
  // Un identifiant fixe : dix appuis répétés ne donnent qu'une notification.
  toast(DEMO_UNAVAILABLE, { id: 'demo-unavailable', icon: '🔒' });
  return true;
}
