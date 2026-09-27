// Jeu de données 100 % FICTIF, marqué meta.tag = fictif. Aucune personne réelle.
// Sert au développement local (chargement dans HAPI FHIR) et aux tests.
import type { Bundle, FhirResource, Patient } from 'fhir/r4.js';
import { MARQUEUR_FICTIF, PROFILS, SYSTEMES } from './constantes.js';
import { conditionDeclaree, consentement, provenanceAgent } from './construire.js';

function patientFictif(numero: number, prenom: string, genre: Patient['gender']): Patient {
  const id = `fictif-patient-${String(numero).padStart(4, '0')}`;
  return {
    resourceType: 'Patient',
    id,
    meta: { profile: [PROFILS.patient], tag: [MARQUEUR_FICTIF] },
    identifier: [
      { system: SYSTEMES.identifiantPatient, value: `FICTIF-${String(numero).padStart(4, '0')}` },
    ],
    name: [{ family: 'Test', given: [prenom] }],
    ...(genre ? { gender: genre } : {}),
    telecom: [{ system: 'phone', value: '+241 00 00 00 00' }],
  };
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
