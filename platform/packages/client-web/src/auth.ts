// Connexion OpenID Connect avec PKCE (S256), sans bibliothèque. Le jeton reste en mémoire :
// jamais dans localStorage (exposé en cas d'injection de script). Après un rechargement, la session
// Keycloak (cookie) reconnecte sans ressaisie.

const b64url = (octets: Uint8Array): string =>
  btoa(String.fromCharCode(...octets))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const aleatoire = (n = 32): string => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function defiPkce(verificateur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificateur));
  return b64url(new Uint8Array(empreinte));
}

export interface ParametresConnexion {
  emetteur: string;
  client: string;
  retour: string;
}

/**
 * Adresse de la page de connexion Keycloak, ou de son formulaire d'inscription (code d'invitation,
 * ADR-0014) : même PKCE, même retour. `action` : action Keycloak lancée par l'application
 * (`kc_action`, ex. changer son numéro, ADR-0023) ; son résultat revient dans `kc_action_status`.
 */
export async function urlAutorisation(
  p: ParametresConnexion,
  verificateur: string,
  etat: string,
  inscription = false,
  niveau?: number,
  action?: string,
): Promise<string> {
  const q = new URLSearchParams({
    client_id: p.client,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: p.retour,
    state: etat,
    code_challenge: await defiPkce(verificateur),
    code_challenge_method: 'S256',
    // Double authentification (ADR-0022) : niveau 2 demandé juste avant une action sensible.
    ...(niveau ? { acr_values: String(niveau) } : {}),
    ...(action ? { kc_action: action } : {}),
  });
  const point = inscription ? 'registrations' : 'auth';
  return `${p.emetteur}/protocol/openid-connect/${point}?${q.toString()}`;
}

/** Stockage de la tentative de connexion (le temps d'un aller-retour vers Keycloak). */
export interface Memoire {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

const CLE = 'mbolo.connexion';

export async function demarrerConnexion(
  p: ParametresConnexion,
  m: Memoire,
  inscription = false,
  niveau?: number,
  action?: string,
): Promise<string> {
  const verificateur = aleatoire();
  const etat = aleatoire(16);
  m.setItem(CLE, JSON.stringify({ verificateur, etat }));
  return urlAutorisation(p, verificateur, etat, inscription, niveau, action);
}

/** Résultat d'une action lancée par l'application, lu au retour de Keycloak (`kc_action_status`). */
export type StatutAction = 'success' | 'cancelled' | 'error';

export function statutAction(adresse: URL): StatutAction | undefined {
  const s = adresse.searchParams.get('kc_action_status');
  return s === 'success' || s === 'cancelled' || s === 'error' ? s : undefined;
}

/**
 * Revendications d'un jeton, pour l'affichage seulement (jamais pour une décision d'accès : les
 * services vérifient la signature). Un objet vide si le jeton est illisible.
 */
export function revendications(jeton: string): Record<string, unknown> {
  try {
    const partie = (jeton.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(partie.padEnd(Math.ceil(partie.length / 4) * 4, '=')), (c) =>
        c.charCodeAt(0),
      ),
    );
    const r: unknown = JSON.parse(json);
    return r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Niveau d'authentification du jeton (`acr`, ADR-0022), pour décider s'il faut demander le code SMS
 * avant d'agir. Les services le vérifient de leur côté.
 */
export function niveauDuJeton(jeton: string | undefined): number {
  const acr = jeton ? revendications(jeton)['acr'] : undefined;
  return typeof acr === 'string' && /^[1-9]$/.test(acr) ? Number(acr) : 1;
}

/** Refus d'un service parce que l'action demande le code SMS (401, motif `niveau-insuffisant`). */
export const MOTIF_NIVEAU_INSUFFISANT = 'niveau-insuffisant';

/**
 * Retour de Keycloak : vérifie l'état (protection CSRF), puis échange le code contre un jeton.
 * Renvoie undefined si l'adresse n'est pas un retour de connexion.
 */
export async function terminerConnexion(
  p: ParametresConnexion,
  adresse: URL,
  m: Memoire,
  appeler: typeof fetch = fetch,
): Promise<string | undefined> {
  const code = adresse.searchParams.get('code');
  const etat = adresse.searchParams.get('state');
  if (!code || !etat) return undefined;
  const tentative = m.getItem(CLE);
  m.removeItem(CLE);
  const attendu = tentative
    ? (JSON.parse(tentative) as { verificateur: string; etat: string })
    : undefined;
  if (!attendu || attendu.etat !== etat) throw new Error('Connexion refusée : état inattendu.');
  const r = await appeler(`${p.emetteur}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: p.client,
      code,
      redirect_uri: p.retour,
      code_verifier: attendu.verificateur,
    }),
  });
  if (!r.ok) throw new Error('Connexion refusée.');
  const jeton = ((await r.json()) as { access_token?: string }).access_token;
  if (!jeton) throw new Error('Connexion refusée.');
  return jeton;
}

export function urlDeconnexion(p: ParametresConnexion): string {
  const q = new URLSearchParams({ client_id: p.client, post_logout_redirect_uri: p.retour });
  return `${p.emetteur}/protocol/openid-connect/logout?${q.toString()}`;
}
