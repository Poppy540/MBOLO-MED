// Espace professionnel : connexion (double authentification), rendez-vous, créneaux,
// report, annulation, téléconsultation. Aucune donnée de santé affichée ici : le dossier du
// patient s'ouvre par ses consentements (service identite).
import { useEffect, useState } from 'preact/hooks';
import {
  Consultation,
  demarrerConnexion,
  ErreurApi,
  estHorsLigne,
  oublierRendezVous,
  RendezVousHorsLigne,
  retenirRendezVous,
  quand as formater,
  terminerConnexion,
  urlDeconnexion,
  versInstant,
} from '@mbolo/client-web';
import { creerApi, type Creneau, type RendezVous } from './api.js';
import { CONFIG } from './config.js';

const connexion = () => ({
  emetteur: CONFIG.emetteur,
  client: CONFIG.client,
  retour: `${location.origin}/`,
});

let jeton: string | undefined;
const api = creerApi(CONFIG.api, () => jeton);
const quand = (iso: string) => formater(iso, CONFIG.fuseau, CONFIG.langue);

type Ecran =
  | { nom: 'accueil' }
  | { nom: 'rendez-vous' }
  | { nom: 'creneaux' }
  | { nom: 'report'; rendezVous: RendezVous }
  | { nom: 'visio'; rendezVous: RendezVous };

