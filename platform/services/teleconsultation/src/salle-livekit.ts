// Salles vidéo LiveKit (ADR-0011) : jetons courts émis par ce service, deux participants au
// maximum, aucun enregistrement (le jeton ne donne jamais le droit d'enregistrer).
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { FournisseurSalle } from './rendez-vous.js';

export interface OptionsLiveKit {
  /** URL des clients, ex. wss://visio.mbolo-sante.example */
  url: string;
  cle: string;
  secret: string;
  /** Durée de validité du jeton pour entrer dans la salle (défaut : 10 min). */
  dureeJeton?: string;
}

export class SalleLiveKit implements FournisseurSalle {
  readonly url: string;
  private readonly api: RoomServiceClient;

  constructor(private readonly o: OptionsLiveKit) {
    this.url = o.url;
    this.api = new RoomServiceClient(o.url.replace(/^ws/, 'http'), o.cle, o.secret);
  }

  async preparer(nom: string): Promise<void> {
    await this.api.createRoom({ name: nom, maxParticipants: 2, emptyTimeout: 300 });
  }

  async jeton(j: { salle: string; identite: string; nomAffiche: string }): Promise<string> {
    const t = new AccessToken(this.o.cle, this.o.secret, {
      identity: j.identite,
      name: j.nomAffiche,
      ttl: this.o.dureeJeton ?? '10m',
    });
    t.addGrant({
      room: j.salle,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      roomRecord: false,
    });
    return t.toJwt();
  }
}
