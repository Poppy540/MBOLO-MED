// Commande de rotation de la clé maître (ADR-0016), lancée par un humain habilité :
//   node dist/rotation-commande.js
// Même configuration que le service (base, clés). Ré-enveloppe les clés des documents avec la clé
// maître actuelle ; ne déchiffre jamais les documents ; journalise seulement des nombres.
import { connecter } from '@mbolo/base-donnees';
import { creerJournal } from '@mbolo/journal-securise';
import { trousseauDepuis } from './cles.js';
import { DepotCandidaturesPostgres } from './candidature.js';
import { DepotPostgres } from './depot.js';
import { reenvelopper } from './rotation.js';

const journal = creerJournal({ service: 'documents-rotation' });
const url = process.env['DOCUMENTS_DATABASE_URL'];
if (!url) {
  journal.erreur('DOCUMENTS_DATABASE_URL est obligatoire.');
  process.exit(1);
}
const sql = connecter({
  url,
  application: 'documents-rotation',
  production: process.env['MBOLO_ENV'] === 'prod',
  max: 1,
});
try {
  const trousseau = trousseauDepuis(process.env);
  journal.info('rotation de la clé maître démarrée', { cle: trousseau.actuelle.identifiant });
  const bilan = await reenvelopper(new DepotPostgres(sql), trousseau);
  journal.info('rotation de la clé maître terminée', { ...bilan });
  // Pièces des professionnels (ADR-0026) : mêmes enveloppes, autre table.
  const pieces = await reenvelopper(new DepotCandidaturesPostgres(sql), trousseau);
  journal.info('rotation de la clé maître terminée (pièces des professionnels)', { ...pieces });
} catch (e) {
  journal.erreur('rotation de la clé maître interrompue (reprise possible)', { err: e });
  process.exitCode = 1;
} finally {
  await sql.end();
}
