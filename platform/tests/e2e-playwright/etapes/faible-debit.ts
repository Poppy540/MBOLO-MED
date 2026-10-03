// Faible débit (D-0001, skill optimisation-faible-debit) : première ouverture d'une application sur
// un réseau 3G lent simulé par Chrome. Le budget de poids (`@mbolo/client-web`, scripts/budget.mjs)
// contrôle la taille des fichiers ; ce test contrôle ce que vit la personne : le temps jusqu'à
// l'écran d'accueil et les octets réellement transférés (compressés, en-têtes compris).
// Limite : seule la première ouverture est mesurée ; ensuite, le service worker sert l'application
// depuis le téléphone, mais ses propres requêtes échappent au réseau simulé de la page.
// La page de connexion (Keycloak, thème `mbolo`) est mesurée de la même façon : tout patient la
// charge à chaque connexion.
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { APP_PATIENT_URL, APP_PRO_URL } from '../configuration.js';
import { Then, When, urlAutorisation, type Monde } from './fixtures.js';

/**
 * Profil « 3G lente » des outils de développement de Chrome (valeurs appliquées par Chrome :
 * 2 s de latence par requête, 400 kbit/s dans chaque sens, soit 50 000 octets par seconde).
 */
const RESEAU_3G_LENT = {
  offline: false,
  latency: 2000,
  downloadThroughput: 50_000,
  uploadThroughput: 50_000,
};

/** Adresse de chaque écran mesuré, et ce qui montre qu'il est utilisable. */
const ECRANS: Record<string, { adresse: () => string; pret: (page: Page) => Locator }> = {
  'application patient': {
    adresse: () => APP_PATIENT_URL,
    pret: (page) => page.getByRole('button', { name: 'Se connecter' }),
  },
  'espace professionnel': {
    adresse: () => APP_PRO_URL,
    pret: (page) => page.getByRole('button', { name: 'Se connecter' }),
  },
  'page de connexion': {
    adresse: () => urlAutorisation('patient', true).url,
    pret: (page) => page.getByRole('button', { name: 'Connexion' }),
  },
};

