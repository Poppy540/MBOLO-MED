import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import { AnnuaireMemoire, type Fiche } from './annuaire.js';
import {
  AnnuaireSansComptesCoupes,
  ComptesCoupesFhir,
  ComptesCoupesMemoire,
  ServiceComptesCoupes,
} from './comptes-coupes.js';
import { DepotCreneauxMemoire } from './creneaux.js';
import { IdentitesMemoire } from './identites.js';
import {
  DepotRendezVousMemoire,
  ErreurTeleconsultation,
  ServiceTeleconsultation,
  type FournisseurSalle,
} from './rendez-vous.js';

// Données FICTIVES.
const securite: Utilisateur = { sujet: 'u-s1', roles: ['responsable-securite'] };
const assistance: Utilisateur = { sujet: 'u-a1', roles: ['assistance-patient'] };
const patient: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };
const salle: FournisseurSalle = {
  url: 'ws://livekit.test',
  preparer: async () => undefined,
  jeton: async () => 'jeton-fictif',
  retirer: async () => 0,
};

async function monter() {
  const coupes = new ComptesCoupesMemoire();
  const creneaux = new DepotCreneauxMemoire();
  const fiches = new Map<string, Fiche>([
    ['prac-fictif-001', { nom: 'Dr Test A [FICTIF]' }],
    ['prac-fictif-002', { nom: 'Dr Test B [FICTIF]' }],
  ]);
  const service = new ServiceTeleconsultation(
    new DepotRendezVousMemoire(),
    creneaux,
    salle,
    { estActif: async (nom) => nom !== 'paiement.mobile-money' },
    () => new Date('2026-11-17T03:00:00Z'),
    undefined,
    new AnnuaireSansComptesCoupes(new AnnuaireMemoire(fiches), coupes),
    new IdentitesMemoire(new Map([['pat-fictif-001', 'verifiee']])),
  );
  const [a, b] = await creneaux.publier('prac-fictif-002', [
    { debut: '2026-11-18T08:00:00Z', dureeMinutes: 20 },
    { debut: '2026-11-19T08:00:00Z', dureeMinutes: 20 },
  ]);
  if (!a || !b) throw new Error('créneaux non publiés');
  const r = await service.demander(patient, { creneauId: a.id });
  const gestion = new ServiceComptesCoupes(coupes, () => new Date('2026-11-17T03:15:00Z'));
  return { service, gestion, coupes, r, libre: b };
}

describe('compte coupé par le responsable sécurité (plan d’incident, E5)', () => {
  it('retire le professionnel de l’annuaire, refuse les réservations, met ses rendez-vous à reprendre', async () => {
    const { service, gestion, coupes, r, libre } = await monter();
    expect(await service.rendezVousAReprendre(assistance)).toEqual([]);
    expect((await service.praticiens(patient)).map((p) => p.id)).toContain('prac-fictif-002');

    expect(await gestion.couper(securite, 'prac-fictif-002')).toBe(true);
    expect(await gestion.couper(securite, 'prac-fictif-002')).toBe(false);
    expect(coupes.marques).toHaveLength(1);

    expect((await service.praticiens(patient)).map((p) => p.id)).not.toContain('prac-fictif-002');
    await expect(service.demander(patient, { creneauId: libre.id })).rejects.toBeInstanceOf(
      ErreurTeleconsultation,
    );
    expect(await service.rendezVousAReprendre(assistance)).toEqual([
      { rendezVousId: r.id, debut: r.debut, statut: 'prevu', patientId: 'pat-fictif-001' },
    ]);

    // Rétablissement : marque levée (jamais supprimée), tout revient.
    expect(await gestion.retablir(securite, 'prac-fictif-002')).toBe(true);
    expect(await gestion.retablir(securite, 'prac-fictif-002')).toBe(false);
    expect(coupes.marques[0]).toMatchObject({
      status: 'inactive',
      period: { end: '2026-11-17T03:15:00.000Z' },
    });
    expect((await service.praticiens(patient)).map((p) => p.id)).toContain('prac-fictif-002');
    expect(await service.rendezVousAReprendre(assistance)).toEqual([]);
  });

  it('réservé au responsable sécurité, jamais à un agent IA (403)', async () => {
    const { gestion } = await monter();
    for (const u of [
      patient,
      assistance,
      { sujet: 'u-m1', roles: ['professionnel'], practitionerId: 'prac-fictif-001' },
      { sujet: 'u-ia', roles: ['responsable-securite', 'agent-ia'] },
    ] as Utilisateur[]) {
      await expect(gestion.couper(u, 'prac-fictif-002')).rejects.toMatchObject({ statut: 403 });
      await expect(gestion.retablir(u, 'prac-fictif-002')).rejects.toMatchObject({ statut: 403 });
    }
  });
});

describe('ComptesCoupesFhir', () => {
  it('cherche les marques actives sans cache, crée une marque, puis la lève par PUT versionné', async () => {
    const appels: {
      url: string;
      methode: string;
      corps?: string;
      entetes: Record<string, string>;
    }[] = [];
    const reponses: Response[] = [
      new Response(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', entry: [] })),
      new Response(null, { status: 201 }),
    ];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      appels.push({
        url: String(url),
        methode: init?.method ?? 'GET',
        ...(typeof init?.body === 'string' ? { corps: init.body } : {}),
        entetes: (init?.headers ?? {}) as Record<string, string>,
      });
      const r = reponses.shift();
      if (!r) throw new TypeError('fetch failed');
      return r;
    }) as typeof fetch;
    const depot = new ComptesCoupesFhir({ base: 'http://fhir.test/fhir', fetch: f }, 'dev');
    expect(await depot.couper('prac-fictif-002', '2026-11-17T03:15:00Z')).toBe(true);
    // Ni `code` ni `status` : FHIR R4 ne cherche pas un Flag par ces paramètres.
    expect(decodeURIComponent(appels[0]?.url ?? '')).toContain(
      '/Flag?subject=Practitioner/prac-fictif-002&_count=50',
    );
    expect(appels[0]?.entetes['cache-control']).toBe('no-cache');
    expect(appels[1]).toMatchObject({ url: 'http://fhir.test/fhir/Flag', methode: 'POST' });
    expect(JSON.parse(appels[1]?.corps ?? '{}')).toMatchObject({
      resourceType: 'Flag',
      status: 'active',
    });

    const marque = { ...JSON.parse(appels[1]?.corps ?? '{}'), id: 'f1', meta: { versionId: '1' } };
    reponses.push(
      new Response(
        JSON.stringify({
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: marque }],
        }),
      ),
      new Response(null, { status: 200 }),
    );
    expect(await depot.retablir('prac-fictif-002', '2026-11-17T10:00:00Z')).toBe(true);
    expect(appels[3]).toMatchObject({ url: 'http://fhir.test/fhir/Flag/f1', methode: 'PUT' });
    expect(appels[3]?.entetes['if-match']).toBe('W/"1"');
    expect(JSON.parse(appels[3]?.corps ?? '{}')).toMatchObject({ status: 'inactive' });
  });
});
