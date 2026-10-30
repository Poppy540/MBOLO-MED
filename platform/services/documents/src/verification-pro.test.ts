// Vérification des professionnels par une personne habilitée (ADR-0026, étape 4).
// Données FICTIVES uniquement.
import {
  declarationPraticien,
  praticien,
  praticienVerifie,
  statutVerification,
} from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DepotCandidaturesMemoire, ServiceCandidature } from './candidature.js';
import { CleMaitreLocale } from './chiffrement.js';
import { ConditionsMemoire } from './conditions.js';
import { DepotMemoire } from './depot.js';
import { DossierMemoire, FichesMemoire } from './dossier.js';
import { passerEcheances } from './echeances.js';
import { creerServeur } from './serveur.js';
import { ServiceDocuments } from './service.js';
import { StockageMemoire } from './stockage.js';
import {
  DepotDecisionsProMemoire,
  ServiceVerificationPro,
  type Controle,
} from './verification-pro.js';
import { ServiceVerification } from './verification.js';
import { ServiceVerificateur } from './verificateur.js';

const CANDIDAT = 'prac-candidat-001';
const COMPTES: Record<string, Utilisateur> = {
  verificateur: { sujet: 'sujet-verificateur-fictif', roles: ['verification-professionnels'] },
  // A les deux rôles, et a recruté le candidat : ne peut pas le vérifier.
  recruteur: {
    sujet: 'sujet-recruteur-fictif',
    roles: ['recrutement', 'verification-professionnels'],
  },
  candidat: { sujet: 'u-c1', roles: ['professionnel-candidat'], practitionerId: CANDIDAT },
  // Personne habilitée qui est elle-même ce candidat (cas absurde, refusé quand même).
  luiMeme: {
    sujet: 'u-c2',
    roles: ['verification-professionnels'],
    practitionerId: CANDIDAT,
  },
  identite: { sujet: 'u-vi', roles: ['verification-identite'] },
  agent: {
    sujet: 'u-agent',
    roles: ['verification-professionnels', 'agent-ia'],
    agent: { nom: 'agent-03-recrutement', patientSession: 'aucune' },
  },
};
const VERSION = 'c-verification-pro-v0.1';
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(300)]);
const CONTROLES: Controle[] = (['identite', 'diplome', 'inscription', 'specialite'] as const).map(
  (point) => ({ point, source: 'registre-ordre', consulteLe: '2026-10-28', conforme: true }),
);
const statutDe = (f: FichesMemoire) => {
  const fiche = f.fiches.get(CANDIDAT);
  return fiche && statutVerification(fiche);
};
const VALIDITE = { debut: '2026-10-01', fin: '2027-10-01' };