async function ouvrirSur3gLente(monde: Monde, browser: Browser, application: string) {
  const ecran = ECRANS[application];
  if (!ecran) throw new Error(`Écran inconnu : ${application}`);
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  monde.visio.set(application, { contexte, page });
  const cdp = await contexte.newCDPSession(page);
  await cdp.send('Network.enable');
  let octets = 0;
  cdp.on('Network.loadingFinished', (e) => {
    octets += e.encodedDataLength;
  });
  await cdp.send('Network.emulateNetworkConditions', RESEAU_3G_LENT);
  const debut = Date.now();
  await page.goto(ecran.adresse(), { waitUntil: 'commit' });
  // Écran utilisable : le bouton de connexion est affiché, et la page entière est chargée
  // (feuilles de style, polices et images comprises).
  await expect(ecran.pret(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('load', { timeout: 60_000 });
  monde.ouverture = { ms: Date.now() - debut, ko: octets / 1024 };
}

When(
  'l’{string} s’ouvre pour la première fois sur un réseau 3G lent',
  ({ monde, browser }: { monde: Monde; browser: Browser }, ecran: string) =>
    ouvrirSur3gLente(monde, browser, ecran),
);

When(
  'la {string} s’ouvre pour la première fois sur un réseau 3G lent',
  ({ monde, browser }: { monde: Monde; browser: Browser }, ecran: string) =>
    ouvrirSur3gLente(monde, browser, ecran),
);

Then('l’écran d’accueil s’affiche en moins de {int} secondes', async ({ monde }, s: number) => {
  if (!monde.ouverture) throw new Error('Aucune ouverture mesurée dans ce scénario.');
  expect(monde.ouverture.ms, `ouverture en ${monde.ouverture.ms} ms`).toBeLessThan(s * 1000);
});

Then('moins de {int} Ko ont été téléchargés', async ({ monde }, ko: number) => {
  if (!monde.ouverture) throw new Error('Aucune ouverture mesurée dans ce scénario.');
  expect(monde.ouverture.ko, `${monde.ouverture.ko.toFixed(1)} Ko transférés`).toBeLessThan(ko);
});

// ── Réseau qui ne répond plus, ou coupé ─────────────────────────────────────

const pagePatient = (monde: Monde): Page => {
  const page = monde.visio.get('application patient')?.page;
  if (!page) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return page;
};

// Réseau saturé : les appels d'API partent mais aucune réponse n'arrive jamais (ni erreur, ni
// coupure franche). Sans délai, l'application attendrait indéfiniment ; avec celui de
// `creerRequete` (20 s), elle le dit à la personne.
When('le réseau du patient ne répond plus', async ({ monde }) => {
  await pagePatient(monde).route('**/api/**', () => new Promise<void>(() => undefined));
});

When('le réseau du patient est coupé', async ({ monde }) => {
  await pagePatient(monde).route('**/api/**', (route) => route.abort('internetdisconnected'));
});

When('le patient appuie sur {string}', async ({ monde }, bouton: string) => {
  const page = pagePatient(monde);
  monde.attenteDebut = Date.now();
  await page.getByRole('button', { name: bouton }).click();
});

Then(
  'l’application affiche {string} en moins de {int} secondes',
  async ({ monde }, texte: string, s: number) => {
    // Alerte de l'application ou message d'un écran (rôle « status ») : on cherche le texte lui-même.
    await expect(pagePatient(monde).getByText(texte, { exact: true })).toBeVisible({
      timeout: s * 1000,
    });
    const ms = Date.now() - (monde.attenteDebut ?? 0);
    expect(ms, `message affiché après ${ms} ms`).toBeLessThan(s * 1000);
  },
);

// ── Consommation de données d'une téléconsultation ──────────────────────────

/**
 * Instrumentation de test : garde chaque connexion WebRTC de la page dans `window.__mboloPairs`
 * pour en lire les statistiques (octets envoyés et reçus). Posée avant le chargement de la page.
 */
export async function suivreConnexionsWebRtc(contexte: BrowserContext): Promise<void> {
  await contexte.addInitScript(() => {
    const Origine = window.RTCPeerConnection;
    const pairs: RTCPeerConnection[] = [];
    (window as unknown as { __mboloPairs: RTCPeerConnection[] }).__mboloPairs = pairs;
    window.RTCPeerConnection = class extends Origine {
      constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) {
        super(...args);
        pairs.push(this);
      }
    };
  });
}

/** Octets envoyés et reçus jusqu'ici par toutes les connexions WebRTC de la page. */
async function octetsWebRtc(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const pairs = (window as unknown as { __mboloPairs?: RTCPeerConnection[] }).__mboloPairs ?? [];
    let total = 0;
    for (const pc of pairs) {
      const stats = await pc.getStats();
      stats.forEach((r: { type: string; bytesSent?: number; bytesReceived?: number }) => {
        if (r.type === 'transport') total += (r.bytesSent ?? 0) + (r.bytesReceived ?? 0);
      });
    }
    return total;
  });
}

/** Consommation mesurée sur 15 s (après 5 s de stabilisation), ramenée à la minute. */
async function koParMinute(page: Page): Promise<number> {
  await page.waitForTimeout(5_000);
  const avant = await octetsWebRtc(page);
  await page.waitForTimeout(15_000);
  return ((await octetsWebRtc(page)) - avant) / 1024 / 0.25;
}

Then(
  'en {string}, l’application patient consomme moins de {int} Ko par minute',
  async ({ monde }, mode: string, plafond: number) => {
    const page = monde.visio.get('application patient')?.page;
    if (!page) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
    const ko = await koParMinute(page);
    expect(ko, `${mode} : ${ko.toFixed(0)} Ko par minute (envoi et réception)`).toBeLessThan(
      plafond,
    );
  },
);
