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

/** Ce qui traîne autour du nom : dates, numéro de carte, référence, civilité. */
const NOISE = [
  /\bcb\*?\s*\d{3,4}\b/gi,          // CB*0556
  /\b\d{2}\/\d{2}\/\d{2,4}\b/g,     // 09/08/25
  /\b\d{2}\/\d{2}\b/g,              // 09/08
  /\bref\.?\s*:?\s*\S+/gi,
  /\bmandat\s+\S+/gi,
  /\b(?:m|mme|mlle|mr)\b\.?\s+/gi,  // civilité d'un virement
];

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

function titleCase(value: string): string {
  return value
    .split(/(\s|-)/)
    .map((part) => {
      if (!/[a-zà-öø-ÿ]/i.test(part)) return part;
      if (isAcronym(part)) return part;
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
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

  for (const noise of NOISE) value = value.replace(noise, ' ');

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
  const isShouting = value === value.toUpperCase() && /[A-ZÀ-Þ]{3,}/.test(value);
  return isShouting ? titleCase(value) : value;
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
