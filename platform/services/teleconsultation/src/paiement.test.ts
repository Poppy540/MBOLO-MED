// Réservation payante (ADR-0017) : créneau retenu, confirmation après paiement, expiration du délai.
// Données FICTIVES.
import { ErreurDepot, type Utilisateur } from '@mbolo/identite';
import { creerJournal, type Evenement } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { AnnuaireMemoire } from './annuaire.js';
import { DepotCreneauxMemoire } from './creneaux.js';
import { IdentitesMemoire } from './identites.js';
import { PaiementsHttp, PaiementsMemoire } from './paiements.js';
import {
  DepotRendezVousMemoire,
  ServiceTeleconsultation,
  type FournisseurSalle,
} from './rendez-vous.js';

const patient: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };
const medecin: Utilisateur = {
  sujet: 'u-m1',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-001',
};
const salle: FournisseurSalle = {
  url: 'ws://livekit.test',
  preparer: async () => undefined,
  jeton: async () => 'jeton-fictif',
};

const DEBUT = '2026-09-27T10:00:00.000Z';

async function monter(o: { payant?: boolean; sansService?: boolean } = {}) {
  const depot = new DepotRendezVousMemoire();
  const creneaux = new DepotCreneauxMemoire();
  const paiements = new PaiementsMemoire();
  const etat = { heure: '2026-09-27T09:00:00Z' };
  const sms: { destinataire: string; evenement: string }[] = [];
  const service = new ServiceTeleconsultation(
    depot,
    creneaux,
    salle,
    { estActif: async (nom) => nom !== 'paiement.mobile-money' || (o.payant ?? true) },
    () => new Date(etat.heure),
    {
      prevenir: async (destinataire, evenement) => {
        sms.push({ destinataire, evenement });
      },
    },
    // [FICTIF] Professionnel vérifié (ADR-0026).
    new AnnuaireMemoire(new Map([['prac-fictif-001', { nom: 'Dr Test A [FICTIF]' }]])),
    new IdentitesMemoire(new Map([['pat-fictif-001', 'verifiee']])),
    o.sansService ? undefined : { service: paiements, delaiMinutes: 15 },
  );
  const [c] = await creneaux.publier('prac-fictif-001', [{ debut: DEBUT, dureeMinutes: 20 }]);
  if (!c) throw new Error('créneau non publié');
  return { service, depot, creneaux, paiements, etat, c, sms };
}

