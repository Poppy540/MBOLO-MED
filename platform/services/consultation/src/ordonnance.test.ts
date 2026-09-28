// Ordonnance électronique prescrite depuis la consultation (ADR-0018). Données FICTIVES.
import type { Appointment, MedicationRequest } from 'fhir/r4.js';
import { SYSTEME_ORDONNANCE } from '@mbolo/dossier-fhir';
import type { Utilisateur } from '@mbolo/identite';
import { describe, expect, it } from 'vitest';
import type { DecideurAcces } from './acces.js';
import type { Dossier, DossierOrdonnances } from './dossier.js';
import { ServiceConsultation, type LigneSaisie } from './service.js';

const ATC = 'http://www.whocc.no/atc';
const medecin: Utilisateur = {
  sujet: 'u-m1',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-001',
};
const autreMedecin: Utilisateur = {
  sujet: 'u-m2',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-002',
};
const patient: Utilisateur = { sujet: 'u-p1', roles: ['patient'], patientId: 'pat-fictif-001' };
const agent: Utilisateur = {
  sujet: 'u-agent',
  roles: ['professionnel'],
  practitionerId: 'prac-fictif-001',
  agent: { nom: 'agent-02-pharmacie-suivi', patientSession: 'pat-fictif-001' },
};

const rdv: Appointment = {
  resourceType: 'Appointment',
  id: 'rdv-fictif-1',
  status: 'booked',
  start: '2026-10-01T08:00:00Z',
  participant: [
    { actor: { reference: 'Patient/pat-fictif-001' }, status: 'accepted' },
    { actor: { reference: 'Practitioner/prac-fictif-001' }, status: 'accepted' },
  ],
};

const paracetamol: LigneSaisie = {
  medicament: { systeme: ATC, code: 'N02BE01', libelle: 'paracétamol' },
  dose: { valeur: 500, unite: 'mg' },
  frequence: { fois: 3, periode: 1, unite: 'd' },
  dureeJours: 5,
};

function monter(o: { actif?: boolean; autorise?: boolean; panneApres?: number } = {}) {
  const lignes: MedicationRequest[] = [];
  const decisions: string[] = [];
  const acces: DecideurAcces = {
    decider: async (jeton, patientId) => {
      decisions.push(`${jeton}:${patientId}`);
      return o.autorise === false
        ? { autorise: false, motif: 'refus-sans-consentement' }
        : { autorise: true, motif: 'consentement-partage-pro' };
    },
  };
  const dossier: Dossier = {
    rendezVous: async (id) => (id === 'rdv-fictif-1' ? rdv : undefined),
    problemes: async () => [],
    comptesRendus: async () => [],
    ajouterCompteRendu: async (c) => c,
  };
  const ordonnances: DossierOrdonnances = {
    ajouterLigne: async (m) => {
      if (o.panneApres !== undefined && lignes.length >= o.panneApres) {
        throw new Error('dossier indisponible');
      }
      const cree = { ...m, id: `mr-${lignes.length + 1}`, meta: { ...m.meta, versionId: '1' } };
      lignes.push(cree);
      return cree;
    },
    lignes: async (numero) =>
      lignes.filter(
        (l) =>
          l.groupIdentifier?.system === SYSTEME_ORDONNANCE && l.groupIdentifier.value === numero,
      ),
    changerStatut: async (m, statut) => {
      const l = lignes.find((x) => x.id === m.id);
      if (!l) throw new Error('introuvable');
      l.status = statut;
      return { ...l };
    },
  };
  const service = new ServiceConsultation(
    acces,
    dossier,
    'dev',
    () => new Date('2026-10-01T08:10:00Z'),
    {
      dossier: ordonnances,
      drapeaux: {
        estActif: async (nom) => nom === 'ordonnances.electroniques' && o.actif !== false,
      },
      nomenclature: ATC,
      validiteJours: 90,
    },
  );
  return { service, lignes, decisions };
}

