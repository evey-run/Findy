/**
 * Nom du commerçant, extrait du libellé bancaire.
 *
 * Une banque n'écrit pas « Monoprix » mais
 * « CARTE 09/08/25 MONOPRIX LYON 3 CB*0556 » : la date du paiement, le numéro
 * de carte et parfois la ville entourent le seul mot qui intéresse. Le tableau
 * des transactions affiche le nom nettoyé, et garde le libellé d'origine en
 * infobulle — rien n'est perdu.
 */

/** Préfixes d'opération, retirés en tête de libellé. */
const PREFIXES = [
  /^carte\s+/i,
  /^avoir\s+/i,
  /^retrait\s+dab\s+/i,
  /^retrait\s+/i,
  /^prlv\s+sepa\s+/i,
  /^prlv\s+/i,
  /^vir\s+sepa\s+/i,
  /^vir\s+inst\s+/i,
  /^vir\s+de\s+/i,
  /^vir\s+/i,
  /^virement\s+/i,
  /^paiement\s+/i,
];

/**
 * Ville et pays accolés au commerçant.
 *
 * Boursorama écrit « MAXICOFFEE ARA\NEYRON\ FR » : le nom du commerçant, puis
 * la ville entre barres obliques, puis le pays. Tout ce qui suit la première
 * barre est du contexte de terminal de paiement, pas le marchand.
 */
const TERMINAL_SUFFIX = /\\.*$/;

/** Ce qui traîne autour du nom : dates, numéro de carte, référence, civilité. */
const NOISE = [
  /\bcb\*?\s*\d{3,4}\b/gi,          // CB*0556
  /\b\d{2}\/\d{2}\/\d{2,4}\b/g,     // 09/08/25
  /\b\d{2}\/\d{2}\b/g,              // 09/08
  /\bref\.?\s*:?\s*\S+/gi,
  /\bmandat\s+\S+/gi,
  /\b(?:m|mme|mlle|mr)\b\.?\s+/gi,  // civilité d'un virement
  /\*\w+\b/g,                        // référence de terminal : « PRIME*OQ2V »
  /\s+\d{1,3},$/,                     // montant tronqué en fin de libellé
];

/** « Virement de X » : le virement est déjà dit par le montant, reste le nom. */
const TRANSFER_LEAD = /^virement\s+(?:de|depuis|vers|à|a)\s+/i;
/**
 * « Virement de … » recollé après le nom.
 *
 * Certaines banques répètent l'émetteur derrière ce mot-charnière — le libellé
 * complet dit deux fois la même chose. On coupe au mot, où qu'il se trouve.
 */
const TRANSFER_TRAIL = /\s+virement\s+(?:de|depuis|vers)?\b.*$/i;

/** Suffixes de forme sociale, sans intérêt à l'affichage. */
const LEGAL_SUFFIX = /\s+(?:sas|sasu|sarl|eurl|sa|sci|ltd|inc|gmbh|bv|nv|plc)\b\.?$/i;

/**
 * Un libellé qui ne dit rien du commerçant.
 *
 * « CHQ. N.4903928 » ou « RETRAIT DAB 69VILLEURBA » n'ont pas de marchand :
 * mieux vaut afficher l'opération telle quelle qu'un fragment illisible.
 */
const OPAQUE = /^(?:chq\.?\s*n?\.?\s*\d+|\d+|[\d\s.*-]+)$/i;

/**
 * Un sigle reste en capitales.
 *
 * Sans cette exception, « SNCF » devient « Sncf » et « TCL » « Tcl ». On
 * reconnaît un sigle à son absence de voyelle sur quelques lettres — règle
 * générale, plutôt qu'une liste de marques à maintenir.
 */
function isAcronym(word: string): boolean {
  return word.length <= 5 && word === word.toUpperCase() && !/[AEIOUYÀ-Þ]/i.test(word);
}

