import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drapeauxFixes, drapeauxUnleash } from './drapeaux.js';

describe('drapeaux fixés', () => {
  it('désactivé par défaut, activé seulement si demandé', async () => {
    const d = await drapeauxFixes({ 'consentement.proche': true });
    expect(await d.estActif('consentement.proche')).toBe(true);
    expect(await d.estActif('teleconsultation.video')).toBe(false);
    expect(await (await drapeauxFixes()).estActif('consentement.proche')).toBe(false);
  });

  it('un flag reste désactivé si une de ses dépendances est désactivée', async () => {
    const seul = await drapeauxFixes({ 'agent01.accueil': true });
    expect(await seul.estActif('agent01.accueil')).toBe(false);
    const avec = await drapeauxFixes({ 'agent01.accueil': true, 'teleconsultation.video': true });
    expect(await avec.estActif('agent01.accueil')).toBe(true);
  });

  it('un nom hors catalogue est toujours désactivé', async () => {
    const d = await drapeauxFixes();
    expect(await d.estActif('inconnu.x' as 'consentement.proche')).toBe(false);
  });
});

// Faux serveur Unleash (API client v2) : ciblage par identifiant de compte FICTIF.
describe('drapeaux Unleash', () => {
  let serveur: Server;
  let url: string;
  const jetons: string[] = [];

  beforeAll(async () => {
    serveur = createServer((req, res) => {
      jetons.push(String(req.headers.authorization));
      if (!req.url?.startsWith('/api/client/features')) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          version: 2,
          features: [
            {
              name: 'consentement.proche',
              enabled: true,
              strategies: [
                {
                  name: 'flexibleRollout',
                  parameters: { rollout: '100', stickiness: 'default', groupId: 'x' },
                  constraints: [
                    { contextName: 'userId', operator: 'IN', values: ['compte-fictif-a'] },
                  ],
                },
              ],
            },
            {
              name: 'teleconsultation.video',
              enabled: true,
              strategies: [
                {
                  name: 'default',
                  constraints: [{ contextName: 'ville', operator: 'IN', values: ['libreville'] }],
                },
              ],
            },
          ],
        }),
      );
    });
    await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api`;
  });

  afterAll(() => serveur.close());

  it('applique le ciblage (compte, ville) et envoie le jeton backend', async () => {
    const d = await drapeauxUnleash({ url, jeton: 'jeton-de-test', application: 'test' });
    expect(await d.estActif('consentement.proche', { sujet: 'compte-fictif-a' })).toBe(true);
    expect(await d.estActif('consentement.proche', { sujet: 'compte-fictif-b' })).toBe(false);
    expect(await d.estActif('teleconsultation.video', { ville: 'libreville' })).toBe(true);
    expect(await d.estActif('teleconsultation.video', { ville: 'franceville' })).toBe(false);
    // Absent du serveur : désactivé.
    expect(await d.estActif('paiement.mobile-money')).toBe(false);
    expect(jetons).toContain('jeton-de-test');
    await d.fermer();
  });

  it('Unleash injoignable : tout est désactivé', async () => {
    const d = await drapeauxUnleash({
      url: 'http://127.0.0.1:9/api',
      jeton: 'jeton-de-test',
      application: 'test',
      attenteMaxMs: 300,
    });
    expect(await d.estActif('consentement.proche', { sujet: 'compte-fictif-a' })).toBe(false);
    await d.fermer();
  });
});
