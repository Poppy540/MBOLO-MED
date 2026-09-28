// Invitation d'un proche par le patient (ADR-0019). Données FICTIVES uniquement.
import type { RelatedPerson } from 'fhir/r4.js';
import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import { creerEmpreinte } from './codes.js';
import { DepotMemoire } from './depot.js';
import { ServiceProches, type DossierProches } from './proches.js';
import { ServiceInvitations } from './service.js';

const patient: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };
const demande = {
  prenom: 'Serge [FICTIF]',
  lien: 'CHILD' as const,
  telephone: '+33000000000',
  versionTexte: 'c-proche-v0.1-brouillon',
};

function monter(o: { ouvert?: boolean; smsEnPanne?: boolean; consentementRefuse?: boolean } = {}) {
  const depot = new DepotMemoire();
  const empreinte = creerEmpreinte('cle-de-test-fictive-de-32-octets-au-moins!!');
  const fiches = new Map<string, RelatedPerson>();
  const dossier: DossierProches = {
    creer: async (r) => {
      const id = `rp-${fiches.size + 1}`;
      fiches.set(id, { ...r, id });
      return id;
    },
    lire: async (id) => fiches.get(id),
    activer: async (id) => {
      const f = fiches.get(id);
      if (f) fiches.set(id, { ...f, active: true });
    },
    desactiver: async (id) => {
      const f = fiches.get(id);
      if (f) fiches.set(id, { ...f, active: false });
    },
  };
  const retraits: string[] = [];
  const consentements: { jeton: string; beneficiaire: string }[] = [];
  const sms: { telephone: string; code: string; jours: number }[] = [];
  let maintenant = new Date('2026-10-01T08:00:00Z');
  const proches = new ServiceProches(
    depot,
    empreinte,
    dossier,
    {
      accorder: async (c) => {
        if (o.consentementRefuse) throw new Error('refusé');
        consentements.push({ jeton: c.jetonPatient, beneficiaire: c.relatedPersonId });
      },
      retirer: async (c) => {
        retraits.push(`${c.jetonPatient}:${c.relatedPersonId}`);
      },
    },
    {
      envoyer: async (m) => {
        if (o.smsEnPanne) throw new Error('fournisseur indisponible');
        sms.push(m);
        return 'envoyee';
      },
    },
    { estActif: async (nom) => nom === 'consentement.proche' && o.ouvert !== false },
    { max: 3, validiteJours: 7, env: 'dev' },
    () => maintenant,
  );
  const invitations = new ServiceInvitations(
    depot,
    empreinte,
    { cohortes: ['ville-fictive'], quotaParCohorte: 10, validiteJours: 14 },
    () => maintenant,
    (i) => proches.activer(i),
  );
  return {
    proches,
    invitations,
    depot,
    fiches,
    consentements,
    retraits,
    sms,
    avancer: (jours: number) => {
      maintenant = new Date(maintenant.getTime() + jours * 86_400_000);
    },
  };
}

