// Étapes « téléconsultation » : rendez-vous, jeton de salle, vraie connexion LiveKit dans deux
// navigateurs (micro simulé). Données FICTIVES uniquement ; rien n'est enregistré.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, type Browser } from '@playwright/test';
import { FHIR_URL, TELECONSULTATION_URL, WEBRTC_URL } from '../configuration.js';
import { Given, Then, When, type Monde } from './fixtures.js';

// Bundle navigateur du client LiveKit, lu depuis le paquet installé (hors champ « exports »).
const require = createRequire(import.meta.url);
const CLIENT_LIVEKIT = readFileSync(
  join(dirname(require.resolve('livekit-client')), 'livekit-client.umd.js'),
  'utf8',
);

// Page minimale d'appel, servie sur localhost (contexte sécurisé pour le micro).
const ORIGINE = 'http://localhost:5173';
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<script src="/livekit-client.umd.js"></script></head><body><script>
window.rejoindre = async (url, jeton) => {
  const salle = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
  window.salle = salle;
  await salle.connect(url, jeton);
  await salle.localParticipant.setMicrophoneEnabled(true);
  return salle.state;
};
window.distants = () => [...window.salle.remoteParticipants.values()].map((p) => ({
  nom: p.name,
  audio: [...p.audioTrackPublications.values()].some((t) => t.isSubscribed),
}));
</script></body></html>`;

async function appeler(
  monde: Monde,
  methode: 'GET' | 'POST',
  chemin: string,
  jeton: string | undefined,
  corps?: unknown,
): Promise<void> {
  const r = await fetch(`${TELECONSULTATION_URL}${chemin}`, {
    method: methode,
    headers: {
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
      ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
  });
  monde.reponse = { statut: r.status, corps: (await r.json()) as Record<string, unknown> };
}

When(
  '{string} demande un rendez-vous vidéo avec {string} maintenant',
  async ({ monde }, identifiant: string, praticien: string) => {
    await appeler(monde, 'POST', '/rendez-vous', monde.jetons.get(identifiant), {
      praticienId: praticien,
      debut: new Date().toISOString(),
      dureeMinutes: 20,
    });
    if (monde.reponse?.statut === 201) monde.rendezVousId = String(monde.reponse.corps['id']);
  },
);

Then('le rendez-vous est enregistré', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(201);
});

// Lecture directe du serveur FHIR de test (hors passerelle) pour vérifier ce qui a été écrit.
Then(
  'le dossier médical contient ce rendez-vous entre {string} et {string}, sans motif',
  async ({ monde }, patient: string, praticien: string) => {
    const r = await fetch(`${FHIR_URL}/Appointment/${monde.rendezVousId ?? ''}`, {
      headers: { accept: 'application/fhir+json', 'cache-control': 'no-cache' },
    });
    expect(r.status).toBe(200);
    const a = (await r.json()) as Record<string, unknown> & {
      participant: { actor?: { reference?: string } }[];
      meta?: { tag?: { code?: string }[] };
    };
    expect(a['status']).toBe('booked');
    expect(a.participant.map((p) => p.actor?.reference).sort()).toEqual(
      [`Patient/${patient}`, `Practitioner/${praticien}`].sort(),
    );
    for (const champ of ['reasonCode', 'reasonReference', 'description', 'comment']) {
      expect(a[champ]).toBeUndefined();
    }
    expect(a.meta?.tag?.some((t) => t.code === 'fictif')).toBe(true);
  },
);

Then(
  '{string} retrouve ce rendez-vous dans ses rendez-vous',
  async ({ monde }, identifiant: string) => {
    await appeler(monde, 'GET', '/rendez-vous', monde.jetons.get(identifiant));
    expect(monde.reponse?.statut).toBe(200);
    const ids = (monde.reponse?.corps['rendezVous'] as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(monde.rendezVousId);
  },
);

Then('le rendez-vous est refusé par le dossier médical', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(422);
});

When(
  '{string} rejoint la téléconsultation',
  async ({ monde, browser }: { monde: Monde; browser: Browser }, identifiant: string) => {
    await appeler(
      monde,
      'POST',
      `/rendez-vous/${monde.rendezVousId ?? ''}/salle`,
      monde.jetons.get(identifiant),
    );
    expect(monde.reponse?.statut).toBe(200);
    expect(monde.reponse?.corps['url']).toBe(WEBRTC_URL);
    const contexte = await browser.newContext({ permissions: ['microphone'] });
    const page = await contexte.newPage();
    await page.route(`${ORIGINE}/**`, (route) =>
      route.request().url().endsWith('/livekit-client.umd.js')
        ? route.fulfill({ contentType: 'text/javascript', body: CLIENT_LIVEKIT })
        : route.fulfill({ contentType: 'text/html', body: PAGE }),
    );
    await page.goto(`${ORIGINE}/visio`);
    const etat = await page.evaluate(
      ([url, jeton]) =>
        (window as unknown as { rejoindre: (u: string, j: string) => Promise<string> }).rejoindre(
          url,
          jeton,
        ),
      [String(monde.reponse?.corps['url']), String(monde.reponse?.corps['jeton'])] as const,
    );
    expect(etat).toBe('connected');
    monde.visio.set(identifiant, { contexte, page });
  },
);

Then('{string} entend {string}', async ({ monde }, auditeur: string, libelle: string) => {
  const page = monde.visio.get(auditeur)?.page;
  if (!page) throw new Error(`${auditeur} n'a pas rejoint la salle.`);
  // Le son de l'autre participant est reçu (piste audio abonnée), avec un libellé neutre.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { distants: () => { nom: string; audio: boolean }[] }).distants(),
        ),
      { timeout: 15_000 },
    )
    .toEqual([{ nom: libelle, audio: true }]);
});

When(
  '{string} demande à entrer dans la salle de ce rendez-vous',
  async ({ monde }, identifiant: string) => {
    await appeler(
      monde,
      'POST',
      `/rendez-vous/${monde.rendezVousId ?? ''}/salle`,
      monde.jetons.get(identifiant),
    );
  },
);

Then("l'entrée dans la salle est refusée", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(404);
  expect(monde.reponse?.corps['jeton']).toBeUndefined();
});

Then("la téléconsultation n'est pas encore disponible pour ce compte", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(403);
  expect(monde.reponse?.corps['erreur']).toBe('Fonction non disponible.');
});

Given("aucun jeton n'est présenté au service de téléconsultation", async ({ monde }) => {
  await appeler(monde, 'GET', '/rendez-vous', undefined);
});

Then('le service de téléconsultation exige une authentification', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(401);
});

When('{string} annule ce rendez-vous', async ({ monde }, identifiant: string) => {
  await appeler(
    monde,
    'POST',
    `/rendez-vous/${monde.rendezVousId ?? ''}/annulation`,
    monde.jetons.get(identifiant),
  );
});

Then('le rendez-vous est annulé', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(200);
  expect(monde.reponse?.corps['statut']).toBe('annule');
});

Then("l'annulation est refusée car le rendez-vous est introuvable", ({ monde }) => {
  expect(monde.reponse?.statut).toBe(404);
});

Then('la salle est fermée pour ce rendez-vous', ({ monde }) => {
  expect(monde.reponse?.statut).toBe(409);
  expect(monde.reponse?.corps['jeton']).toBeUndefined();
});

// Lecture directe du serveur FHIR de test : le rendez-vous est conservé, avec qui a annulé et quand.
Then(
  'le dossier médical conserve ce rendez-vous annulé par {string}, sans motif',
  async ({ monde }, auteur: string) => {
    const r = await fetch(`${FHIR_URL}/Appointment/${monde.rendezVousId ?? ''}`, {
      headers: { accept: 'application/fhir+json', 'cache-control': 'no-cache' },
    });
    expect(r.status).toBe(200);
    const a = (await r.json()) as {
      status: string;
      cancelationReason?: { text?: string; coding?: { code?: string }[] };
      extension?: { url: string; valueDateTime?: string }[];
    };
    expect(a.status).toBe('cancelled');
    expect(a.cancelationReason?.coding?.[0]?.code).toBe(auteur);
    expect(a.cancelationReason?.text).toBeUndefined();
    const date = a.extension?.find((e) => e.url.endsWith('/date-annulation'))?.valueDateTime;
    expect(Date.now() - new Date(date ?? 0).getTime()).toBeLessThan(5 * 60_000);
  },
);
