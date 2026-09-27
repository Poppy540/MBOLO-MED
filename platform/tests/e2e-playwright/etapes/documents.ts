// Étapes « vérification d'identité par photos » (ADR-0015) : charte acceptée par le service identite,
// photos déposées au service documents. Photos GÉNÉRÉES (aplats de couleur) : jamais de vraie personne.
import { deflateSync } from 'node:zlib';
import { expect, type Browser, type Page } from '@playwright/test';
import { SYSTEMES } from '@mbolo/dossier-fhir';
import {
  APP_PATIENT_URL,
  DOCUMENTS_URL,
  FHIR_URL,
  IDENTITE_URL,
  compte,
} from '../configuration.js';
import { Given, Then, When, saisirIdentifiants, type Monde } from './fixtures.js';

const APP = 'application patient';
const VERSION_CHARTE = '0.1';

const page = (monde: Monde): Page => {
  const p = monde.visio.get(APP)?.page;
  if (!p) throw new Error('L’application patient n’est pas ouverte dans ce scénario.');
  return p;
};

const jeton = (monde: Monde, identifiant: string): string => {
  const j = monde.jetons.get(identifiant);
  if (!j) throw new Error(`${identifiant} n'est pas connecté dans ce scénario.`);
  return j;
};

const patientId = (identifiant: string): string => {
  const id = compte(identifiant).attributs['patient_id'];
  if (!id) throw new Error(`${identifiant} n'est pas un patient.`);
  return id;
};

/** Image PNG [FICTIF] : un aplat de couleur, de quoi passer la compression du téléphone. */
function pngFictif(rouge: number, vert: number, bleu: number, largeur = 64, hauteur = 48): Buffer {
  const crc = (octets: Buffer): number => {
    let c = ~0;
    for (const o of octets) {
      c ^= o;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const bloc = (type: string, donnees: Buffer): Buffer => {
    const tete = Buffer.alloc(4);
    tete.writeUInt32BE(donnees.length);
    const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
    const fin = Buffer.alloc(4);
    fin.writeUInt32BE(crc(corps));
    return Buffer.concat([tete, corps, fin]);
  };
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete.set([8, 2, 0, 0, 0], 8); // 8 bits, RVB
  const ligne = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: largeur }, () => [rouge, vert, bleu]).flat()),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(Buffer.concat(Array.from({ length: hauteur }, () => ligne)))),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

async function envoyer(
  monde: Monde,
  identifiant: string,
  type: string,
  corps: Buffer,
  contentType: string,
): Promise<void> {
  const r = await fetch(`${DOCUMENTS_URL}/verification/documents/${type}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jeton(monde, identifiant)}`, 'content-type': contentType },
    body: new Uint8Array(corps),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

// ── Application patient ──────────────────────────────────────────────────────

When(
  '{string} ouvre l’application patient avant la vérification de son identité',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    const contexte = await browser.newContext();
    const p = await contexte.newPage();
    monde.visio.set(APP, { contexte, page: p });
    await p.goto(`${APP_PATIENT_URL}/`);
    await p.getByRole('button', { name: 'Se connecter' }).click();
    await saisirIdentifiants(p, identifiant, false);
    await expect(p.getByText('votre identité doit être vérifiée')).toBeVisible();
  },
);

When('le patient ouvre « Vérifier mon identité »', async ({ monde }) => {
  await page(monde).getByRole('button', { name: 'Vérifier mon identité' }).click();
});

When("le patient accepte la charte de vérification d'identité", async ({ monde }) => {
  const p = page(monde);
  await expect(p.getByRole('heading', { name: "Charte de vérification d'identité" })).toBeVisible();
  await expect(p.getByText(`version ${VERSION_CHARTE}`)).toBeVisible();
  await p.getByRole('button', { name: "J'accepte" }).click();
  await expect(p.getByRole('heading', { name: 'Vos deux photos' })).toBeVisible();
});

