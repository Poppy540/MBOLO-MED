// Étapes « ordonnances électroniques » (ADR-0018) : prescription par le médecin du rendez-vous via
// le service consultation, vérification dans le dossier FHIR de test. Données FICTIVES uniquement.
import { expect } from '@playwright/test';
import { CONSULTATION_URL, FHIR_URL } from '../configuration.js';
import { Then, When, type Monde } from './fixtures.js';

const ATC = 'http://www.whocc.no/atc';

/** Champs lus d'une MedicationRequest (sans dépendre des types FHIR dans ce paquet de tests). */
interface Ligne {
  status: string;
  requester?: { reference?: string };
  note?: unknown[];
  dosageInstruction?: { text?: string; patientInstruction?: string }[];
  medicationCodeableConcept?: { coding?: { system?: string; code?: string }[] };
}

async function appeler(
  monde: Monde,
  methode: 'GET' | 'POST',
  chemin: string,
  jeton: string | undefined,
  corps?: unknown,
): Promise<void> {
  const r = await fetch(`${CONSULTATION_URL}${chemin}`, {
    method: methode,
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

async function lignes(numero: string): Promise<Ligne[]> {
  const r = await fetch(
    `${FHIR_URL}/MedicationRequest?identifier=${encodeURIComponent(
      `https://mbolo-sante.example/fhir/identifiant-ordonnance|${numero}`,
    )}`,
    { headers: { 'cache-control': 'no-cache' } },
  );
  expect(r.status).toBe(200);
  const b = (await r.json()) as { entry?: { resource: Ligne }[] };
  return (b.entry ?? []).map((e) => e.resource);
}

When(
  '{string} prescrit du paracétamol 500 mg 3 fois par jour pendant 5 jours pour ce rendez-vous',
  async ({ monde }, identifiant: string) => {
    await appeler(
      monde,
      'POST',
      `/rendez-vous/${monde.rendezVousId ?? ''}/ordonnance`,
      monde.jetons.get(identifiant),
      {
        lignes: [
          {
            medicament: { systeme: ATC, code: 'N02BE01', libelle: 'paracétamol' },
            dose: { valeur: 500, unite: 'mg' },
            frequence: { fois: 3, periode: 1, unite: 'd' },
            dureeJours: 5,
          },
        ],
      },
    );
    if (monde.reponse?.statut === 201) monde.ordonnance = String(monde.reponse.corps['numero']);
  },
);

Then(
  "l'ordonnance est enregistrée dans le dossier, prescrite par {string}, sans texte libre",
  async ({ monde }, praticien: string) => {
    expect(monde.reponse?.statut).toBe(201);
    expect(monde.reponse?.corps).toMatchObject({ statut: 'active', lignes: [{ dureeJours: 5 }] });
    const [l] = await lignes(monde.ordonnance ?? '');
    expect(l?.status).toBe('active');
    expect(l?.requester?.reference).toBe(`Practitioner/${praticien}`);
    expect(l?.medicationCodeableConcept?.coding?.[0]).toMatchObject({
      system: ATC,
      code: 'N02BE01',
    });
    expect(l?.note).toBeUndefined();
    expect(l?.dosageInstruction?.[0]?.text).toBeUndefined();
    expect(l?.dosageInstruction?.[0]?.patientInstruction).toBeUndefined();
  },
);

When('{string} révoque cette ordonnance', async ({ monde }, identifiant: string) => {
  await appeler(
    monde,
    'POST',
    `/ordonnances/${monde.ordonnance ?? 'ORD-000000000000'}/revocation`,
    monde.jetons.get(identifiant),
  );
});

Then('le dossier médical indique que cette ordonnance est révoquée', async ({ monde }) => {
  expect(monde.reponse?.statut).toBe(200);
  expect(monde.reponse?.corps['statut']).toBe('revoquee');
  expect((await lignes(monde.ordonnance ?? '')).map((l) => l.status)).toEqual(['cancelled']);
});

Then('la prescription est refusée', ({ monde }) => {
  // 401 : jeton sans accès à l'API de consultation (patient) ; 403 : accès au dossier refusé.
  expect([401, 403]).toContain(monde.reponse?.statut);
  expect(monde.ordonnance).toBeUndefined();
});

Then('la révocation est refusée', async ({ monde }) => {
  expect([401, 403, 404]).toContain(monde.reponse?.statut);
  expect((await lignes(monde.ordonnance ?? '')).map((l) => l.status)).toEqual(['active']);
});
