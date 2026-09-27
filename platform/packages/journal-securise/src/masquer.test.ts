import { describe, expect, it } from 'vitest';
import { DONNEE_MASQUEE, MOTIF_MASQUE, SECRET_MASQUE, masquer, masquerTexte } from './masquer.js';

// Toutes les données de ces tests sont FICTIVES.

describe('masquer — secrets', () => {
  it('masque les clés secrètes quelle que soit la casse ou le séparateur', () => {
    expect(
      masquer({ password: 'x', API_KEY: 'y', 'client-secret': 'z', Authorization: 'Bearer abc' }),
    ).toEqual({
      password: SECRET_MASQUE,
      API_KEY: SECRET_MASQUE,
      'client-secret': SECRET_MASQUE,
      Authorization: SECRET_MASQUE,
    });
  });

  it('masque un jeton Bearer ou une clé sk- présents dans du texte libre', () => {
    expect(masquerTexte('appel avec Bearer eyJhbGciOi.fictif.xyz')).toBe(
      `appel avec ${MOTIF_MASQUE}`,
    );
    // Clé fictive construite à l'exécution : aucune chaîne ressemblant à une clé n'est écrite dans le dépôt.
    const cleFictive = ['sk', 'fictif', '0'.repeat(20)].join('-');
    expect(masquerTexte(`cle=${cleFictive}`)).toBe(`cle=${MOTIF_MASQUE}`);
  });
});

describe('masquer — données de santé et d’identification', () => {
  it('masque identité, coordonnées et contenu clinique [FICTIF]', () => {
    const entree = {
      patientId: 'fictif-0001',
      nom: 'Test',
      prénom: 'Patiente',
      telephone: '+241 00 00 00 00',
      dateNaissance: '1990-01-01',
      diagnostic: 'fictif',
      message: 'j’ai mal à la poitrine',
      categorie: 'C-SOINS',
    };
    expect(masquer(entree)).toEqual({
      patientId: 'fictif-0001',
      nom: DONNEE_MASQUEE,
      prénom: DONNEE_MASQUEE,
      telephone: DONNEE_MASQUEE,
      dateNaissance: DONNEE_MASQUEE,
      diagnostic: DONNEE_MASQUEE,
      message: DONNEE_MASQUEE,
      categorie: 'C-SOINS',
    });
  });

  it('garde les identifiants UUID lisibles, même quand ils commencent par des chiffres', () => {
    // UUID fictifs : 8 chiffres en tête ressemblent à un téléphone, mais ne le sont pas.
    const compte = '10644808-aa50-465b-9fad-1395adabe5e0';
    const invitation = '12345678-1234-4234-8234-123456789012';
    expect(masquerTexte(`compte ${compte}`)).toBe(`compte ${compte}`);
    expect(masquerTexte(invitation)).toBe(invitation);
    // Un téléphone à côté d'un UUID reste masqué ; un jeton porteur aussi, même en forme d'UUID.
    expect(masquerTexte(`${compte} appelle le +241 00 00 00 00`)).toBe(
      `${compte} appelle le ${MOTIF_MASQUE}`,
    );
    expect(masquerTexte(`Bearer ${compte}`)).toBe(MOTIF_MASQUE);
  });

  it('masque les téléphones et e-mails présents dans des champs non prévus', () => {
    expect(masquer({ detail: 'rappeler le +241 00 00 00 00 ou test@example.invalid' })).toEqual({
      detail: `rappeler le ${MOTIF_MASQUE} ou ${MOTIF_MASQUE}`,
    });
  });

  it('ne masque pas les dates ISO ni les identifiants techniques', () => {
    expect(masquer({ le: '2026-09-26T10:00:00Z', id: 'fictif-0001' })).toEqual({
      le: '2026-09-26T10:00:00Z',
      id: 'fictif-0001',
    });
  });

  it('parcourt les objets imbriqués et les tableaux', () => {
    expect(masquer({ requete: { patient: [{ nom: 'Test', id: 'fictif-2' }] } })).toEqual({
      requete: { patient: [{ nom: DONNEE_MASQUEE, id: 'fictif-2' }] },
    });
  });
});

describe('masquer — robustesse', () => {
  it('conserve nombres, booléens et null', () => {
    expect(masquer({ age: 34, actif: true, fin: null })).toEqual({
      age: 34,
      actif: true,
      fin: null,
    });
  });

  it('résiste aux références circulaires', () => {
    const a: Record<string, unknown> = { id: 'fictif-3' };
    a['moi'] = a;
    expect(masquer(a)).toEqual({ id: 'fictif-3', moi: '[RÉFÉRENCE CIRCULAIRE]' });
  });

  it('limite la profondeur', () => {
    let profond: Record<string, unknown> = { fin: 'x' };
    for (let i = 0; i < 20; i++) profond = { suite: profond };
    expect(JSON.stringify(masquer(profond))).toContain('[PROFONDEUR MAX]');
  });

  it('réduit une erreur à son nom et son message masqué', () => {
    expect(masquer({ err: new Error('échec pour test@example.invalid') })).toEqual({
      err: { nom: 'Error', message: `échec pour ${MOTIF_MASQUE}` },
    });
  });
});
