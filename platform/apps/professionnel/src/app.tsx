// Espace professionnel : connexion (double authentification), rendez-vous, créneaux,
// report, annulation, téléconsultation. Aucune donnée de santé affichée ici : le dossier du
// patient s'ouvre par ses consentements (service identite).
import type { ComponentType } from 'preact';
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
  useTitreAuFocus,
  versInstant,
} from '@mbolo/client-web';
import {
  creerApi,
  creerApiConsultation,
  type Creneau,
  type RendezVous,
  type ResumeDossier,
} from './api.js';
import { CONFIG } from './config.js';

const connexion = () => ({
  emetteur: CONFIG.emetteur,
  client: CONFIG.client,
  retour: `${location.origin}/`,
});

let jeton: string | undefined;
const api = creerApi(CONFIG.api, () => jeton);
const clinique = creerApiConsultation(CONFIG.apiConsultation, () => jeton);
const quand = (iso: string) => formater(iso, CONFIG.fuseau, CONFIG.langue);

type Ecran =
  | { nom: 'accueil' }
  | { nom: 'rendez-vous' }
  | { nom: 'creneaux' }
  | { nom: 'report'; rendezVous: RendezVous }
  | { nom: 'dossier'; rendezVous: RendezVous }
  | { nom: 'visio'; rendezVous: RendezVous }
  | { nom: 'verifications' }
  | { nom: 'pertes' }
  | { nom: 'remboursements' }
  | { nom: 'assistance' };

/** Rôles du compte connecté (jeton Keycloak) : l'affichage suit, le service décide. */
const roles = (): string[] => {
  const r = jeton ? revendications(jeton)['realm_access'] : undefined;
  return (r as { roles?: string[] } | undefined)?.roles ?? [];
};
const estVerificateur = () => roles().includes('verification-identite');
const estValideur = () => roles().includes('validation-remboursement');
const estAssistant = () => roles().includes('assistance-patient');
const estSoignant = () => roles().some((r) => r === 'professionnel' || r === 'infirmier');

