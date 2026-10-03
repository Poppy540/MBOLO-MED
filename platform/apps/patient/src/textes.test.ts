import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Catalogue } from '@mbolo/client-web';

// Chaque texte des catalogues est traduit et validé dans chaque langue (ADR-0025) : un texte qui n'est
// plus affiché coûterait une traduction pour rien. Les clés sont cherchées dans le code des écrans.
// Les écrans chargés à la demande ont leur propre catalogue (`textes-fr-<écran>.ts`), chargé avec eux.
const dossier = new URL('.', import.meta.url).pathname;
const fichiers = readdirSync(dossier);
const code = fichiers
  .filter((f) => f.endsWith('.tsx') || (f.endsWith('.ts') && !f.startsWith('textes')))
  .map((f) => readFileSync(join(dossier, f), 'utf8'))
  .join('\n');
const catalogues = fichiers.filter((f) => /^textes-fr(-[a-z-]+)?\.ts$/.test(f));

async function lire(fichier: string): Promise<Catalogue> {
  const module = (await import(`./${fichier}`)) as Record<string, unknown>;
  const catalogue = Object.values(module).find(
    (v): v is Catalogue => typeof v === 'object' && v !== null,
  );
  if (!catalogue) throw new Error(`Aucun catalogue exporté par ${fichier}`);
  return catalogue;
}

describe('catalogues français de l’application patient', () => {
  it('existent : celui de l’ouverture et ceux des écrans chargés à la demande', () => {
    expect(catalogues).toContain('textes-fr.ts');
    expect(catalogues.length).toBeGreaterThan(1);
  });

  it.each(catalogues)('%s : chaque clé est utilisée par un écran, aucun texte vide', async (f) => {
    const catalogue = await lire(f);
    expect(Object.keys(catalogue).filter((cle) => !code.includes(`'${cle}'`))).toEqual([]);
    expect(
      Object.entries(catalogue).filter(
        ([, v]) => (typeof v === 'string' ? v : v.other).trim() === '',
      ),
    ).toEqual([]);
  });

  it('une clé n’appartient qu’à un seul catalogue', async () => {
    const cles = (await Promise.all(catalogues.map(lire))).flatMap((c) => Object.keys(c));
    expect(cles.filter((c, i) => cles.indexOf(c) !== i)).toEqual([]);
  });
});
