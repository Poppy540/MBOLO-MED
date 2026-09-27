// Garde-fous sur la configuration du royaume Keycloak (keycloak/realm-mbolo.json).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (fichier: string): unknown =>
  JSON.parse(readFileSync(new URL(`../keycloak/${fichier}`, import.meta.url), 'utf8'));

interface Royaume {
  browserFlow: string;
  roles: { realm: { name: string; composites?: { realm?: string[] } }[] };
  clients: {
    clientId: string;
    defaultClientScopes?: string[];
    directAccessGrantsEnabled?: boolean;
    standardFlowEnabled?: boolean;
    serviceAccountsEnabled?: boolean;
    publicClient?: boolean;
    secret?: string;
    protocolMappers?: { protocolMapper: string; config: Record<string, string> }[];
  }[];
  components: Record<string, { config: Record<string, string[]> }[]>;
  authenticationFlows: { alias: string; authenticationExecutions: { authenticator?: string }[] }[];
}

const royaume = lire('realm-mbolo.json') as Royaume;

describe('royaume mbolo', () => {
  it('embarque exactement le profil utilisateur de profil-utilisateur.json', () => {
    const [profil] = royaume.components['org.keycloak.userprofile.UserProfileProvider'] ?? [];
    const embarque = JSON.parse(profil?.config['kc.user.profile.config']?.[0] ?? 'null') as unknown;
    expect(embarque).toEqual(lire('profil-utilisateur.json'));
  });

  it.each(['professionnel', 'infirmier', 'pharmacien', 'administrateur'])(
    'impose la double authentification au rôle %s',
    (nom) => {
      const role = royaume.roles.realm.find((r) => r.name === nom);
      expect(role?.composites?.realm).toContain('mfa-requise');
    },
  );

  it("n'impose pas la double authentification aux patients et proches", () => {
    for (const nom of ['patient', 'proche']) {
      expect(royaume.roles.realm.find((r) => r.name === nom)?.composites).toBeUndefined();
    }
  });

  it('utilise le flux de connexion avec OTP conditionnel', () => {
    const flux = royaume.authenticationFlows.find((f) => f.alias === 'navigateur-mbolo mfa');
    expect(royaume.browserFlow).toBe('navigateur-mbolo');
    expect(flux?.authenticationExecutions.map((e) => e.authenticator)).toEqual([
      'conditional-user-role',
      'auth-otp-form',
    ]);
  });

  it('ne met ni e-mail ni nom dans le jeton des applications, et interdit la connexion directe', () => {
    for (const c of royaume.clients.filter((x) => x.clientId.startsWith('mbolo-app-'))) {
      expect(c.defaultClientScopes).not.toContain('email');
      expect(c.defaultClientScopes).not.toContain('profile');
      expect(c.directAccessGrantsEnabled).toBe(false);
    }
  });

  it('compte de service identite : confidentiel, secret jamais écrit dans le royaume, accès minimal', () => {
    const c = royaume.clients.find((x) => x.clientId === 'mbolo-identite-service');
    expect(c).toMatchObject({
      publicClient: false,
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
    });
    // Le secret est injecté à l'import depuis l'environnement (coffre-fort), jamais en clair.
    expect(c?.secret).toBe('${IDENTITE_SERVICE_CLIENT_SECRET}');
    const mappeurs = c?.protocolMappers ?? [];
    expect(
      mappeurs.find((m) => m.protocolMapper === 'oidc-audience-mapper')?.config[
        'included.client.audience'
      ],
    ).toBe('mbolo-dossier-fhir');
    // Consentements seulement : créer, lire, mettre à jour, rechercher ; jamais supprimer.
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_scopes')?.config['claim.value'],
    ).toBe('system/Consent.crus');
  });

  it('aucun client ne contient de secret en clair', () => {
    for (const c of royaume.clients) {
      if (c.secret !== undefined) expect(c.secret).toMatch(/^\$\{[A-Z_]+\}$/);
    }
  });
});