export function App() {
  const [ecran, setEcran] = useState<Ecran>({ nom: 'accueil' });
  // Au changement d'écran, le focus va au titre du nouvel écran (clavier, lecteur d'écran).
  useTitreAuFocus(ecran.nom);
  const [message, setMessage] = useState<string>();
  const [attente, setAttente] = useState(true);

  useEffect(() => {
    terminerConnexion(connexion(), new URL(location.href), sessionStorage)
      .then((j) => {
        if (j) {
          jeton = j;
          history.replaceState(null, '', '/');
          setEcran(
            estSoignant()
              ? { nom: 'rendez-vous' }
              : estVerificateur()
                ? { nom: 'verifications' }
                : estValideur()
                  ? { nom: 'remboursements' }
                  : estAssistant()
                    ? { nom: 'assistance' }
                    : { nom: 'rendez-vous' },
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
      {jeton &&
        (ecran.nom === 'rendez-vous' ||
          ecran.nom === 'creneaux' ||
          ecran.nom === 'verifications' ||
          ecran.nom === 'pertes' ||
          ecran.nom === 'remboursements' ||
          ecran.nom === 'assistance') && (
          <nav class="actions">
            {(estSoignant() || (!estVerificateur() && !estValideur() && !estAssistant())) && (
              <>
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
              </>
            )}
            {estVerificateur() && (
              <button
                class={ecran.nom === 'verifications' ? 'principal' : ''}
                onClick={() => allerA({ nom: 'verifications' })}
              >
                <span aria-hidden="true">🪪</span> Vérifications
              </button>
            )}
            {estVerificateur() && (
              <button
                class={ecran.nom === 'pertes' ? 'principal' : ''}
                onClick={() => allerA({ nom: 'pertes' })}
              >
                <span aria-hidden="true">📱</span> Numéros perdus
              </button>
            )}
            {estValideur() && (
              <button
                class={ecran.nom === 'remboursements' ? 'principal' : ''}
                onClick={() => allerA({ nom: 'remboursements' })}
              >
                <span aria-hidden="true">↩️</span> Remboursements
              </button>
            )}
            {estAssistant() && (
              <button
                class={ecran.nom === 'assistance' ? 'principal' : ''}
                onClick={() => allerA({ nom: 'assistance' })}
              >
                <span aria-hidden="true">🛟</span> Assistance
              </button>
            )}
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
      ) : ecran.nom === 'dossier' ? (
        <DossierPatient rendezVous={ecran.rendezVous} allerA={allerA} signaler={signaler} />
      ) : ecran.nom === 'verifications' ? (
        <EcranVerifications signaler={(m) => setMessage(m)} />
      ) : ecran.nom === 'pertes' ? (
        <EcranPertes signaler={(m) => setMessage(m)} />
      ) : ecran.nom === 'remboursements' ? (
        <EcranRemboursements signaler={(m) => setMessage(m)} />
      ) : ecran.nom === 'assistance' ? (
        <EcranAssistance signaler={(m) => setMessage(m)} />
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

/** Écran chargé à la demande : il ne pèse rien à l'ouverture de l'espace professionnel. */
function EcranVerifications(p: { signaler: (m: string) => void }) {
  type Props = { jeton: string; quand: (iso: string) => string; signaler: (m: string) => void };
  const [Ecran, setEcran] = useState<ComponentType<Props>>();
  useEffect(() => {
    import('./verifications.js')
      .then((m) => setEcran(() => m.Verifications))
      .catch(() => p.signaler('Pas de réseau. Réessayez plus tard.'));
  }, []);
  return Ecran && jeton ? (
    <Ecran jeton={jeton} quand={quand} signaler={p.signaler} />
  ) : (
    <p aria-live="polite">Chargement…</p>
  );
}

/** Changements de numéro après un téléphone perdu (ADR-0023) : écran chargé à la demande. */
function EcranPertes(p: { signaler: (m: string) => void }) {
  type Props = { jeton: string; quand: (iso: string) => string; signaler: (m: string) => void };
  const [Ecran, setEcran] = useState<ComponentType<Props>>();
  useEffect(() => {
    import('./pertes.js')
      .then((m) => setEcran(() => m.Pertes))
      .catch(() => p.signaler('Pas de réseau. Réessayez plus tard.'));
  }, []);
  return Ecran && jeton ? (
    <Ecran jeton={jeton} quand={quand} signaler={p.signaler} />
  ) : (
    <p aria-live="polite">Chargement…</p>
  );
}

/** Remboursements à valider (ADR-0017) : écran chargé à la demande. */
function EcranRemboursements(p: { signaler: (m: string) => void }) {
  type Props = { jeton: string; quand: (iso: string) => string; signaler: (m: string) => void };
  const [Ecran, setEcran] = useState<ComponentType<Props>>();
  useEffect(() => {
    import('./remboursements.js')
      .then((m) => setEcran(() => m.Remboursements))
      .catch(() => p.signaler('Pas de réseau. Réessayez plus tard.'));
  }, []);
  return Ecran && jeton ? (
    <Ecran jeton={jeton} quand={quand} signaler={p.signaler} />
  ) : (
    <p aria-live="polite">Chargement…</p>
  );
}

/**
 * Équipe d'assistance : retrait des proches (ADR-0019) et code de récupération du compte
 * (ADR-0021) ; écran chargé à la demande.
 */
function EcranAssistance(p: { signaler: (m?: string) => void }) {
  type Props = { jeton: string; signaler: (m?: string) => void };
  const [Ecran, setEcran] = useState<ComponentType<Props>>();
  useEffect(() => {
    import('./assistance.js')
      .then((m) => setEcran(() => m.Assistance))
      .catch(() => p.signaler('Pas de réseau. Réessayez plus tard.'));
  }, []);
  return Ecran && jeton ? (
    <Ecran jeton={jeton} signaler={p.signaler} />
  ) : (
    <p aria-live="polite">Chargement…</p>
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
                <button onClick={() => p.allerA({ nom: 'dossier', rendezVous: r })}>
                  <span aria-hidden="true">📋</span> Dossier
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

const SECTIONS = [
  ['motif', 'Motif de consultation'],
  ['observations', 'Observations'],
  ['conclusion', 'Conclusion'],
  ['conduiteATenir', 'Conduite à tenir'],
] as const;

const LIBELLES_CR: Record<string, string> = {
  motif: 'Motif',
  observations: 'Observations',
  conclusion: 'Conclusion',
  'conduite-a-tenir': 'Conduite à tenir',
};

/**
 * Dossier du patient (lecture après décision d'accès d'identite) et compte-rendu rédigé par le
 * professionnel. Aucune suggestion automatique : le texte est celui du professionnel.
 */
function DossierPatient(p: {
  rendezVous: RendezVous;
  allerA: (e: Ecran, m?: string) => void;
  signaler: (e: unknown) => void;
}) {
  const [dossier, setDossier] = useState<ResumeDossier>();
  const [refus, setRefus] = useState(false);
  const [info, setInfo] = useState<string>();

  const lire = (brisDeGlace?: { motif: string }) =>
    clinique
      .lireDossier(p.rendezVous.patientId, brisDeGlace)
      .then((d) => {
        setRefus(false);
        setDossier(d);
      })
      .catch((e: unknown) =>
        e instanceof ErreurApi && e.statut === 403 ? setRefus(true) : p.signaler(e),
      );
  useEffect(() => void lire(), []);

  const enregistrer = async (e: Event) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const saisie = Object.fromEntries(SECTIONS.map(([cle]) => [cle, String(f.get(cle) ?? '')]));
    try {
      await clinique.ecrireCompteRendu(p.rendezVous.id, saisie);
      (e.currentTarget as HTMLFormElement | null)?.reset();
      setInfo('Compte-rendu enregistré dans le dossier.');
      await lire();
    } catch (x) {
      setInfo(undefined);
      p.signaler(x);
    }
  };

  return (
    <section>
      <h2>Dossier — rendez-vous du {quand(p.rendezVous.debut)}</h2>
      {refus ? (
        <div data-acces-refuse="">
          <p class="message" role="status">
            Le patient n’a pas partagé son dossier avec vous.
          </p>
          <details>
            <summary>Accès d’urgence (bris de glace)</summary>
            <p>
              Réservé à une urgence vitale. Votre motif est enregistré, signalé au patient et revu
              par un humain.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const motif = String(new FormData(e.currentTarget).get('motif') ?? '').trim();
                if (motif) void lire({ motif });
              }}
            >
              <label>
                Motif <textarea name="motif" required maxLength={500} rows={3} />
              </label>
              <button class="danger" type="submit">
                Accéder en urgence
              </button>
            </form>
          </details>
        </div>
      ) : dossier === undefined ? (
        <p aria-live="polite">Chargement…</p>
      ) : (
        <div data-dossier="">
          {dossier.motifAcces === 'bris-de-glace' && (
            <p class="message" role="status">
              Accès d’urgence : cette consultation du dossier sera revue.
            </p>
          )}
          <h3>Problèmes de santé</h3>
          {dossier.problemes.length === 0 ? (
            <p>Aucun problème enregistré.</p>
          ) : (
            <ul class="liste">
              {dossier.problemes.map((x, i) => (
                <li key={i}>
                  {x.texte}{' '}
                  <em>
                    ({x.parProfessionnel ? 'posé par un professionnel' : 'déclaré, non confirmé'})
                  </em>
                </li>
              ))}
            </ul>
          )}
          <h3>Comptes-rendus</h3>
          {dossier.comptesRendus.length === 0 ? (
            <p>Aucun compte-rendu.</p>
          ) : (
            <ul class="liste" aria-label="Comptes-rendus">
              {dossier.comptesRendus.map((c) => (
                <li key={c.id} data-compte-rendu={c.id}>
                  <strong>{quand(c.date)}</strong>
                  {Object.entries(c.sections).map(([s, t]) => (
                    <p key={s}>
                      <strong>{LIBELLES_CR[s] ?? s} :</strong> {t}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <h3>Rédiger le compte-rendu</h3>
          <form onSubmit={enregistrer} class="formulaire">
            {SECTIONS.map(([cle, libelle]) => (
              <label key={cle}>
                {libelle} <textarea name={cle} maxLength={4000} rows={3} />
              </label>
            ))}
            <button class="principal" type="submit">
              <span aria-hidden="true">💾</span> Enregistrer le compte-rendu
            </button>
          </form>
          {info && <p role="status">{info}</p>}
        </div>
      )}
      <button onClick={() => p.allerA({ nom: 'rendez-vous' })}>Retour</button>
    </section>
  );
}
