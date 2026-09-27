// Préparation du Keycloak de test : comptes FICTIFS. Le profil utilisateur (attributs réservés à
// l'administrateur) est déjà dans le royaume importé : il n'est pas réappliqué ici, pour le vérifier. N'agit que sur un Keycloak local ou de CI, jamais sur un environnement réel.
import { randomBytes } from 'node:crypto';
import { MARQUEUR_FICTIF } from '@mbolo/dossier-fhir';
import {
  COMPTES,
  FHIR_URL,
  KEYCLOAK_URL,
  RESSOURCES_FHIR,
  ROYAUME,
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
        name: [{ text: `${id} [FICTIF]` }],
      }),
    });
    if (!r.ok)
      throw new Error(`Serveur FHIR : création de ${type}/${id} impossible (${r.status}).`);
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

export default async function preparationGlobale(): Promise<void> {
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;
  if (!local.test(KEYCLOAK_URL) || !local.test(FHIR_URL)) {
    throw new Error(
      'Les tests e2e ne s’exécutent que contre un Keycloak et un serveur FHIR locaux.',
    );
  }
  await preparerDossier();
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

  // Comptes fictifs, recréés à chaque exécution avec un mot de passe aléatoire.
  const motsDePasse: Record<string, string> = {};
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
    const role = await (await admin(`/roles/${c.role}`)).json();
    await admin(`/users/${cree.id}/role-mappings/realm`, {
      method: 'POST',
      body: JSON.stringify([role]),
    });
  }
  // Transmis aux processus de test par l'environnement (jamais écrit sur disque).
  process.env[VARIABLE_MOTS_DE_PASSE] = JSON.stringify(motsDePasse);
}
