import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { describe, expect, it } from 'vitest';
import { creerVerificateurService } from './jeton-service.js';

const EMETTEUR = 'http://127.0.0.1:8081/realms/mbolo';

describe('jetons de l’extension d’inscription', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'cle-fictive', alg: 'RS256' };
  const verifier = creerVerificateurService({
    emetteur: EMETTEUR,
    audience: 'mbolo-invitations-api',
    clientsAutorises: ['mbolo-keycloak-inscription'],
    cles: createLocalJWKSet({ keys: [jwk] }),
  });
  const signer = (azp: string, aud = 'mbolo-invitations-api') =>
    new SignJWT({ azp })
      .setProtectedHeader({ alg: 'RS256', kid: 'cle-fictive' })
      .setIssuer(EMETTEUR)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(privateKey);

  it('accepte un jeton du client autorisé', async () => {
    expect(await verifier(await signer('mbolo-keycloak-inscription'))).toBe(
      'mbolo-keycloak-inscription',
    );
  });

  it('refuse un autre client, une autre audience ou un autre émetteur', async () => {
    await expect(verifier(await signer('mbolo-app-pro'))).rejects.toThrow();
    await expect(verifier(await signer('mbolo-keycloak-inscription', 'autre'))).rejects.toThrow();
    const autre = await new SignJWT({ azp: 'mbolo-keycloak-inscription' })
      .setProtectedHeader({ alg: 'RS256', kid: 'cle-fictive' })
      .setIssuer('http://ailleurs.invalid/realms/mbolo')
      .setAudience('mbolo-invitations-api')
      .setExpirationTime('60s')
      .sign(privateKey);
    await expect(verifier(autre)).rejects.toThrow();
  });
});