async function monter(o: { invitationsEnPanne?: boolean } = {}) {
  const horloge = { maintenant: new Date('2026-10-28T09:00:00Z') };
  const stockage = new StockageMemoire();
  const maitre = new CleMaitreLocale(randomBytes(32).toString('base64'));
  const pieces = new DepotCandidaturesMemoire();
  const fiches = new FichesMemoire(
    new Map([
      [
        CANDIDAT,
        {
          ...praticien({ nom: 'Fictif', prenom: 'Amina', statut: 'a-verifier', env: 'dev' }),
          ...declarationPraticien({
            specialite: 'pediatrie',
            paysOrdre: 'GA',
            numeroOrdre: 'FICTIF-ORDRE-0004',
            langues: ['fr'],
          }),
        },
      ],
    ]),
  );
  const candidature = new ServiceCandidature(
    pieces,
    stockage,
    maitre,
    fiches,
    {
      versionCharte: VERSION,
      conservationJours: 730,
      maxParType: 2,
      specialites: ['pediatrie'],
      langues: ['fr'],
    },
    () => horloge.maintenant,
  );
  const candidat = COMPTES['candidat'] as Utilisateur;
  await candidature.deciderCharte(candidat, { version: VERSION, accepte: true });
  const diplome = jpeg();
  await candidature.deposer(candidat, 'diplome', diplome);
  await candidature.deposer(candidat, 'inscription-ordre', jpeg());
  await candidature.deposer(candidat, 'piece-identite', jpeg());
  const decisions = new DepotDecisionsProMemoire(pieces);
  const service = new ServiceVerificationPro(
    decisions,
    pieces,
    stockage,
    maitre,
    fiches,
    {
      de: async (id) => {
        if (o.invitationsEnPanne) throw new Error('injoignable');
        return id === CANDIDAT ? ['sujet-recruteur-fictif'] : [];
      },
    },
    'dev',
    () => horloge.maintenant,
  );
  const lignes: string[] = [];
  const depot = new DepotMemoire();
  const documents = new ServiceDocuments(depot, stockage, maitre, {
    conservationJours: 90,
    maxParType: 2,
  });
  const app = await creerServeur({
    verifierJeton: async (j) => {
      const u = COMPTES[j];
      if (!u) throw new Error('jeton invalide');
      return u;
    },
    verification: new ServiceVerification(
      documents,
      new ConditionsMemoire(),
      { estActif: async () => false },
      '0.1',
    ),
    verificateur: new ServiceVerificateur(documents, depot, new DossierMemoire(), {
      systemes: {
        'assurance-maladie': 'https://mbolo-sante.example/fhir/identifiant/xx/assurance-maladie',
        provisoire: 'https://mbolo-sante.example/fhir/identifiant/xx/provisoire',
      },
      env: 'dev',
    }),
    verificationPro: service,
    journal: creerJournal({ service: 'documents', ecrire: (l) => lignes.push(l) }),
  });
  const appel = (methode: 'GET' | 'POST', url: string, compte?: string, corps?: object) =>
    app.inject({
      method: methode,
      url,
      headers: compte ? { authorization: `Bearer ${compte}` } : {},
      ...(corps ? { payload: corps } : {}),
    });
  const decider = (corps: object, compte = 'verificateur') =>
    appel('POST', `/professionnels/${CANDIDAT}/decision`, compte, corps);
  return {
    app,
    service,
    fiches,
    pieces,
    decisions,
    stockage,
    horloge,
    diplome,
    lignes,
    appel,
    decider,
  };
}

