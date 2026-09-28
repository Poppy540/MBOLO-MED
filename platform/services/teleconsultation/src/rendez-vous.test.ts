import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import { AnnuaireMemoire, versFiche } from './annuaire.js';
import { DepotCreneauxMemoire } from './creneaux.js';
import { IdentitesMemoire } from './identites.js';
import {
  DepotRendezVousMemoire,
  ErreurTeleconsultation,
  ServiceTeleconsultation,
  type FournisseurSalle,
} from './rendez-vous.js';

// Données FICTIVES.
const patient: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };
const autrePatient: Utilisateur = {
  sujet: 'u-p2',
  roles: ['patient'],
  patientId: 'pat-fictif-002',
};
const medecin: Utilisateur = {
  sujet: 'u-m1',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-001',
};
const autreMedecin: Utilisateur = {
  sujet: 'u-m2',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-002',
};
const pharmacien: Utilisateur = { sujet: 'u-ph', roles: ['pharmacien'] };

const salles = () => {
  const jetons: { salle: string; identite: string; nomAffiche: string }[] = [];
  const preparees: string[] = [];
  const f: FournisseurSalle = {
    url: 'ws://livekit.test',
    preparer: async (nom) => {
      preparees.push(nom);
    },
    jeton: async (j) => {
      jetons.push(j);
      return `jeton-${j.identite}`;
    },
  };
  return { f, jetons, preparees };
};

const DEBUT = '2026-09-27T10:00:00.000Z';

/** [FICTIF] Identités vérifiées des patients de test (ADR-0014). */
const identitesVerifiees = () =>
  new IdentitesMemoire(
    new Map([
      ['pat-fictif-001', 'verifiee'],
      ['pat-fictif-002', 'verifiee'],
    ]),
  );

/** Service monté avec une horloge réglable et un créneau libre de prac-fictif-001 à DEBUT. */
async function monter(heure = '2026-09-27T09:00:00Z') {
  const s = salles();
  const depot = new DepotRendezVousMemoire();
  const creneaux = new DepotCreneauxMemoire();
  const etat = { heure, actif: true };
  const notifications: { destinataire: string; evenement: string; instant: string }[] = [];
  const service = new ServiceTeleconsultation(
    depot,
    creneaux,
    s.f,
    { estActif: async (nom) => nom !== 'paiement.mobile-money' && etat.actif },
    () => new Date(etat.heure),
    {
      prevenir: async (destinataire, evenement, instant) => {
        notifications.push({ destinataire, evenement, instant });
      },
    },
    undefined,
    identitesVerifiees(),
  );
  const [c] = await creneaux.publier('prac-fictif-001', [{ debut: DEBUT, dureeMinutes: 20 }]);
  if (!c) throw new Error('créneau non publié');
  return { service, s, depot, creneaux, c, etat, notifications };
}

describe('identité vérifiée avant toute réservation (ADR-0014)', () => {
  const autre = (statut?: 'a-verifier' | 'refusee') =>
    new ServiceTeleconsultation(
      new DepotRendezVousMemoire(),
      new DepotCreneauxMemoire(),
      salles().f,
      { estActif: async (nom) => nom !== 'paiement.mobile-money' },
      () => new Date('2026-09-27T09:00:00Z'),
      undefined,
      undefined,
      new IdentitesMemoire(statut ? new Map([['pat-fictif-001', statut]]) : new Map()),
    );

  it.each([['a-verifier'], ['refusee'], [undefined]] as const)(
    'refuse la réservation quand l’identité est %s',
    async (statut) => {
      const service = autre(statut);
      await expect(
        service.demander(patient, { creneauId: 'n-importe-lequel' }),
      ).rejects.toMatchObject({
        statut: 403,
        message: expect.stringContaining('identité'),
      });
    },
  );

  it('indique au patient le statut de son identité, et à lui seul', async () => {
    expect(await autre('a-verifier').statutIdentite(patient)).toBe('a-verifier');
    expect(await autre().statutIdentite(patient)).toBe('inconnu');
    const medecin: Utilisateur = { sujet: 'u-m', roles: ['professionnel'], practitionerId: 'p' };
    await expect(autre('a-verifier').statutIdentite(medecin)).rejects.toMatchObject({
      statut: 403,
    });
  });

  it('accepte la réservation quand l’identité est vérifiée', async () => {
    const { service, c } = await monter();
    await expect(service.demander(patient, { creneauId: c.id })).resolves.toMatchObject({
      statut: 'prevu',
    });
  });
});

