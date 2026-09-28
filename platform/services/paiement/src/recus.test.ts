// Reçus et avoirs du patient (ADR-0020, flag facturation.recus). Données FICTIVES uniquement.
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { DepotMemoire } from './depot.js';
import { FournisseurSimule } from './fournisseur.js';
import { DepotRecusMemoire, ServiceRecus, numeroRecu } from './recus.js';
import { creerServeur } from './serveur.js';
import { ServicePaiement } from './service.js';
import type { Tarifs } from './tarifs.js';

// [FICTIF] Secret de test construit à l'exécution (jamais une vraie valeur).
const SECRET = ['essai', 'recus', 'fictif'].join('-').padEnd(40, 'x');
const TARIFS: Tarifs = {
  devise: 'XAF',
  prix: { generaliste: 10_000, specialiste: 15_000 },
  operateurs: ['airtel', 'moov'],
  indicatif: '241',
};
const patient: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };
const valideur: Utilisateur = { sujet: 'u-v1', roles: ['validation-remboursement'] };

function monter(o: { recusOuverts?: boolean; horloge?: () => Date } = {}) {
  const depot = new DepotMemoire();
  const fournisseur = new FournisseurSimule(SECRET);
  const drapeaux = {
    estActif: async (nom: string) => nom !== 'facturation.recus' || o.recusOuverts !== false,
  };
  const depotRecus = new DepotRecusMemoire(depot);
  const horloge = o.horloge ?? (() => new Date('2026-10-01T08:00:00Z'));
  const recus = new ServiceRecus(
    depotRecus,
    depot,
    drapeaux,
    {
      pays: 'GA',
      fuseau: 'Africa/Libreville',
      emetteur: { nom: 'Mbolo Santé [FICTIF]', mentions: 'Mentions à compléter.' },
      valeurFiscale: false,
    },
    horloge,
  );
  const service = new ServicePaiement(
    depot,
    fournisseur,
    TARIFS,
    drapeaux,
    horloge,
    () => undefined,
    recus,
  );
  /** Rendez-vous payé par le patient (payeur simulé qui valide). */
  const payer = async (reference: string) => {
    const { id } = await service.creer({ reference, sujet: 'u-p1', type: 'generaliste' });
    // [FICTIF] Numéro manifestement inventé.
    await service.collecter(patient, id, { operateur: 'airtel', numero: '+241 00 00 00 00' });
    fournisseur.conclure((await service.tentativeEnAttente(id)) ?? '', 'reussi');
    await service.lire(patient, id);
    return id;
  };
  return { depot, depotRecus, recus, service, payer };
}