describe('réservation payante (flag paiement.mobile-money)', () => {
  it('retient le créneau, crée le paiement, puis confirme le rendez-vous une fois payé', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    expect(r).toMatchObject({
      statut: 'a-payer',
      creeLe: '2026-09-27T09:00:00.000Z',
      expireLe: '2026-09-27T09:15:00.000Z',
      paiement: { montant: 10_000, devise: 'XAF' },
    });
    // Le montant vient du service de paiement, pour le compte du patient, en médecine générale.
    expect(m.paiements.crees.get(r.id)).toEqual({ sujet: 'u-p1', type: 'generaliste' });
    expect((await m.creneaux.lire(m.c.id))?.statut).toBe('reserve');
    // Pas de salle avant le paiement.
    m.etat.heure = '2026-09-27T09:50:00Z';
    await expect(m.service.rejoindre(patient, r.id)).rejects.toMatchObject({ statut: 409 });

    m.etat.heure = '2026-09-27T09:05:00Z';
    // En attente : le même paiement est renvoyé, pour reprendre depuis la liste des rendez-vous.
    expect(await m.service.verifierPaiement(patient, r.id)).toMatchObject({
      statut: 'a-payer',
      paiement: { id: `paiement-${r.id}`, montant: 10_000 },
      expireLe: '2026-09-27T09:15:00.000Z',
    });
    m.paiements.payer(r.id);
    expect((await m.service.verifierPaiement(patient, r.id)).statut).toBe('prevu');
    // Le patient est prévenu (s'il a accepté les rappels, vérifié par le service notifications).
    expect(m.sms).toEqual([
      { destinataire: 'Patient/pat-fictif-001', evenement: 'rendez-vous-confirme' },
    ]);
    m.etat.heure = '2026-09-27T09:50:00Z';
    await expect(m.service.rejoindre(patient, r.id)).resolves.toMatchObject({
      salle: `rdv-${r.id}`,
    });
  });

  it('délai dépassé sans paiement : annulé par la plateforme, créneau libéré', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    m.etat.heure = '2026-09-27T09:16:00Z';
    expect(await m.service.expirerPaiements()).toEqual({ confirmes: 0, annules: 1, reportes: 0 });
    const apres = await m.depot.lire(r.id);
    expect(apres).toMatchObject({ statut: 'annule', annulation: { par: 'plateforme' } });
    expect((await m.creneaux.lire(m.c.id))?.statut).toBe('libre');
    // Le paiement est prévenu : plus de collecte, remboursement préparé si payé après coup.
    expect(m.paiements.annules.has(r.id)).toBe(true);
    expect(m.sms).toEqual([
      { destinataire: 'Patient/pat-fictif-001', evenement: 'reservation-expiree' },
    ]);
  });

  it('payé juste avant l’expiration : le passage périodique confirme au lieu d’annuler', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    m.paiements.payer(r.id);
    m.etat.heure = '2026-09-27T09:30:00Z';
    expect(await m.service.expirerPaiements()).toEqual({ confirmes: 1, annules: 0, reportes: 0 });
    expect((await m.depot.lire(r.id))?.statut).toBe('prevu');
  });

  it('paiement injoignable : rien n’est annulé sur une incertitude', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    m.paiements.indisponible = true;
    m.etat.heure = '2026-09-27T10:30:00Z';
    expect(await m.service.expirerPaiements()).toEqual({ confirmes: 0, annules: 0, reportes: 1 });
    expect((await m.depot.lire(r.id))?.statut).toBe('a-payer');
    await expect(m.service.verifierPaiement(patient, r.id)).rejects.toMatchObject({
      statut: 503,
    });
  });

  it('paiement impossible à préparer : réservation retirée et créneau rendu', async () => {
    const m = await monter();
    m.paiements.indisponible = true;
    await expect(m.service.demander(patient, { creneauId: m.c.id })).rejects.toMatchObject({
      statut: 503,
    });
    expect((await m.creneaux.lire(m.c.id))?.statut).toBe('libre');
    const [r] = await m.depot.pourPatient('pat-fictif-001');
    expect(r).toMatchObject({ statut: 'annule', annulation: { par: 'plateforme' } });
  });

  it('flag ouvert sans service de paiement : refus (jamais gratuit par erreur)', async () => {
    const m = await monter({ sansService: true });
    await expect(m.service.demander(patient, { creneauId: m.c.id })).rejects.toMatchObject({
      statut: 503,
    });
    expect((await m.creneaux.lire(m.c.id))?.statut).toBe('libre');
  });

  it('flag fermé : réservation confirmée aussitôt, sans paiement', async () => {
    const m = await monter({ payant: false });
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    expect(r.statut).toBe('prevu');
    expect(m.paiements.crees.size).toBe(0);
  });

  it('en attente : pas de report ; le patient peut abandonner, le créneau se libère', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    const [autre] = await m.creneaux.publier('prac-fictif-001', [
      { debut: '2026-09-27T11:00:00Z', dureeMinutes: 20 },
    ]);
    await expect(
      m.service.reporter(patient, r.id, { creneauId: autre?.id ?? '' }),
    ).rejects.toMatchObject({ statut: 409, message: expect.stringContaining('paiement') });
    // Le professionnel voit la réservation mais ne déclenche aucune vérification de paiement.
    expect((await m.service.verifierPaiement(medecin, r.id)).statut).toBe('a-payer');
    expect((await m.service.annuler(patient, r.id)).statut).toBe('annule');
    expect((await m.creneaux.lire(m.c.id))?.statut).toBe('libre');
    expect(m.paiements.annules.has(r.id)).toBe(true);
  });
});

