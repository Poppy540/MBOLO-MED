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

describe('retrait d’un compte des salles LiveKit', () => {
  it('retire le compte de chaque salle où il est, et seulement de celles-là', async () => {
    const s = new SalleLiveKit({ url: 'ws://livekit.test', cle, secret });
    const retraits: string[] = [];
    (s as unknown as { api: unknown }).api = {
      listRooms: async () => [{ name: 'rdv-1' }, { name: 'rdv-2' }, { name: 'rdv-3' }],
      listParticipants: async (salle: string) =>
        salle === 'rdv-2' ? [{ identity: 'u-p2' }] : [{ identity: 'u-p1' }, { identity: 'u-m1' }],
      removeParticipant: async (salle: string, identite: string) => {
        retraits.push(`${salle}/${identite}`);
      },
    };
    expect(await s.retirer('u-m1')).toBe(2);
    expect(retraits).toEqual(['rdv-1/u-m1', 'rdv-3/u-m1']);
    expect(await s.retirer('u-inconnu')).toBe(0);
  });
});
