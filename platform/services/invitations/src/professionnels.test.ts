// Invitation des professionnels de santé par l'équipe de recrutement (ADR-0026).
// Données FICTIVES uniquement.
import type { Practitioner } from 'fhir/r4.js';
import { statutVerification } from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { creerEmpreinte } from './codes.js';
import { DepotMemoire } from './depot.js';
import { LimiteurMemoire } from './limiteur.js';
import { ServiceRecrutement } from './professionnels.js';
import { creerServeur } from './serveur.js';
import { ServiceInvitations } from './service.js';

// Jetons factices : le vérificateur réel (signature Keycloak) est testé dans @mbolo/identite.
const UTILISATEURS: Record<string, Utilisateur> = {
  recruteur: { sujet: 'sujet-recruteur-fictif', roles: ['recrutement'] },
  gestionnaire: { sujet: 'sujet-gestionnaire-fictif', roles: ['gestion-invitations'] },
  medecin: { sujet: 'sujet-medecin-fictif', roles: ['professionnel'], practitionerId: 'p' },
  agent: {
    sujet: 'sujet-agent-fictif',
    roles: ['recrutement', 'agent-ia'],
    agent: { nom: 'agent-03', patientSession: 'aucune' },
  },
};
const TOUS_TYPES = ['patient', 'proche', 'professionnel'];

async function monter(o: { ouvert?: boolean; quota?: number } = {}) {
  const depot = new DepotMemoire();
  const empreinte = creerEmpreinte('essai-'.repeat(8));
  const fiches = new Map<string, Practitioner>();
  const lignes: string[] = [];
  const recrutement = new ServiceRecrutement(
    depot,
    empreinte,
    {
      creer: async (p) => {
        const id = `prac-candidat-${fiches.size + 1}`;
        fiches.set(id, { ...p, id });
        return id;
      },
    },
    { estActif: async (nom) => nom === 'professionnels.recrutement' && (o.ouvert ?? true) },
    { validiteJours: 14, quota: o.quota ?? 200, env: 'dev' },
  );
  const app = await creerServeur({
    verifierJeton: async (j) => {
      const u = UTILISATEURS[j];
      if (!u) throw new Error('jeton invalide');
      return u;
    },
    service: new ServiceInvitations(depot, empreinte, {
      cohortes: ['ville-fictive'],
      quotaParCohorte: 100,
      validiteJours: 14,
    }),
    limiteur: new LimiteurMemoire(100, 60_000),
    journal: creerJournal({ service: 'invitations', ecrire: (l) => lignes.push(l) }),
    verifierService: async (j) => {
      if (j !== 'extension') throw new Error('jeton de service invalide');
      return 'mbolo-keycloak-inscription';
    },
    recrutement,
  });
  const appeler = (
    methode: 'GET' | 'POST',
    url: string,
    jeton?: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method: methode,
      url,
      headers: jeton ? { authorization: `Bearer ${jeton}` } : {},
      ...(payload ? { payload } : {}),
    });
  const inviter = (jeton = 'recruteur', payload: Record<string, unknown> = {}) =>
    appeler('POST', '/professionnels', jeton, {
      nom: 'Fictif',
      prenom: 'Amina',
      ...payload,
    });
  const extension = (chemin: string, payload: Record<string, unknown>) =>
    appeler('POST', `/inscription/${chemin}`, 'extension', payload);
  return { app, fiches, lignes, appeler, inviter, extension };
}

