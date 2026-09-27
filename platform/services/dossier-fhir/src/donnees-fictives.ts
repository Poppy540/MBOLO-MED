// Jeu de données 100 % FICTIF, marqué meta.tag = fictif. Aucune personne réelle.
// Sert au développement local (chargement dans HAPI FHIR) et aux tests.
import type { Bundle, FhirResource, Patient } from 'fhir/r4.js';
import { MARQUEUR_FICTIF, SYSTEMES } from './constantes.js';
import {
  changerStatutIdentite,
  conditionDeclaree,
  consentement,
  patientInscrit,
  provenanceAgent,
} from './construire.js';

function patientFictif(numero: number, prenom: string, genre: Patient['gender']): Patient {
  const id = `fictif-patient-${String(numero).padStart(4, '0')}`;
  const p = patientInscrit({
    nom: 'Test',
    prenom,
    naissance: `19${80 + numero}-01-01`,
    ...(genre ? { sexe: genre } : {}),
    telephone: '+241 00 00 00 00',
    identifiant: {
      type: 'assurance-maladie',
      systeme: `${SYSTEMES.identifiantPatient}/assurance-maladie`,
      valeur: `FICTIF-${String(numero).padStart(4, '0')}`,
    },
    env: 'dev',
  });
  return { ...changerStatutIdentite(p, 'verifiee'), id };
}

export function jeuFictif(): Bundle {
  const env = 'dev' as const;
  const patients = [
    patientFictif(1, 'Patiente A', 'female'),
    patientFictif(2, 'Patient B', 'male'),
    patientFictif(3, 'Patiente C', 'female'),
  ];
  const ressources: FhirResource[] = [...patients];

  for (const p of patients) {
    const pid = p.id ?? '';
    ressources.push(
      consentement({
        patientId: pid,
        categorie: 'C-SOINS',
        mode: 'vocal',
        date: '2026-09-26T10:15:00+01:00',
        versionTexte: 'Texte de consentement C-SOINS v0.1 (fr)',
        accepte: true,
        env,
      }),
    );
  }

  const toux = {
    ...conditionDeclaree({
      patientId: 'fictif-patient-0001',
      texte: 'Toux depuis 5 jours (déclaré par la patiente)',
      date: '2026-09-26',
      declarant: 'Patient/fictif-patient-0001',
      env,
    }),
    id: 'fictif-condition-0001',
  };
  ressources.push(
    toux,
    provenanceAgent({
      cibles: ['Condition/fictif-condition-0001'],
      agent: 'Agent 1 — accueil et orientation (assistant IA)',
      date: '2026-09-26T10:20:00+01:00',
      env,
    }),
  );

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    meta: { tag: [MARQUEUR_FICTIF] },
    entry: ressources.map((resource) => ({
      resource,
      request: resource.id
        ? { method: 'PUT', url: `${resource.resourceType}/${resource.id}` }
        : { method: 'POST', url: resource.resourceType },
    })),
  };
}
