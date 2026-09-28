// Annulation, rapprochement et remboursement validé par un humain (ADR-0017). Données FICTIVES.
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal, type Evenement } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { DepotMemoire, type Remboursement } from './depot.js';
import { FournisseurSimule } from './fournisseur.js';
import { creerServeur } from './serveur.js';
import { ServicePaiement } from './service.js';
import type { Tarifs } from './tarifs.js';

// [FICTIF] Secret de test construit à l'exécution (jamais une vraie valeur).
const SECRET = ['essai', 'remboursement', 'fictif'].join('-').padEnd(40, 'x');
const TARIFS: Tarifs = {
  devise: 'XAF',
  prix: { generaliste: 10_000, specialiste: 15_000 },
  operateurs: ['airtel', 'moov'],
  indicatif: '241',
};

const COMPTES: Record<string, Utilisateur> = {
  patient: { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' },
  valideur: { sujet: 'u-v1', roles: ['validation-remboursement'] },
  // Un valideur qui est aussi le patient concerné ne décide jamais de son propre paiement.
  soiMeme: { sujet: 'u-p1', roles: ['validation-remboursement', 'patient'] },
  agent: {
    sujet: 'u-agent',
    roles: ['validation-remboursement', 'agent-ia'],
    agent: { nom: 'agent-06-pilote', patientSession: 'pat-fictif-001' },
  },
  medecin: { sujet: 'u-m1', roles: ['professionnel'], practitionerId: 'prac-fictif-001' },
};

async function monter() {
  const evenements: Evenement[] = [];
  const prepares: Remboursement[] = [];
  const fournisseur = new FournisseurSimule(SECRET);
  const depot = new DepotMemoire();
  const service = new ServicePaiement(
    depot,
    fournisseur,
    TARIFS,
    { estActif: async () => true },
    () => new Date(),
    (r) => prepares.push(r),
  );
  const app = await creerServeur({
    verifierJeton: async (j) => {
      const u = COMPTES[j];
      if (!u) throw new Error('jeton invalide');
      return u;
    },
    verifierAppelant: async (j) => {
      if (j !== 'service-teleconsultation') throw new Error('client non autorisé');
      return 'mbolo-teleconsultation-service';
    },
    service,
    journal: creerJournal({
      service: 'paiement',
      ecrire: (ligne) => evenements.push(JSON.parse(ligne) as Evenement),
    }),
    limites: { parMinute: 1_000, collecteParMinute: 100 },
  });
  const service_ = { authorization: 'Bearer service-teleconsultation' };
  const reference = 'rdv-fictif-remb';
  /** Paiement créé et collecte lancée par le patient ; renvoie l'identifiant et la tentative. */
  const payer = async (conclure?: 'reussi' | 'echoue') => {
    const { id } = (
      await app.inject({
        method: 'POST',
        url: '/paiements',
        headers: service_,
        payload: { reference, sujet: 'u-p1', type: 'generaliste' },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: 'POST',
      url: `/paiements/${id}/collecte`,
      headers: { authorization: 'Bearer patient' },
      // [FICTIF] Numéro manifestement inventé.
      payload: { operateur: 'airtel', numero: '+241 00 00 00 00' },
    });
    const tentative = [...fournisseur.tentatives.keys()].at(-1) ?? '';
    if (conclure) fournisseur.conclure(tentative, conclure);
    return { id, tentative };
  };
  const annuler = () =>
    app.inject({
      method: 'POST',
      url: `/rendez-vous/${reference}/annulation`,
      headers: service_,
    });
  const liste = (compte = 'valideur') =>
    app.inject({
      method: 'GET',
      url: '/remboursements',
      headers: { authorization: `Bearer ${compte}` },
    });
  const decider = (id: string, decision: 'valide' | 'refuse', compte = 'valideur') =>
    app.inject({
      method: 'POST',
      url: `/remboursements/${id}/decision`,
      headers: { authorization: `Bearer ${compte}` },
      payload: { decision },
    });
  return {
    app,
    service,
    depot,
    fournisseur,
    evenements,
    prepares,
    payer,
    annuler,
    liste,
    decider,
  };
}

describe('rendez-vous annulé après paiement', () => {
  it('prépare un remboursement à valider, que seul un humain habilité décide', async () => {
    const m = await monter();
    await m.payer('reussi');
    const a = await m.annuler();
    expect(a.json()).toEqual({ connu: true, aRembourser: true });
    expect(m.prepares).toHaveLength(1);

    const l = await m.liste();
    const [r] = l.json<{ remboursements: { id: string; montant: number; statut: string }[] }>()
      .remboursements;
    expect(r).toMatchObject({ montant: 10_000, statut: 'a-valider', reference: 'rdv-fictif-remb' });
    // Le valideur ne voit ni le patient ni le numéro.
    expect(JSON.stringify(l.json())).not.toMatch(/u-p1|24100000000/);
    // Rien n'est versé avant la décision.
    expect(m.fournisseur.remboursements.size).toBe(0);

    const d = await m.decider(r?.id ?? '', 'valide');
    expect(d.json()).toMatchObject({ statut: 'effectue' });
    expect(m.fournisseur.remboursements.size).toBe(1);
    // Une décision ne se prend qu'une fois, et le remboursement n'est jamais versé deux fois.
    expect((await m.decider(r?.id ?? '', 'valide')).json()).toMatchObject({ motif: 'deja-decide' });
    expect(m.fournisseur.remboursements.size).toBe(1);
    expect((await m.liste()).json()).toEqual({ remboursements: [] });
    const journal = JSON.stringify(m.evenements);
    expect(journal).toContain('décision de remboursement');
    expect(journal).not.toContain('24100000000');
  });

  it('refus du valideur : aucun versement, décision tracée', async () => {
    const m = await monter();
    await m.payer('reussi');
    await m.annuler();
    const [r] = m.prepares;
    expect((await m.decider(r?.id ?? '', 'refuse')).json()).toMatchObject({ statut: 'refuse' });
    expect(m.fournisseur.remboursements.size).toBe(0);
    expect((await m.depot.trouverRemboursement(r?.id ?? ''))?.decidePar).toBe('u-v1');
  });

  it('ni agent IA, ni patient concerné, ni autre rôle ne décident ; aucun texte libre', async () => {
    const m = await monter();
    await m.payer('reussi');
    await m.annuler();
    const id = m.prepares[0]?.id ?? '';
    expect((await m.decider(id, 'valide', 'agent')).statusCode).toBe(403);
    expect((await m.decider(id, 'valide', 'soiMeme')).statusCode).toBe(403);
    expect((await m.decider(id, 'valide', 'medecin')).statusCode).toBe(403);
    expect((await m.decider(id, 'valide', 'patient')).statusCode).toBe(403);
    expect((await m.liste('medecin')).statusCode).toBe(403);
    const libre = await m.app.inject({
      method: 'POST',
      url: `/remboursements/${id}/decision`,
      headers: { authorization: 'Bearer valideur' },
      payload: { decision: 'valide', commentaire: '[FICTIF] texte libre' },
    });
    expect(libre.statusCode).toBe(400);
    expect(m.fournisseur.remboursements.size).toBe(0);
    // L'annulation n'est acceptée que d'un service autorisé.
    const parPatient = await m.app.inject({
      method: 'POST',
      url: '/rendez-vous/rdv-fictif-remb/annulation',
      headers: { authorization: 'Bearer patient' },
    });
    expect(parPatient.statusCode).toBe(401);
  });

  it('rendez-vous annulé avant paiement : collecte refusée, rien à rembourser', async () => {
    const m = await monter();
    const { id } = (
      await m.app.inject({
        method: 'POST',
        url: '/paiements',
        headers: { authorization: 'Bearer service-teleconsultation' },
        payload: { reference: 'rdv-fictif-remb', sujet: 'u-p1', type: 'generaliste' },
      })
    ).json<{ id: string }>();
    expect((await m.annuler()).json()).toEqual({ connu: true, aRembourser: false });
    const c = await m.app.inject({
      method: 'POST',
      url: `/paiements/${id}/collecte`,
      headers: { authorization: 'Bearer patient' },
      payload: { operateur: 'airtel', numero: '+241 00 00 00 00' },
    });
    expect(c.statusCode).toBe(409);
    expect(c.json()).toMatchObject({ motif: 'annule' });
    expect(m.fournisseur.tentatives.size).toBe(0);
    expect(m.prepares).toHaveLength(0);
  });

  it('paiement validé après l’annulation : le rapprochement prépare le remboursement', async () => {
    const m = await monter();
    const { tentative } = await m.payer();
    await m.annuler();
    expect(m.prepares).toHaveLength(0);
    // Le payeur valide sur son téléphone après l'annulation, et la notification se perd.
    m.fournisseur.conclure(tentative, 'reussi');
    expect(await m.service.rapprocher()).toEqual({
      relues: 1,
      prepares: 1,
      effectues: 0,
      recus: 0,
      erreurs: 0,
    });
    expect(m.prepares).toHaveLength(1);
    // Un second passage ne prépare rien de plus.
    expect((await m.service.rapprocher()).prepares).toBe(0);
  });

  it('prestataire injoignable au moment de rembourser : validé, puis exécuté au rapprochement', async () => {
    const m = await monter();
    await m.payer('reussi');
    await m.annuler();
    const id = m.prepares[0]?.id ?? '';
    m.fournisseur.indisponible = true;
    expect((await m.decider(id, 'valide')).json()).toMatchObject({ statut: 'valide' });
    expect(await m.service.rapprocher()).toMatchObject({ effectues: 0, erreurs: 1 });
    m.fournisseur.indisponible = false;
    expect(await m.service.rapprocher()).toMatchObject({ effectues: 1, erreurs: 0 });
    expect(m.fournisseur.remboursements.size).toBe(1);
  });

  it('annulation d’un rendez-vous sans paiement connu : sans effet', async () => {
    const m = await monter();
    expect((await m.annuler()).json()).toEqual({ connu: false, aRembourser: false });
  });
});