describe('invitation d’un proche par le patient (ADR-0019)', () => {
  it('fiche inactive, consentement du patient, code valable 7 jours envoyé par SMS', async () => {
    const m = monter();
    const r = await m.proches.inviter(patient, 'jeton-p1', demande);
    expect(r).toMatchObject({ sms: 'envoyee', expireLe: '2026-10-08T08:00:00.000Z' });
    expect(r.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // Fiche minimale : prénom et lien, inactive, rattachée au patient ; jamais le numéro.
    expect(m.fiches.get('rp-1')).toMatchObject({
      active: false,
      patient: { reference: 'Patient/pat-fictif-001' },
      name: [{ given: ['Serge [FICTIF]'] }],
    });
    expect(JSON.stringify([...m.fiches.values()])).not.toContain('+33000000000');
    // Consentement C-PROCHE avec le jeton du patient, pour cette fiche.
    expect(m.consentements).toEqual([{ jeton: 'jeton-p1', beneficiaire: 'rp-1' }]);
    expect(m.sms).toEqual([{ telephone: '+33000000000', code: r.code, jours: 7 }]);
    // Ni le code ni le numéro ne sont gardés : seulement une empreinte.
    const stocke = JSON.stringify(m.depot.invitations);
    expect(stocke).not.toContain(r.code.replace('-', ''));
    expect(stocke).not.toContain('+33000000000');
    expect(m.depot.invitations[0]).toMatchObject({ type: 'proche', relatedPersonId: 'rp-1' });
  });

  it('SMS en panne : l’invitation reste valable, le code est montré au patient en secours', async () => {
    const m = monter({ smsEnPanne: true });
    const r = await m.proches.inviter(patient, 'j', demande);
    expect(r.sms).toBe('echec');
    expect(await m.invitations.verifier(r.code, ['proche'])).toBe(true);
  });

  it('3 proches au plus ; une invitation expirée ou révoquée libère la place', async () => {
    const m = monter();
    const [a] = [await m.proches.inviter(patient, 'j', demande)];
    await m.proches.inviter(patient, 'j', demande);
    await m.proches.inviter(patient, 'j', demande);
    await expect(m.proches.inviter(patient, 'j', demande)).rejects.toMatchObject({
      statut: 409,
      motif: 'limite-atteinte',
    });
    await m.proches.revoquer(patient, 'j', a?.id ?? '');
    await expect(m.proches.inviter(patient, 'j', demande)).resolves.toBeDefined();
    m.avancer(8);
    await expect(m.proches.inviter(patient, 'j', demande)).resolves.toBeDefined();
  });

  it('refuse : professionnel, agent IA, proche, fonction fermée, prénom ou lien invalide', async () => {
    const m = monter();
    const medecin: Utilisateur = { sujet: 'u-m1', roles: ['professionnel'], practitionerId: 'p1' };
    const agent: Utilisateur = {
      ...patient,
      agent: { nom: 'agent-01-accueil', patientSession: 'pat-fictif-001' },
    };
    const proche: Utilisateur = { sujet: 'u-r1', roles: ['proche'], relatedPersonId: 'rp-x' };
    for (const u of [medecin, agent, proche]) {
      await expect(m.proches.inviter(u, 'j', demande)).rejects.toMatchObject({ statut: 403 });
    }
    await expect(
      monter({ ouvert: false }).proches.inviter(patient, 'j', demande),
    ).rejects.toMatchObject({ statut: 403, message: 'Fonction non disponible.' });
    await expect(
      m.proches.inviter(patient, 'j', { ...demande, prenom: '   ' }),
    ).rejects.toMatchObject({ statut: 400 });
    expect(m.fiches.size).toBe(0);
    expect(m.sms).toEqual([]);
  });

  it('consentement refusé par identite : aucun code, aucun SMS', async () => {
    const m = monter({ consentementRefuse: true });
    await expect(m.proches.inviter(patient, 'j', demande)).rejects.toThrow();
    expect(m.depot.invitations).toHaveLength(0);
    expect(m.sms).toEqual([]);
  });

  it('le patient liste ses proches (prénom, lien, statut) et révoque seulement les siens', async () => {
    const m = monter();
    const r = await m.proches.inviter(patient, 'j', demande);
    expect(await m.proches.lister(patient)).toEqual([
      expect.objectContaining({
        id: r.id,
        prenom: 'Serge [FICTIF]',
        lien: 'CHILD',
        statut: 'valide',
      }),
    ]);
    const autre: Utilisateur = { sujet: 'u-p2', roles: ['patient'], patientId: 'pat-fictif-002' };
    await expect(m.proches.revoquer(autre, 'j', r.id)).rejects.toMatchObject({ statut: 404 });
    expect(await m.proches.lister(autre)).toEqual([]);
  });
});

describe('inscription avec un code de proche', () => {
  it('refusé par défaut : un appelant qui ne connaît que les codes patient n’en fait jamais un compte', async () => {
    const m = monter();
    const r = await m.proches.inviter(patient, 'j', demande);
    expect(await m.invitations.verifier(r.code)).toBe(false);
    expect(await m.invitations.utiliser(r.code, 'u-nouveau')).toBeUndefined();
    expect(m.fiches.get('rp-1')?.active).toBe(false);
  });

  it('accepté quand l’appelant sait créer un compte de proche : fiche activée, type et fiche rendus', async () => {
    const m = monter();
    const r = await m.proches.inviter(patient, 'j', demande);
    expect(await m.invitations.utiliser(r.code, 'u-proche', ['patient', 'proche'])).toEqual({
      cohorte: 'proches',
      type: 'proche',
      relatedPersonId: 'rp-1',
    });
    expect(m.fiches.get('rp-1')?.active).toBe(true);
    expect((await m.proches.lister(patient))[0]?.statut).toBe('utilise');
    // Usage unique.
    expect(await m.invitations.utiliser(r.code, 'u-autre', ['patient', 'proche'])).toBeUndefined();
  });

  it('un code de patient reste un code de patient', async () => {
    const m = monter();
    const c = await m.invitations.creer({ cohorte: 'ville-fictive', par: 'u-gestion' });
    expect(await m.invitations.utiliser(c.code, 'u-nouveau', ['patient', 'proche'])).toEqual({
      cohorte: 'ville-fictive',
      type: 'patient',
    });
  });
});

describe('le patient retire un proche qui a déjà son compte', () => {
  it('partage retiré, fiche désactivée, place libérée ; une seule fois', async () => {
    const m = monter();
    const r = await m.proches.inviter(patient, 'jeton-p1', demande);
    await m.invitations.utiliser(r.code, 'u-proche', ['patient', 'proche']);
    expect(m.fiches.get('rp-1')?.active).toBe(true);
    await m.proches.revoquer(patient, 'jeton-p1', r.id);
    expect(m.retraits).toEqual(['jeton-p1:rp-1']);
    expect(m.fiches.get('rp-1')?.active).toBe(false);
    expect((await m.proches.lister(patient))[0]?.statut).toBe('revoque');
    await expect(m.proches.revoquer(patient, 'jeton-p1', r.id)).rejects.toMatchObject({
      statut: 404,
    });
    // Place libérée : 3 nouvelles invitations possibles.
    for (let i = 0; i < 3; i++) await m.proches.inviter(patient, 'j', demande);
  });
});
