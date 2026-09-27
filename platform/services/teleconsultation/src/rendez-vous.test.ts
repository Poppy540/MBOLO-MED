import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import { DepotCreneauxMemoire } from './creneaux.js';
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

/** Service monté avec une horloge réglable et un créneau libre de prac-fictif-001 à DEBUT. */
async function monter(heure = '2026-09-27T09:00:00Z') {
  const s = salles();
  const depot = new DepotRendezVousMemoire();
  const creneaux = new DepotCreneauxMemoire();
  const etat = { heure, actif: true };
  const service = new ServiceTeleconsultation(
    depot,
    creneaux,
    s.f,
    { estActif: async () => etat.actif },
    () => new Date(etat.heure),
  );
  const [c] = await creneaux.publier('prac-fictif-001', [{ debut: DEBUT, dureeMinutes: 20 }]);
  if (!c) throw new Error('créneau non publié');
  return { service, s, creneaux, c, etat };
}

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
      { estActif: async () => true },
      () => new Date('2026-09-27T09:00:00Z'),
    );
    await expect(enPanne.demander(patient, { creneauId: c.id })).rejects.toThrow();
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
