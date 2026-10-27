// Dossier de candidature d'un professionnel (ADR-0026). Données FICTIVES uniquement.
import { EXTENSION_STATUT_VERIFICATION, praticien } from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { creerJournal, type Evenement } from '@mbolo/journal-securise';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DepotCandidaturesMemoire, ServiceCandidature } from './candidature.js';
import { CleMaitreLocale, TrousseauCles, dechiffrer } from './chiffrement.js';
import { ConditionsMemoire } from './conditions.js';
import { DepotMemoire } from './depot.js';
import { DossierMemoire, FichesMemoire } from './dossier.js';
import { reenvelopper } from './rotation.js';
import { creerServeur } from './serveur.js';
import { ServiceDocuments } from './service.js';
import { StockageMemoire } from './stockage.js';
import { ServiceVerification } from './verification.js';
import { ServiceVerificateur } from './verificateur.js';

const CANDIDAT = 'prac-candidat-001';
// Jetons factices : la vérification réelle (signature Keycloak) est testée dans @mbolo/identite.
const COMPTES: Record<string, Utilisateur> = {
  candidat: { sujet: 'u-c1', roles: ['professionnel-candidat'], practitionerId: CANDIDAT },
  sansFiche: { sujet: 'u-c2', roles: ['professionnel-candidat'] },
  medecin: { sujet: 'u-m1', roles: ['professionnel'], practitionerId: 'prac-fictif-001' },
  patient: { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' },
  agent: {
    sujet: 'u-agent',
    roles: ['professionnel-candidat', 'agent-ia'],
    practitionerId: CANDIDAT,
    agent: { nom: 'agent-03-recrutement', patientSession: 'aucune' },
  },
};
const VERSION = 'c-verification-pro-v0.1';
const PARAMETRES = {
  versionCharte: VERSION,
  conservationJours: 730,
  maxParType: 2,
  specialites: ['medecine-generale', 'pediatrie'],
  langues: ['fr', 'en', 'fan'],
};
const ficheCandidat = () =>
  praticien({ nom: 'Candidat', prenom: 'Médecin [FICTIF]', statut: 'a-verifier', env: 'dev' });
const DECLARATION = {
  specialite: 'pediatrie',
  paysOrdre: 'GA',
  numeroOrdre: 'FICTIF-ORDRE-0002',
  langues: ['fr', 'fan'],
};
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(500)]);
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(200)]);

async function monter() {
  const evenements: Evenement[] = [];
  const stockage = new StockageMemoire();
  const maitre = new CleMaitreLocale(randomBytes(32).toString('base64'));
  const depotPieces = new DepotCandidaturesMemoire();
  const fiches = new FichesMemoire(new Map([[CANDIDAT, ficheCandidat()]]));
  const horloge = { maintenant: new Date('2026-10-28T08:00:00Z') };
  const candidature = new ServiceCandidature(
    depotPieces,
    stockage,
    maitre,
    fiches,
    PARAMETRES,
    () => horloge.maintenant,
  );
  // Parcours des patients, inutilisé ici mais requis par le serveur.
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
    candidature,
    journal: creerJournal({
      service: 'documents',
      ecrire: (ligne) => evenements.push(JSON.parse(ligne) as Evenement),
    }),
  });
  const appel = (methode: 'GET' | 'POST' | 'PUT', url: string, compte?: string, corps?: object) =>
    app.inject({
      method: methode,
      url,
      headers: compte ? { authorization: `Bearer ${compte}` } : {},
      ...(corps ? { payload: corps } : {}),
    });
  const envoyer = (compte: string, type: string, octets: Buffer, contentType = 'image/jpeg') =>
    app.inject({
      method: 'POST',
      url: `/candidature/pieces/${type}`,
      headers: { authorization: `Bearer ${compte}`, 'content-type': contentType },
      payload: octets,
    });
  const accepter = (compte = 'candidat', version = VERSION, accepte = true) =>
    appel('POST', '/candidature/charte', compte, { version, accepte });
  return {
    app,
    candidature,
    depotPieces,
    fiches,
    stockage,
    maitre,
    evenements,
    horloge,
    appel,
    envoyer,
    accepter,
  };
}