describe('client HTTP du service de paiement', () => {
  it('envoie le jeton de service, jamais de montant, et lit « payé »', async () => {
    const appels: { url: string; init: RequestInit }[] = [];
    const client = new PaiementsHttp({
      url: 'http://paiement.test',
      entetes: async () => ({ authorization: 'Bearer jeton-service-fictif' }),
      fetch: async (url, init) => {
        appels.push({ url: String(url), init: init ?? {} });
        return String(url).endsWith('/paiements')
          ? new Response(
              JSON.stringify({ id: 'p1', statut: 'a-payer', montant: 10_000, devise: 'XAF' }),
              { status: 201 },
            )
          : new Response(JSON.stringify({ paye: true }), { status: 200 });
      },
    });
    expect(
      await client.creer({
        reference: 'rdv-fictif-1',
        sujet: 'u-p1',
        type: 'generaliste',
        praticien: 'prac-fictif-001',
      }),
    ).toEqual({ id: 'p1', montant: 10_000, devise: 'XAF' });
    expect(await client.estPaye('rdv-fictif-1')).toBe(true);
    expect(JSON.parse(String(appels[0]?.init.body))).toEqual({
      reference: 'rdv-fictif-1',
      sujet: 'u-p1',
      type: 'generaliste',
      // Référence opaque du professionnel (relevés, ADR-0020), jamais son nom.
      praticien: 'prac-fictif-001',
    });
    expect(appels[1]?.url).toBe('http://paiement.test/rendez-vous/rdv-fictif-1/paiement');
    expect(appels.every((a) => (a.init.headers as Record<string, string>)['authorization'])).toBe(
      true,
    );
  });

  it('annulation non transmise : jamais d’erreur pour l’appelant, alerte d’exploitation', async () => {
    const evenements: Evenement[] = [];
    const client = new PaiementsHttp({
      url: 'http://paiement.test',
      entetes: async () => ({}),
      journal: creerJournal({
        service: 'teleconsultation',
        ecrire: (l) => evenements.push(JSON.parse(l) as Evenement),
      }),
      fetch: async () => {
        throw new Error('réseau');
      },
    });
    await expect(client.annulation('rdv-fictif-1')).resolves.toBeUndefined();
    expect(evenements[0]).toMatchObject({
      message: 'annulation non transmise au paiement',
      contexte: { alerte: 'erreur-serveur', rendezVousId: 'rdv-fictif-1' },
    });
  });

  it('service injoignable ou réponse inattendue : 503, jamais « non payé » par défaut', async () => {
    const enPanne = new PaiementsHttp({
      url: 'http://paiement.test',
      entetes: async () => ({}),
      fetch: async () => {
        throw new Error('réseau');
      },
    });
    await expect(enPanne.estPaye('x')).rejects.toMatchObject({ statut: 503 });
    const refus = new PaiementsHttp({
      url: 'http://paiement.test',
      entetes: async () => ({}),
      fetch: async () => new Response('{}', { status: 401 }),
    });
    await expect(refus.estPaye('x')).rejects.toMatchObject({ statut: 503 });
    await expect(
      refus.creer({
        reference: 'x',
        sujet: 'u',
        type: 'generaliste',
        praticien: 'prac-fictif-001',
      }),
    ).rejects.toMatchObject({ statut: 503 });
  });
});

describe('annulation au moment où le paiement confirme le rendez-vous', () => {
  it('le rendez-vous a changé entre-temps : relu, puis annulé au second essai', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    // Le passage périodique confirme le rendez-vous juste avant l'écriture de l'annulation.
    const annuler = m.depot.annuler.bind(m.depot);
    let essais = 0;
    m.depot.annuler = async (...args) => {
      essais += 1;
      if (essais === 1) {
        await m.depot.confirmer(r.id);
        throw new ErreurDepot('Le rendez-vous a changé.', 409);
      }
      return annuler(...args);
    };
    expect((await m.service.annuler(patient, r.id)).statut).toBe('annule');
    expect(essais).toBe(2);
    expect(m.paiements.annules.has(r.id)).toBe(true);
  });

  it('déjà annulé entre-temps : le conflit est rendu, sans second essai', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    const annuler = m.depot.annuler.bind(m.depot);
    let essais = 0;
    m.depot.annuler = async (...args) => {
      essais += 1;
      await annuler(...args);
      throw new ErreurDepot('Le rendez-vous a changé.', 409);
    };
    await expect(m.service.annuler(patient, r.id)).rejects.toMatchObject({ statut: 409 });
    expect(essais).toBe(1);
  });
});

describe('confirmation simultanée d’un rendez-vous payé', () => {
  it('le patient revient au moment où le passage périodique confirme : pas d’erreur, un seul SMS', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    m.paiements.payer(r.id);
    // Le passage périodique confirme juste avant l'écriture demandée par le patient.
    const confirmer = m.depot.confirmer.bind(m.depot);
    m.depot.confirmer = async (id) => {
      await confirmer(id);
      throw new ErreurDepot('Le rendez-vous a changé.', 409);
    };
    expect((await m.service.verifierPaiement(patient, r.id)).statut).toBe('prevu');
    // L'autre chemin a déjà prévenu le patient : aucun second SMS ici.
    expect(m.sms).toEqual([]);
  });

  it('conflit alors que le rendez-vous n’est pas confirmé : l’erreur est rendue', async () => {
    const m = await monter();
    const r = await m.service.demander(patient, { creneauId: m.c.id });
    m.paiements.payer(r.id);
    m.depot.confirmer = async () => {
      throw new ErreurDepot('Le rendez-vous a changé.', 409);
    };
    await expect(m.service.verifierPaiement(patient, r.id)).rejects.toMatchObject({
      statut: 409,
    });
  });
});