describe('créneaux', () => {
  it('le médecin publie des créneaux consécutifs ; le patient voit les créneaux libres', async () => {
    const { service } = await monter();
    const publies = await service.publier(medecin, {
      debut: '2026-09-28T08:00:00Z',
      dureeMinutes: 15,
      nombre: 3,
    });
    expect(publies.map((c) => c.debut)).toEqual([
      '2026-09-28T08:00:00.000Z',
      '2026-09-28T08:15:00.000Z',
      '2026-09-28T08:30:00.000Z',
    ]);
    const libres = await service.creneauxLibres(patient, 'prac-fictif-001');
    expect(libres).toHaveLength(4);
    expect(libres.every((c) => c.statut === 'libre')).toBe(true);
  });

  it('refuse un chevauchement, un créneau passé, et toute publication hors professionnel', async () => {
    const { service } = await monter();
    await expect(
      service.publier(medecin, { debut: '2026-09-27T10:10:00Z', dureeMinutes: 20, nombre: 1 }),
    ).rejects.toMatchObject({ statut: 409 });
    await expect(
      service.publier(medecin, { debut: '2026-09-27T08:00:00Z', dureeMinutes: 20, nombre: 1 }),
    ).rejects.toMatchObject({ statut: 409 });
    for (const u of [patient, pharmacien]) {
      await expect(
        service.publier(u, { debut: '2026-09-28T08:00:00Z', dureeMinutes: 20, nombre: 1 }),
      ).rejects.toMatchObject({ statut: 403 });
    }
  });
});

describe('téléconsultation', () => {
  it('le patient réserve un créneau ; patient et médecin du rendez-vous obtiennent un jeton', async () => {
    const { service, s, c, etat } = await monter();
    const r = await service.demander(patient, { creneauId: c.id });
    expect(r).toMatchObject({
      patientId: 'pat-fictif-001',
      praticienId: 'prac-fictif-001',
      debut: DEBUT,
      statut: 'prevu',
      creneauId: c.id,
    });
    expect(await service.creneauxLibres(patient, 'prac-fictif-001')).toEqual([]);
    expect((await service.mesRendezVous(medecin)).map((x) => x.id)).toEqual([r.id]);
    etat.heure = '2026-09-27T09:50:00Z';
    const acces = await service.rejoindre(patient, r.id);
    await service.rejoindre(medecin, r.id);
    expect(acces).toEqual({ url: 'ws://livekit.test', jeton: 'jeton-u-p1', salle: `rdv-${r.id}` });
    // Identifiants techniques, jamais de nom ; libellés neutres.
    expect(s.jetons).toEqual([
      { salle: `rdv-${r.id}`, identite: 'u-p1', nomAffiche: 'Patient' },
      { salle: `rdv-${r.id}`, identite: 'u-m1', nomAffiche: 'Professionnel de santé' },
    ]);
  });

  it('un créneau ne se réserve qu’une fois ; créneau inconnu (404) ou déjà commencé (409)', async () => {
    const { service, c, etat } = await monter();
    await service.demander(patient, { creneauId: c.id });
    await expect(service.demander(autrePatient, { creneauId: c.id })).rejects.toMatchObject({
      statut: 409,
    });
    await expect(service.demander(patient, { creneauId: 'inconnu' })).rejects.toMatchObject({
      statut: 404,
    });
    const autre = await service.publier(medecin, {
      debut: '2026-09-27T11:00:00Z',
      dureeMinutes: 20,
      nombre: 1,
    });
    etat.heure = '2026-09-27T11:05:00Z';
    await expect(
      service.demander(patient, { creneauId: autre[0]?.id ?? '' }),
    ).rejects.toMatchObject({ statut: 409 });
  });

  it('refuse toute autre personne, sans révéler l’existence du rendez-vous (404)', async () => {
    const { service, s, c, etat } = await monter();
    const r = await service.demander(patient, { creneauId: c.id });
    etat.heure = DEBUT;
    for (const u of [autrePatient, autreMedecin, pharmacien]) {
      await expect(service.rejoindre(u, r.id)).rejects.toMatchObject({ statut: 404 });
    }
    await expect(service.rejoindre(patient, 'inconnu')).rejects.toMatchObject({ statut: 404 });
    expect(s.jetons).toHaveLength(0);
  });

  it('salle ouverte de 15 min avant le début à 30 min après la fin prévue', async () => {
    const { service, c, etat } = await monter();
    const r = await service.demander(patient, { creneauId: c.id });
    for (const [heure, ouvert] of [
      ['2026-09-27T09:44:00Z', false],
      ['2026-09-27T09:46:00Z', true],
      ['2026-09-27T10:49:00Z', true],
      ['2026-09-27T10:51:00Z', false],
    ] as const) {
      etat.heure = heure;
      const resultat = service.rejoindre(patient, r.id);
      if (ouvert) await expect(resultat).resolves.toBeDefined();
      else await expect(resultat).rejects.toMatchObject({ statut: 409 });
    }
  });

  it('fonction désactivée (flag teleconsultation.video) : ni créneaux, ni rendez-vous, ni salle', async () => {
    const { service, c, etat } = await monter();
    etat.actif = false;
    const e = await service.demander(patient, { creneauId: c.id }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurTeleconsultation);
    expect(e).toMatchObject({ statut: 403, message: 'Fonction non disponible.' });
    await expect(service.creneauxLibres(patient, 'prac-fictif-001')).rejects.toMatchObject({
      statut: 403,
    });
    await expect(
      service.publier(medecin, { debut: '2026-09-28T08:00:00Z', dureeMinutes: 20, nombre: 1 }),
    ).rejects.toMatchObject({ statut: 403 });
  });

  it('seul un patient réserve un rendez-vous, pour lui-même', async () => {
    const { service, c } = await monter();
    for (const u of [medecin, pharmacien]) {
      await expect(service.demander(u, { creneauId: c.id })).rejects.toMatchObject({
        statut: 403,
      });
    }
    await expect(service.mesRendezVous(pharmacien)).rejects.toMatchObject({ statut: 403 });
  });

  it('si le dossier refuse le rendez-vous, le créneau redevient libre', async () => {
    const { service, creneaux, c } = await monter();
    const depotEnPanne = new DepotRendezVousMemoire();
    depotEnPanne.ajouter = async () => {
      throw new Error('dossier indisponible');
    };
    const enPanne = new ServiceTeleconsultation(
      depotEnPanne,
      creneaux,
      salles().f,
      { estActif: async (nom) => nom !== 'paiement.mobile-money' },
      () => new Date('2026-09-27T09:00:00Z'),
      undefined,
      undefined,
      identitesVerifiees(),
    );
    await expect(enPanne.demander(patient, { creneauId: c.id })).rejects.toThrow(
      'dossier indisponible',
    );
    expect((await creneaux.lire(c.id))?.statut).toBe('libre');
    expect(await service.creneauxLibres(patient, 'prac-fictif-001')).toHaveLength(1);
  });
});