export function App() {
  const [ecran, setEcran] = useState<Ecran>({ nom: 'accueil' });
  const [message, setMessage] = useState<string>();
  const [attente, setAttente] = useState(true);

  useEffect(() => {
    terminerConnexion(connexion(), new URL(location.href), sessionStorage)
      .then((j) => {
        if (j) {
          jeton = j;
          history.replaceState(null, '', '/');
          setEcran({ nom: 'rendez-vous' });
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
  const allerA = (e: Ecran, m?: string) => {
    setMessage(m);
    setEcran(e);
  };

  return (
    <main>
      <header>
        <h1>
          <span aria-hidden="true">🩺</span> Mbolo Santé Pro
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
      {jeton && (ecran.nom === 'rendez-vous' || ecran.nom === 'creneaux') && (
        <nav class="actions">
          <button
            class={ecran.nom === 'rendez-vous' ? 'principal' : ''}
            onClick={() => allerA({ nom: 'rendez-vous' })}
          >
            <span aria-hidden="true">📅</span> Rendez-vous
          </button>
          <button
            class={ecran.nom === 'creneaux' ? 'principal' : ''}
            onClick={() => allerA({ nom: 'creneaux' })}
          >
            <span aria-hidden="true">🕒</span> Mes créneaux
          </button>
        </nav>
      )}
      {message && (
        <p class="message" role="alert">
          {message}
        </p>
      )}
      {attente ? (
        <p aria-live="polite">Chargement…</p>
      ) : ecran.nom === 'accueil' && !navigator.onLine ? (
        <RendezVousHorsLigne
          stockage={localStorage}
          fuseau={CONFIG.fuseau}
          langue={CONFIG.langue}
        />
      ) : ecran.nom === 'accueil' ? (
        <section>
          <p>Espace des professionnels de santé.</p>
          <button
            class="principal"
            onClick={async () =>
              location.assign(await demarrerConnexion(connexion(), sessionStorage))
            }
          >
            <span aria-hidden="true">🔑</span> Se connecter
          </button>
        </section>
      ) : ecran.nom === 'rendez-vous' ? (
        <MesRendezVous allerA={allerA} signaler={signaler} />
      ) : ecran.nom === 'creneaux' ? (
        <MesCreneaux signaler={signaler} />
      ) : ecran.nom === 'report' ? (
        <Report rendezVous={ecran.rendezVous} allerA={allerA} signaler={signaler} />
      ) : (
        <Consultation
          salle={() => api.salle(ecran.rendezVous.id)}
          autre="Patient"
          retour={() => allerA({ nom: 'rendez-vous' })}
          signaler={signaler}
        />
      )}
    </main>
  );
}

function MesRendezVous(p: {
  allerA: (e: Ecran, m?: string) => void;
  signaler: (e: unknown) => void;
}) {
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

  if (horsLigne) {
    return (
      <RendezVousHorsLigne stockage={localStorage} fuseau={CONFIG.fuseau} langue={CONFIG.langue} />
    );
  }
  return (
    <section>
      <h2>Rendez-vous à venir</h2>
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
                <button onClick={() => p.allerA({ nom: 'report', rendezVous: r })}>Reporter</button>
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
    </section>
  );
}

function Report(p: {
  rendezVous: RendezVous;
  allerA: (e: Ecran, m?: string) => void;
  signaler: (e: unknown) => void;
}) {
  const [libres, setLibres] = useState<Creneau[]>();
  useEffect(
    () =>
      void api
        .mesCreneaux()
        .then((l) => setLibres(l.filter((c) => c.statut === 'libre')))
        .catch(p.signaler),
    [],
  );
  return (
    <section>
      <h2>Reporter le rendez-vous du {quand(p.rendezVous.debut)}</h2>
      {libres === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : libres.length === 0 ? (
        <p>Aucun créneau libre : publiez-en d’abord.</p>
      ) : (
        <ul class="liste" aria-label="Créneaux libres">
          {libres.map((c) => (
            <li key={c.id}>
              <button
                data-creneau={c.id}
                onClick={() =>
                  api
                    .reporter(p.rendezVous.id, c.id)
                    .then(() =>
                      p.allerA(
                        { nom: 'rendez-vous' },
                        'Rendez-vous reporté. Le patient est prévenu.',
                      ),
                    )
                    .catch(p.signaler)
                }
              >
                {quand(c.debut)} ({c.dureeMinutes} min)
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => p.allerA({ nom: 'rendez-vous' })}>Retour</button>
    </section>
  );
}

function MesCreneaux(p: { signaler: (e: unknown) => void }) {
  const [liste, setListe] = useState<Creneau[]>();
  const [info, setInfo] = useState<string>();
  const charger = () => api.mesCreneaux().then(setListe).catch(p.signaler);
  useEffect(() => void charger(), []);

  const publier = async (e: Event) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    try {
      const publies = await api.publier({
        debut: versInstant(String(f.get('date')), String(f.get('heure')), CONFIG.fuseau),
        dureeMinutes: Number(f.get('duree')),
        nombre: Number(f.get('nombre')),
      });
      setInfo(`${publies.length} créneau(x) publié(s).`);
      await charger();
    } catch (x) {
      setInfo(undefined);
      p.signaler(x);
    }
  };

  return (
    <section>
      <h2>Publier des créneaux</h2>
      <form onSubmit={publier} class="formulaire">
        <label>
          Date <input type="date" name="date" required />
        </label>
        <label>
          Heure de début <input type="time" name="heure" required />
        </label>
        <label>
          Durée{' '}
          <select name="duree">
            {/* Sans attribut « selected » : un nouveau rendu ne doit pas écraser le choix. */}
            <option value="20">20 min</option>
            <option value="15">15 min</option>
            <option value="30">30 min</option>
          </select>
        </label>
        <label>
          Nombre de créneaux{' '}
          {/* Champs non contrôlés : le rechargement de la liste ne doit pas écraser la saisie. */}
          <input type="number" name="nombre" min={1} max={16} defaultValue="1" />
        </label>
        <button class="principal" type="submit">
          <span aria-hidden="true">➕</span> Publier
        </button>
      </form>
      {info && <p role="status">{info}</p>}
      <h2>Mes créneaux (14 jours)</h2>
      {liste === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : liste.length === 0 ? (
        <p>Aucun créneau publié.</p>
      ) : (
        <ul class="liste" aria-label="Mes créneaux">
          {liste.map((c) => (
            <li key={c.id} data-creneau={c.id} data-statut={c.statut}>
              <strong>{quand(c.debut)}</strong> ({c.dureeMinutes} min) —{' '}
              {c.statut === 'libre' ? 'libre' : 'réservé'}
              {c.statut === 'libre' && (
                <div class="actions">
                  <button
                    onClick={() =>
                      api
                        .retirer(c.id)
                        .then(() => charger())
                        .catch(p.signaler)
                    }
                  >
                    Retirer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