describe('dossier de candidature (ADR-0026)', () => {
  it('le candidat accepte la charte puis dépose ses pièces, chiffrées, sans contenu dans le journal', async () => {
    const m = await monter();
    const initial = await m.appel('GET', '/candidature', 'candidat');
    expect(initial.json()).toEqual({
      practitionerId: CANDIDAT,
      charte: { version: VERSION, acceptee: false },
      statut: 'a-verifier',
      pieces: [],
    });
    // Aucune pièce avant la charte.
    expect((await m.envoyer('candidat', 'diplome', jpeg())).statusCode).toBe(409);
    expect((await m.accepter()).statusCode).toBe(204);
    const diplome = jpeg();
    const r = await m.envoyer('candidat', 'diplome', diplome);
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ type: 'diplome', format: 'image/jpeg' });
    expect((await m.envoyer('candidat', 'inscription-ordre', png(), 'image/png')).statusCode).toBe(
      201,
    );
    const etat = (await m.appel('GET', '/candidature', 'candidat')).json<{
      charte: { acceptee: boolean };
      pieces: { type: string }[];
    }>();
    expect(etat.charte.acceptee).toBe(true);
    expect(etat.pieces.map((p) => p.type).sort()).toEqual(['diplome', 'inscription-ordre']);
    // Stockage chiffré : le contenu en clair n'est jamais écrit, mais se relit avec la clé.
    const [piece] = (await m.depotPieces.piecesDe(CANDIDAT)).filter((p) => p.type === 'diplome');
    const stocke = await m.stockage.lire(piece?.id ?? '');
    expect(stocke?.includes(diplome.subarray(4, 40))).toBe(false);
    expect(
      await dechiffrer(
        stocke ?? Buffer.alloc(0),
        piece?.cleEnveloppee ?? Buffer.alloc(0),
        piece?.id ?? '',
        m.maitre,
      ),
    ).toEqual(diplome);
    // Journal : qui, quelle fiche, quel type ; jamais le contenu.
    const journal = JSON.stringify(m.evenements);
    expect(journal).toContain('pièce de candidature déposée');
    expect(journal).not.toContain(diplome.subarray(4, 40).toString('base64'));
  });

  it('refuse tout autre compte : patient, médecin, agent IA, candidat sans fiche (403), sans jeton (401)', async () => {
    const m = await monter();
    for (const compte of ['patient', 'medecin', 'agent', 'sansFiche']) {
      expect((await m.appel('GET', '/candidature', compte)).statusCode).toBe(403);
      expect((await m.accepter(compte)).statusCode).toBe(403);
      expect((await m.envoyer(compte, 'diplome', jpeg())).statusCode).toBe(403);
      expect(
        (await m.appel('PUT', '/candidature/declaration', compte, DECLARATION)).statusCode,
      ).toBe(403);
    }
    expect(m.fiches.versions.size).toBe(0);
    expect((await m.appel('GET', '/candidature')).statusCode).toBe(401);
    expect(m.depotPieces.chartes).toHaveLength(0);
    expect(m.depotPieces.pieces).toHaveLength(0);
  });

  it('charte : ancienne version refusée (409) ; un refus plus récent bloque les dépôts', async () => {
    const m = await monter();
    expect((await m.accepter('candidat', 'c-verification-pro-v0.0')).statusCode).toBe(409);
    await m.accepter();
    m.horloge.maintenant = new Date('2026-10-28T09:00:00Z');
    expect((await m.accepter('candidat', VERSION, false)).statusCode).toBe(204);
    expect((await m.envoyer('candidat', 'diplome', jpeg())).statusCode).toBe(409);
    expect((await m.appel('GET', '/candidature', 'candidat')).json()).toMatchObject({
      charte: { acceptee: false },
    });
  });

  it('refuse un type inconnu (400), un autre format (415), une troisième pièce du même type (409)', async () => {
    const m = await monter();
    await m.accepter();
    expect((await m.envoyer('candidat', 'casier-judiciaire', jpeg())).statusCode).toBe(400);
    // Un PDF déclaré comme JPEG est reconnu par son contenu et refusé.
    expect(
      (await m.envoyer('candidat', 'diplome', Buffer.from('%PDF-1.7 [FICTIF]'))).statusCode,
    ).toBe(415);
    expect((await m.envoyer('candidat', 'piece-identite', jpeg())).statusCode).toBe(201);
    expect((await m.envoyer('candidat', 'piece-identite', jpeg())).statusCode).toBe(201);
    expect((await m.envoyer('candidat', 'piece-identite', jpeg())).statusCode).toBe(409);
  });

  it('à échéance, la clé est détruite puis l’objet supprimé', async () => {
    const m = await monter();
    await m.accepter();
    await m.envoyer('candidat', 'diplome', jpeg());
    const [piece] = await m.depotPieces.piecesDe(CANDIDAT);
    expect(await m.candidature.supprimerEchus()).toBe(0);
    m.horloge.maintenant = new Date('2028-10-28T08:00:00Z');
    expect(await m.candidature.supprimerEchus()).toBe(1);
    expect(await m.stockage.lire(piece?.id ?? '')).toBeUndefined();
    expect(m.depotPieces.pieces[0]?.cleEnveloppee).toBeUndefined();
    expect(await m.depotPieces.piecesDe(CANDIDAT)).toEqual([]);
  });

  it('la rotation de la clé maître ré-enveloppe aussi les pièces, sans changer leur contenu', async () => {
    const ancienne = new CleMaitreLocale(randomBytes(32).toString('base64'), 'ancienne');
    const nouvelle = new CleMaitreLocale(randomBytes(32).toString('base64'), 'nouvelle');
    const depot = new DepotCandidaturesMemoire();
    const stockage = new StockageMemoire();
    const service = new ServiceCandidature(
      depot,
      stockage,
      new TrousseauCles(ancienne),
      new FichesMemoire(new Map([[CANDIDAT, ficheCandidat()]])),
      PARAMETRES,
    );
    await service.deciderCharte(COMPTES['candidat'] as Utilisateur, {
      version: VERSION,
      accepte: true,
    });
    const contenu = jpeg();
    const { id } = await service.deposer(COMPTES['candidat'] as Utilisateur, 'diplome', contenu);
    const trousseau = new TrousseauCles(nouvelle, [ancienne]);
    expect(await reenvelopper(depot, trousseau)).toMatchObject({ examinees: 1, reenveloppees: 1 });
    const cle = depot.pieces[0]?.cleEnveloppee ?? Buffer.alloc(0);
    expect(TrousseauCles.identifiantDe(cle)).toBe('nouvelle');
    expect(
      await dechiffrer(
        (await stockage.lire(id)) ?? Buffer.alloc(0),
        cle,
        id,
        new TrousseauCles(nouvelle),
      ),
    ).toEqual(contenu);
  });

  describe('déclaration (3b)', () => {
    const declarer = (m: Awaited<ReturnType<typeof monter>>, corps: object = DECLARATION) =>
      m.appel('PUT', '/candidature/declaration', 'candidat', corps);

    it('après la charte, la déclaration est écrite dans la fiche sans période et relue', async () => {
      const m = await monter();
      expect((await declarer(m)).statusCode).toBe(409);
      await m.accepter();
      expect((await declarer(m)).statusCode).toBe(204);
      const fiche = m.fiches.fiches.get(CANDIDAT);
      expect(fiche?.active).toBe(false);
      expect(fiche?.name?.[0]?.family).toBe('Candidat');
      expect(fiche?.qualification?.[0]?.period).toBeUndefined();
      expect((await m.appel('GET', '/candidature', 'candidat')).json()).toMatchObject({
        statut: 'a-verifier',
        declaration: DECLARATION,
      });
      // Correction avant la vérification : la dernière déclaration remplace la précédente.
      expect((await declarer(m, { ...DECLARATION, langues: ['en'] })).statusCode).toBe(204);
      expect(m.fiches.fiches.get(CANDIDAT)?.communication).toHaveLength(1);
      expect(JSON.stringify(m.evenements)).not.toContain('FICTIF-ORDRE-0002');
    });

    it('refuse une spécialité ou une langue hors des listes du pays, un champ inconnu (400)', async () => {
      const m = await monter();
      await m.accepter();
      for (const corps of [
        { ...DECLARATION, specialite: 'cardiologie' },
        { ...DECLARATION, specialite: 'Chirurgie [texte libre]' },
        { ...DECLARATION, langues: ['es'] },
        { ...DECLARATION, numeroOrdre: '<b>1</b>' },
        { ...DECLARATION, paysOrdre: 'Gabon' },
        { ...DECLARATION, commentaire: 'texte libre' },
      ]) {
        expect((await declarer(m, corps)).statusCode).toBe(400);
      }
      expect(m.fiches.versions.size).toBe(0);
    });

    it('fiche vérifiée, refusée ou suspendue : plus modifiable (409)', async () => {
      const m = await monter();
      await m.accepter();
      for (const statut of ['verifie', 'refuse', 'suspendu']) {
        m.fiches.changer(CANDIDAT, {
          ...ficheCandidat(),
          extension: [{ url: EXTENSION_STATUT_VERIFICATION, valueCode: statut }],
        });
        expect((await declarer(m)).statusCode).toBe(409);
      }
      expect(m.fiches.fiches.get(CANDIDAT)?.qualification).toBeUndefined();
    });

    it('une décision arrivée entre la lecture et l’écriture n’est jamais écrasée (409)', async () => {
      const m = await monter();
      await m.accepter();
      const lire = m.fiches.lire.bind(m.fiches);
      m.fiches.lire = async (id) => {
        const lue = await lire(id);
        // La personne habilitée décide pendant la déclaration.
        m.fiches.changer(CANDIDAT, {
          ...ficheCandidat(),
          extension: [{ url: EXTENSION_STATUT_VERIFICATION, valueCode: 'refuse' }],
        });
        return lue;
      };
      expect((await declarer(m)).statusCode).toBe(409);
      expect(m.fiches.fiches.get(CANDIDAT)?.qualification).toBeUndefined();
    });
  });
});