describe('vérification des professionnels (ADR-0026, étape 4)', () => {
  it('la personne habilitée consulte (tracé avant affichage) puis vérifie : fiche activée', async () => {
    const m = await monter();
    const liste = (await m.appel('GET', '/professionnels/a-verifier', 'verificateur')).json<{
      candidats: { practitionerId: string }[];
    }>();
    expect(liste.candidats.map((c) => c.practitionerId)).toEqual([CANDIDAT]);

    const r = await m.appel('GET', `/professionnels/${CANDIDAT}`, 'verificateur');
    expect(r.statusCode).toBe(200);
    const dossier = r.json<{
      nom: string;
      declaration: { numeroOrdre: string };
      pieces: { id: string; type: string }[];
    }>();
    expect(dossier.nom).toBe('Fictif');
    expect(dossier.declaration.numeroOrdre).toBe('FICTIF-ORDRE-0004');
    expect(dossier.declaration).toMatchObject({ specialiteLibelle: 'Pédiatrie' });
    expect(dossier.pieces.map((p) => p.type).sort()).toEqual([
      'diplome',
      'inscription-ordre',
      'piece-identite',
    ]);
    const diplome = dossier.pieces.find((p) => p.type === 'diplome');
    const photo = await m.appel(
      'GET',
      `/professionnels/${CANDIDAT}/pieces/${diplome?.id ?? ''}`,
      'verificateur',
    );
    expect(photo.statusCode).toBe(200);
    expect(photo.headers['cache-control']).toBe('no-store');
    expect(photo.rawPayload).toEqual(m.diplome);
    // Une trace par consultation, au nom du sujet technique, sur la fiche du candidat.
    expect(m.fiches.traces.map((t) => t.entity?.[0]?.detail?.[0]?.valueString)).toEqual([
      'dossier',
      'diplome',
    ]);

    const d = await m.decider({ resultat: 'verifie', controles: CONTROLES, validite: VALIDITE });
    expect(d.statusCode).toBe(200);
    const fiche = m.fiches.fiches.get(CANDIDAT);
    expect(fiche && praticienVerifie(fiche, m.horloge.maintenant)).toBe(true);
    expect(fiche?.qualification?.[0]?.period).toEqual({ start: '2026-10-01', end: '2027-10-01' });
    expect(m.decisions.decisions).toEqual([
      expect.objectContaining({
        resultat: 'verifie',
        verificateur: 'sujet-verificateur-fictif',
        finValidite: '2027-10-01',
      }),
    ]);
    expect(m.fiches.traces.at(-1)?.action).toBe('U');
    // Plus rien à décider : la liste se vide, une seconde décision est refusée.
    expect((await m.appel('GET', '/professionnels/a-verifier', 'verificateur')).json()).toEqual({
      candidats: [],
    });
    expect(
      (await m.decider({ resultat: 'refuse', motif: 'pieces-non-conformes', controles: [] }))
        .statusCode,
    ).toBe(409);
    // Journal : jamais le nom ni le numéro d'inscription.
    expect(m.lignes.join('\n')).not.toMatch(/Amina|FICTIF-ORDRE-0004/);
  });

  it('séparation des tâches : le recruteur du candidat ne voit ni ne décide rien (403)', async () => {
    const m = await monter();
    const diplome = (await m.pieces.piecesDe(CANDIDAT))[0];
    expect((await m.appel('GET', `/professionnels/${CANDIDAT}`, 'recruteur')).statusCode).toBe(403);
    expect(
      (await m.appel('GET', `/professionnels/${CANDIDAT}/pieces/${diplome?.id ?? ''}`, 'recruteur'))
        .statusCode,
    ).toBe(403);
    const d = await m.decider(
      { resultat: 'verifie', controles: CONTROLES, validite: VALIDITE },
      'recruteur',
    );
    expect(d.statusCode).toBe(403);
    expect(d.json()).toMatchObject({ erreur: expect.stringContaining('recruté') });
    expect(m.fiches.traces).toHaveLength(0);
    expect(statutDe(m.fiches)).toBe('a-verifier');
  });

  it('service invitations injoignable : 503, rien de montré ni de tracé', async () => {
    const m = await monter({ invitationsEnPanne: true });
    expect((await m.appel('GET', `/professionnels/${CANDIDAT}`, 'verificateur')).statusCode).toBe(
      503,
    );
    expect(m.fiches.traces).toHaveLength(0);
  });

  it('refuse tout autre compte : candidat, vérification d’identité, agent IA, lui-même, sans jeton', async () => {
    const m = await monter();
    for (const compte of ['candidat', 'identite', 'agent', 'luiMeme']) {
      expect((await m.appel('GET', '/professionnels/a-verifier', compte)).statusCode).toBe(
        compte === 'luiMeme' ? 200 : 403,
      );
      expect((await m.appel('GET', `/professionnels/${CANDIDAT}`, compte)).statusCode).toBe(403);
      expect(
        (await m.decider({ resultat: 'verifie', controles: CONTROLES, validite: VALIDITE }, compte))
          .statusCode,
      ).toBe(403);
    }
    // Sa propre fiche n'apparaît jamais dans sa liste.
    expect((await m.appel('GET', '/professionnels/a-verifier', 'luiMeme')).json()).toEqual({
      candidats: [],
    });
    expect((await m.appel('GET', '/professionnels/a-verifier')).statusCode).toBe(401);
    expect(m.fiches.traces).toHaveLength(0);
  });

  it('« vérifié » exige les quatre points conformes et une validité en cours (422)', async () => {
    const m = await monter();
    const sansSpecialite = CONTROLES.filter((c) => c.point !== 'specialite');
    const nonConforme = CONTROLES.map((c) =>
      c.point === 'diplome' ? { ...c, conforme: false } : c,
    );
    for (const corps of [
      { resultat: 'verifie', controles: sansSpecialite, validite: VALIDITE },
      { resultat: 'verifie', controles: nonConforme, validite: VALIDITE },
      {
        resultat: 'verifie',
        controles: CONTROLES,
        validite: { debut: '2025-01-01', fin: '2026-01-01' },
      },
      // Plus d'un an : on revérifie au moins chaque année (décision du 2026-10-29).
      {
        resultat: 'verifie',
        controles: CONTROLES,
        validite: { debut: '2026-10-01', fin: '2027-10-29' },
      },
      { resultat: 'verifie', controles: CONTROLES },
      { resultat: 'refuse', controles: CONTROLES },
      { resultat: 'a-completer', controles: CONTROLES },
      {
        resultat: 'verifie',
        controles: CONTROLES.map((c) => ({ ...c, consulteLe: '2026-12-01' })),
        validite: VALIDITE,
      },
    ]) {
      expect((await m.decider(corps)).statusCode).toBe(422);
    }
    // Aucun texte libre : un champ inconnu ou une source hors liste est refusé par le schéma.
    expect(
      (await m.decider({ resultat: 'refuse', motif: 'autre', controles: [] })).statusCode,
    ).toBe(400);
    expect(
      (
        await m.decider({
          resultat: 'refuse',
          motif: 'pieces-non-conformes',
          controles: [],
          commentaire: 'texte libre',
        })
      ).statusCode,
    ).toBe(400);
    expect(m.decisions.decisions).toHaveLength(0);
    expect(m.fiches.fiches.get(CANDIDAT)?.active).toBe(false);
  });

  it('refus : fiche « refusée », inactive, motif codé gardé', async () => {
    const m = await monter();
    const d = await m.decider({
      resultat: 'refuse',
      motif: 'inscription-introuvable',
      controles: [CONTROLES[2] as Controle],
    });
    expect(d.statusCode).toBe(200);
    const fiche = m.fiches.fiches.get(CANDIDAT);
    expect(fiche?.active).toBe(false);
    expect(fiche && statutVerification(fiche)).toBe('refuse');
    expect(m.decisions.decisions[0]).toMatchObject({ motif: 'inscription-introuvable' });
  });

  it('à compléter : pièces à refaire effacées, fiche toujours à vérifier', async () => {
    const m = await monter();
    const [avant] = (await m.pieces.piecesDe(CANDIDAT)).filter((p) => p.type === 'diplome');
    const d = await m.decider({
      resultat: 'a-completer',
      controles: [],
      piecesARefaire: ['diplome'],
    });
    expect(d.statusCode).toBe(200);
    expect((await m.pieces.piecesDe(CANDIDAT)).map((p) => p.type)).not.toContain('diplome');
    expect(await m.stockage.lire(avant?.id ?? '')).toBeUndefined();
    expect(statutDe(m.fiches)).toBe('a-verifier');
  });

  it('une décision arrivée entre-temps n’est jamais écrasée (409)', async () => {
    const m = await monter();
    const lire = m.fiches.lire.bind(m.fiches);
    m.fiches.lire = async (id) => {
      const lue = await lire(id);
      const fiche = m.fiches.fiches.get(id);
      if (fiche) m.fiches.changer(id, { ...fiche });
      return lue;
    };
    const d = await m.decider({ resultat: 'verifie', controles: CONTROLES, validite: VALIDITE });
    expect(d.statusCode).toBe(409);
    expect(m.fiches.fiches.get(CANDIDAT)?.active).toBe(false);
    expect(m.decisions.decisions).toHaveLength(0);
  });

  it('validité d’exactement un an : acceptée', async () => {
    const m = await monter();
    const d = await m.decider({
      resultat: 'verifie',
      controles: CONTROLES,
      validite: { debut: '2026-10-01', fin: '2027-10-28' },
    });
    expect(d.statusCode).toBe(200);
  });

  it('trace impossible : rien n’est montré', async () => {
    const m = await monter();
    m.fiches.tracer = async () => {
      throw new Error('dossier indisponible');
    };
    const r = await m.appel('GET', `/professionnels/${CANDIDAT}`, 'verificateur');
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain('FICTIF-ORDRE-0004');
  });
});

