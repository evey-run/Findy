/**
 * Logotype officiel d'une banque, récupéré via Enable Banking.
 *
 * L'API expose, pour chaque établissement, l'URL de son logotype — un PNG
 * paysage (le logotype de Revolut fait 5431 × 1200). On le télécharge **une
 * fois** dans `uploads/` plutôt que de pointer dessus depuis l'interface :
 * l'application reste consultable hors ligne, et elle n'émet pas de requête
 * vers un tiers à chaque affichage du portefeuille.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Au-delà, ce n'est pas un logo — on refuse d'écrire le fichier. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

/**
 * Nom de fichier déterministe pour un établissement.
 *
 * Dérivé d'une empreinte du couple pays/banque, jamais du nom lui-même : les
 * noms d'ASPSP contiennent des espaces, des accents et des barres obliques
 * (« Caixa Geral de Depósitos France »), autant de chemins imprévus.
 */
export function brandLogoFilename(country: string, aspspName: string, extension: string): string {
  const key = `${country.trim().toUpperCase()}|${aspspName.trim().toLowerCase()}`;
  const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  const safeExtension = /^\.[a-z0-9]{2,5}$/.test(extension) ? extension : '.png';
  return `brand-${digest}${safeExtension}`;
}

/** Extension à donner au fichier, d'après le type déclaré par le serveur. */
export function extensionForContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  return EXTENSION_BY_TYPE[normalized] ?? null;
}

export interface BrandLogoDeps {
  /** Liste des établissements d'un pays, telle que renvoyée par Enable Banking. */
  listAspsps: (country: string) => Promise<Array<{ name?: string; logo?: string }>>;
  fetchImpl?: typeof fetch;
  uploadsDir: string;
}

/**
 * Télécharge le logotype d'un établissement et renvoie son chemin public.
 *
 * Renvoie `null` — sans jamais lever — dès que quelque chose cloche : logo
 * absent, réponse non-image, fichier trop gros, réseau indisponible. Un
 * portefeuille sans logo reste parfaitement utilisable ; échouer bruyamment
 * ferait rater une liaison bancaire pour une image.
 */
export async function fetchBrandLogo(
  aspspName: string,
  country: string,
  deps: BrandLogoDeps,
): Promise<string | null> {
  const doFetch = deps.fetchImpl ?? fetch;

  try {
    const aspsps = await deps.listAspsps(country);
    const wanted = aspspName.trim().toLowerCase();
    const match = aspsps.find((a) => (a.name ?? '').trim().toLowerCase() === wanted);
    if (!match?.logo) return null;

    const response = await doFetch(match.logo);
    if (!response.ok) return null;

    const extension = extensionForContentType(response.headers.get('content-type'));
    // Un HTML d'erreur renvoyé en 200 ne doit pas atterrir dans `uploads/`.
    if (!extension) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_LOGO_BYTES) return null;

    const filename = brandLogoFilename(country, aspspName, extension);
    fs.mkdirSync(deps.uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(deps.uploadsDir, filename), buffer);

    return `/uploads/${filename}`;
  } catch (error) {
    console.warn(`[Brand] Logotype de ${aspspName} (${country}) indisponible:`, error);
    return null;
  }
}
