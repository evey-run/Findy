/**
 * Valide l'origine du navigateur qui revient sur la page HTTPS de callback.
 * Seule l'URL publique ngrok actuellement ouverte par ce serveur est admise.
 */
export function isCurrentPublicCallbackOrigin(
  origin: string | undefined,
  publicBaseUrl: string,
): boolean {
  if (!origin) return false;

  try {
    const publicUrl = new URL(publicBaseUrl);
    return publicUrl.protocol === 'https:' && publicUrl.origin === origin;
  } catch {
    return false;
  }
}