describe('suspension d’un professionnel vérifié (ADR-0026, étape 5)', () => {
  const verifier = async (m: Awaited<ReturnType<typeof monter>>) =>
    expect(
      (await m.decider({ resultat: 'verifie', controles: CONTROLES, validite: VALIDITE }))
        .statusCode,
    ).toBe(200);
  const suspendre = (m: Awaited<ReturnType<typeof monter>>, compte: string, motif: string) =>
    m.appel('POST', `/professionnels/${CANDIDAT}/suspension`, compte, { motif });

  it('suspendu : fiche inactive à l’instant, de retour dans la liste, réactivée par une nouvelle vérification', async () => {
    const m = await monter();
    await verifier(m);
    m.horloge.maintenant = new Date('2026-11-02T09:00:00Z');
    const r = await suspendre(m, 'verificateur', 'signalement-ordre');
    expect(r.statusCode).toBe(200);
    const fiche = m.fiches.fiches.get(CANDIDAT);
    expect(fiche?.active).toBe(false);
    expect(fiche && statutVerification(fiche)).toBe('suspendu');
    expect(fiche && praticienVerifie(fiche, m.horloge.maintenant)).toBe(false);
    // La déclaration et la validité passée restent : rien n'est effacé par une suspension.
    expect(fiche?.qualification?.[0]?.period?.end).toBe('2027-10-01');
    expect(m.fiches.traces.at(-1)?.entity?.[0]?.detail?.[0]?.valueString).toBe('suspension');
    expect(m.decisions.decisions.at(-1)).toMatchObject({
      resultat: 'suspendu',
      motif: 'signalement-ordre',
      controles: [],
    });

    // Elle revient dans la liste ; seule une vérification complète la réactive.
    const liste = (await m.appel('GET', '/professionnels/a-verifier', 'verificateur')).json<{
      candidats: { practitionerId: string }[];
    }>();
    expect(liste.candidats.map((c) => c.practitionerId)).toEqual([CANDIDAT]);
    const dossier = (await m.appel('GET', `/professionnels/${CANDIDAT}`, 'verificateur')).json<{
      statut: string;
      decisions: { resultat: string; motif?: string }[];
    }>();
    expect(dossier.statut).toBe('suspendu');
    expect(dossier.decisions[0]).toMatchObject({
      resultat: 'suspendu',
      motif: 'signalement-ordre',
    });
    // « À compléter » laisse la fiche suspendue et dans la liste.
    expect(
      (await m.decider({ resultat: 'a-completer', controles: [], piecesARefaire: ['diplome'] }))
        .statusCode,
    ).toBe(200);
    expect(statutDe(m.fiches)).toBe('suspendu');
    expect(
      (await m.appel('GET', '/professionnels/a-verifier', 'verificateur'))
        .json<{ candidats: { practitionerId: string }[] }>()
        .candidats.map((c) => c.practitionerId),
    ).toEqual([CANDIDAT]);
  });

  it('une suspension ne dépend pas du service invitations', async () => {
    const m = await monter({ invitationsEnPanne: true });
    m.fiches.changer(CANDIDAT, {
      ...(m.fiches.fiches.get(CANDIDAT) ?? {}),
      ...praticien({ nom: 'Fictif', prenom: 'Amina', statut: 'verifie', env: 'dev' }),
    });
    expect((await suspendre(m, 'verificateur', 'plainte-confirmee')).statusCode).toBe(200);
    expect(statutDe(m.fiches)).toBe('suspendu');
  });

  it('refuse : fiche non vérifiée (409), motif hors liste ou texte libre (400), autres comptes (403)', async () => {
    const m = await monter();
    expect((await suspendre(m, 'verificateur', 'signalement-ordre')).statusCode).toBe(409);
    await verifier(m);
    expect((await suspendre(m, 'verificateur', 'autre')).statusCode).toBe(400);
    expect(
      (
        await m.appel('POST', `/professionnels/${CANDIDAT}/suspension`, 'verificateur', {
          motif: 'plainte-confirmee',
          commentaire: 'texte libre',
        })
      ).statusCode,
    ).toBe(400);
    for (const compte of ['candidat', 'identite', 'agent', 'luiMeme']) {
      expect((await suspendre(m, compte, 'signalement-ordre')).statusCode).toBe(403);
    }
    expect((await suspendre(m, '', 'signalement-ordre')).statusCode).toBe(401);
    expect(statutDe(m.fiches)).toBe('verifie');
    // Une fois suspendue, une seconde suspension est refusée.
    expect((await suspendre(m, 'verificateur', 'incident-qualite-confirme')).statusCode).toBe(200);
    expect((await suspendre(m, 'verificateur', 'signalement-ordre')).statusCode).toBe(409);
  });
});