describe('annulation', () => {
  const prevu = async (heure: string, actif = true) => {
    const m = await monter('2026-09-27T09:00:00Z');
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    m.etat.heure = heure;
    m.etat.actif = actif;
    return { ...m, r };
  };

  it('le patient annule : qui et quand sont conservés, la salle est fermée, le créneau libéré', async () => {
    const { service, r, s } = await prevu('2026-09-27T09:00:00Z');
    const annule = await service.annuler(patient, r.id);
    expect(annule).toMatchObject({
      statut: 'annule',
      annulation: { par: 'patient', date: '2026-09-27T09:00:00.000Z' },
    });
    await expect(service.rejoindre(medecin, r.id)).rejects.toMatchObject({ statut: 409 });
    expect(s.jetons).toEqual([]);
    expect(await service.creneauxLibres(autrePatient, 'prac-fictif-001')).toHaveLength(1);
  });

  it('le médecin du rendez-vous peut annuler ; une seconde annulation est refusée', async () => {
    const { service, r } = await prevu('2026-09-27T09:00:00Z');
    expect((await service.annuler(medecin, r.id)).annulation?.par).toBe('professionnel');
    await expect(service.annuler(patient, r.id)).rejects.toMatchObject({ statut: 409 });
  });

  it('un tiers ne peut pas annuler, sans apprendre que le rendez-vous existe', async () => {
    const { service, r } = await prevu('2026-09-27T09:00:00Z');
    for (const u of [autrePatient, autreMedecin, pharmacien]) {
      const e = await service.annuler(u, r.id).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErreurTeleconsultation);
      expect(e).toMatchObject({ statut: 404, message: 'Rendez-vous introuvable.' });
    }
  });

  it('un rendez-vous passé ne s’annule plus ; l’annulation reste possible si le flag est retiré', async () => {
    const passe = await prevu('2026-09-27T11:00:00Z');
    await expect(passe.service.annuler(patient, passe.r.id)).rejects.toMatchObject({
      statut: 409,
    });
    const sansFlag = await prevu('2026-09-27T09:00:00Z', false);
    expect((await sansFlag.service.annuler(patient, sansFlag.r.id)).statut).toBe('annule');
  });
});

