// Décisions de vérification des professionnels sur un vrai PostgreSQL (ADR-0026, étapes 4 et 5) :
// migration réelle, rôle d'exécution restreint, contraintes de la table. Données de test uniquement ;
// exécuté si les variables MBOLO_TEST_DATABASE_URL* sont définies (toujours en CI).
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connecter, migrer, roleDe, type Sql } from '@mbolo/base-donnees';
import { DepotCandidaturesPostgres } from './candidature.js';
import { DepotDecisionsProPostgres, type DecisionPro } from './verification-pro.js';

const URL_MIGRATION = process.env['MBOLO_TEST_DATABASE_URL'];
const URL_EXECUTION = process.env['MBOLO_TEST_DATABASE_URL_EXECUTION'];

describe.runIf(URL_MIGRATION && URL_EXECUTION)(
  'décisions des professionnels sur PostgreSQL',
  () => {
    let proprietaire: Sql;
    let execution: Sql;
    const practitionerId = `prac-candidat-${randomUUID().slice(0, 8)}`;
    const decision = (o: Partial<DecisionPro> = {}): DecisionPro => ({
      id: randomUUID(),
      practitionerId,
      verificateur: 'sujet-verificateur-fictif',
      resultat: 'verifie',
      controles: [
        { point: 'diplome', source: 'registre-ordre', consulteLe: '2026-10-28', conforme: true },
      ],
      piecesARefaire: [],
      finValidite: '2027-10-01',
      decideLe: new Date('2026-10-28T09:00:00Z'),
      ...o,
    });

    const sansFin = (o: Partial<DecisionPro>): DecisionPro => {
      const d = decision(o);
      delete d.finValidite;
      return d;
    };

    beforeAll(async () => {
      proprietaire = connecter({
        url: URL_MIGRATION ?? '',
        application: 'essai',
        production: false,
      });
      execution = connecter({ url: URL_EXECUTION ?? '', application: 'essai', production: false });
      const dossier = new URL('../migrations/', import.meta.url);
      await migrer({
        sql: proprietaire,
        schema: 'documents',
        roleExecution: roleDe(URL_EXECUTION ?? ''),
        migrations: readdirSync(dossier).map((nom) => ({
          nom,
          sql: readFileSync(new URL(nom, dossier), 'utf8'),
        })),
      });
    });

    afterAll(async () => {
      await Promise.all([proprietaire.end(), execution.end()]);
    });

    it('garde les décisions, la plus récente d’abord, avec leurs contrôles', async () => {
      const depot = new DepotDecisionsProPostgres(execution);
      await depot.enregistrer(
        sansFin({
          resultat: 'a-completer',
          piecesARefaire: ['diplome'],
          decideLe: new Date('2026-10-27T09:00:00Z'),
        }),
      );
      await depot.enregistrer(decision());
      const lues = await depot.decisionsDe(practitionerId, 10);
      expect(lues.map((d) => d.resultat)).toEqual(['verifie', 'a-completer']);
      expect(lues[0]).toMatchObject({ finValidite: '2027-10-01', controles: decision().controles });
      expect(lues[1]?.piecesARefaire).toEqual(['diplome']);
    });

    it('refuse une décision incohérente (contraintes de la table) et toute suppression', async () => {
      const depot = new DepotDecisionsProPostgres(execution);
      // Refus sans motif, vérifié sans fin de validité, motif hors liste.
      await expect(depot.enregistrer(sansFin({ resultat: 'refuse' }))).rejects.toThrow();
      await expect(depot.enregistrer(sansFin({}))).rejects.toThrow();
      await expect(
        execution`insert into documents.decisions_professionnels
        (id, practitioner_id, verificateur, resultat, motif, controles, decide_le)
        values (${randomUUID()}, ${practitionerId}, 'sujet-fictif', 'refuse', 'texte libre',
                '[]'::jsonb, now())`,
      ).rejects.toThrow();
      await expect(
        execution`delete from documents.decisions_professionnels where practitioner_id = ${practitionerId}`,
      ).rejects.toThrow();
    });

    it('liste les fiches qui ont des pièces présentes', async () => {
      const pieces = new DepotCandidaturesPostgres(execution);
      const id = randomUUID();
      await pieces.insererPieceSiPlace(
        {
          id,
          practitionerId,
          type: 'diplome',
          format: 'image/jpeg',
          taille: 500,
          versionCharte: 'c-verification-pro-v0.1',
          cleEnveloppee: randomBytes(60),
          deposeLe: new Date('2026-10-28T08:00:00Z'),
          supprimerLe: new Date('2028-10-28T08:00:00Z'),
        },
        2,
      );
      const depot = new DepotDecisionsProPostgres(execution);
      expect((await depot.candidatsAvecPieces(10_000)).map((c) => c.practitionerId)).toContain(
        practitionerId,
      );
      await pieces.detruireClePiece(id, new Date('2026-10-29T08:00:00Z'));
      expect((await depot.candidatsAvecPieces(10_000)).map((c) => c.practitionerId)).not.toContain(
        practitionerId,
      );
    });

    it('suspension : motif de suspension obligatoire, jamais un motif de refus', async () => {
      const depot = new DepotDecisionsProPostgres(execution);
      const suspendu = (o: Partial<DecisionPro>) =>
        sansFin({ resultat: 'suspendu', controles: [], ...o });
      await expect(depot.enregistrer(suspendu({}))).rejects.toThrow();
      await expect(
        depot.enregistrer(suspendu({ motif: 'inscription-introuvable' })),
      ).rejects.toThrow();
      await expect(
        depot.enregistrer(sansFin({ resultat: 'refuse', motif: 'signalement-ordre' })),
      ).rejects.toThrow();
    });

    it('liste les fiches dont la dernière décision (hors « à compléter ») est une suspension', async () => {
      const depot = new DepotDecisionsProPostgres(execution);
      const fiche = `prac-suspendu-${randomUUID().slice(0, 8)}`;
      const ids = async () =>
        (await depot.remisEnVerification(10_000)).map((c) => c.practitionerId);
      await depot.enregistrer(decision({ practitionerId: fiche }));
      expect(await ids()).not.toContain(fiche);
      await depot.enregistrer(
        sansFin({
          practitionerId: fiche,
          resultat: 'suspendu',
          motif: 'signalement-ordre',
          controles: [],
          decideLe: new Date('2026-11-02T09:00:00Z'),
        }),
      );
      await depot.enregistrer(
        sansFin({
          practitionerId: fiche,
          resultat: 'a-completer',
          piecesARefaire: ['diplome'],
          decideLe: new Date('2026-11-03T09:00:00Z'),
        }),
      );
      expect(await ids()).toContain(fiche);
      await depot.enregistrer(
        decision({ practitionerId: fiche, decideLe: new Date('2026-11-04T09:00:00Z') }),
      );
      expect(await ids()).not.toContain(fiche);
    });

    it('échéance : par la plateforme seulement, et la fiche revient en vérification', async () => {
      const depot = new DepotDecisionsProPostgres(execution);
      const fiche = `prac-echeance-${randomUUID().slice(0, 8)}`;
      const echeance = (o: Partial<DecisionPro>) =>
        sansFin({ practitionerId: fiche, resultat: 'echeance', controles: [], ...o });
      await expect(
        depot.enregistrer(echeance({ verificateur: 'sujet-verificateur-fictif' })),
      ).rejects.toThrow();
      await depot.enregistrer(decision({ practitionerId: fiche, finValidite: '2027-10-01' }));
      const verifies = async (jour: string) =>
        (await depot.verifiesJusquau(jour, 10_000)).filter((v) => v.practitionerId === fiche);
      expect(await verifies('2027-09-30')).toEqual([]);
      expect(await verifies('2027-10-01')).toEqual([
        { practitionerId: fiche, finValidite: '2027-10-01' },
      ]);
      await depot.enregistrer(
        echeance({ verificateur: 'plateforme', decideLe: new Date('2027-10-02T03:00:00Z') }),
      );
      expect(await verifies('2027-10-02')).toEqual([]);
      expect((await depot.remisEnVerification(10_000)).map((c) => c.practitionerId)).toContain(
        fiche,
      );
    });
  },
);
