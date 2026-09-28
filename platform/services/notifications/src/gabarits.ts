// Gabarits de notification approuvés (ADR-0012). Liste fermée : aucun texte libre, aucune donnée
// de santé (ni motif, ni spécialité, ni nom du professionnel). Un SMS : 160 caractères au plus.
// Toute modification, et toute nouvelle langue, est relue par le porteur de projet avant la
// mise en production.
//
// Le Gabon est le premier pays : fuseau et langue sont des paramètres de déploiement
// (NOTIFICATIONS_FUSEAU, NOTIFICATIONS_LANGUE), jamais codés en dur dans les textes.

export const IDENTIFIANTS_GABARITS = [
  'rendez-vous-annule',
  'rendez-vous-reporte',
  /** Paiement reçu : la réservation devient un rendez-vous confirmé (ADR-0017). */
  'rendez-vous-confirme',
  /** Délai de paiement dépassé : la réservation est annulée par la plateforme (ADR-0017). */
  'reservation-expiree',
] as const;
export type Gabarit = (typeof IDENTIFIANTS_GABARITS)[number];

export const estGabarit = (x: string): x is Gabarit =>
  (IDENTIFIANTS_GABARITS as readonly string[]).includes(x);

/**
 * Textes par langue (code ISO 639-1). Chaque langue fournit tous les gabarits ; {date} et {heure}
 * sont remplacés au fuseau et dans les formats du pays.
 */
export const CATALOGUE: Readonly<Record<string, Readonly<Record<Gabarit, string>>>> = {
  fr: {
    'rendez-vous-annule':
      'Mbolo Santé : votre rendez-vous du {date} à {heure} est annulé. Ouvrez l’application pour en choisir un autre.',
    'rendez-vous-reporte':
      'Mbolo Santé : votre rendez-vous est déplacé au {date} à {heure}. Détails dans l’application.',
    'rendez-vous-confirme':
      'Mbolo Santé : paiement reçu, votre rendez-vous du {date} à {heure} est confirmé. Détails dans l’application.',
    'reservation-expiree':
      'Mbolo Santé : paiement non reçu à temps, votre réservation du {date} à {heure} est annulée. Vous pouvez en choisir une autre.',
  },
};

/**
 * Invitation d'un proche (ADR-0019) : envoyée au numéro saisi par le patient, qui n'est pas gardé.
 * Ni le nom du patient ni aucune donnée de santé : le patient prévient lui-même son proche.
 * {code} et {jours} sont les seules variables.
 */
export const CATALOGUE_INVITATION_PROCHE: Readonly<Record<string, string>> = {
  fr: 'Mbolo Santé : vous êtes invité à suivre un proche. Votre code : {code}, valable {jours} jours. Créez votre compte dans l’application.',
};

/**
 * Alerte de sécurité au patient (ADR-0019, décision du porteur de projet) : la personne qu'il a
 * invitée a créé son compte. Sans le prénom du proche ni aucune donnée de santé ; envoyée même sans
 * consentement C-RAPPELS (information sur l'accès à son dossier, pas un rappel).
 */
export const CATALOGUE_ALERTE_PROCHE: Readonly<Record<string, string>> = {
  fr: 'Mbolo Santé : votre proche invité a créé son compte. Si ce n’est pas vous qui l’avez invité, retirez-le dans l’application.',
};

/**
 * Confirmation au patient (ADR-0019) : l'équipe (rôle assistance-patient) a retiré tous ses proches,
 * après l'avoir rappelé au numéro de son dossier. Sans prénom ni donnée de santé ; envoyée même sans
 * C-RAPPELS : si le patient n'a rien demandé, il le sait aussitôt.
 */
export const CATALOGUE_ALERTE_RETRAIT_PROCHES: Readonly<Record<string, string>> = {
  fr: 'Mbolo Santé : à votre demande, l’équipe a retiré l’accès de vos proches à votre dossier. Si vous n’avez rien demandé, contactez l’équipe.',
};

/** Alertes de sécurité envoyées au patient, sans condition C-RAPPELS. */
export const ALERTES_PATIENT = {
  'proche-inscrit': CATALOGUE_ALERTE_PROCHE,
  'proches-retires': CATALOGUE_ALERTE_RETRAIT_PROCHES,
} as const;
export type AlertePatient = keyof typeof ALERTES_PATIENT;

/** Paramètres du pays déployé. */
export interface Pays {
  /** Fuseau horaire IANA, ex. Africa/Libreville. */
  fuseau: string;
  /** Langue et formats (BCP 47), ex. fr-FR. */
  langue: string;
}

export const PAYS_PAR_DEFAUT: Pays = { fuseau: 'Africa/Libreville', langue: 'fr-FR' };

const langueDe = (langue: string) => langue.split('-')[0]?.toLowerCase() ?? '';
const textes = (langue: string) => CATALOGUE[langueDe(langue)];

/** Vérifie au démarrage que le pays est utilisable (fuseau connu, textes approuvés). */
export function verifierPays(p: Pays): void {
  try {
    new Intl.DateTimeFormat(p.langue, { timeZone: p.fuseau });
  } catch {
    throw new Error(`Fuseau ou langue invalide : ${p.fuseau}, ${p.langue}.`);
  }
  const langue = langueDe(p.langue);
  if (
    !textes(p.langue) ||
    !CATALOGUE_INVITATION_PROCHE[langue] ||
    Object.values(ALERTES_PATIENT).some((c) => !c[langue])
  ) {
    throw new Error(`Aucun gabarit approuvé pour la langue ${p.langue}.`);
  }
}

/** Variables autorisées : une date et une heure, calculées à partir d'un instant. */
export interface Variables {
  /** Instant du rendez-vous (ISO 8601). */
  instant: string;
}

export function rediger(g: Gabarit, v: Variables, pays: Pays = PAYS_PAR_DEFAUT): string {
  const catalogue = textes(pays.langue);
  if (!catalogue) throw new Error(`Aucun gabarit approuvé pour la langue ${pays.langue}.`);
  const t = new Date(v.instant);
  if (Number.isNaN(t.getTime())) throw new Error('Instant invalide.');
  const date = new Intl.DateTimeFormat(pays.langue, {
    timeZone: pays.fuseau,
    day: '2-digit',
    month: '2-digit',
  }).format(t);
  const heure = new Intl.DateTimeFormat(pays.langue, {
    timeZone: pays.fuseau,
    hour: '2-digit',
    minute: '2-digit',
  }).format(t);
  return catalogue[g].replace('{date}', date).replace('{heure}', heure);
}

/** Code d'invitation présenté (ABCD-EFGH, alphabet sans caractères ambigus). */
export const FORMAT_CODE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

export function redigerInvitationProche(
  code: string,
  jours: number,
  pays: Pays = PAYS_PAR_DEFAUT,
): string {
  const texte = CATALOGUE_INVITATION_PROCHE[langueDe(pays.langue)];
  if (!texte) throw new Error(`Aucun gabarit approuvé pour la langue ${pays.langue}.`);
  if (!FORMAT_CODE.test(code) || !Number.isInteger(jours) || jours < 1 || jours > 90) {
    throw new Error('Variables invalides.');
  }
  return texte.replace('{code}', code).replace('{jours}', String(jours));
}

export function redigerAlerteProche(
  alerte: AlertePatient = 'proche-inscrit',
  pays: Pays = PAYS_PAR_DEFAUT,
): string {
  const texte = ALERTES_PATIENT[alerte][langueDe(pays.langue)];
  if (!texte) throw new Error(`Aucun gabarit approuvé pour la langue ${pays.langue}.`);
  return texte;
}