describe('report', () => {
  const prevu = async () => {
    const m = await monter('2026-09-27T09:00:00Z');
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    const [nouveau] = await m.service.publier(medecin, {
      debut: '2026-09-28T10:00:00Z',
      dureeMinutes: 30,
      nombre: 1,
    });
    if (!nouveau) throw new Error('créneau non publié');
    return { ...m, r, nouveau };
  };

  it('le patient reporte : même rendez-vous, nouvelle plage ; l’ancien créneau se libère', async () => {
    const { service, r, c, nouveau, creneaux } = await prevu();
    const reporte = await service.reporter(patient, r.id, { creneauId: nouveau.id });
    expect(reporte).toMatchObject({
      id: r.id,
      statut: 'prevu',
      debut: '2026-09-28T10:00:00.000Z',
      dureeMinutes: 30,
      creneauId: nouveau.id,
    });
    expect((await creneaux.lire(c.id))?.statut).toBe('libre');
    expect((await creneaux.lire(nouveau.id))?.statut).toBe('reserve');
  });

  it('le médecin peut reporter ; un tiers reçoit 404 sans rien apprendre', async () => {
    const { service, r, nouveau } = await prevu();
    for (const u of [autrePatient, autreMedecin, pharmacien]) {
      await expect(service.reporter(u, r.id, { creneauId: nouveau.id })).rejects.toMatchObject({
        statut: 404,
        message: 'Rendez-vous introuvable.',
      });
    }
    expect((await service.reporter(medecin, r.id, { creneauId: nouveau.id })).creneauId).toBe(
      nouveau.id,
    );
  });

  it('refuse un créneau d’un autre professionnel, déjà pris, ou un rendez-vous commencé', async () => {
    const { service, r, nouveau, creneaux, etat } = await prevu();
    const [ailleurs] = await creneaux.publier('prac-fictif-002', [
      { debut: '2026-09-28T11:00:00Z', dureeMinutes: 20 },
    ]);
    await expect(
      service.reporter(patient, r.id, { creneauId: ailleurs?.id ?? '' }),
    ).rejects.toMatchObject({ statut: 409 });
    await creneaux.reserver(nouveau.id);
    await expect(service.reporter(patient, r.id, { creneauId: nouveau.id })).rejects.toMatchObject({
      statut: 409,
    });
    etat.heure = '2026-09-27T10:05:00Z';
    await expect(service.reporter(patient, r.id, { creneauId: nouveau.id })).rejects.toMatchObject({
      statut: 409,
    });
  });

  it('si le dossier refuse le report, le nouveau créneau est rendu et l’ancien reste réservé', async () => {
    const { service, r, c, nouveau, creneaux, depot } = await prevu();
    depot.reporter = async () => {
      throw new Error('dossier indisponible');
    };
    await expect(service.reporter(patient, r.id, { creneauId: nouveau.id })).rejects.toThrow();
    expect((await creneaux.lire(nouveau.id))?.statut).toBe('libre');
    expect((await creneaux.lire(c.id))?.statut).toBe('reserve');
  });
});

describe('retrait d’un créneau', () => {
  it('le professionnel retire un créneau libre : il n’est plus proposé, la plage se republie', async () => {
    const { service, c } = await monter();
    expect((await service.retirerCreneau(medecin, c.id)).statut).toBe('retire');
    expect(await service.creneauxLibres(patient, 'prac-fictif-001')).toEqual([]);
    await expect(service.demander(patient, { creneauId: c.id })).rejects.toMatchObject({
      statut: 409,
    });
    await expect(
      service.publier(medecin, { debut: DEBUT, dureeMinutes: 20, nombre: 1 }),
    ).resolves.toHaveLength(1);
  });

  it('refuse un créneau réservé (409) et le créneau d’un autre (404)', async () => {
    const { service, c } = await monter();
    await expect(service.retirerCreneau(autreMedecin, c.id)).rejects.toMatchObject({
      statut: 404,
    });
    await expect(service.retirerCreneau(patient, c.id)).rejects.toMatchObject({ statut: 403 });
    await service.demander(patient, { creneauId: c.id });
    await expect(service.retirerCreneau(medecin, c.id)).rejects.toMatchObject({ statut: 409 });
  });
});

