import { describe, expect, it } from 'vitest';
import type { VNode } from 'preact';
import { Picto, PICTOS } from './pictos.js';

// Textes contenus dans un dessin (il ne doit y en avoir aucun : le texte reste à côté, visible).
function textes(noeud: unknown): string[] {
  if (typeof noeud === 'string' || typeof noeud === 'number') return [String(noeud)];
  if (Array.isArray(noeud)) return noeud.flatMap(textes);
  if (noeud && typeof noeud === 'object' && 'props' in noeud) {
    return textes((noeud as VNode<{ children?: unknown }>).props.children);
  }
  return [];
}

describe('pictogrammes des actions clés (ADR-0025)', () => {
  it('couvrent la liste de l’ADR', () => {
    expect(PICTOS).toEqual([
      'rendez-vous',
      'video',
      'audio',
      'raccrocher',
      'payer',
      'ordonnance',
      'urgence',
      'partage',
      'proche',
      'sans-reseau',
    ]);
  });

  it.each(PICTOS)(
    '%s : décoratif, hors du parcours clavier, sans texte, à la couleur du texte',
    (nom) => {
      const svg = Picto({ nom }) as VNode<Record<string, unknown>>;
      expect(svg.type).toBe('svg');
      expect(svg.props['aria-hidden']).toBe('true');
      expect(svg.props['focusable']).toBe('false');
      expect(svg.props['stroke']).toBe('currentColor');
      expect(svg.props['children']).toBeTruthy();
      expect(textes(svg.props['children']).join('').trim()).toBe('');
    },
  );
});