describe('reçus et avoirs (ADR-0020)', () => {
  it('un reçu numéroté sans trou à chaque paiement reçu, sans donnée de santé ni numéro', async () => {
    const m = monter();
    await m.payer('rdv-fictif-r1');
    await m.payer('rdv-fictif-r2');
    const liste = await m.recus.lister(patient);
    expect(liste.map((r) => r.numero).sort()).toEqual(['GA-2026-000001', 'GA-2026-000002']);
    const r = liste.find((x) => x.numero === 'GA-2026-000001');
    expect(r).toMatchObject({
      type: 'recu',
      libelle: 'Consultation Mbolo Santé',
      montant: 10_000,
      devise: 'XAF',
      reference: 'rdv-fictif-r1',
      operateur: 'airtel',
      valeurFiscale: false,
    });
    // Ni numéro de téléphone ni identifiant du patient.
    expect(JSON.stringify(liste)).not.toMatch(/\+241|u-p1|pat-fictif/);
  });

  it('idempotent : relire ou rattraper n’émet pas un deuxième reçu', async () => {
    const m = monter();
    const id = await m.payer('rdv-fictif-r1');
    await m.service.lire(patient, id);
    expect(await m.recus.rattraper()).toBe(0);
    expect(m.depotRecus.recus).toHaveLength(1);
  });

  it('un avoir quand le remboursement est versé, qui renvoie au reçu annulé', async () => {
    const m = monter();
    await m.payer('rdv-fictif-r1');
    await m.service.annulationRendezVous('rdv-fictif-r1');
    const [aValider] = await m.service.aValider(valideur);
    await m.service.decider(valideur, aValider?.id ?? '', 'valide');
    const liste = await m.recus.lister(patient);
    expect(liste.map((r) => [r.numero, r.type]).sort()).toEqual([
      ['GA-2026-000001', 'recu'],
      ['GA-2026-000002', 'avoir'],
    ]);
    expect(liste.find((r) => r.type === 'avoir')).toMatchObject({
      recuAnnule: 'GA-2026-000001',
      libelle: 'Remboursement — Consultation Mbolo Santé',
      montant: 10_000,
    });
  });

  it('flag fermé : aucun reçu ; à l’ouverture, le rattrapage émet ceux qui manquent', async () => {
    const ferme = monter({ recusOuverts: false });
    await ferme.payer('rdv-fictif-r1');
    expect(ferme.depotRecus.recus).toHaveLength(0);
    await expect(ferme.recus.lister(patient)).rejects.toMatchObject({ motif: 'desactive' });
    // Même paiement, fonction ouverte : le rapprochement périodique émet le reçu manquant.
    const ouvert = new ServiceRecus(
      ferme.depotRecus,
      ferme.depot,
      { estActif: async () => true },
      {
        pays: 'GA',
        fuseau: 'Africa/Libreville',
        emetteur: { nom: 'Mbolo Santé [FICTIF]', mentions: '' },
        valeurFiscale: false,
      },
    );
    expect(await ouvert.rattraper()).toBe(1);
  });

  it('série par pays et par année du pays (fuseau), pas d’UTC', async () => {
    // 31/12 à 23 h 30 UTC = 1er janvier 00 h 30 à Libreville (UTC+1).
    const m = monter({ horloge: () => new Date('2026-12-31T23:30:00Z') });
    await m.payer('rdv-fictif-r1');
    expect(m.depotRecus.recus[0]?.numero).toBe('GA-2027-000001');
    expect(numeroRecu('GA-2027', 1234567)).toBe('GA-2027-1234567');
  });

  it('seul le patient lui-même voit ses reçus ; jamais un agent IA ni un autre compte', async () => {
    const m = monter();
    await m.payer('rdv-fictif-r1');
    expect(await m.recus.lister({ sujet: 'u-p2', roles: ['patient'] })).toEqual([]);
    for (const u of [
      valideur,
      {
        sujet: 'u-p1',
        roles: ['patient', 'agent-ia'],
        agent: { nom: 'agent-01-accueil', patientSession: 'pat-fictif-001' },
      },
    ] as Utilisateur[]) {
      await expect(m.recus.lister(u)).rejects.toMatchObject({ motif: 'interdit' });
    }
  });

  it('route GET /recus : 401 sans jeton, 403 fonction fermée, liste sans cache', async () => {
    for (const ouvert of [true, false]) {
      const m = monter({ recusOuverts: ouvert });
      await m.payer('rdv-fictif-r1');
      const app = await creerServeur({
        verifierJeton: async (j) => {
          if (j !== 'patient') throw new Error('jeton invalide');
          return patient;
        },
        verifierAppelant: async () => 'mbolo-teleconsultation-service',
        service: m.service,
        recus: m.recus,
        journal: creerJournal({ service: 'paiement', ecrire: () => undefined }),
      });
      expect((await app.inject({ method: 'GET', url: '/recus' })).statusCode).toBe(401);
      const r = await app.inject({
        method: 'GET',
        url: '/recus',
        headers: { authorization: 'Bearer patient' },
      });
      if (ouvert) {
        expect(r.statusCode).toBe(200);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.json<{ recus: unknown[] }>().recus).toHaveLength(1);
      } else {
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({ motif: 'desactive' });
      }
    }
  });
});