describe('notification de l’autre participant', () => {
  it('annulation par le patient : le médecin est prévenu ; par le médecin : le patient', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    await m.service.annuler(patient, r.id);
    expect(m.notifications).toEqual([
      {
        destinataire: 'Practitioner/prac-fictif-001',
        evenement: 'rendez-vous-annule',
        instant: DEBUT,
      },
    ]);
    const m2 = await monter();
    const r2 = await m2.service.demander(patient, { creneauId: m2.c.id });
    await m2.service.annuler(medecin, r2.id);
    expect(m2.notifications[0]?.destinataire).toBe('Patient/pat-fictif-001');
  });

  it('report : l’autre participant reçoit la nouvelle heure', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    const [nouveau] = await m.service.publier(medecin, {
      debut: '2026-09-28T10:00:00Z',
      dureeMinutes: 20,
      nombre: 1,
    });
    await m.service.reporter(medecin, r.id, { creneauId: nouveau?.id ?? '' });
    expect(m.notifications).toEqual([
      {
        destinataire: 'Patient/pat-fictif-001',
        evenement: 'rendez-vous-reporte',
        instant: '2026-09-28T10:00:00.000Z',
      },
    ]);
  });
});

describe('créneaux du professionnel', () => {
  it('le médecin voit ses créneaux libres et réservés, pas ceux retirés ni ceux d’un autre', async () => {
    const { service, c, creneaux } = await monter();
    await service.demander(patient, { creneauId: c.id });
    const [libre, retire] = await service.publier(medecin, {
      debut: '2026-09-28T10:00:00Z',
      dureeMinutes: 20,
      nombre: 2,
    });
    await service.retirerCreneau(medecin, retire?.id ?? '');
    await creneaux.publier('prac-fictif-002', [
      { debut: '2026-09-28T12:00:00Z', dureeMinutes: 20 },
    ]);
    const miens = await service.mesCreneaux(medecin);
    expect(miens.map((x) => [x.id, x.statut])).toEqual([
      [c.id, 'reserve'],
      [libre?.id, 'libre'],
    ]);
    for (const u of [patient, pharmacien]) {
      await expect(service.mesCreneaux(u)).rejects.toMatchObject({ statut: 403 });
    }
  });
});

describe('annuaire', () => {
  it('liste les médecins qui ont un agenda, avec leur prochain créneau libre, les plus proches d’abord', async () => {
    const creneaux = new DepotCreneauxMemoire();
    await creneaux.publier('prac-fictif-001', [
      { debut: '2026-09-29T08:00:00Z', dureeMinutes: 20 },
    ]);
    await creneaux.publier('prac-fictif-002', [
      { debut: '2026-09-28T08:00:00Z', dureeMinutes: 20 },
    ]);
    const service = new ServiceTeleconsultation(
      new DepotRendezVousMemoire(),
      creneaux,
      salles().f,
      { estActif: async (nom) => nom !== 'paiement.mobile-money' },
      () => new Date('2026-09-27T09:00:00Z'),
      undefined,
      new AnnuaireMemoire(
        new Map([
          ['prac-fictif-001', { nom: 'Dr Test A [FICTIF]', specialite: 'Médecine générale' }],
          ['prac-fictif-002', { nom: 'Dr Test B [FICTIF]' }],
        ]),
      ),
    );
    expect(await service.praticiens(patient)).toEqual([
      {
        id: 'prac-fictif-002',
        nom: 'Dr Test B [FICTIF]',
        prochainCreneau: '2026-09-28T08:00:00.000Z',
      },
      {
        id: 'prac-fictif-001',
        nom: 'Dr Test A [FICTIF]',
        specialite: 'Médecine générale',
        prochainCreneau: '2026-09-29T08:00:00.000Z',
      },
    ]);
    await expect(service.praticiens(medecin)).rejects.toMatchObject({ statut: 403 });
  });
});

describe('fiche d’annuaire', () => {
  it('nom et spécialité seulement, avec un libellé par défaut', () => {
    expect(
      versFiche({
        resourceType: 'Practitioner',
        name: [{ prefix: ['Dr'], given: ['Test'], family: 'Fictif' }],
        qualification: [{ code: { text: 'Médecine générale' } }],
      }),
    ).toEqual({ nom: 'Dr Test Fictif', specialite: 'Médecine générale' });
    expect(versFiche({ resourceType: 'Practitioner' })).toEqual({ nom: 'Professionnel de santé' });
  });
});
