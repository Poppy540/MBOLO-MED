// Règles d'alerte (ADR-0016), source unique : les fichiers `regles/*.yaml` en sont générés
// (`pnpm --filter @mbolo/supervision generer`) et un test vérifie qu'ils sont à jour.
// - Loki compte les événements d'alerte du journal (`contexte.alerte`, `@mbolo/journal-securise`).
// - Prometheus sonde `/sante` de chaque service (exportateur blackbox).
// Destinataires : des rôles (ADR-0016), jamais des noms ; les titulaires sont dans l'astreinte.
import type { Alerte } from '@mbolo/journal-securise';

export const DESTINATAIRES = [
  'responsable-securite',
  'revue-acces',
  'astreinte-technique',
  /** Valideurs des remboursements (ADR-0017), heures ouvrées. */
  'validation-remboursement',
] as const;
export type Destinataire = (typeof DESTINATAIRES)[number];

/** `critique` : appel ou SMS de l'astreinte, jour et nuit ; `normale` : message, heures ouvrées. */
export type Gravite = 'critique' | 'normale';

export interface Regle {
  alert: string;
  expr: string;
  for?: string;
  labels: { gravite: Gravite; destinataire: Destinataire; alerte?: Alerte };
  annotations: { resume: string; conduite: string };
}

export interface Groupe {
  name: string;
  interval: string;
  rules: Regle[];
}

/** Flux de journaux de la plateforme, étiqueté par le collecteur (Grafana Alloy ou Promtail). */
export const FLUX = '{app="mbolo-sante"}';

/** Nombre d'événements d'alerte `alerte` sur la fenêtre, regroupés si besoin. */
export const compter = (alerte: Alerte, fenetre: string, par?: string): string =>
  `sum${par ? ` by (${par})` : ''} (count_over_time(${FLUX} | json | contexte_alerte="${alerte}" [${fenetre}]))`;

export const REGLES_LOKI: { groups: Groupe[] } = {
  groups: [
    {
      name: 'mbolo-securite',
      interval: '1m',
      rules: [
        {
          alert: 'ConsultationsPhotosAnormales',
          expr: `${compter('consultation-photo', '1h', 'contexte_sujet')} > 60`,
          labels: {
            gravite: 'critique',
            destinataire: 'responsable-securite',
            alerte: 'consultation-photo',
          },
          annotations: {
            resume: "Plus de 60 photos d'identité ouvertes en une heure par un même vérificateur.",
            conduite:
              "Plan d'incident « fuite de photos d'identité » : vérifier les traces, retirer le rôle verification-identite si besoin.",
          },
        },
        {
          alert: 'BrisDeGlace',
          expr: `${compter('bris-de-glace', '5m')} > 0`,
          labels: { gravite: 'normale', destinataire: 'revue-acces', alerte: 'bris-de-glace' },
          annotations: {
            resume: "Accès d'urgence à un dossier : revue humaine sous 24 h.",
            conduite: 'Espace de revue des bris de glace (rôle revue-acces).',
          },
        },
        {
          alert: 'AccesRefusesEnRafale',
          expr: `${compter('acces-refuse', '5m', 'contexte_sujet, contexte_client')} > 20`,
          labels: {
            gravite: 'critique',
            destinataire: 'responsable-securite',
            alerte: 'acces-refuse',
          },
          annotations: {
            resume:
              'Plus de 20 refus d’accès au dossier en 5 minutes pour un même compte ou service.',
            conduite:
              'Vérifier le compte ; le désactiver dans Keycloak en cas de tentative d’intrusion.',
          },
        },
      ],
    },
    {
      name: 'mbolo-exploitation',
      interval: '1m',
      rules: [
        {
          alert: 'LimitesAppelsDepassees',
          expr: `${compter('limite-appels', '5m')} > 100`,
          labels: {
            gravite: 'normale',
            destinataire: 'astreinte-technique',
            alerte: 'limite-appels',
          },
          annotations: {
            resume: 'Plus de 100 requêtes refusées par les limites d’appels en 5 minutes.',
            conduite: 'Chercher l’adresse en cause ; bloquer au pare-feu si c’est une attaque.',
          },
        },
        {
          // Provisoire : 1 % des requêtes quand les métriques de requêtes existeront (ADR-0016).
          alert: 'ErreursServeur',
          expr: `${compter('erreur-serveur', '5m', 'service')} > 10`,
          labels: {
            gravite: 'normale',
            destinataire: 'astreinte-technique',
            alerte: 'erreur-serveur',
          },
          annotations: {
            resume: 'Plus de 10 erreurs internes en 5 minutes sur un service.',
            conduite: 'Lire le journal du service ; vérifier le dossier médical et la base.',
          },
        },
        {
          alert: 'RemboursementsAValider',
          expr: `${compter('remboursement-a-valider', '1h')} > 0`,
          labels: {
            gravite: 'normale',
            destinataire: 'validation-remboursement',
            alerte: 'remboursement-a-valider',
          },
          annotations: {
            resume: 'Un paiement a été reçu pour un rendez-vous annulé : remboursement à valider.',
            conduite:
              'Espace des remboursements (rôle validation-remboursement) : valider ou refuser selon les règles du porteur de projet.',
          },
        },
      ],
    },
  ],
};

export const REGLES_PROMETHEUS: { groups: Groupe[] } = {
  groups: [
    {
      name: 'mbolo-disponibilite',
      interval: '30s',
      rules: [
        {
          alert: 'ServiceInjoignable',
          expr: 'probe_success{job="mbolo-sante"} == 0',
          for: '2m',
          labels: { gravite: 'critique', destinataire: 'astreinte-technique' },
          annotations: {
            resume: 'Un service ne répond plus sur /sante depuis 2 minutes.',
            conduite:
              'Redémarrer le service ; vérifier l’hébergeur. La téléconsultation passe en priorité.',
          },
        },
      ],
    },
  ],
};
