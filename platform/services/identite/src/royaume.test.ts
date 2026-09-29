// Garde-fous sur la configuration du royaume Keycloak (keycloak/realm-mbolo.json).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (fichier: string): unknown =>
  JSON.parse(readFileSync(new URL(`../keycloak/${fichier}`, import.meta.url), 'utf8'));

interface Royaume {
  sslRequired: string;
  revokeRefreshToken?: boolean;
  refreshTokenMaxReuse?: number;
  browserFlow: string;
  requiredActions: { alias: string; enabled: boolean; defaultAction?: boolean }[];
  registrationAllowed: boolean;
  registrationFlow: string;
  loginTheme: string;
  roles: { realm: { name: string; description?: string; composites?: { realm?: string[] } }[] };
  clients: {
    clientId: string;
    defaultClientScopes?: string[];
    directAccessGrantsEnabled?: boolean;
    standardFlowEnabled?: boolean;
    serviceAccountsEnabled?: boolean;
    publicClient?: boolean;
    secret?: string;
    clientAuthenticatorType?: string;
    attributes?: Record<string, string>;
    protocolMappers?: { protocolMapper: string; config: Record<string, string> }[];
  }[];
  components: Record<string, { config: Record<string, string[]> }[]>;
  authenticationFlows: { alias: string; authenticationExecutions: { authenticator?: string }[] }[];
}

const royaume = lire('realm-mbolo.json') as Royaume;

/** Compte de service authentifié par clé privée (private_key_jwt), sans secret (ADR-0016). */
const authentificationParCle = (
  c:
    | { secret?: string; clientAuthenticatorType?: string; attributes?: Record<string, string> }
    | undefined,
  prefixe: string,
): boolean =>
  c?.secret === undefined &&
  c?.clientAuthenticatorType === 'client-jwt' &&
  c.attributes?.['use.jwks.url'] === 'false' &&
  c.attributes['jwt.credential.certificate'] === `\${${prefixe}_SERVICE_CERTIFICAT}` &&
  c.attributes['token.endpoint.auth.signing.alg'] === 'RS256';