describe('prescription d’une ordonnance électronique', () => {
  it('le médecin du rendez-vous prescrit : lignes valides, même numéro, validité du pays', async () => {
    const m = monter();
    const o = await m.service.prescrire(medecin, 'jeton-m1', 'rdv-fictif-1', {
      lignes: [
        paracetamol,
        {
          medicament: { systeme: ATC, code: 'A07CA', libelle: 'sels de réhydratation orale' },
          dose: { valeur: 200, unite: 'mL' },
          frequence: { fois: 1, periode: 4, unite: 'h' },
          dureeJours: 2,
        },
      ],
    });
    expect(o).toMatchObject({
      statut: 'active',
      patientId: 'pat-fictif-001',
      valableJusquau: '2026-12-30',
      lignes: [{ medicament: 'paracétamol', dose: '500 mg', dureeJours: 5 }, { dureeJours: 2 }],
    });
    expect(o.numero).toMatch(/^ORD-[0-9A-F]{12}$/);
    expect(m.lignes).toHaveLength(2);
    expect(new Set(m.lignes.map((l) => l.groupIdentifier?.value))).toEqual(new Set([o.numero]));
    expect(m.lignes.every((l) => l.requester?.reference === 'Practitioner/prac-fictif-001')).toBe(
      true,
    );
    // La décision d'accès est prise avec le jeton du médecin, pour le patient du rendez-vous.
    expect(m.decisions).toEqual(['jeton-m1:pat-fictif-001']);
  });

  it('refuse : agent IA, patient, autre médecin, fonction fermée, sans accès au dossier', async () => {
    const d = { lignes: [paracetamol] };
    await expect(monter().service.prescrire(agent, 'j', 'rdv-fictif-1', d)).rejects.toMatchObject({
      statut: 403,
    });
    await expect(monter().service.prescrire(patient, 'j', 'rdv-fictif-1', d)).rejects.toMatchObject(
      { statut: 403 },
    );
    await expect(
      monter().service.prescrire(autreMedecin, 'j', 'rdv-fictif-1', d),
    ).rejects.toMatchObject({ statut: 404 });
    await expect(
      monter({ actif: false }).service.prescrire(medecin, 'j', 'rdv-fictif-1', d),
    ).rejects.toMatchObject({ statut: 403, message: 'Fonction non disponible.' });
    const sansAcces = monter({ autorise: false });
    await expect(
      sansAcces.service.prescrire(medecin, 'j', 'rdv-fictif-1', d),
    ).rejects.toMatchObject({ statut: 403 });
    expect(sansAcces.lignes).toHaveLength(0);
  });

  it('refuse un médicament hors de la nomenclature du pays ou trop de renouvellements', async () => {
    const m = monter();
    await expect(
      m.service.prescrire(medecin, 'j', 'rdv-fictif-1', {
        lignes: [
          { ...paracetamol, medicament: { ...paracetamol.medicament, systeme: 'urn:autre' } },
        ],
      }),
    ).rejects.toMatchObject({ statut: 400 });
    await expect(
      m.service.prescrire(medecin, 'j', 'rdv-fictif-1', {
        lignes: [paracetamol],
        renouvellements: 13,
      }),
    ).rejects.toMatchObject({ statut: 400 });
    expect(m.lignes).toHaveLength(0);
  });

  it('écriture interrompue : les lignes déjà écrites ne sont jamais utilisables', async () => {
    const m = monter({ panneApres: 1 });
    await expect(
      m.service.prescrire(medecin, 'j', 'rdv-fictif-1', { lignes: [paracetamol, paracetamol] }),
    ).rejects.toThrow('dossier indisponible');
    expect(m.lignes.map((l) => l.status)).toEqual(['entered-in-error']);
  });

  it('seul le prescripteur relit et révoque ; une ordonnance révoquée ne l’est qu’une fois', async () => {
    const m = monter();
    const o = await m.service.prescrire(medecin, 'j', 'rdv-fictif-1', { lignes: [paracetamol] });
    await expect(m.service.lireOrdonnance(autreMedecin, o.numero)).rejects.toMatchObject({
      statut: 404,
    });
    expect((await m.service.lireOrdonnance(medecin, o.numero)).statut).toBe('active');
    expect((await m.service.revoquerOrdonnance(medecin, 'j', o.numero)).statut).toBe('revoquee');
    await expect(m.service.revoquerOrdonnance(medecin, 'j', o.numero)).rejects.toMatchObject({
      statut: 409,
    });
  });

  it('fonction fermée après coup : le prescripteur peut encore révoquer', async () => {
    const m = monter();
    const o = await m.service.prescrire(medecin, 'j', 'rdv-fictif-1', { lignes: [paracetamol] });
    const ferme = new ServiceConsultation(
      { decider: async () => ({ autorise: true, motif: 'consentement-partage-pro' }) },
      {
        rendezVous: async () => rdv,
        problemes: async () => [],
        comptesRendus: async () => [],
        ajouterCompteRendu: async (c) => c,
      },
      'dev',
      () => new Date('2026-10-02T08:00:00Z'),
      {
        dossier: {
          ajouterLigne: async (x) => x,
          lignes: async () => m.lignes,
          changerStatut: async (x, statut) => ({ ...x, status: statut }),
        },
        drapeaux: { estActif: async () => false },
        nomenclature: ATC,
        validiteJours: 90,
      },
    );
    expect((await ferme.revoquerOrdonnance(medecin, 'j', o.numero)).statut).toBe('revoquee');
  });
});
