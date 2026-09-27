import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { SalleLiveKit } from './salle-livekit.js';

// Clé et secret de test construits à l'exécution (aucun secret dans le dépôt).
const cle = ['cle', 'test'].join('-');
const secret = 'x'.repeat(40);

describe('jeton LiveKit', () => {
  it('limité à une salle, court, sans droit d’enregistrer ni d’envoyer des données', async () => {
    const s = new SalleLiveKit({ url: 'ws://livekit.test', cle, secret });
    const jeton = await s.jeton({ salle: 'rdv-1', identite: 'u-p1', nomAffiche: 'Patient' });
    const c = decodeJwt(jeton) as Record<string, unknown> & {
      video: Record<string, unknown>;
      exp: number;
      nbf?: number;
    };
    expect(c['sub']).toBe('u-p1');
    expect(c['name']).toBe('Patient');
    expect(c.video).toMatchObject({
      room: 'rdv-1',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      roomRecord: false,
    });
    expect(c.video['roomAdmin']).toBeUndefined();
    expect(c.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(600);
  });
});
