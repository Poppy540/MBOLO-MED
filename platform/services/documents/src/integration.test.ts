// Intégration sur un vrai PostgreSQL et un vrai stockage S3 (SeaweedFS en local et en CI) : données
// de test uniquement. Exécuté si les variables MBOLO_TEST_* sont définies (toujours en CI).
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connecter, migrer, roleDe, type Sql } from '@mbolo/base-donnees';
import { CleMaitreLocale } from './chiffrement.js';
import { DepotPostgres } from './depot.js';
import { ServiceDocuments } from './service.js';
import { StockageS3 } from './stockage.js';

const env = process.env;
const URL_MIGRATION = env['MBOLO_TEST_DATABASE_URL'];
const URL_EXECUTION = env['MBOLO_TEST_DATABASE_URL_EXECUTION'];
const S3 = env['MBOLO_TEST_S3_URL'];
const CLE = env['MBOLO_TEST_S3_CLE'];
const SECRET = env['MBOLO_TEST_S3_SECRET'];

const jpeg = () =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4_000, 'FICTIF-')]);

describe.runIf(URL_MIGRATION && URL_EXECUTION && S3 && CLE && SECRET)(
  'documents sur PostgreSQL et S3',
  () => {
    let proprietaire: Sql;
    let execution: Sql;
    let service: ServiceDocuments;
    let horloge = new Date('2026-10-01T08:00:00Z');
    const compartiment = `mbolo-test-${randomBytes(4).toString('hex')}`;
    const patientId = `pat-fictif-${randomUUID().slice(0, 8)}`;
    const s3 = { url: S3 ?? '', region: 'us-east-1', cleAcces: CLE ?? '', secret: SECRET ?? '' };

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
      await new S3Client({
        endpoint: s3.url,
        region: s3.region,
        forcePathStyle: true,
        credentials: { accessKeyId: s3.cleAcces, secretAccessKey: s3.secret },
      }).send(new CreateBucketCommand({ Bucket: compartiment }));
      service = new ServiceDocuments(
        new DepotPostgres(execution),
        new StockageS3({ ...s3, compartiment }),
        new CleMaitreLocale(randomBytes(32).toString('base64')),
        { conservationJours: 30, maxParType: 2 },
        () => horloge,
      );
    });

    afterAll(async () => {
      await Promise.all([proprietaire.end(), execution.end()]);
    });

    it('dépose, relit, puis supprime à échéance ; la base ne garde aucune image', async () => {
      const photo = jpeg();
      const r = await service.deposer({
        patientId,
        type: 'visage',
        octets: photo,
        versionCharte: '0.1',
      });
      expect((await service.lire(r.id)).octets).toEqual(photo);
      const [ligne] = await proprietaire`select * from documents.documents where id = ${r.id}`;
      expect(JSON.stringify(ligne)).not.toContain('FICTIF-FICTIF-');

      horloge = new Date('2026-11-01T08:00:00Z');
      expect(await service.supprimerEchus()).toBeGreaterThanOrEqual(1);
      await expect(service.lire(r.id)).rejects.toMatchObject({ motif: 'introuvable' });
      const [trace] = await proprietaire<{ cle_enveloppee: Buffer | null; supprime_le: Date }[]>`
        select cle_enveloppee, supprime_le from documents.documents where id = ${r.id}`;
      expect(trace?.cle_enveloppee).toBeNull();
      expect(trace?.supprime_le).toBeInstanceOf(Date);
    });

    it('deux envois simultanés ne dépassent pas la limite par type (verrou)', async () => {
      const autre = `pat-fictif-conc-${randomBytes(4).toString('hex')}`;
      const envois = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          service.deposer({
            patientId: autre,
            type: 'piece-identite',
            octets: jpeg(),
            versionCharte: '0.1',
          }),
        ),
      );
      expect(envois.filter((e) => e.status === 'fulfilled')).toHaveLength(2);
      expect(await service.duPatient(autre)).toHaveLength(2);
    });

    it('patients en attente de décision, puis décision enregistrée (sans texte libre)', async () => {
      const depot = new DepotPostgres(execution);
      const autre = `pat-fictif-att-${randomBytes(4).toString('hex')}`;
      const deposer = (type: string) =>
        service.deposer({ patientId: autre, type, octets: jpeg(), versionCharte: '0.1' });
      await deposer('acte-naissance');
      const enAttente = async () => (await depot.enAttente(1000)).map((e) => e.patientId);
      // Il manque encore la photo du visage.
      expect(await enAttente()).not.toContain(autre);
      await deposer('visage');
      expect(await enAttente()).toContain(autre);
      horloge = new Date(horloge.getTime() + 60_000);
      await depot.enregistrerDecision({
        id: randomUUID(),
        patientId: autre,
        verificateur: 'u-verificateur-fictif',
        resultat: 'refusee',
        motif: 'photo-illisible',
        decideLe: horloge,
      });
      expect(await enAttente()).not.toContain(autre);
      expect(await depot.derniereDecision(autre)).toMatchObject({
        resultat: 'refusee',
        motif: 'photo-illisible',
      });
      // Un refus sans motif est rejeté par la base elle-même.
      await expect(
        depot.enregistrerDecision({
          id: randomUUID(),
          patientId: autre,
          verificateur: 'u-verificateur-fictif',
          resultat: 'refusee',
          decideLe: horloge,
        }),
      ).rejects.toThrow();
    });

    it('le service ne peut supprimer aucune ligne de la base', async () => {
      await expect(execution`delete from documents.documents`).rejects.toThrow(/permission/);
    });
  },
);
