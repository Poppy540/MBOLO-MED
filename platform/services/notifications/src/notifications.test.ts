import { describe, expect, it } from 'vitest';
import { CATALOGUE, IDENTIFIANTS_GABARITS, rediger, verifierPays } from './gabarits.js';
import { CanalSimule, ServiceNotifications, type SourceContacts } from './notifications.js';

// Données FICTIVES.
const contacts = (o: { rappels?: boolean; numero?: string | undefined } = {}): SourceContacts => ({
  telephone: async () => ('numero' in o ? o.numero : '+241 00 00 00 00'),
  accepteRappels: async () => o.rappels ?? true,
});

const demande = {
  destinataire: 'Patient/pat-fictif-001',
  gabarit: 'rendez-vous-annule',
  variables: { instant: '2026-10-01T08:00:00Z' },
} as const;

describe('gabarits', () => {
  it('chaque langue fournit tous les gabarits, dans un SMS, sans donnée de santé', () => {
    for (const [langue, textes] of Object.entries(CATALOGUE)) {
      expect(Object.keys(textes).sort()).toEqual([...IDENTIFIANTS_GABARITS].sort());
      for (const g of IDENTIFIANTS_GABARITS) {
        const texte = rediger(g, { instant: '2026-12-31T23:59:00Z' }, { fuseau: 'UTC', langue });
        expect(texte.length).toBeLessThanOrEqual(160);
        expect(texte).toMatch(/^Mbolo Santé : /);
        expect(texte).not.toMatch(/\{|\}|Dr|docteur|médecin|motif|spécialit/i);
      }
    }
  });

  it('donnent la date et l’heure du pays déployé (Gabon par défaut)', () => {
    expect(rediger('rendez-vous-reporte', { instant: '2026-10-01T08:30:00Z' })).toBe(
      'Mbolo Santé : votre rendez-vous est déplacé au 01/10 à 09:30. Détails dans l’application.',
    );
    // Autre pays, même code : Sénégal (UTC+0).
    expect(
      rediger(
        'rendez-vous-reporte',
        { instant: '2026-10-01T08:30:00Z' },
        { fuseau: 'Africa/Dakar', langue: 'fr-SN' },
      ),
    ).toContain('01/10 à 08:30');
  });

  it('refuse au démarrage une langue sans gabarits approuvés ou un fuseau inconnu', () => {
    expect(() => verifierPays({ fuseau: 'Africa/Libreville', langue: 'fr-GA' })).not.toThrow();
    expect(() => verifierPays({ fuseau: 'Africa/Libreville', langue: 'en-GB' })).toThrow(
      'Aucun gabarit approuvé',
    );
    expect(() => verifierPays({ fuseau: 'Afrique/Inconnue', langue: 'fr-FR' })).toThrow('invalide');
  });
});

describe('ServiceNotifications', () => {
  it('envoie au patient qui a accepté les rappels', async () => {
    const canal = new CanalSimule();
    expect(await new ServiceNotifications(contacts(), canal).envoyer(demande)).toBe('envoyee');
    expect(canal.boite).toHaveLength(1);
    expect(canal.boite[0]?.texte).toContain('01/10 à 09:00');
  });

  it('n’envoie rien au patient sans consentement C-RAPPELS', async () => {
    const canal = new CanalSimule();
    const r = await new ServiceNotifications(contacts({ rappels: false }), canal).envoyer(demande);
    expect(r).toBe('ignoree-sans-consentement');
    expect(canal.boite).toEqual([]);
  });

  it('prévient un professionnel sans condition de consentement', async () => {
    const canal = new CanalSimule();
    const r = await new ServiceNotifications(contacts({ rappels: false }), canal).envoyer({
      ...demande,
      destinataire: 'Practitioner/prac-fictif-001',
    });
    expect(r).toBe('envoyee');
  });

  it('ignore un destinataire sans numéro, signale un échec du canal', async () => {
    const canal = new CanalSimule();
    expect(
      await new ServiceNotifications(contacts({ numero: undefined }), canal).envoyer(demande),
    ).toBe('ignoree-sans-numero');
    const enPanne = { nom: 'panne', envoyer: async () => Promise.reject(new Error('x')) };
    expect(await new ServiceNotifications(contacts(), enPanne).envoyer(demande)).toBe('echec');
  });
});