describe('royaume mbolo', () => {
  it('embarque exactement le profil utilisateur de profil-utilisateur.json', () => {
    const [profil] = royaume.components['org.keycloak.userprofile.UserProfileProvider'] ?? [];
    const embarque = JSON.parse(profil?.config['kc.user.profile.config']?.[0] ?? 'null') as unknown;
    expect(embarque).toEqual(lire('profil-utilisateur.json'));
  });

  it.each([
    'professionnel',
    'infirmier',
    'pharmacien',
    'administrateur',
    'revue-acces',
    'gestion-invitations',
    'verification-identite',
    'validation-remboursement',
    'assistance-patient',
    'validation-reversement',
    // Le proche voit des données de santé d'une autre personne (ADR-0019, porteur de projet).
    'proche',
  ])('impose la double authentification au rôle %s', (nom) => {
    const role = royaume.roles.realm.find((r) => r.name === nom);
    expect(role?.composites?.realm).toContain('mfa-requise');
  });

  it('garde les descriptions des rôles sous la limite de Keycloak (255 caractères)', () => {
    for (const r of royaume.roles.realm) {
      expect(r.description?.length ?? 0, r.name).toBeLessThanOrEqual(255);
    }
  });

  it('fait tourner les jetons de rafraîchissement, à usage unique (ASVS C5)', () => {
    expect(royaume.revokeRefreshToken).toBe(true);
    expect(royaume.refreshTokenMaxReuse).toBe(0);
  });

  it('exige TLS hors réseau privé par défaut, et partout si la production le demande (ASVS C5)', () => {
    // MBOLO_KEYCLOAK_SSL_REQUIRED=all en production ; « external » en local et en CI (HTTP).
    expect(royaume.sslRequired).toBe('${MBOLO_KEYCLOAK_SSL_REQUIRED:external}');
  });

  it("n'impose pas la double authentification aux patients", () => {
    expect(royaume.roles.realm.find((r) => r.name === 'patient')?.composites).toBeUndefined();
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

  it('compte de service identite : confidentiel, authentifié par clé, accès minimal', () => {
    const c = royaume.clients.find((x) => x.clientId === 'mbolo-identite-service');
    expect(c).toMatchObject({
      publicClient: false,
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
    });
    // Clé privée côté service, certificat public côté Keycloak (ADR-0016) : aucun secret partagé.
    expect(authentificationParCle(c, 'IDENTITE')).toBe(true);
    const mappeurs = c?.protocolMappers ?? [];
    expect(
      mappeurs.find((m) => m.protocolMapper === 'oidc-audience-mapper')?.config[
        'included.client.audience'
      ],
    ).toBe('mbolo-dossier-fhir');
    // Consentements (créer, lire, mettre à jour, rechercher) et journal des accès (créer, rechercher
    // seulement : une trace ne se modifie pas) ; jamais de suppression.
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_scopes')?.config['claim.value'],
    ).toBe('system/Consent.crus system/AuditEvent.cs');
  });

  it('compte de service teleconsultation : rendez-vous et agendas uniquement, jamais de suppression', () => {
    const c = royaume.clients.find((x) => x.clientId === 'mbolo-teleconsultation-service');
    expect(c).toMatchObject({
      publicClient: false,
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
    });
    expect(authentificationParCle(c, 'TELECONSULTATION')).toBe(true);
    const mappeurs = c?.protocolMappers ?? [];
    expect(
      mappeurs.find((m) => m.protocolMapper === 'oidc-audience-mapper')?.config[
        'included.client.audience'
      ],
    ).toBe('mbolo-dossier-fhir');
    // Aucun accès aux consentements, au journal ni aux données cliniques.
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_scopes')?.config['claim.value'],
    ).toBe(
      'system/Appointment.crus system/Schedule.crus system/Slot.crus system/Practitioner.r system/Patient.r',
    );
    // Annuaire : du professionnel, seuls le nom et la qualification sortent de la passerelle ;
    // du patient, seulement le statut de vérification d'identité (extension, ADR-0014).
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_elements')?.config['claim.value'],
    ).toBe('Practitioner.name Practitioner.qualification Patient.extension');
  });

  it('compte de service documents : identité déclarée, charte, statut et numéro seulement (ADR-0015)', () => {
    const c = royaume.clients.find((x) => x.clientId === 'mbolo-documents-service');
    expect(c).toMatchObject({
      publicClient: false,
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
    });
    expect(authentificationParCle(c, 'DOCUMENTS')).toBe(true);
    const mappeurs = c?.protocolMappers ?? [];
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_scopes')?.config['claim.value'],
    ).toBe('system/Patient.ru system/Consent.s system/AuditEvent.c');
    // Du patient, seuls l'identité déclarée et son statut sortent de la passerelle (pour la
    // comparer aux photos) ; seuls le statut et le numéro peuvent être modifiés.
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_elements')?.config['claim.value'],
    ).toBe('Patient.extension Patient.identifier Patient.name Patient.birthDate');
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_elements_modifiables')?.config[
        'claim.value'
      ],
    ).toBe('Patient.extension Patient.identifier');
    const audiences = (id: string) =>
      (royaume.clients.find((x) => x.clientId === id)?.protocolMappers ?? [])
        .filter((m) => m.protocolMapper === 'oidc-audience-mapper')
        .map((m) => m.config['included.client.audience']);
    expect(audiences('mbolo-app-patient')).toContain('mbolo-documents-api');
    // L'espace professionnel l'appelle aussi : écran du vérificateur (rôle verification-identite).
    expect(audiences('mbolo-app-pro')).toContain('mbolo-documents-api');
  });

  it('paiement (ADR-0017) : le patient et la téléconsultation seulement', () => {
    const audiences = (id: string) =>
      (royaume.clients.find((x) => x.clientId === id)?.protocolMappers ?? [])
        .filter((m) => m.protocolMapper === 'oidc-audience-mapper')
        .map((m) => m.config['included.client.audience']);
    const avecPaiement = royaume.clients
      .filter((c) => audiences(c.clientId).includes('mbolo-paiement-api'))
      .map((c) => c.clientId)
      .sort();
    // Le patient paie, la téléconsultation crée le paiement, l'espace professionnel sert aux
    // seuls valideurs des remboursements (rôle vérifié par le service) ; aucun agent IA.
    expect(avecPaiement).toEqual([
      'mbolo-app-patient',
      'mbolo-app-pro',
      'mbolo-teleconsultation-service',
    ]);
    expect(royaume.clients.find((c) => c.clientId === 'mbolo-paiement-api')).toMatchObject({
      bearerOnly: true,
      publicClient: false,
    });
  });

  it('compte de service notifications : lecture du contact et du consentement seulement', () => {
    const c = royaume.clients.find((x) => x.clientId === 'mbolo-notifications-service');
    expect(c).toMatchObject({
      publicClient: false,
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
    });
    expect(authentificationParCle(c, 'NOTIFICATIONS')).toBe(true);
    const mappeurs = c?.protocolMappers ?? [];
    // Lecture par identifiant (r) et recherche de consentements (s) : aucune écriture.
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_scopes')?.config['claim.value'],
    ).toBe('system/Patient.r system/Practitioner.r system/Consent.s');
    // Minimisation appliquée par la passerelle : seul le numéro sort du dossier.
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_elements')?.config['claim.value'],
    ).toBe('Patient.telecom Practitioner.telecom');
    // Seul le service de téléconsultation peut appeler les notifications.
    const audiences = (id: string) =>
      (royaume.clients.find((x) => x.clientId === id)?.protocolMappers ?? [])
        .filter((m) => m.protocolMapper === 'oidc-audience-mapper')
        .map((m) => m.config['included.client.audience']);
    expect(audiences('mbolo-teleconsultation-service')).toContain('mbolo-notifications');
    expect(audiences('mbolo-identite-service')).not.toContain('mbolo-notifications');
  });

  it('compte de service consultation : problèmes et comptes-rendus, rendez-vous en lecture seule', () => {
    const c = royaume.clients.find((x) => x.clientId === 'mbolo-consultation-service');
    expect(c).toMatchObject({ publicClient: false, serviceAccountsEnabled: true });
    expect(authentificationParCle(c, 'CONSULTATION')).toBe(true);
    const mappeurs = c?.protocolMappers ?? [];
    // Pas de suppression, pas de modification ; pas d'accès aux consentements ni au journal.
    expect(
      mappeurs.find((m) => m.config['claim.name'] === 'mbolo_scopes')?.config['claim.value'],
    ).toBe(
      'system/Condition.rs system/Composition.crs system/Appointment.r system/MedicationRequest.crus system/RelatedPerson.r',
    );
    // Les deux applications appellent l'API de consultation : le professionnel pour lire, rédiger et
    // prescrire ; le patient seulement pour lire ses propres documents (le service vérifie le rôle).
    const audiences = (id: string) =>
      (royaume.clients.find((x) => x.clientId === id)?.protocolMappers ?? [])
        .filter((m) => m.protocolMapper === 'oidc-audience-mapper')
        .map((m) => m.config['included.client.audience']);
    expect(audiences('mbolo-app-pro')).toContain('mbolo-consultation-api');
    expect(audiences('mbolo-app-patient')).toContain('mbolo-consultation-api');
  });

  it('invitations : applications professionnelle et patient, rôle jamais donné aux agents IA', () => {
    const audiences = (id: string) =>
      (royaume.clients.find((x) => x.clientId === id)?.protocolMappers ?? [])
        .filter((m) => m.protocolMapper === 'oidc-audience-mapper')
        .map((m) => m.config['included.client.audience']);
    expect(audiences('mbolo-app-pro')).toContain('mbolo-invitations-api');
    // Le patient appelle l'API pour inviter ses proches (ADR-0019) ; le service vérifie le rôle.
    expect(audiences('mbolo-app-patient')).toContain('mbolo-invitations-api');
    const agentIa = royaume.roles.realm.find((r) => r.name === 'agent-ia');
    expect(agentIa?.composites?.realm ?? []).not.toContain('gestion-invitations');
  });

  it('invitations de proches : compte de service limité à la fiche du proche, au SMS et à l’assistance (ADR-0019)', () => {
    const c = royaume.clients.find((x) => x.clientId === 'mbolo-invitations-service');
    expect(c?.clientAuthenticatorType).toBe('client-jwt');
    expect(c?.attributes?.['jwt.credential.certificate']).toBe('${INVITATIONS_SERVICE_CERTIFICAT}');
    const mappers = c?.protocolMappers ?? [];
    expect(
      mappers
        .filter((m) => m.protocolMapper === 'oidc-audience-mapper')
        .map((m) => m.config['included.client.audience'])
        .sort(),
    ).toEqual(['mbolo-dossier-fhir', 'mbolo-notifications']);
    // Jamais de suppression ; du patient, seulement de quoi le retrouver et le rappeler (équipe
    // d'assistance) ; traces en création seulement.
    expect(
      mappers.find((m) => m.config['claim.name'] === 'mbolo_scopes')?.config['claim.value'],
    ).toBe('system/RelatedPerson.crus system/Patient.rs system/AuditEvent.c');
    expect(
      mappers.find((m) => m.config['claim.name'] === 'mbolo_elements')?.config['claim.value'],
    ).toBe('Patient.identifier Patient.telecom Patient.birthDate');
  });

  it("n'ouvre l'inscription qu'avec un code d'invitation, vérifié après les autres champs (ADR-0014)", () => {
    expect(royaume.registrationAllowed).toBe(true);
    expect(royaume.loginTheme).toBe('mbolo');
    expect(royaume.registrationFlow).toBe('inscription-mbolo');
    const formulaire = royaume.authenticationFlows.find(
      (f) => f.alias === 'inscription-mbolo formulaire',
    );
    expect(formulaire?.authenticationExecutions.map((e) => e.authenticator)).toEqual([
      'registration-user-creation',
      'registration-password-action',
      'mbolo-code-invitation',
    ]);
  });

  it("demande l'identité juste après l'inscription, sans perdre les actions par défaut (ADR-0014)", () => {
    const actives = royaume.requiredActions.filter((a) => a.enabled).map((a) => a.alias);
    expect(actives).toContain('mbolo-identite-patient');
    // Déclarer une action supprime celles qui ne le sont pas : la MFA en dépend.
    expect(actives).toContain('CONFIGURE_TOTP');
    expect(actives).toContain('UPDATE_PASSWORD');
    // Conditions d'utilisation, demandées aux seuls proches par l'extension (ADR-0019).
    expect(actives).toContain('TERMS_AND_CONDITIONS');
    // Jamais par défaut : un patient ne les voit pas.
    expect(
      royaume.requiredActions.find((a) => a.alias === 'TERMS_AND_CONDITIONS')?.defaultAction,
    ).toBe(false);
  });

  it("ne demande ni nom ni e-mail à l'inscription : identité dans le dossier seulement", () => {
    const profil = lire('profil-utilisateur.json') as {
      attributes: { name: string; permissions: { edit: string[] } }[];
    };
    for (const nom of ['email', 'firstName', 'lastName']) {
      expect(profil.attributes.find((a) => a.name === nom)?.permissions.edit).toEqual(['admin']);
    }
  });

  it('aucun client ne contient de secret en clair', () => {
    for (const c of royaume.clients) {
      if (c.secret !== undefined) expect(c.secret).toMatch(/^\$\{[A-Z_]+\}$/);
    }
  });
});
