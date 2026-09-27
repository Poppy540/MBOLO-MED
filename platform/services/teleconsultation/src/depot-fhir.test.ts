import type { Appointment, Bundle } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { DepotRendezVousFhir } from './depot-fhir.js';

// Données FICTIVES. Faux serveur FHIR : enregistre les requêtes et renvoie des réponses préparées.
const BASE = 'http://fhir.fictif.example/fhir';

function fauxServeur(reponses: Response[]) {
  const requetes: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    requetes.push({ url, init });
    const r = reponses.shift();
    if (!r) throw new Error('réponse non prévue');
    return r;
  }) as typeof globalThis.fetch;
  return { requetes, fetch };
}

const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut });

const rdv = (
  patient = 'fictif-patient-0001',
  praticien = 'fictif-praticien-0001',
): Appointment => ({
  resourceType: 'Appointment',
  id: 'rdv-fictif-1',
  status: 'booked',
  start: '2026-10-01T08:00:00Z',
  end: '2026-10-01T08:20:00Z',
  minutesDuration: 20,
  participant: [
    { actor: { reference: `Patient/${patient}` }, status: 'accepted' },
    { actor: { reference: `Practitioner/${praticien}` }, status: 'accepted' },
  ],
});

describe('DepotRendezVousFhir', () => {
  it('enregistre un Appointment conforme au profil, sans motif, marqué fictif', async () => {
    const s = fauxServeur([json(rdv(), 201)]);
    const depot = new DepotRendezVousFhir(
      { base: BASE, fetch: s.fetch, entetes: async () => ({ authorization: 'Bearer x' }) },
      'dev',
    );
    const r = await depot.ajouter({
      patientId: 'fictif-patient-0001',
      praticienId: 'fictif-praticien-0001',
      debut: '2026-10-01T08:00:00Z',
      dureeMinutes: 20,
      statut: 'prevu',
    });
    expect(r).toMatchObject({ id: 'rdv-fictif-1', statut: 'prevu', dureeMinutes: 20 });
    const envoye = JSON.parse(String(s.requetes[0]?.init.body)) as Appointment;
    expect(s.requetes[0]?.url).toBe(`${BASE}/Appointment`);
    expect(envoye.meta?.tag?.[0]?.code).toBe('fictif');
    expect(envoye.reasonCode).toBeUndefined();
    expect(envoye.comment).toBeUndefined();
  });

  it('un rendez-vous annulé dans le dossier ferme la salle', async () => {
    const s = fauxServeur([json({ ...rdv(), status: 'cancelled' })]);
    const depot = new DepotRendezVousFhir({ base: BASE, fetch: s.fetch }, 'dev');
    expect((await depot.lire('rdv-fictif-1'))?.statut).toBe('annule');
  });

  it('recherche sans cache et écarte un résultat qui ne concerne pas ce patient', async () => {
    const lot: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [{ resource: rdv() }, { resource: { ...rdv('fictif-patient-0002'), id: 'autre' } }],
    };
    const s = fauxServeur([json(lot)]);
    const depot = new DepotRendezVousFhir({ base: BASE, fetch: s.fetch }, 'dev');
    const liste = await depot.pourPatient('fictif-patient-0001');
    expect(liste.map((x) => x.id)).toEqual(['rdv-fictif-1']);
    expect(s.requetes[0]?.url).toContain('Appointment?patient=Patient%2Ffictif-patient-0001');
    expect((s.requetes[0]?.init.headers as Record<string, string>)['cache-control']).toBe(
      'no-cache',
    );
  });

  it('un professionnel inconnu du dossier est refusé (422), sans détail du serveur', async () => {
    const s = fauxServeur([json({ resourceType: 'OperationOutcome' }, 422)]);
    const depot = new DepotRendezVousFhir({ base: BASE, fetch: s.fetch }, 'dev');
    await expect(
      depot.ajouter({
        patientId: 'fictif-patient-0001',
        praticienId: 'inconnu',
        debut: '2026-10-01T08:00:00Z',
        dureeMinutes: 20,
        statut: 'prevu',
      }),
    ).rejects.toMatchObject({ statut: 422, message: 'Rendez-vous refusé par le dossier médical.' });
  });
});

describe('DepotRendezVousFhir — annulation', () => {
  it('annule avec verrou optimiste : auteur codé, date, aucun motif', async () => {
    const lu = { ...rdv(), meta: { versionId: '3' } };
    const s = fauxServeur([json(lu), json({ ...lu, status: 'cancelled' })]);
    const depot = new DepotRendezVousFhir({ base: BASE, fetch: s.fetch }, 'dev');
    await depot.annuler('rdv-fictif-1', 'patient', '2026-09-30T17:00:00.000Z');
    const put = s.requetes[1];
    expect(put?.init.method).toBe('PUT');
    expect((put?.init.headers as Record<string, string>)['if-match']).toBe('W/"3"');
    const envoye = JSON.parse(String(put?.init.body)) as Appointment;
    expect(envoye.status).toBe('cancelled');
    expect(envoye.cancelationReason).toEqual({
      coding: [
        { system: 'https://mbolo-sante.example/fhir/CodeSystem/mbolo-annulation', code: 'patient' },
      ],
    });
    expect(envoye.extension?.[0]?.valueDateTime).toBe('2026-09-30T17:00:00.000Z');
  });

  it('une modification concurrente est refusée (409)', async () => {
    const s = fauxServeur([json({ ...rdv(), meta: { versionId: '3' } }), json({}, 412)]);
    const depot = new DepotRendezVousFhir({ base: BASE, fetch: s.fetch }, 'dev');
    await expect(
      depot.annuler('rdv-fictif-1', 'professionnel', '2026-09-30T17:00:00.000Z'),
    ).rejects.toMatchObject({ statut: 409 });
  });
});
