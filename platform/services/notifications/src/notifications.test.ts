import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  IDENTIFIANTS_GABARITS,
  languesApprouvees,
  PAYS_PAR_DEFAUT,
  paysPour,
  rediger,
  verifierPays,
} from './gabarits.js';
import { CanalSimule, ServiceNotifications, type SourceContacts } from './notifications.js';

// Données FICTIVES.
const contacts = (
  o: {
    rappels?: boolean;
    numero?: string | undefined;
    attente?: boolean;
    langue?: () => Promise<string | undefined>;
  } = {},
): SourceContacts => ({
  telephone: async () => ('numero' in o ? o.numero : '+241 00 00 00 00'),
  accepteRappels: async () => o.rappels ?? true,
  enAttenteApresPerte: async () => o.attente ?? false,
  ...(o.langue ? { languePreferee: o.langue } : {}),
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

describe('langue préférée du patient (ADR-0025)', () => {
  it('seules les langues dont tous les gabarits sont approuvés sont utilisables', () => {
    expect(languesApprouvees()).toEqual(['fr']);
  });

  it('prend la langue préférée si elle est approuvée, garde le fuseau du pays', () => {
    const p = paysPour(PAYS_PAR_DEFAUT, 'en-GB', ['fr', 'en']);
    expect(p).toEqual({ fuseau: 'Africa/Libreville', langue: 'en-GB', langueTextes: 'en-GB' });
  });

  it('garde la langue du pays si la langue préférée n’est pas approuvée ou absente', () => {
    expect(paysPour(PAYS_PAR_DEFAUT, 'en', ['fr'])).toBe(PAYS_PAR_DEFAUT);
    expect(paysPour(PAYS_PAR_DEFAUT, undefined)).toBe(PAYS_PAR_DEFAUT);
    expect(paysPour(PAYS_PAR_DEFAUT, 'fr-CA')).toBe(PAYS_PAR_DEFAUT);
  });

  it('garde les formats du pays pour un code de langue invalide', () => {
    const p = paysPour(PAYS_PAR_DEFAUT, 'en-%%', ['fr', 'en']);
    expect(p.langue).toBe('fr-FR');
    expect(p.langueTextes).toBe('en-%%');
  });

  it('écrit en français si la langue du patient n’a pas tous ses gabarits, ou si le dossier ne répond pas', async () => {
    for (const langue of [
      async () => 'en',
      async () => Promise.reject(new Error('dossier indisponible')),
    ]) {
      const canal = new CanalSimule();
      const service = new ServiceNotifications(contacts({ langue }), canal);
      expect(await service.envoyer(demande)).toBe('envoyee');
      expect(await service.envoyerCodeConnexion('pat-fictif-001', '482913')).toBe('envoyee');
      expect(await service.alerterPatient('pat-fictif-001', 'numero-change')).toBe('envoyee');
      expect(canal.boite.map((m) => m.texte.slice(0, 14))).toEqual(Array(3).fill('Mbolo Santé : '));
      expect(canal.boite[0]?.texte).toContain('est annulé');
    }
  });

  it('ne lit pas la langue d’un patient qui n’a pas accepté les rappels', async () => {
    let lue = false;
    const langue = async () => {
      lue = true;
      return 'fr';
    };
    const service = new ServiceNotifications(
      contacts({ rappels: false, langue }),
      new CanalSimule(),
    );
    expect(await service.envoyer(demande)).toBe('ignoree-sans-consentement');
    expect(lue).toBe(false);
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

  it('n’envoie aucun code de connexion dans les 24 heures qui suivent une perte (ADR-0023)', async () => {
    const canal = new CanalSimule();
    const service = new ServiceNotifications(contacts({ attente: true }), canal);
    expect(await service.envoyerCodeConnexion('pat-fictif-005', '482913')).toBe(
      'attente-apres-perte',
    );
    expect(canal.boite).toEqual([]);
    // Les autres messages (rappels, alertes de sécurité) partent normalement.
    expect(await service.envoyer(demande)).toBe('envoyee');
  });
});
