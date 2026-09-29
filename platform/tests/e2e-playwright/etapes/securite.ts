// Étapes « en-têtes de sécurité des API » (revue ASVS n°1, C1). Données FICTIVES uniquement.
import { expect, type Browser } from '@playwright/test';
import type { DataTable } from 'playwright-bdd';
import {
  APP_PATIENT_URL,
  APP_PRO_URL,
  CONSULTATION_URL,
  DOCUMENTS_URL,
  IDENTITE_URL,
  INVITATIONS_URL,
  NOTIFICATIONS_URL,
  PAIEMENT_URL,
  TELECONSULTATION_URL,
} from '../configuration.js';
import { Then } from './fixtures.js';

const SERVICES: Record<string, string> = {
  consultation: CONSULTATION_URL,
  documents: DOCUMENTS_URL,
  identite: IDENTITE_URL,
  invitations: INVITATIONS_URL,
  notifications: NOTIFICATIONS_URL,
  paiement: PAIEMENT_URL,
  teleconsultation: TELECONSULTATION_URL,
};

const verifier = (r: Response, libelle: string) => {
  expect(r.headers.get('cache-control'), libelle).toBe('no-store');
  expect(r.headers.get('x-content-type-options'), libelle).toBe('nosniff');
};

Then(
  'les réponses de {string} à ces adresses interdisent le cache et la devinette du type :',
  async ({ monde }, identifiant: string, table: DataTable) => {
    for (const { service, chemin } of table.hashes() as { service: string; chemin: string }[]) {
      const base = SERVICES[service];
      if (!base) throw new Error(`Service inconnu : ${service}`);
      const r = await fetch(`${base}${chemin}`, {
        headers: { authorization: `Bearer ${monde.jetons.get(identifiant) ?? ''}` },
      });
      // Le statut importe peu (fonction fermée, 403…) : les en-têtes valent pour toute réponse.
      verifier(r, `${service} ${chemin} (${r.status})`);
    }
  },
);

Then(
  'une réponse d’erreur sans jeton de {string} interdit aussi le cache',
  async ({ monde }, service: string) => {
    const r = await fetch(`${SERVICES[service] ?? ''}/mes-documents`);
    monde.reponse = { statut: r.status, corps: {} };
    expect(r.status).toBe(401);
    verifier(r, `${service} sans jeton`);
  },
);

Then(
  'l’application {string} se charge avec sa politique de sécurité du contenu, sans violation',
  async ({ browser }: { browser: Browser }, application: string) => {
    const contexte = await browser.newContext();
    const page = await contexte.newPage();
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
    });
    await page.goto(application === 'patient' ? APP_PATIENT_URL : APP_PRO_URL);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(violations).toEqual([]);
    await contexte.close();
  },
);
