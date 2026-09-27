// Préparation du Keycloak de test : comptes FICTIFS. Le profil utilisateur (attributs réservés à
// l'administrateur) est déjà dans le royaume importé : il n'est pas réappliqué ici, pour le vérifier. N'agit que sur un Keycloak local ou de CI, jamais sur un environnement réel.
import { randomBytes } from 'node:crypto';
import { COMPTES, KEYCLOAK_URL, ROYAUME, VARIABLE_MOTS_DE_PASSE } from './configuration.js';

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

export default async function preparationGlobale(): Promise<void> {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(KEYCLOAK_URL)) {
    throw new Error('Les tests e2e ne s’exécutent que contre un Keycloak local.');
  }
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
