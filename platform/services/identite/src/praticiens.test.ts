// Statut des professionnels lu dans le dossier (ADR-0026, étape 5). Données FICTIVES uniquement.
import { praticien } from '@mbolo/dossier-fhir';
import { describe, expect, it } from 'vitest';
import { FichesPraticiensFhir } from './praticiens.js';

const MAINTENANT = new Date('2026-10-30T09:00:00Z');
const inscription = {
  specialite: 'Médecine générale',
  numero: 'FICTIF-ORDRE-0001',
  ordre: 'Ordre des médecins [FICTIF]',
  debut: '2026-01-01',
  fin: '2027-01-01',
};

function fiches(reponse: () => Response) {
  const appels: { url: string; entetes: Headers }[] = [];
  const f = new FichesPraticiensFhir({
    base: 'https://fhir.test/fhir/',
    fetch: async (url, init) => {
      appels.push({ url: String(url), entetes: new Headers(init?.headers) });
      return reponse();
    },
  });
  return { f, appels };
}
const json = (corps: object, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/fhir+json' },
  });

describe('statut des professionnels lu sans cache', () => {
  it('vérifié et inscription valable : oui ; fiche lue sans cache', async () => {
    const { f, appels } = fiches(() =>
      json(praticien({ nom: 'Fictif', prenom: 'A', statut: 'verifie', inscription, env: 'dev' })),
    );
    expect(await f.verifie('prac-fictif-001', MAINTENANT)).toBe(true);
    expect(appels[0]?.url).toBe('https://fhir.test/fhir/Practitioner/prac-fictif-001');
    expect(appels[0]?.entetes.get('cache-control')).toBe('no-cache');
  });

  it('suspendu, inscription échue ou fiche absente : non', async () => {
    const suspendu = {
      ...praticien({ nom: 'Fictif', prenom: 'A', statut: 'suspendu', inscription, env: 'dev' }),
      active: false,
    };
    expect(await fiches(() => json(suspendu)).f.verifie('prac-fictif-001', MAINTENANT)).toBe(false);
    const echue = praticien({
      nom: 'Fictif',
      prenom: 'A',
      statut: 'verifie',
      inscription: { ...inscription, fin: '2026-10-29' },
      env: 'dev',
    });
    expect(await fiches(() => json(echue)).f.verifie('prac-fictif-001', MAINTENANT)).toBe(false);
    expect(await fiches(() => json({}, 404)).f.verifie('prac-fictif-001', MAINTENANT)).toBe(false);
  });

  it('dossier en erreur : 503, jamais un accord', async () => {
    await expect(
      fiches(() => json({}, 500)).f.verifie('prac-fictif-001', MAINTENANT),
    ).rejects.toMatchObject({ statut: 503 });
  });
});