function capitalize(word: string): string {
  if (!/[a-zà-öø-ÿ]/i.test(word)) return word;
  if (isAcronym(word)) return word;
  const lower = word.toLowerCase();
  // « D'AUVERGNE » doit devenir « D'Auvergne », mais « MCDONALD'S » ne doit pas
  // devenir « Mcdonald'S » : on ne capitalise pas une lettre isolée.
  return lower
    .split(/(')/)
    .map((piece, index) =>
      index === 0 || (piece.length > 1 && piece !== "'")
        ? piece.charAt(0).toUpperCase() + piece.slice(1)
        : piece,
    )
    .join('');
}

function titleCase(value: string): string {
  return value.split(/(\s|-)/).map(capitalize).join('');
}

/**
 * Un jeton qui n'est pas un mot : référence de virement, code de paie, matricule.
 *
 * Les virements d'organismes traînent des blocs comme « S22HE » ou
 * « L069A80L200PAY08/2026-32REGION » qui débordent la ligne sans rien apprendre.
 */
function isReference(word: string): boolean {
  if (word.length < 4) return false;
  const hasDigit = /\d/.test(word);
  const hasLetter = /[a-zà-öø-ÿ]/i.test(word);
  // Un code mêle chiffres et lettres, ou aligne beaucoup de chiffres.
  return (hasDigit && hasLetter) || /^\d{4,}$/.test(word);
}

/** Longueur au-delà de laquelle un nom cesse d'être lisible dans le tableau. */
const MAX_LENGTH = 38;

/**
 * Coupe le libellé devant sa première référence, puis le borne.
 *
 * « PAIERIE REGIONALE D'AUVERGNE RH PAYE DU MOIS REMU STAGIAIRES S22HE
 * L069A80L200PAY08/2026… » n'a pas besoin d'être lu en entier : les premiers
 * mots suffisent, le reste reste accessible en infobulle.
 */
function shorten(value: string): string {
  const words = value.split(/\s+/);
  const cut = words.findIndex(isReference);
  const kept = (cut > 0 ? words.slice(0, cut) : words).join(' ').trim() || value;

  if (kept.length <= MAX_LENGTH) return kept;
  // On coupe sur un mot entier plutôt qu'au milieu d'un mot.
  const truncated = kept.slice(0, MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${(lastSpace > 12 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}…`;
}

/**
 * Nom lisible d'un commerçant.
 *
 * Renvoie le libellé d'origine, à peine nettoyé, quand rien d'exploitable n'en
 * ressort : afficher « 69VILLEURBA » serait pire que « Retrait DAB ».
 */
export function merchantName(description: string): string {
  const original = (description ?? '').trim();
  if (!original) return 'Opération';

  // Les récurrences générées portent un marqueur ajouté par l'application.
  let value = original.replace(/\s*🔄\s*$/, '').trim();

  const isWithdrawal = /^retrait\b/i.test(value);
  const isCheque = /^chq/i.test(value);

  for (const prefix of PREFIXES) {
    if (prefix.test(value)) {
      value = value.replace(prefix, '');
      break;
    }
  }

  value = value.replace(TERMINAL_SUFFIX, '');
  for (const noise of NOISE) value = value.replace(noise, ' ');
  value = value.replace(TRANSFER_TRAIL, '').replace(TRANSFER_LEAD, '');

  value = value
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(LEGAL_SUFFIX, '')
    // Un chiffre isolé en fin de libellé est un numéro de boutique. Le nettoyage
    // laisse des espaces en fin de chaîne : il faut couper avant de tester `$`.
    .replace(/\s+\d{1,3}$/, '')
    .trim();

  if (isCheque) return 'Chèque';
  if (isWithdrawal) return 'Retrait';
  if (!value || OPAQUE.test(value)) return titleCase(original.slice(0, 40));

  // Un libellé déjà écrit normalement (« Assurance Habitation Lemonade ») ne
  // doit pas être recasé ; seuls les libellés tout en capitales le sont.
  // Mot à mot plutôt que tout ou rien : « PAIERIE REGIONALE … Virement de »
  // mélange capitales et minuscules, et resterait entièrement crié sinon.
  const cased = value
    .split(/(\s)/)
    .map((word) => (word === word.toUpperCase() && /[A-ZÀ-Þ]{3,}/.test(word) ? titleCase(word) : word))
    .join('');
  return shorten(cased);
}

/** Initiales affichées à défaut de logo. */
export function merchantInitials(name: string): string {
  const words = name.split(/[\s-]+/).filter((w) => /[a-zà-öø-ÿ0-9]/i.test(w));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Palette des pastilles, choisie pour rester lisible en texte blanc. */
const AVATAR_COLORS = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d',
  '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#9333ea',
];

/**
 * Couleur stable d'un commerçant.
 *
 * Le même marchand garde la même pastille d'une session à l'autre, ce qui rend
 * une liste de transactions repérable au coup d'œil.
 */
export function merchantColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
