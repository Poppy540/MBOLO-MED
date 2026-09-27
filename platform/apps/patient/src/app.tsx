// Application patient : connexion, mes rendez-vous, créneaux libres, téléconsultation.
// Écrans simples, gros boutons, peu de texte, pictogrammes (faible littératie, petits écrans).
import { useEffect, useState } from 'preact/hooks';
import {
  Consultation,
  demarrerConnexion,
  ErreurApi,
  estHorsLigne,
  oublierRendezVous,
  RendezVousHorsLigne,
  retenirRendezVous,
  revendications,
  quand as formater,
  terminerConnexion,
  urlDeconnexion,
} from '@mbolo/client-web';
import { creerApi, type Creneau, type Praticien, type RendezVous } from './api.js';
import { CONFIG } from './config.js';

const connexion = () => ({
  emetteur: CONFIG.emetteur,
  client: CONFIG.client,
  retour: `${location.origin}/`,
});

/** Professionnel choisi (lien reçu du point de consultation), gardé le temps de la connexion. */
const CLE_PRATICIEN = 'mbolo.praticien';

let jeton: string | undefined;
const api = creerApi(CONFIG.api, () => jeton);
const quand = (iso: string) => formater(iso, CONFIG.fuseau, CONFIG.langue);

type Ecran =
  | { nom: 'accueil' }
  | { nom: 'dossier-a-completer' }
  | { nom: 'rendez-vous' }
  | { nom: 'praticiens' }
  | { nom: 'creneaux'; praticienId: string }
  | { nom: 'visio'; rendezVous: RendezVous };

export function App() {
  const [ecran, setEcran] = useState<Ecran>({ nom: 'accueil' });
  const [message, setMessage] = useState<string>();
  const [attente, setAttente] = useState(true);

  useEffect(() => {
    const adresse = new URL(location.href);
    const praticien = adresse.searchParams.get('praticien');
    if (praticien && /^[A-Za-z0-9\-.]{1,64}$/.test(praticien)) {
      sessionStorage.setItem(CLE_PRATICIEN, praticien);
    }
    terminerConnexion(connexion(), adresse, sessionStorage)
      .then((j) => {
        if (j) {
          jeton = j;
          history.replaceState(null, '', '/');
          // Compte créé avec un code, identité pas encore vérifiée : pas de dossier, pas de
          // consultation (ADR-0014).
          setEcran(
            revendications(j)['patient_id']
              ? { nom: 'rendez-vous' }
              : { nom: 'dossier-a-completer' },
          );
        }
      })
      .catch(() => setMessage('La connexion a échoué. Réessayez.'))
      .finally(() => setAttente(false));
  }, []);

  const signaler = (e: unknown) => {
    setMessage(e instanceof ErreurApi ? e.message : 'Service indisponible. Réessayez plus tard.');
    if (e instanceof ErreurApi && e.statut === 401) {
      jeton = undefined;
      setEcran({ nom: 'accueil' });
    }
  };

  return (
    <main>
      <header>
        <h1>
          <span aria-hidden="true">🩺</span> Mbolo Santé
        </h1>
        {jeton && (
          <button
            class="lien"
            onClick={() => {
              oublierRendezVous(localStorage);
              location.assign(urlDeconnexion(connexion()));
            }}
          >
            Se déconnecter
          </button>
        )}
      </header>
      {message && (
        <p class="message" role="alert">
          {message}
        </p>
      )}
      {attente ? (
        <p aria-live="polite">Chargement…</p>
      ) : ecran.nom === 'accueil' ? (
        <Accueil />
      ) : ecran.nom === 'dossier-a-completer' ? (
        <DossierACompleter />
      ) : ecran.nom === 'rendez-vous' ? (
        <MesRendezVous
          allerA={(e) => {
            setMessage(undefined);
            setEcran(e);
          }}
          signaler={signaler}
        />
      ) : ecran.nom === 'praticiens' ? (
        <Praticiens
          choisir={(id) => setEcran({ nom: 'creneaux', praticienId: id })}
          retour={() => setEcran({ nom: 'rendez-vous' })}
          signaler={signaler}
        />
      ) : ecran.nom === 'creneaux' ? (
        <Creneaux
          praticienId={ecran.praticienId}
          retour={(m) => {
            setMessage(m);
            setEcran({ nom: 'rendez-vous' });
          }}
          signaler={signaler}
        />
      ) : (
        <Consultation
          salle={() => api.salle(ecran.rendezVous.id)}
          autre="Professionnel de santé"
          retour={() => setEcran({ nom: 'rendez-vous' })}
          signaler={signaler}
        />
      )}
    </main>
  );
}

function Accueil() {
  // Sans réseau, la connexion est impossible : on montre les rendez-vous déjà connus.
  if (!navigator.onLine) {
    return (
      <RendezVousHorsLigne stockage={localStorage} fuseau={CONFIG.fuseau} langue={CONFIG.langue} />
    );
  }
  return (
    <section>
      <p>Consultez un médecin depuis votre téléphone.</p>
      <button
        class="principal"
        onClick={async () => location.assign(await demarrerConnexion(connexion(), sessionStorage))}
      >
        <span aria-hidden="true">🔑</span> Se connecter
      </button>
      <button
        onClick={async () =>
          location.assign(await demarrerConnexion(connexion(), sessionStorage, true))
        }
      >
        <span aria-hidden="true">✉️</span> J'ai un code d'invitation
      </button>
    </section>
  );
}