describe('invitation des professionnels (ADR-0026)', () => {
  it('le recruteur invite : fiche inactive « à vérifier », code montré une fois, jamais journalisé', async () => {
    const m = await monter();
    const r = await m.inviter();
    expect(r.statusCode).toBe(201);
    const corps = r.json<{ id: string; code: string; practitionerId: string; expireLe: string }>();
    expect(corps.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const fiche = m.fiches.get(corps.practitionerId);
    expect(fiche?.active).toBe(false);
    expect(fiche && statutVerification(fiche)).toBe('a-verifier');
    expect(fiche?.name).toEqual([{ family: 'Fictif', given: ['Amina'] }]);
    // Ni le code ni le nom dans le journal ; le recruteur et la fiche suffisent.
    const journal = m.lignes.join('\n');
    expect(journal).not.toContain(corps.code.replace('-', ''));
    expect(journal).not.toContain('Amina');
    expect(journal).toContain(corps.practitionerId);

    const liste = (await m.appeler('GET', '/professionnels', 'recruteur')).json<{
      invitations: { id: string; statut: string; creePar: string }[];
    }>();
    expect(liste.invitations).toEqual([
      expect.objectContaining({
        id: corps.id,
        statut: 'valide',
        creePar: 'sujet-recruteur-fictif',
      }),
    ]);
  });

  it('le candidat utilise son code à l’inscription : rattaché à sa fiche, une seule fois', async () => {
    const m = await monter();
    const { code, practitionerId } = (await m.inviter()).json<{
      code: string;
      practitionerId: string;
    }>();
    const controle = await m.extension('controle', {
      code,
      adresse: '192.0.2.20',
      types: TOUS_TYPES,
    });
    expect(controle.json()).toEqual({ valide: true });
    const utilise = await m.extension('utilisation', {
      code,
      sujet: 'sujet-candidat-fictif',
      types: TOUS_TYPES,
    });
    expect(utilise.json()).toEqual({
      cohorte: 'professionnels',
      type: 'professionnel',
      practitionerId,
    });
    // La fiche reste inactive : seule la vérification par une personne habilitée l'activera.
    expect(m.fiches.get(practitionerId)?.active).toBe(false);
    const seconde = await m.extension('utilisation', {
      code,
      sujet: 'sujet-autre-fictif',
      types: TOUS_TYPES,
    });
    expect(seconde.statusCode).toBe(409);
  });

  it('une extension qui ne connaît pas les professionnels ne crée jamais de compte avec ce code', async () => {
    const m = await monter();
    const { code } = (await m.inviter()).json<{ code: string }>();
    for (const types of [undefined, ['patient'], ['patient', 'proche']]) {
      const payload = { code, adresse: '192.0.2.21', ...(types ? { types } : {}) };
      expect((await m.extension('controle', payload)).json()).toEqual({ valide: false });
      const sujet = { code, sujet: 'sujet-candidat-fictif', ...(types ? { types } : {}) };
      expect((await m.extension('utilisation', sujet)).statusCode).toBe(409);
    }
    // Le code n'a pas été « brûlé » par ces refus.
    expect(
      (await m.extension('controle', { code, adresse: '192.0.2.21', types: TOUS_TYPES })).json(),
    ).toEqual({ valide: true });
  });

  it('refuse : sans jeton (401), médecin, gestionnaire des patients ou agent IA (403), flag fermé (403)', async () => {
    const m = await monter();
    expect((await m.inviter('')).statusCode).toBe(401);
    for (const jeton of ['medecin', 'gestionnaire', 'agent']) {
      expect((await m.inviter(jeton)).statusCode).toBe(403);
      expect((await m.appeler('GET', '/professionnels', jeton)).statusCode).toBe(403);
    }
    expect(m.fiches.size).toBe(0);
    const ferme = await monter({ ouvert: false });
    expect((await ferme.inviter()).statusCode).toBe(403);
    expect(ferme.fiches.size).toBe(0);
  });

  it('refuse un nom invalide ou un champ inconnu (400), sans rien écrire dans le dossier', async () => {
    const m = await monter();
    for (const payload of [
      { nom: '' },
      { prenom: 'Amina2' },
      { nom: 'Fictif <script>' },
      { nom: 'x'.repeat(81) },
      { telephone: '+241 00 00 00 00' },
    ]) {
      expect((await m.inviter('recruteur', payload)).statusCode).toBe(400);
    }
    expect(m.fiches.size).toBe(0);
  });

  it('révocation : le code ne sert plus ; un code utilisé ou d’un autre type ne se révoque pas ici', async () => {
    const m = await monter();
    const { id, code } = (await m.inviter()).json<{ id: string; code: string }>();
    const revoque = await m.appeler('POST', `/professionnels/${id}/revocation`, 'recruteur');
    expect(revoque.json()).toEqual({ statut: 'revoque' });
    expect(
      (await m.extension('controle', { code, adresse: '192.0.2.22', types: TOUS_TYPES })).json(),
    ).toEqual({ valide: false });
    expect(
      (await m.appeler('POST', `/professionnels/${id}/revocation`, 'recruteur')).statusCode,
    ).toBe(404);
    const patient = (
      await m.appeler('POST', '/invitations', 'gestionnaire', { cohorte: 'ville-fictive' })
    ).json<{ id: string }>();
    expect(
      (await m.appeler('POST', `/professionnels/${patient.id}/revocation`, 'recruteur')).statusCode,
    ).toBe(404);
  });

  it('quota atteint : 409, aucune fiche créée de plus', async () => {
    const m = await monter({ quota: 1 });
    expect((await m.inviter()).statusCode).toBe(201);
    const r = await m.inviter();
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ motif: 'quota-atteint' });
    expect(m.fiches.size).toBe(1);
  });
});