When(
  "le patient envoie la photo de sa pièce d'identité puis celle de son visage",
  async ({ monde }) => {
    const p = page(monde);
    await p.getByLabel('Photo de votre document').setInputFiles({
      name: 'document-fictif.png',
      mimeType: 'image/png',
      buffer: pngFictif(40, 90, 160),
    });
    await p.getByRole('button', { name: 'Envoyer la photo du document' }).click();
    await expect(p.getByText('Votre document est envoyé')).toBeVisible();
    await p.getByLabel('Photo de votre visage').setInputFiles({
      name: 'visage-fictif.png',
      mimeType: 'image/png',
      buffer: pngFictif(200, 150, 120),
    });
    await p.getByRole('button', { name: 'Envoyer la photo du visage' }).click();
  },
);

Then("l'application indique que ses deux photos sont envoyées", async ({ monde }) => {
  const p = page(monde);
  await expect(p.getByText('Votre visage est envoyé')).toBeVisible();
  await expect(p.getByText('va vérifier vos photos')).toBeVisible();
});

Then(
  "le dossier médical contient l'accord de {string} à la charte {string}",
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, identifiant: string, version: string) => {
    const r = await fetch(
      `${FHIR_URL}/Consent?patient=Patient/${patientId(identifiant)}&status=active&_count=50` +
        `&category=${encodeURIComponent(`${SYSTEMES.consentement}|C-IDENTITE`)}`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    const lot = (await r.json()) as {
      entry?: { resource: { provision?: { type?: string }; policyRule?: { text?: string } } }[];
    };
    expect(
      (lot.entry ?? []).some(
        (e) => e.resource.provision?.type === 'permit' && e.resource.policyRule?.text === version,
      ),
    ).toBe(true);
  },
);

// ── API ──────────────────────────────────────────────────────────────────────

Given(
  "{string} n'a pas accepté la charte de vérification d'identité",
  // eslint-disable-next-line no-empty-pattern -- aucun élément du contexte n'est utilisé
  async ({}, identifiant: string) => {
    // Les accords des scénarios précédents sont révoqués (jamais supprimés, comme dans le dossier réel).
    const r = await fetch(
      `${FHIR_URL}/Consent?patient=Patient/${patientId(identifiant)}&status=active&_count=200` +
        `&category=${encodeURIComponent(`${SYSTEMES.consentement}|C-IDENTITE`)}`,
      { headers: { 'cache-control': 'no-cache' } },
    );
    const lot = (await r.json()) as { entry?: { resource: { id: string } }[] };
    for (const { resource } of lot.entry ?? []) {
      const m = await fetch(`${FHIR_URL}/Consent/${resource.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/fhir+json' },
        body: JSON.stringify({ ...resource, status: 'inactive' }),
      });
      expect(m.ok).toBe(true);
    }
  },
);

Given(
  "{string} accepte la charte de vérification d'identité",
  async ({ monde }, identifiant: string) => {
    const r = await fetch(`${IDENTITE_URL}/patients/${patientId(identifiant)}/consentements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jeton(monde, identifiant)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        categorie: 'C-IDENTITE',
        mode: 'texte',
        versionTexte: VERSION_CHARTE,
        accepte: true,
      }),
    });
    expect(r.status).toBe(201);
  },
);

When('{string} envoie une photo de son visage', async ({ monde }, identifiant: string) => {
  await envoyer(monde, identifiant, 'visage', pngFictif(10, 20, 30), 'image/png');
});

When(
  '{string} envoie un document PDF présenté comme une photo',
  async ({ monde }, identifiant: string) => {
    const pdf = Buffer.from('%PDF-1.7\n% document [FICTIF], pas une photo\n', 'latin1');
    await envoyer(monde, identifiant, 'piece-identite', pdf, 'image/jpeg');
  },
);

Then(
  "l'envoi est refusé avec le statut {int} et le message « {} »",
  ({ monde }, statut: number, message: string) => {
    expect(monde.reponse?.statut).toBe(statut);
    expect(monde.reponse?.corps['erreur']).toBe(message);
  },
);
