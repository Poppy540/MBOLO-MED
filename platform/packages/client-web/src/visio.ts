// Téléconsultation vidéo LiveKit, chargée seulement au moment de rejoindre (économie de données).
// Commune aux applications patient et professionnel.
// Vidéo en basse définition, flux adaptatif ; repli audio automatique ou choisi par le patient.
import type { AccesSalle } from './api.js';
import { DecisionRepli, type Qualite } from './repli.js';

export interface EtatVisio {
  connecte: boolean;
  /** L'autre participant (patient ou professionnel) est dans la salle. */
  autrePresent: boolean;
  audioSeulement: boolean;
  /** Le repli audio a été décidé automatiquement (réseau faible). */
  repliAutomatique: boolean;
}

export interface Visio {
  audioSeulement(actif: boolean): Promise<void>;
  quitter(): Promise<void>;
}

export async function rejoindre(
  acces: AccesSalle,
  conteneur: HTMLElement,
  surEtat: (e: EtatVisio) => void,
): Promise<Visio> {
  const lk = await import('livekit-client');
  const room = new lk.Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: { resolution: lk.VideoPresets.h216.resolution },
  });
  const etat: EtatVisio = {
    connecte: false,
    autrePresent: false,
    audioSeulement: false,
    repliAutomatique: false,
  };
  const publier = () => surEtat({ ...etat });
  const decision = new DecisionRepli();
  let qualite: Qualite = 'unknown';

  const appliquerAudioSeulement = async (actif: boolean) => {
    etat.audioSeulement = actif;
    await room.localParticipant.setCameraEnabled(!actif).catch(() => undefined);
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.videoTrackPublications.values()) {
        // L'image disparaît tout de suite ; le serveur arrête ensuite d'envoyer la vidéo.
        if (actif) for (const el of pub.track?.detach() ?? []) el.remove();
        pub.setSubscribed(!actif);
      }
    }
    publier();
  };

  const verifierRepli = () => {
    if (!etat.audioSeulement && decision.observer(qualite, Date.now())) {
      etat.repliAutomatique = true;
      void appliquerAudioSeulement(true);
    }
  };

  room
    .on(lk.RoomEvent.TrackSubscribed, (piste) => {
      const el = piste.attach();
      el.dataset['piste'] = piste.kind;
      conteneur.appendChild(el);
    })
    .on(lk.RoomEvent.TrackUnsubscribed, (piste) => {
      for (const el of piste.detach()) el.remove();
    })
    .on(lk.RoomEvent.TrackPublished, (pub) => {
      if (etat.audioSeulement && pub.kind === lk.Track.Kind.Video) pub.setSubscribed(false);
    })
    .on(lk.RoomEvent.ParticipantConnected, () => {
      etat.autrePresent = room.remoteParticipants.size > 0;
      publier();
    })
    .on(lk.RoomEvent.ParticipantDisconnected, () => {
      etat.autrePresent = room.remoteParticipants.size > 0;
      publier();
    })
    .on(lk.RoomEvent.ConnectionQualityChanged, (q, participant) => {
      if (participant.isLocal) {
        qualite = q as Qualite;
        verifierRepli();
      }
    })
    .on(lk.RoomEvent.Disconnected, () => {
      etat.connecte = false;
      publier();
    });

  // La qualité n'est signalée qu'à ses changements : on revérifie chaque seconde.
  const minuterie = setInterval(verifierRepli, 1_000);

  // Micro et caméra d'abord : l'autorisation est demandée avant la connexion (message clair en cas
  // de refus), et le navigateur peut alors proposer ses vraies adresses réseau pour l'appel.
  const pistes = await lk
    .createLocalTracks({
      audio: true,
      video: { resolution: lk.VideoPresets.h216.resolution },
    })
    .catch(() => lk.createLocalTracks({ audio: true }));
  await room.connect(acces.url, acces.jeton);
  for (const piste of pistes) await room.localParticipant.publishTrack(piste);
  etat.connecte = true;
  etat.autrePresent = room.remoteParticipants.size > 0;
  publier();

  return {
    audioSeulement: async (actif) => {
      etat.repliAutomatique = false;
      await appliquerAudioSeulement(actif);
    },
    quitter: async () => {
      clearInterval(minuterie);
      await room.disconnect();
    },
  };
}