describe('échéances des professionnels vérifiés (ADR-0026, étape 5)', () => {
  const verifier = async (m: Awaited<ReturnType<typeof monter>>) =>
    expect(
      (await m.decider({ resultat: 'verifie', controles: CONTROLES, validite: VALIDITE }))
        .statusCode,
    ).toBe(200);

  it('rappels à 30, 7 et 1 jours, puis fiche remise « à vérifier » à l’échéance, une seule fois', async () => {
    const m = await monter();
    await verifier(m);
    const passer = async (jour: string) => {
      m.horloge.maintenant = new Date(`${jour}T03:00:00Z`);
      return m.service.echeances();
    };
    expect(await passer('2027-08-01')).toEqual({ rappels: [], echues: [] });
    for (const [jour, jours] of [
      ['2027-09-01', 30],
      ['2027-09-24', 7],
      ['2027-09-30', 1],
    ] as const) {
      expect(await passer(jour)).toEqual({
        rappels: [{ practitionerId: CANDIDAT, jours }],
        echues: [],
      });
    }
    // Dernier jour de validité : encore vérifié, aucun rappel.
    expect(await passer('2027-10-01')).toEqual({ rappels: [], echues: [] });
    expect(statutDe(m.fiches)).toBe('verifie');

    expect(await passer('2027-10-02')).toEqual({ rappels: [], echues: [CANDIDAT] });
    const fiche = m.fiches.fiches.get(CANDIDAT);
    expect(fiche?.active).toBe(false);
    expect(fiche && statutVerification(fiche)).toBe('a-verifier');
    expect(m.fiches.traces.at(-1)).toMatchObject({
      action: 'U',
      agent: [{ who: { identifier: { value: 'plateforme' } } }],
    });
    expect(m.decisions.decisions.at(-1)).toMatchObject({
      resultat: 'echeance',
      verificateur: 'plateforme',
    });
    // De retour dans la liste ; le passage suivant ne refait rien.
    expect(
      (await m.appel('GET', '/professionnels/a-verifier', 'verificateur'))
        .json<{ candidats: { practitionerId: string }[] }>()
        .candidats.map((c) => c.practitionerId),
    ).toEqual([CANDIDAT]);
    expect(await passer('2027-10-03')).toEqual({ rappels: [], echues: [] });
    // Une nouvelle vérification complète le réactive.
    expect(
      (
        await m.decider({
          resultat: 'verifie',
          controles: CONTROLES.map((c) => ({ ...c, consulteLe: '2027-10-03' })),
          validite: { debut: '2027-10-01', fin: '2028-10-01' },
        })
      ).statusCode,
    ).toBe(200);
    expect(statutDe(m.fiches)).toBe('verifie');
    expect(await passer('2027-10-04')).toEqual({ rappels: [], echues: [] });
  });

  it('un professionnel suspendu n’est ni rappelé ni remis « à vérifier » par l’échéance', async () => {
    const m = await monter();
    await verifier(m);
    expect(
      (
        await m.appel('POST', `/professionnels/${CANDIDAT}/suspension`, 'verificateur', {
          motif: 'signalement-ordre',
        })
      ).statusCode,
    ).toBe(200);
    m.horloge.maintenant = new Date('2027-10-02T03:00:00Z');
    expect(await m.service.echeances()).toEqual({ rappels: [], echues: [] });
    expect(statutDe(m.fiches)).toBe('suspendu');
  });

  it('alertes au rôle de vérification, avec la fiche opaque et jamais le nom', async () => {
    const m = await monter();
    await verifier(m);
    const lignes: string[] = [];
    const journal = creerJournal({ service: 'documents', ecrire: (l) => lignes.push(l) });
    m.horloge.maintenant = new Date('2027-09-01T03:00:00Z');
    await passerEcheances(m.service, journal);
    m.horloge.maintenant = new Date('2027-10-02T03:00:00Z');
    await passerEcheances(m.service, journal);
    const alertes = lignes.map(
      (l) => (JSON.parse(l) as { contexte?: Record<string, unknown> }).contexte,
    );
    expect(alertes).toEqual([
      expect.objectContaining({
        alerte: 'professionnel-echeance',
        practitionerId: CANDIDAT,
        jours: 30,
      }),
      expect.objectContaining({ alerte: 'professionnel-echu', practitionerId: CANDIDAT }),
    ]);
    expect(lignes.join('\n')).not.toMatch(/Amina|FICTIF-ORDRE-0004/);
    // Une erreur est journalisée, jamais lancée.
    lignes.length = 0;
    await passerEcheances(
      {
        echeances: async () => {
          throw new Error('dossier indisponible');
        },
      },
      journal,
    );
    expect(lignes.join('\n')).toContain('passage des échéances des professionnels impossible');
  });
});
