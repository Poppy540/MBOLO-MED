// Préparation du Keycloak de test : comptes FICTIFS. Le profil utilisateur (attributs réservés à
// l'administrateur) est déjà dans le royaume importé : il n'est pas réappliqué ici, pour le vérifier. N'agit que sur un Keycloak local ou de CI, jamais sur un environnement réel.
import { randomBytes } from 'node:crypto';
import { connecter } from '@mbolo/base-donnees';
import {
  agendaVideo,
  EXTENSION_STATUT_IDENTITE,
  MARQUEUR_FICTIF,
  SYSTEMES,
} from '@mbolo/dossier-fhir';
import {
  COMPTES,
  FHIR_URL,
  KEYCLOAK_URL,
  COHORTES,
  PATIENTS_A_VERIFIER,
  PREFIXE_INSCRITS,
  RESSOURCES_FHIR,
  ROYAUME,
  UNLEASH_URL,
  VARIABLE_MOTS_DE_PASSE,
} from './configuration.js';

async function jetonAdministrateur(): Promise<string> {
  const motDePasse = process.env['KC_BOOTSTRAP_ADMIN_PASSWORD'];
  if (!motDePasse) throw new Error('KC_BOOTSTRAP_ADMIN_PASSWORD manquant (Keycloak de test).');
  const r = await fetch(`${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env['KC_BOOTSTRAP_ADMIN_USERNAME'] ?? 'admin',
      password: motDePasse,
    }),
  });
  if (!r.ok) throw new Error(`Connexion administrateur Keycloak impossible (${r.status}).`);
  return ((await r.json()) as { access_token: string }).access_token;
}

/** Patients, professionnels et proches FICTIFS dans le serveur FHIR (identifiants imposés, marqués fictifs). */
async function preparerDossier(): Promise<void> {
  for (const { type, id } of RESSOURCES_FHIR) {
    const r = await fetch(`${FHIR_URL}/${type}/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify({
        resourceType: type,
        id,
        meta: { tag: [MARQUEUR_FICTIF] },
        ...(type === 'RelatedPerson' ? { patient: { reference: 'Patient/pat-fictif-001' } } : {}),
        // Patients conformes au profil mbolo-patient (nom et prénom) : leur identité peut être modifiée
        // par la passerelle, qui valide la ressource complète (ADR-0015).
        name: [
          type === 'Patient'
            ? { family: 'Fictif', given: [id], text: `${id} [FICTIF]` }
            : { text: `${id} [FICTIF]` },
        ],
        // Numéros manifestement fictifs, distincts pour savoir qui est prévenu.
        // Patients déjà vérifiés (ADR-0014) : identité contrôlée, numéro d'assurance fictif.
        ...(type === 'Patient'
          ? {
              // Le patient de la cohorte payante et celui de la récupération du compte ont leur
              // propre numéro : leurs SMS ne se mêlent pas à ceux des autres scénarios.
              telecom: [
                {
                  system: 'phone',
                  value:
                    { 'pat-fictif-004': '+241 00 00 00 04', 'pat-fictif-005': '+241 00 00 00 05' }[
                      id
                    ] ?? '+241 00 00 00 01',
                },
              ],
              birthDate: '1990-01-01',
              extension: [
                {
                  url: EXTENSION_STATUT_IDENTITE,
                  valueCode: PATIENTS_A_VERIFIER.includes(id) ? 'a-verifier' : 'verifiee',
                },
              ],
              identifier: [
                {
                  system: `${SYSTEMES.identifiantPatient}/assurance-maladie`,
                  type: {
                    coding: [
                      { system: SYSTEMES.typeIdentifiantPatient, code: 'assurance-maladie' },
                    ],
                  },
                  value: `FICTIF-${id}`,
                },
              ],
            }
          : {}),
        ...(type === 'Practitioner'
          ? { telecom: [{ system: 'phone', value: '+241 00 00 00 02' }] }
          : {}),
      }),
    });
    if (!r.ok)
      throw new Error(`Serveur FHIR : création de ${type}/${id} impossible (${r.status}).`);
  }
  // Un agenda par professionnel fictif ; les créneaux des exécutions précédentes sont retirés
  // (« entered-in-error », jamais supprimés) pour que les scénarios de publication soient reproductibles.
  for (const { id } of RESSOURCES_FHIR.filter((x) => x.type === 'Practitioner')) {
    const agenda = { ...agendaVideo({ praticienId: id, env: 'dev' }), id: `agenda-${id}` };
    const r = await fetch(`${FHIR_URL}/Schedule/${agenda.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify(agenda),
    });
    if (!r.ok) throw new Error(`Serveur FHIR : agenda de ${id} impossible (${r.status}).`);
    const agendas = (await (
      await fetch(`${FHIR_URL}/Schedule?actor=Practitioner/${id}&_count=100`, {
        headers: { 'cache-control': 'no-cache' },
      })
    ).json()) as { entry?: { resource: { id: string } }[] };
    for (const { resource: a } of agendas.entry ?? []) {
      const lot = (await (
        await fetch(`${FHIR_URL}/Slot?schedule=Schedule/${a.id}&status=free,busy&_count=500`, {
          headers: { 'cache-control': 'no-cache' },
        })
      ).json()) as { entry?: { resource: { id: string } }[] };
      for (const { resource } of lot.entry ?? []) {
        const m = await fetch(`${FHIR_URL}/Slot/${resource.id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/fhir+json' },
          body: JSON.stringify({ ...resource, status: 'entered-in-error' }),
        });
        if (!m.ok) throw new Error(`Serveur FHIR : retrait de Slot/${resource.id} impossible.`);
      }
    }
  }
  // Scénarios indépendants des exécutions précédentes : les consentements encore actifs des patients
  // fictifs sont révoqués (jamais supprimés, comme dans le dossier réel).
  for (const { id } of RESSOURCES_FHIR.filter((x) => x.type === 'Patient')) {
    const lot = (await (
      await fetch(`${FHIR_URL}/Consent?patient=Patient/${id}&status=active&_count=200`, {
        headers: { 'cache-control': 'no-cache' },
      })
    ).json()) as { entry?: { resource: { id: string; status: string } }[] };
    for (const { resource } of lot.entry ?? []) {
      const r = await fetch(`${FHIR_URL}/Consent/${resource.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/fhir+json' },
        body: JSON.stringify({ ...resource, status: 'inactive' }),
      });
      if (!r.ok) throw new Error(`Serveur FHIR : révocation de Consent/${resource.id} impossible.`);
    }
  }
}

/**
 * Photos des exécutions précédentes (patients fictifs) : retirées comme à échéance, clé détruite et
 * ligne gardée (jamais supprimées), pour que les scénarios de dépôt soient reproductibles.
 */
async function retirerPhotos(): Promise<void> {
  const url = process.env['DOCUMENTS_MIGRATION_DATABASE_URL'];
  if (!url) throw new Error('DOCUMENTS_MIGRATION_DATABASE_URL manquant (base de test).');
  if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
    throw new Error('Les tests e2e ne s’exécutent que contre une base locale.');
  }
  const sql = connecter({ url, application: 'e2e-preparation', production: false, max: 1 });
  try {
    const [table] = await sql<
      { t: string | null }[]
    >`select to_regclass('documents.documents') as t`;
    if (table?.t) {
      await sql`
        update documents.documents set cle_enveloppee = null, supprime_le = now()
         where patient_id like 'pat-fictif-%' and supprime_le is null`;
    }
  } finally {
    await sql.end();
  }
}

/**
 * Flags activés en développement pour leur seule cohorte de test, ciblée par identifiant de compte
 * (déploiement à 100 % limité par une contrainte sur userId). Les autres comptes les voient désactivés.
 */
async function preparerDrapeaux(sujets: Record<string, string>): Promise<void> {
  const jeton = process.env['UNLEASH_ADMIN_TOKEN'];
  if (!jeton) throw new Error('UNLEASH_ADMIN_TOKEN manquant (Unleash de test).');
  const base = `${UNLEASH_URL}/admin/projects/default/features`;
  const appeler = async (chemin: string, init: RequestInit = {}): Promise<Response> => {
    const r = await fetch(`${base}${chemin}`, {
      ...init,
      headers: { authorization: jeton, 'content-type': 'application/json' },
    });
    if (!r.ok && r.status !== 409) {
      throw new Error(`Unleash ${init.method ?? 'GET'} ${chemin} : ${r.status}`);
    }
    return r;
  };
  for (const [nom, cohorte] of Object.entries(COHORTES)) {
    await appeler('', {
      method: 'POST',
      body: JSON.stringify({ name: nom, type: 'release', description: 'e2e [FICTIF]' }),
    });
    const env = `/${nom}/environments/development`;
    const existantes = (await (await appeler(`${env}/strategies`)).json()) as { id: string }[];
    for (const st of existantes) await appeler(`${env}/strategies/${st.id}`, { method: 'DELETE' });
    await appeler(`${env}/strategies`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'flexibleRollout',
        parameters: { rollout: '100', stickiness: 'default', groupId: nom },
        constraints: [
          { contextName: 'userId', operator: 'IN', values: cohorte.map((i) => sujets[i] ?? '') },
        ],
      }),
    });
    await appeler(`${env}/on`, { method: 'POST' });
  }
  // Laisse les services relire les flags (rafraîchissement de 500 ms en e2e).
  await new Promise((r) => setTimeout(r, 1_500));
}

export default async function preparationGlobale(): Promise<void> {
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;
  if (!local.test(KEYCLOAK_URL) || !local.test(FHIR_URL) || !local.test(UNLEASH_URL)) {
    throw new Error(
      'Les tests e2e ne s’exécutent que contre un Keycloak, un serveur FHIR et un Unleash locaux.',
    );
  }
  await preparerDossier();
  await retirerPhotos();
  const jeton = await jetonAdministrateur();
  const admin = async (chemin: string, init: RequestInit = {}): Promise<Response> => {
    const r = await fetch(`${KEYCLOAK_URL}/admin/realms/${ROYAUME}${chemin}`, {
      ...init,
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
    });
    if (!r.ok && r.status !== 404) {
      throw new Error(`Keycloak ${init.method ?? 'GET'} ${chemin} : ${r.status}`);
    }
    return r;
  };

  // Comptes créés par les scénarios d'inscription des exécutions précédentes (ADR-0014).
  const inscrits = (await (await admin(`/users?search=${PREFIXE_INSCRITS}&max=1000`)).json()) as {
    id: string;
    username: string;
  }[];
  for (const u of inscrits.filter((x) => x.username.startsWith(PREFIXE_INSCRITS))) {
    await admin(`/users/${u.id}`, { method: 'DELETE' });
  }

  // Comptes fictifs, recréés à chaque exécution avec un mot de passe aléatoire.
  const motsDePasse: Record<string, string> = {};
  const sujets: Record<string, string> = {};
  for (const c of COMPTES) {
    const existants = (await (
      await admin(`/users?username=${c.identifiant}&exact=true`)
    ).json()) as { id: string }[];
    for (const e of existants) await admin(`/users/${e.id}`, { method: 'DELETE' });

    const mdp = `Fictif-${randomBytes(18).toString('base64url')}`;
    motsDePasse[c.identifiant] = mdp;
    await admin('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: c.identifiant,
        enabled: true,
        email: `${c.identifiant}@exemple.invalid`,
        emailVerified: true,
        firstName: c.prenom,
        lastName: 'Fictif',
        attributes: Object.fromEntries(Object.entries(c.attributs).map(([k, v]) => [k, [v]])),
        credentials: [{ type: 'password', value: mdp, temporary: false }],
      }),
    });
    const [cree] = (await (await admin(`/users?username=${c.identifiant}&exact=true`)).json()) as {
      id: string;
    }[];
    if (!cree) throw new Error(`Création du compte ${c.identifiant} impossible.`);
    sujets[c.identifiant] = cree.id;
    const role = await (await admin(`/roles/${c.role}`)).json();
    await admin(`/users/${cree.id}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([role]),
    });
  }
  await preparerDrapeaux(sujets);
  // Transmis aux processus de test par l'environnement (jamais écrit sur disque).
  process.env[VARIABLE_MOTS_DE_PASSE] = JSON.stringify(motsDePasse);
}
