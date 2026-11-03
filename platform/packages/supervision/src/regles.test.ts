import { readFileSync } from 'node:fs';
import { ALERTES } from '@mbolo/journal-securise';
import { describe, expect, it } from 'vitest';
import { fichiersRegles } from './fichiers.js';
import { DESTINATAIRES, REGLES_LOKI, REGLES_PROMETHEUS, type Regle } from './regles.js';

const toutes: Regle[] = [...REGLES_LOKI.groups, ...REGLES_PROMETHEUS.groups].flatMap(
  (g) => g.rules,
);
const regle = (nom: string): Regle => {
  const r = toutes.find((x) => x.alert === nom);
  if (!r) throw new Error(`règle absente : ${nom}`);
  return r;
};

describe('règles d’alerte (ADR-0016)', () => {
  it('chaque événement d’alerte du journal a sa règle, et chaque règle un événement connu', () => {
    const utilises = new Set(toutes.flatMap((r) => (r.labels.alerte ? [r.labels.alerte] : [])));
    expect([...utilises].sort()).toEqual([...ALERTES].sort());
    for (const r of toutes) {
      if (r.labels.alerte) expect(r.expr).toContain(`contexte_alerte="${r.labels.alerte}"`);
    }
  });

  it('applique les seuils acceptés dans l’ADR-0016', () => {
    expect(regle('ConsultationsPhotosAnormales').expr).toMatch(/\[1h\]\)\) > 60$/);
    expect(regle('ConsultationsPhotosAnormales').expr).toContain('by (contexte_sujet)');
    expect(regle('BrisDeGlace').expr).toMatch(/ > 0$/);
    expect(regle('AccesRefusesEnRafale').expr).toMatch(/\[5m\]\)\) > 20$/);
    expect(regle('LecturesDossiersEnSerie').expr).toMatch(
      /^count by \(contexte_sujet\) \(sum by \(contexte_sujet, contexte_patientId\) .*\[1h\]\)\)\) > 30$/,
    );
    expect(regle('LimitesAppelsDepassees').expr).toMatch(/\[5m\]\)\) > 100$/);
    expect(regle('ServiceInjoignable').for).toBe('2m');
  });

  it('envoie chaque alerte au bon rôle, jamais à une personne nommée', () => {
    for (const r of toutes) expect(DESTINATAIRES).toContain(r.labels.destinataire);
    expect(regle('ConsultationsPhotosAnormales').labels).toMatchObject({
      gravite: 'critique',
      destinataire: 'responsable-securite',
    });
    expect(regle('BrisDeGlace').labels.destinataire).toBe('revue-acces');
    expect(regle('ServiceInjoignable').labels).toMatchObject({
      gravite: 'critique',
      destinataire: 'astreinte-technique',
    });
  });

  it('noms de règles uniques et expressions sans donnée personnelle', () => {
    expect(new Set(toutes.map((r) => r.alert)).size).toBe(toutes.length);
    // Seule exception : le regroupement intérieur d'un compte de dossiers distincts, absent de
    // l'alerte qui ne porte que le compte du professionnel.
    const interieur = 'sum by (contexte_sujet, contexte_patientId)';
    for (const r of toutes) {
      if (r.expr.includes(interieur)) expect(r.expr).toMatch(/^count by \(contexte_sujet\) \(/);
      expect(r.expr.replace(interieur, '')).not.toMatch(/patient|telephone|nom=/i);
    }
  });

  it('les fichiers YAML du dépôt sont à jour (pnpm --filter @mbolo/supervision generer)', () => {
    for (const [chemin, attendu] of Object.entries(fichiersRegles())) {
      expect(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')).toBe(attendu);
    }
  });
});
