// Masquage des secrets et des données sensibles avant journalisation.

export const SECRET_MASQUE = '[SECRET MASQUÉ]';
export const DONNEE_MASQUEE = '[DONNÉE SENSIBLE MASQUÉE]';
export const MOTIF_MASQUE = '[MASQUÉ]';
export const PROFONDEUR_MAX = 8;

const CLES_SECRETES = [
  'password',
  'motdepasse',
  'passwd',
  'secret',
  'token',
  'apikey',
  'cle',
  'authorization',
  'cookie',
  'privatekey',
  'credential',
];

const CLES_SENSIBLES = [
  'nom',
  'prenom',
  'name',
  'firstname',
  'lastname',
  'fullname',
  'telephone',
  'tel',
  'phone',
  'mobile',
  'email',
  'courriel',
  'adresse',
  'address',
  'datenaissance',
  'birthdate',
  'dob',
  'diagnostic',
  'diagnosis',
  'symptome',
  'symptomes',
  'motif',
  'traitement',
  'allergie',
  'message',
  'note',
  'notes',
  'contenu',
  'texte',
  'transcription',
  'ordonnance',
  'numerocnamgs',
  'numeropiece',
];

const MOTIFS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
];

// Téléphones : groupes de chiffres séparés par espaces ou points (les dates ISO ne sont pas visées).
const TELEPHONE = /(?:\+\d{1,3}[\s.]?)?\b\d{2}(?:[\s.]?\d{2}){3,}\b/g;

/**
 * Identifiants techniques (UUID : comptes Keycloak, invitations…) : opaques, jamais une donnée
 * personnelle. Leurs chiffres ne sont pas pris pour un téléphone, sinon la trace d'audit se perd.
 */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function normaliser(cle: string): string {
  return cle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\-\s]/g, '')
    .toLowerCase();
}

function correspond(cle: string, liste: readonly string[]): boolean {
  const c = normaliser(cle);
  return liste.some((mot) => c === mot || c.endsWith(mot) || c.startsWith(mot));
}

export function masquerTexte(texte: string): string {
  // Secrets et e-mails d'abord, sur tout le texte (un jeton peut ressembler à un UUID).
  const sansSecret = MOTIFS.reduce((acc, motif) => acc.replace(motif, MOTIF_MASQUE), texte);
  // Téléphones ensuite, hors des UUID.
  let resultat = '';
  let debut = 0;
  for (const u of sansSecret.matchAll(UUID)) {
    resultat += sansSecret.slice(debut, u.index).replace(TELEPHONE, MOTIF_MASQUE) + u[0];
    debut = u.index + u[0].length;
  }
  return resultat + sansSecret.slice(debut).replace(TELEPHONE, MOTIF_MASQUE);
}

export function masquer(valeur: unknown, profondeur = 0, vus = new WeakSet<object>()): unknown {
  if (typeof valeur === 'string') return masquerTexte(valeur);
  if (valeur === null || typeof valeur !== 'object') return valeur;
  if (profondeur >= PROFONDEUR_MAX) return '[PROFONDEUR MAX]';
  if (vus.has(valeur)) return '[RÉFÉRENCE CIRCULAIRE]';
  vus.add(valeur);

  if (Array.isArray(valeur)) {
    return valeur.map((v) => masquer(v, profondeur + 1, vus));
  }
  if (valeur instanceof Error) {
    return { nom: valeur.name, message: masquerTexte(valeur.message) };
  }

  const resultat: Record<string, unknown> = {};
  for (const [cle, v] of Object.entries(valeur)) {
    if (correspond(cle, CLES_SECRETES)) {
      resultat[cle] = SECRET_MASQUE;
    } else if (correspond(cle, CLES_SENSIBLES)) {
      resultat[cle] = DONNEE_MASQUEE;
    } else {
      resultat[cle] = masquer(v, profondeur + 1, vus);
    }
  }
  return resultat;
}
