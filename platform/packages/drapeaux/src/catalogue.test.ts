import { describe, expect, it } from 'vitest';
import { CATALOGUE, NOMS_DRAPEAUX } from './catalogue.js';

describe('catalogue des flags', () => {
  it('nomme les flags <domaine>.<fonction> en minuscules sans accents', () => {
    for (const nom of NOMS_DRAPEAUX) expect(nom).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);
  });

  it('ne déclare que des dépendances connues, sans cycle', () => {
    const visiter = (nom: string, chemin: string[]): void => {
      expect(chemin, `cycle : ${[...chemin, nom].join(' → ')}`).not.toContain(nom);
      const definition = (CATALOGUE as Record<string, { dependances: readonly string[] }>)[nom];
      expect(definition, `dépendance inconnue : ${nom}`).toBeDefined();
      for (const d of definition?.dependances ?? []) visiter(d, [...chemin, nom]);
    };
    for (const nom of NOMS_DRAPEAUX) visiter(nom, []);
  });

  it('aucun flag ne concerne la sécurité (authentification, consentement obligatoire, urgence)', () => {
    for (const nom of NOMS_DRAPEAUX) {
      expect(nom).not.toMatch(/auth|mfa|urgence|bris-de-glace|controle-acces|journal/);
    }
  });
});
