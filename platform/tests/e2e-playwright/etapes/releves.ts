// Étapes « relevés des professionnels » (ADR-0020) : API du service de paiement avec le jeton du
// compte habilité (rôle validation-reversement). Données FICTIVES uniquement.
import { expect } from '@playwright/test';
import { PAIEMENT_URL } from '../configuration.js';
import { Then, When, type Monde } from './fixtures.js';

/** Mois en cours dans le fuseau du pays déployé (AAAA-MM). */
function moisEnCours(): string {
  const parties = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Libreville',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => parties.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}`;
}

interface Releve {
  praticien: string;
  consultations: number;
  net: number;
  aReverser: number;
}

async function lire(monde: Monde, identifiant: string): Promise<Releve[]> {
  const r = await fetch(`${PAIEMENT_URL}/releves?mois=${moisEnCours()}`, {
    headers: { authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}` },
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
  return (monde.reponse.corps['releves'] ?? []) as Releve[];
}

Then(
  '{string} voit dans le relevé du mois de {string} au moins {int} consultation payée, avec {int} % à reverser',
  async ({ monde }, identifiant: string, praticien: string, n: number, part: number) => {
    const releve = (await lire(monde, identifiant)).find((x) => x.praticien === praticien);
    expect(monde.reponse?.statut).toBe(200);
    // Au moins : la base locale garde les paiements des exécutions précédentes du même mois.
    expect(releve?.consultations ?? 0).toBeGreaterThanOrEqual(n);
    expect(releve?.aReverser).toBe(Math.floor(((releve?.net ?? 0) * part) / 100));
    // Ni patient ni numéro de téléphone dans un relevé.
    expect(JSON.stringify(monde.reponse?.corps)).not.toMatch(/pat-fictif|\+241|sujet/);
  },
);

When('{string} consulte le relevé du mois', async ({ monde }, identifiant: string) => {
  await lire(monde, identifiant);
});

Then('la consultation du relevé est refusée avec le statut {int}', ({ monde }, statut: number) => {
  expect(monde.reponse?.statut).toBe(statut);
});
