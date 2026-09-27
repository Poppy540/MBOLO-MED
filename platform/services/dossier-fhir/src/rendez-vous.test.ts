import type { Appointment } from 'fhir/r4.js';
import { describe, expect, it } from 'vitest';
import { agendaVideo, annulerRendezVous, creneauVideo, rendezVousVideo } from './construire.js';
import { valider, verifierAppointment, verifierSchedule, verifierSlot } from './regles.js';

// Toutes les données sont FICTIVES.
const regles = (v: { regle: string }[]) => v.map((x) => x.regle);

const rdv = () =>
  rendezVousVideo({
    patientId: 'fictif-patient-0001',
    praticienId: 'fictif-praticien-0001',
    debut: '2026-10-01T08:00:00Z',
    dureeMinutes: 20,
    env: 'dev',
  });

describe('Appointment — rendez-vous de téléconsultation', () => {
  it('construit un rendez-vous valide, marqué fictif, avec fin calculée', () => {
    const a = rdv();
    expect(valider(a, 'dev')).toEqual([]);
    expect(a.end).toBe('2026-10-01T08:20:00.000Z');
    expect(a.meta?.tag?.[0]?.code).toBe('fictif');
  });

  it('refuse un motif médical dans le rendez-vous (mbolo-rdv-1, minimisation)', () => {
    const a: Appointment = { ...rdv(), reasonCode: [{ text: '[FICTIF] toux' }] };
    expect(regles(verifierAppointment(a))).toContain('mbolo-rdv-1');
    const b: Appointment = { ...rdv(), comment: '[FICTIF] texte libre' };
    expect(regles(verifierAppointment(b))).toContain('mbolo-rdv-1');
  });

  it('refuse un rendez-vous sans professionnel ou avec un tiers (mbolo-rdv-2)', () => {
    const a = rdv();
    const sansPro: Appointment = { ...a, participant: a.participant.slice(0, 1) };
    expect(regles(verifierAppointment(sansPro))).toContain('mbolo-rdv-2');
    const avecTiers: Appointment = {
      ...a,
      participant: [
        ...a.participant,
        { actor: { reference: 'RelatedPerson/fictif-proche-0001' }, status: 'accepted' },
      ],
    };
    expect(regles(verifierAppointment(avecTiers))).toContain('mbolo-rdv-2');
  });

  it('refuse une fin antérieure au début (mbolo-rdv-3)', () => {
    const a: Appointment = { ...rdv(), end: '2026-10-01T07:00:00Z' };
    expect(regles(verifierAppointment(a))).toContain('mbolo-rdv-3');
  });
});

describe('Appointment — annulation (mbolo-rdv-4)', () => {
  it('annule en gardant le rendez-vous : auteur codé, date, participant qui décline', () => {
    const a = annulerRendezVous(rdv(), 'patient', '2026-09-30T17:00:00Z');
    expect(valider(a, 'dev')).toEqual([]);
    expect(a.status).toBe('cancelled');
    expect(a.cancelationReason?.coding?.[0]?.code).toBe('patient');
    expect(a.participant.find((p) => p.actor?.reference?.startsWith('Patient/'))?.status).toBe(
      'declined',
    );
  });

  it('refuse une annulation avec un motif libre ou sans date', () => {
    const libre: Appointment = {
      ...annulerRendezVous(rdv(), 'professionnel', '2026-09-30T17:00:00Z'),
      cancelationReason: { text: '[FICTIF] motif libre' },
    };
    expect(regles(verifierAppointment(libre))).toContain('mbolo-rdv-4');
    const sansDate: Appointment = {
      ...annulerRendezVous(rdv(), 'patient', '2026-09-30T17:00:00Z'),
      extension: [],
    };
    expect(regles(verifierAppointment(sansDate))).toContain('mbolo-rdv-4');
  });
});

describe('Schedule et Slot — agenda et créneaux', () => {
  it('construit un agenda et un créneau valides, marqués fictifs', () => {
    const agenda = agendaVideo({ praticienId: 'fictif-praticien-0001', env: 'dev' });
    expect(valider(agenda, 'dev')).toEqual([]);
    const c = creneauVideo({
      agendaId: 'fictif-agenda-0001',
      debut: '2026-10-01T08:00:00Z',
      dureeMinutes: 20,
      env: 'dev',
    });
    expect(valider(c, 'dev')).toEqual([]);
    expect(c.status).toBe('free');
    expect(c.end).toBe('2026-10-01T08:20:00.000Z');
  });

  it('refuse un texte libre dans un créneau (mbolo-creneau-1) et un agenda partagé (mbolo-agenda-1)', () => {
    const c = {
      ...creneauVideo({
        agendaId: 'fictif-agenda-0001',
        debut: '2026-10-01T08:00:00Z',
        dureeMinutes: 20,
        env: 'dev',
      }),
      comment: '[FICTIF] texte libre',
    };
    expect(regles(verifierSlot(c))).toContain('mbolo-creneau-1');
    const agenda = agendaVideo({ praticienId: 'fictif-praticien-0001', env: 'dev' });
    const partage = {
      ...agenda,
      actor: [...agenda.actor, { reference: 'Practitioner/fictif-praticien-0002' }],
    };
    expect(regles(verifierSchedule(partage))).toContain('mbolo-agenda-1');
  });

  it('un rendez-vous garde la référence du créneau réservé', () => {
    const a = rendezVousVideo({
      patientId: 'fictif-patient-0001',
      praticienId: 'fictif-praticien-0001',
      debut: '2026-10-01T08:00:00Z',
      dureeMinutes: 20,
      creneauId: 'fictif-creneau-0001',
      env: 'dev',
    });
    expect(a.slot).toEqual([{ reference: 'Slot/fictif-creneau-0001' }]);
    expect(valider(a, 'dev')).toEqual([]);
  });
});
