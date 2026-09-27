import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
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
const a = (iso: string) => () => new Date(iso);

describe('téléconsultation', () => {
  it('le patient demande un rendez-vous ; patient et médecin du rendez-vous obtiennent un jeton', async () => {
    const s = salles();
    const depot = new DepotRendezVousMemoire();
    const service = new ServiceTeleconsultation(
      depot,
      s.f,
      { estActif: async () => true },
      a('2026-09-27T09:50:00Z'),
    );
    const r = await service.demander(patient, {
      praticienId: 'prac-fictif-001',
      debut: DEBUT,
      dureeMinutes: 20,
    });
    expect(r).toMatchObject({
      patientId: 'pat-fictif-001',
      praticienId: 'prac-fictif-001',
      statut: 'prevu',
    });
    expect((await service.mesRendezVous(medecin)).map((x) => x.id)).toEqual([r.id]);
    const acces = await service.rejoindre(patient, r.id);
    await service.rejoindre(medecin, r.id);
    expect(acces).toEqual({ url: 'ws://livekit.test', jeton: 'jeton-u-p1', salle: `rdv-${r.id}` });
    // Identifiants techniques, jamais de nom ; libellés neutres.
    expect(s.jetons).toEqual([
      { salle: `rdv-${r.id}`, identite: 'u-p1', nomAffiche: 'Patient' },
      { salle: `rdv-${r.id}`, identite: 'u-m1', nomAffiche: 'Professionnel de santé' },
    ]);
  });

  it('refuse toute autre personne, sans révéler l’existence du rendez-vous (404)', async () => {
    const s = salles();
    const service = new ServiceTeleconsultation(
      new DepotRendezVousMemoire(),
      s.f,
      { estActif: async () => true },
      a('2026-09-27T10:00:00Z'),
    );
    const r = await service.demander(patient, {
      praticienId: 'prac-fictif-001',
      debut: DEBUT,
      dureeMinutes: 20,
    });
    for (const u of [autrePatient, autreMedecin, pharmacien]) {
      await expect(service.rejoindre(u, r.id)).rejects.toMatchObject({ statut: 404 });
    }
    await expect(service.rejoindre(patient, 'inconnu')).rejects.toMatchObject({ statut: 404 });
    expect(s.jetons).toHaveLength(0);
  });

  it('salle ouverte de 15 min avant le début à 30 min après la fin prévue', async () => {
    for (const [heure, ouvert] of [
      ['2026-09-27T09:44:00Z', false],
      ['2026-09-27T09:46:00Z', true],
      ['2026-09-27T10:49:00Z', true],
      ['2026-09-27T10:51:00Z', false],
    ] as const) {
      const service = new ServiceTeleconsultation(
        new DepotRendezVousMemoire(),
        salles().f,
        { estActif: async () => true },
        a(heure),
      );
      const r = await service.demander(patient, {
        praticienId: 'prac-fictif-001',
        debut: DEBUT,
        dureeMinutes: 20,
      });
      const resultat = service.rejoindre(patient, r.id);
      if (ouvert) await expect(resultat).resolves.toBeDefined();
      else await expect(resultat).rejects.toMatchObject({ statut: 409 });
    }
  });

  it('fonction désactivée (flag teleconsultation.video) : ni rendez-vous ni salle', async () => {
    const service = new ServiceTeleconsultation(new DepotRendezVousMemoire(), salles().f, {
      estActif: async () => false,
    });
    const e = await service
      .demander(patient, { praticienId: 'prac-fictif-001', debut: DEBUT, dureeMinutes: 20 })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurTeleconsultation);
    expect(e).toMatchObject({ statut: 403, message: 'Fonction non disponible.' });
  });

  it('seul un patient demande un rendez-vous, pour lui-même', async () => {
    const service = new ServiceTeleconsultation(new DepotRendezVousMemoire(), salles().f, {
      estActif: async () => true,
    });
    for (const u of [medecin, pharmacien]) {
      await expect(
        service.demander(u, { praticienId: 'prac-fictif-001', debut: DEBUT, dureeMinutes: 20 }),
      ).rejects.toMatchObject({ statut: 403 });
    }
    await expect(service.mesRendezVous(pharmacien)).rejects.toMatchObject({ statut: 403 });
  });
});

describe('annulation', () => {
  const prevu = async (maintenant: string, actif = true) => {
    const s = salles();
    const depot = new DepotRendezVousMemoire();
    // Rendez-vous créé pendant que la fonction est active ; `actif` règle le flag ensuite.
    const r = await new ServiceTeleconsultation(
      depot,
      s.f,
      { estActif: async () => true },
      a(maintenant),
    ).demander(patient, { praticienId: 'prac-fictif-001', debut: DEBUT, dureeMinutes: 20 });
    const service = new ServiceTeleconsultation(
      depot,
      s.f,
      { estActif: async () => actif },
      a(maintenant),
    );
    return { service, r, s };
  };

  it('le patient annule : qui et quand sont conservés, la salle est fermée', async () => {
    const { service, r, s } = await prevu('2026-09-27T09:00:00Z');
    const annule = await service.annuler(patient, r.id);
    expect(annule).toMatchObject({
      statut: 'annule',
      annulation: { par: 'patient', date: '2026-09-27T09:00:00.000Z' },
    });
    await expect(service.rejoindre(medecin, r.id)).rejects.toMatchObject({ statut: 409 });
    expect(s.jetons).toEqual([]);
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
