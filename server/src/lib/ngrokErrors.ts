/**
 * Traduction des échecs d'ouverture de tunnel ngrok.
 *
 * L'échec était jusqu'ici résumé par « Vérifiez le token et le domaine
 * configuré », ce qui ne distingue pas un token invalide d'une session déjà
 * ouverte ailleurs — deux causes qui n'ont rien à voir et ne se règlent pas de
 * la même façon. ngrok fournit pourtant un code précis.
 */

/** Codes rencontrés en pratique, et ce qu'il faut faire pour chacun. */
const KNOWN_CAUSES: Array<{ code: string; hint: string }> = [
  {
    code: 'ERR_NGROK_108',
    hint: 'Ce token ngrok est déjà utilisé par une autre session en cours '
      + '(un autre lancement de Findy, un serveur de développement, ou un ngrok lancé à la main). '
      + 'Le forfait gratuit n’autorise qu’une session à la fois : fermez l’autre, ou utilisez un second token.',
  },
  {
    code: 'ERR_NGROK_105',
    hint: 'Le token ngrok est refusé (invalide ou révoqué). Recopiez-le depuis le tableau de bord ngrok.',
  },
  {
    code: 'ERR_NGROK_107',
    hint: 'Le token ngrok est mal formé. Recopiez-le entièrement, sans espace ni retour à la ligne.',
  },
  {
    code: 'ERR_NGROK_313',
    hint: 'Ce domaine réservé est déjà occupé par une autre session ngrok. Fermez-la avant de relancer.',
  },
  {
    code: 'ERR_NGROK_334',
    hint: 'Ce domaine n’est pas réservé sur votre compte ngrok, ou appartient à un autre compte. '
      + 'Vérifiez son orthographe dans les réglages.',
  },
  {
    code: 'ERR_NGROK_324',
    hint: 'Ce domaine réservé n’existe pas sur le compte associé à ce token.',
  },
];

/** Extrait le code `ERR_NGROK_xxx` d'une erreur du SDK, s'il y en a un. */
export function ngrokErrorCode(error: unknown): string | null {
  const candidates = [
    (error as any)?.errorCode,
    (error as any)?.code,
    (error as any)?.message,
    String(error ?? ''),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const match = /ERR_NGROK_\d+/.exec(candidate);
    if (match) return match[0];
  }
  return null;
}

/**
 * Message affiché à l'utilisateur : la cause probable quand on la connaît, et
 * dans tous les cas le code ngrok pour pouvoir chercher plus loin.
 */
export function describeNgrokFailure(error: unknown): string {
  const code = ngrokErrorCode(error);
  const known = code ? KNOWN_CAUSES.find((cause) => cause.code === code) : undefined;

  if (known) return `${known.hint} (${code})`;
  if (code) return `ngrok a refusé d’ouvrir le tunnel (${code}).`;

  const message = typeof (error as any)?.message === 'string' ? (error as any).message.trim() : '';
  return message
    ? `ngrok n’a pas pu créer le tunnel HTTPS : ${message}`
    : 'ngrok n’a pas pu créer le tunnel HTTPS. Vérifiez le token et le domaine configuré.';
}
