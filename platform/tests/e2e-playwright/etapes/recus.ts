// Étapes « reçus et avoirs » (ADR-0020) : API du service de paiement avec le jeton du patient.
// Données FICTIVES uniquement (fournisseur simulé, numéro inventé).
import { expect } from '@playwright/test';
import { PAIEMENT_URL } from '../configuration.js';
import { Then, When, type Monde } from './fixtures.js';

interface Recu {
  numero: string;
  type: 'recu' | 'avoir';
  libelle: string;
  montant: number;
  devise: string;
  reference: string;
  operateur?: string;
  recuAnnule?: string;
  valeurFiscale: boolean;
}

async function lireRecus(monde: Monde, identifiant: string): Promise<Recu[]> {
  const r = await fetch(`${PAIEMENT_URL}/recus`, {
    headers: { authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}` },
  });
  monde.reponse = {
    statut: r.status,
    corps: (await r.json().catch(() => ({}))) as Record<string, unknown>,
  };
  return (monde.reponse.corps['recus'] ?? []) as Recu[];
}

/** Attend le reçu (ou l'avoir) du rendez-vous en cours : émis à la confirmation du paiement. */
async function attendre(monde: Monde, identifiant: string, type: Recu['type']): Promise<Recu> {
  let trouve: Recu | undefined;
  await expect
    .poll(
      async () => {
        trouve = (await lireRecus(monde, identifiant)).find(
          (x) => x.reference === monde.rendezVousId && x.type === type,
        );
        return Boolean(trouve);
      },
      { timeout: 15_000, intervals: [1_000] },
    )
    .toBe(true);
  if (!trouve) throw new Error('Reçu introuvable.');
  return trouve;
}

Then(
  '{string} a un reçu de {int} {string} pour ce rendez-vous, sans son numéro de téléphone',
  async ({ monde }, identifiant: string, montant: number, devise: string) => {
    const r = await attendre(monde, identifiant, 'recu');
    expect(r).toMatchObject({
      libelle: 'Consultation Mbolo Santé',
      montant,
      devise,
      operateur: 'airtel',
      valeurFiscale: false,
    });
    expect(r.numero).toMatch(/^[A-Z]{2}-\d{4}-\d{6,}$/);
    // Ni numéro de téléphone ni donnée de santé.
    expect(JSON.stringify(monde.reponse?.corps)).not.toMatch(/\+241|00 00 00/);
    monde.recu = r.numero;
  },
);

Then(
  '{string} a un avoir de {int} {string} qui annule ce reçu',
  async ({ monde }, identifiant: string, montant: number, devise: string) => {
    const a = await attendre(monde, identifiant, 'avoir');
    expect(a).toMatchObject({ montant, devise, recuAnnule: monde.recu });
    expect(a.numero).not.toBe(monde.recu);
  },
);

When('{string} consulte ses reçus', async ({ monde }, identifiant: string) => {
  await lireRecus(monde, identifiant);
});

Then('la consultation des reçus est refusée avec le statut {int}', ({ monde }, statut: number) => {
  expect(monde.reponse?.statut).toBe(statut);
});