function DossierACompleter() {
  return (
    <section>
      <p>
        <span aria-hidden="true">✅</span> Votre compte est créé.
      </p>
      <p>
        Avant votre première consultation, votre identité doit être vérifiée. L'équipe Mbolo Santé
        vous contactera.
      </p>
      <p>
        <strong>En cas d'urgence, appelez les secours.</strong>
      </p>
    </section>
  );
}

function MesRendezVous(p: { allerA: (e: Ecran) => void; signaler: (e: unknown) => void }) {
  const [liste, setListe] = useState<RendezVous[]>();
  const [horsLigne, setHorsLigne] = useState(false);
  const charger = () =>
    api
      .mesRendezVous()
      .then((l) => {
        const prevus = l
          .filter((r) => r.statut === 'prevu')
          .sort((a, b) => a.debut.localeCompare(b.debut));
        retenirRendezVous(localStorage, prevus);
        setHorsLigne(false);
        setListe(prevus);
      })
      .catch((e: unknown) => (estHorsLigne(e) ? setHorsLigne(true) : p.signaler(e)));
  useEffect(() => void charger(), []);
  const praticien = sessionStorage.getItem(CLE_PRATICIEN);

  if (horsLigne) {
    return (
      <RendezVousHorsLigne stockage={localStorage} fuseau={CONFIG.fuseau} langue={CONFIG.langue} />
    );
  }
  return (
    <section>
      <h2>
        <span aria-hidden="true">📅</span> Mes rendez-vous
      </h2>
      {liste === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : liste.length === 0 ? (
        <p>Aucun rendez-vous prévu.</p>
      ) : (
        <ul class="liste" aria-label="Rendez-vous prévus">
          {liste.map((r) => (
            <li key={r.id} data-rendez-vous={r.id} data-creneau={r.creneauId}>
              <strong>{quand(r.debut)}</strong> <span>({r.dureeMinutes} min)</span>
              <div class="actions">
                <button class="principal" onClick={() => p.allerA({ nom: 'visio', rendezVous: r })}>
                  <span aria-hidden="true">📹</span> Rejoindre
                </button>
                <button
                  onClick={() =>
                    api
                      .annuler(r.id)
                      .then(() => charger())
                      .catch(p.signaler)
                  }
                >
                  Annuler
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* Lien d'un point de consultation : directement ce médecin ; sinon l'annuaire. */}
      <button
        class="principal"
        onClick={() =>
          p.allerA(praticien ? { nom: 'creneaux', praticienId: praticien } : { nom: 'praticiens' })
        }
      >
        <span aria-hidden="true">➕</span> Prendre rendez-vous
      </button>
    </section>
  );
}

function Creneaux(p: {
  praticienId: string;
  retour: (message?: string) => void;
  signaler: (e: unknown) => void;
}) {
  const [liste, setListe] = useState<Creneau[]>();
  const [choisi, setChoisi] = useState<Creneau>();
  useEffect(() => void api.creneauxLibres(p.praticienId).then(setListe).catch(p.signaler), []);

  if (choisi) {
    return (
      <section>
        <h2>Confirmer le rendez-vous</h2>
        <p>
          <strong>{quand(choisi.debut)}</strong> ({choisi.dureeMinutes} min)
        </p>
        <button
          class="principal"
          onClick={() =>
            api
              .reserver(choisi.id)
              .then(() => p.retour('Rendez-vous réservé.'))
              .catch((e: unknown) => {
                setChoisi(undefined);
                p.signaler(e);
              })
          }
        >
          <span aria-hidden="true">✅</span> Réserver
        </button>
        <button onClick={() => setChoisi(undefined)}>Retour</button>
      </section>
    );
  }
  return (
    <section>
      <h2>
        <span aria-hidden="true">🕒</span> Créneaux libres
      </h2>
      {liste === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : liste.length === 0 ? (
        <p>Aucun créneau libre pour le moment.</p>
      ) : (
        <ul class="liste" aria-label="Créneaux libres">
          {liste.map((c) => (
            <li key={c.id}>
              <button data-creneau={c.id} onClick={() => setChoisi(c)}>
                {quand(c.debut)} ({c.dureeMinutes} min)
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => p.retour()}>Retour</button>
    </section>
  );
}

/** Annuaire : médecins qui consultent en vidéo, avec leur prochain créneau libre. */
function Praticiens(p: {
  choisir: (id: string) => void;
  retour: () => void;
  signaler: (e: unknown) => void;
}) {
  const [liste, setListe] = useState<Praticien[]>();
  useEffect(() => void api.praticiens().then(setListe).catch(p.signaler), []);
  return (
    <section>
      <h2>
        <span aria-hidden="true">🩺</span> Choisir un médecin
      </h2>
      {liste === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : liste.length === 0 ? (
        <p>Aucun médecin disponible pour le moment.</p>
      ) : (
        <ul class="liste" aria-label="Médecins">
          {liste.map((x) => (
            <li key={x.id}>
              <button data-praticien={x.id} onClick={() => p.choisir(x.id)}>
                <strong>{x.nom}</strong>
                {x.specialite && <span> — {x.specialite}</span>}
                <br />
                <small>
                  {x.prochainCreneau
                    ? `Prochain créneau : ${quand(x.prochainCreneau)}`
                    : 'Pas de créneau libre pour le moment'}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={p.retour}>Retour</button>
    </section>
  );
}
