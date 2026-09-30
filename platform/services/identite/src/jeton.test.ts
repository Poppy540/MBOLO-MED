import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { creerVerificateurAppelant } from './jeton.js';

const EMETTEUR = 'https://auth.mbolo-sante.example/realms/mbolo';

describe('jeton de service (appelant)', () => {
  it('rend le client appelant autorisé ; refuse un autre client ou une autre audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const verifier = creerVerificateurAppelant({
      emetteur: EMETTEUR,
      audience: 'mbolo-documents-api',
      clientsAutorises: ['mbolo-keycloak-inscription'],
      cles: createLocalJWKSet({ keys: [jwk] }),
    });
    const jeton = (azp: string, aud = 'mbolo-documents-api') =>
      new SignJWT({ azp })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(EMETTEUR)
        .setAudience(aud)
        .setExpirationTime('5m')
        .sign(privateKey);
    await expect(verifier(await jeton('mbolo-keycloak-inscription'))).resolves.toBe(
      'mbolo-keycloak-inscription',
    );
    await expect(verifier(await jeton('mbolo-app-patient'))).rejects.toThrow();
    await expect(
      verifier(await jeton('mbolo-keycloak-inscription', 'mbolo-notifications')),
    ).rejects.toThrow();
  });
});
