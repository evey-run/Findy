/**
 * Adresses par lesquelles un téléphone peut joindre ce serveur.
 *
 * Quand l'accès mobile est activé, l'application iOS/Android a besoin d'une
 * adresse à saisir. La demander à l'utilisateur revient à lui faire ouvrir les
 * réglages réseau de son Mac ; on la lui donne donc directement, ce qui suppose
 * de trier les interfaces : une machine en expose facilement une dizaine, dont
 * la boucle locale, des ponts Docker et des interfaces VPN qu'aucun téléphone
 * du salon ne peut atteindre.
 */
import os from 'node:os';

/** Interfaces virtuelles, jamais l'adresse par laquelle un téléphone arrive. */
const VIRTUAL_PREFIXES = ['lo', 'utun', 'awdl', 'llw', 'bridge', 'docker', 'vboxnet', 'tun', 'tap'];

function isVirtual(name: string): boolean {
  const lower = name.toLowerCase();
  return VIRTUAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export interface LanAddress {
  /** Nom de l'interface, tel que rapporté par le système (« en0 »). */
  iface: string;
  address: string;
}

/**
 * Adresses IPv4 privées des interfaces physiques, Wi-Fi en tête.
 *
 * `en0` est le Wi-Fi sur un portable Apple : c'est l'interface qui partage le
 * réseau du téléphone dans l'écrasante majorité des cas, elle passe donc en
 * premier même si une carte Ethernet répond aussi.
 */
export function lanAddresses(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): LanAddress[] {
  const found: LanAddress[] = [];

  for (const [iface, addresses] of Object.entries(interfaces)) {
    if (!addresses || isVirtual(iface)) continue;
    for (const entry of addresses) {
      // `family` vaut « IPv4 » (Node ≥ 18) ou 4 selon les versions.
      const isIPv4 = entry.family === 'IPv4' || (entry.family as unknown as number) === 4;
      if (!isIPv4 || entry.internal) continue;
      found.push({ iface, address: entry.address });
    }
  }

  return found.sort((a, b) => {
    const rank = (iface: string) => (iface.startsWith('en0') ? 0 : iface.startsWith('en') ? 1 : 2);
    return rank(a.iface) - rank(b.iface) || a.address.localeCompare(b.address);
  });
}
