// Écran de téléconsultation commun : connexion à la salle, présence de l'autre participant,
// repli audio automatique ou choisi, raccrocher. Téléphone en économie de données ou réseau 2G :
// la consultation commence en audio seulement, la vidéo reste activable.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ErreurApi, type AccesSalle } from './api.js';
import { economiserDonnees } from './repli.js';
import type { EtatVisio, Visio } from './visio.js';

export function Consultation(p: {
  /** Demande le jeton de salle (API de téléconsultation). */
  salle: () => Promise<AccesSalle>;
  /** Libellé de l'autre participant : « Patient » ou « Professionnel de santé ». */
  autre: string;
  retour: () => void;
  signaler: (e: unknown) => void;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const visio = useRef<Visio>();
  const [etat, setEtat] = useState<EtatVisio>();

  useEffect(() => {
    let fini = false;
    void (async () => {
      try {
        const acces = await p.salle();
        const { rejoindre } = await import('./visio.js');
        if (fini || !conteneur.current) return;
        visio.current = await rejoindre(acces, conteneur.current, setEtat, {
          audioSeulement: economiserDonnees(),
        });
      } catch (e) {
        p.signaler(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? new ErreurApi(0, 'Autorisez le micro pour la consultation, puis réessayez.')
            : e,
        );
        p.retour();
      }
    })();
    return () => {
      fini = true;
      void visio.current?.quitter();
    };
  }, []);

  return (
    <section>
      <h2>
        <span aria-hidden="true">📹</span> Téléconsultation
      </h2>
      <p aria-live="polite" data-etat-visio="">
        {!etat?.connecte
          ? 'Connexion…'
          : etat.autrePresent
            ? `${p.autre} connecté.`
            : `En attente : ${p.autre.toLowerCase()}…`}
      </p>
      {etat?.audioSeulement && (
        <p class="message" role="status" data-audio-seulement="">
          {etat.repliAutomatique
            ? 'Réseau faible : audio seulement pour garder la communication.'
            : etat.economieDonnees
              ? 'Économie de données : audio seulement. Vous pouvez réactiver la vidéo.'
              : 'Audio seulement.'}
        </p>
      )}
      <div ref={conteneur} class="medias" />
      {etat?.connecte && (
        <div class="actions">
          <button onClick={() => void visio.current?.audioSeulement(!etat.audioSeulement)}>
            {etat.audioSeulement ? '🎥 Réactiver la vidéo' : '🔈 Audio seulement'}
          </button>
          <button class="danger" onClick={p.retour}>
            <span aria-hidden="true">📞</span> Raccrocher
          </button>
        </div>
      )}
    </section>
  );
}
