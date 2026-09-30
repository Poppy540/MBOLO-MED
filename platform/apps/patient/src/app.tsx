// Application patient : connexion, mes rendez-vous, créneaux libres, téléconsultation.
// Écrans simples, gros boutons, peu de texte, pictogrammes (faible littératie, petits écrans).
import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  Consultation,
  demarrerConnexion,
  ErreurApi,
  estHorsLigne,
  niveauDuJeton,
  oublierRendezVous,
  RendezVousHorsLigne,
  retenirRendezVous,
  revendications,
  quand as formater,
  statutAction,
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

/**
 * Écran à rouvrir après le code SMS (ADR-0022), le temps de l'aller-retour vers Keycloak : le nom de
 * l'écran et l'identifiant du rendez-vous seulement, jamais ce que le patient a saisi.
 */
const CLE_REPRISE = 'mbolo.reprise';

/** Actions sensibles : niveau 2 (mot de passe et code SMS de moins de 15 minutes). */
const NIVEAU_SENSIBLE = 2;
const niveauSuffisant = () => niveauDuJeton(jeton) >= NIVEAU_SENSIBLE;

/** Écrans qui mènent à une action sensible, et que l'on peut rouvrir après le code. */
type EcranSensible = { nom: 'paiement'; rendezVousId: string } | { nom: 'partages' };

/** Relit l'écran à reprendre ; toute autre valeur est ignorée. */
function lireReprise(): EcranSensible | undefined {
  const brut = sessionStorage.getItem(CLE_REPRISE);
  sessionStorage.removeItem(CLE_REPRISE);
  try {
    const e = JSON.parse(brut ?? 'null') as Partial<{ nom: string; rendezVousId: unknown }> | null;
    if (e?.nom === 'partages') return { nom: 'partages' };
    if (
      e?.nom === 'paiement' &&
      typeof e.rendezVousId === 'string' &&
      /^[A-Za-z0-9\-.]{1,64}$/.test(e.rendezVousId)
    ) {
      return { nom: 'paiement', rendezVousId: e.rendezVousId };
    }
  } catch {
    // Valeur illisible : rien à reprendre.
  }
  return undefined;
}

async function confirmerParSms(reprise: EcranSensible) {
  sessionStorage.setItem(CLE_REPRISE, JSON.stringify(reprise));
  location.assign(await demarrerConnexion(connexion(), sessionStorage, false, NIVEAU_SENSIBLE));
}

/** Action Keycloak « Changer mon numéro » (ADR-0023) : codes à l'ancien puis au nouveau numéro. */
const ACTION_CHANGER_NUMERO = 'mbolo-changer-telephone';
/** Téléphone perdu (ADR-0023) : code au nouveau numéro, puis photos et décision de l'équipe. */
const ACTION_TELEPHONE_PERDU = 'mbolo-telephone-perdu';
/** Action Keycloak en cours, le temps de l'aller-retour (pour lire son résultat au retour). */
const CLE_ACTION = 'mbolo.action';

async function lancerAction(action: string) {
  sessionStorage.setItem(CLE_ACTION, action);
  location.assign(await demarrerConnexion(connexion(), sessionStorage, false, undefined, action));
}

const MESSAGES_NUMERO = {
  success: 'Votre numéro est changé. Les prochains codes arriveront à ce numéro.',
  cancelled: 'Votre numéro n’a pas changé.',
  error: 'Votre numéro n’a pas pu être changé. Réessayez plus tard.',
} as const;

let jeton: string | undefined;
const api = creerApi(CONFIG.api, () => jeton);
const quand = (iso: string) => formater(iso, CONFIG.fuseau, CONFIG.langue);

type Ecran =
  | { nom: 'accueil' }
  | { nom: 'dossier-a-completer'; refusee?: boolean }
  | { nom: 'verification' }
  | { nom: 'rendez-vous' }
  | { nom: 'praticiens' }
  | { nom: 'creneaux'; praticienId: string }
  | { nom: 'visio'; rendezVous: RendezVous }
  | { nom: 'paiement'; rendezVousId: string }
  | { nom: 'documents' }
  | { nom: 'documents-proche' }
  | { nom: 'partages' }
  | { nom: 'confirmation-sms'; reprise: EcranSensible }
  | { nom: 'changer-numero'; depuis: Ecran }
  | { nom: 'perte' }
  | { nom: 'recus' };

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
          // Retour d'une action Keycloak : résultat lu avant d'effacer l'adresse.
          const numero = statutAction(adresse);
          const action = sessionStorage.getItem(CLE_ACTION);
          sessionStorage.removeItem(CLE_ACTION);
          history.replaceState(null, '', '/');
          if (numero === 'success' && action === ACTION_TELEPHONE_PERDU) {
            // Demande enregistrée : le patient envoie tout de suite ses nouvelles photos.
            setMessage('Demande enregistrée. Envoyez maintenant deux nouvelles photos.');
            setEcran({ nom: 'perte' });
            return;
          }
          if (numero) setMessage(MESSAGES_NUMERO[numero]);
          // Un proche désigné par un patient (C-PROCHE) ne voit que les documents partagés.
          const r = revendications(j);
          const roles = (r['realm_access'] as { roles?: string[] } | undefined)?.roles ?? [];
          if (roles.includes('proche') && r['related_person_id']) {
            setEcran({ nom: 'documents-proche' });
            return;
          }
          // Retour du code SMS (ADR-0022) : l'écran de l'action sensible est rouvert.
          const reprise = lireReprise();
          if (reprise && r['patient_id'] && niveauSuffisant()) {
            setEcran(reprise);
            return;
          }
          // Pas de consultation tant que l'identité n'est pas vérifiée par l'équipe (ADR-0014).
          if (!revendications(j)['patient_id']) {
            setEcran({ nom: 'dossier-a-completer' });
            return;
          }
          return api
            .identite()
            .then((statut) =>
              setEcran(
                statut === 'verifiee'
                  ? { nom: 'rendez-vous' }
                  : { nom: 'dossier-a-completer', refusee: statut === 'refusee' },
              ),
            );
        }
      })
      .catch(() => setMessage('La connexion a échoué. Réessayez.'))
      .finally(() => setAttente(false));
  }, []);

  /** Payer demande d'abord le code SMS, avant la saisie du numéro qui paie. */
  const ouvrir = (e: Ecran) =>
    setEcran(
      e.nom === 'paiement' && !niveauSuffisant() ? { nom: 'confirmation-sms', reprise: e } : e,
    );
  const confirmer = (reprise: EcranSensible) => () => {
    setMessage(undefined);
    setEcran({ nom: 'confirmation-sms', reprise });
  };

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
        <DossierACompleter
          refusee={ecran.refusee === true}
          verifier={() => {
            setMessage(undefined);
            setEcran({ nom: 'verification' });
          }}
          changerNumero={() => {
            setMessage(undefined);
            setEcran({ nom: 'changer-numero', depuis: ecran });
          }}
        />
      ) : ecran.nom === 'verification' ? (
        <EcranVerification retour={() => setEcran({ nom: 'dossier-a-completer' })} />
      ) : ecran.nom === 'rendez-vous' ? (
        <MesRendezVous
          allerA={(e) => {
            setMessage(undefined);
            ouvrir(e);
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
          payer={(rendezVousId) => {
            setMessage(undefined);
            ouvrir({ nom: 'paiement', rendezVousId });
          }}
          signaler={signaler}
        />
      ) : ecran.nom === 'documents' ? (
        <EcranDocuments retour={() => setEcran({ nom: 'rendez-vous' })} />
      ) : ecran.nom === 'recus' ? (
        <EcranRecus retour={() => setEcran({ nom: 'rendez-vous' })} />
      ) : ecran.nom === 'partages' ? (
        <EcranPartages
          retour={() => setEcran({ nom: 'rendez-vous' })}
          confirmer={confirmer({ nom: 'partages' })}
        />
      ) : ecran.nom === 'confirmation-sms' ? (
        <ConfirmationSms
          action={ecran.reprise.nom === 'paiement' ? 'payer' : 'partager'}
          confirmer={() => void confirmerParSms(ecran.reprise)}
          retour={() =>
            setEcran(ecran.reprise.nom === 'partages' ? ecran.reprise : { nom: 'rendez-vous' })
          }
        />
      ) : ecran.nom === 'changer-numero' ? (
        <ChangerNumero
          retour={() => setEcran(ecran.depuis)}
          photos={() => {
            setMessage(undefined);
            setEcran({ nom: 'perte' });
          }}
        />
      ) : ecran.nom === 'perte' ? (
        <EcranVerification perte retour={() => setEcran({ nom: 'rendez-vous' })} />
      ) : ecran.nom === 'documents-proche' ? (
        <EcranDocuments proche />
      ) : ecran.nom === 'paiement' ? (
        <EcranPaiement
          rendezVousId={ecran.rendezVousId}
          confirmer={confirmer(ecran)}
          retour={(m) => {
            setMessage(m);
            setEcran({ nom: 'rendez-vous' });
          }}
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

function DossierACompleter(p: {
  refusee: boolean;
  verifier: () => void;
  changerNumero: () => void;
}) {
  // Photos possibles une fois le dossier créé (identité saisie), tant que l'identité n'est pas vérifiée.
  const dossier = jeton !== undefined && Boolean(revendications(jeton)['patient_id']);
  return (
    <section>
      {p.refusee ? (
        <p>
          <span aria-hidden="true">⚠️</span> Votre identité n'a pas pu être confirmée. L'équipe
          Mbolo Santé va vous recontacter.
        </p>
      ) : (
        <>
          <p>
            <span aria-hidden="true">✅</span> Votre compte est créé.
          </p>
          <p>
            Avant votre première consultation, votre identité doit être vérifiée. L'équipe Mbolo
            Santé vous contactera.
          </p>
        </>
      )}
      {dossier && (
        <button class="principal" onClick={p.verifier}>
          <span aria-hidden="true">📷</span> Vérifier mon identité
        </button>
      )}
      {/* L'équipe appelle au numéro du dossier : il doit rester juste (ADR-0023). */}
      {dossier && (
        <button onClick={p.changerNumero}>
          <span aria-hidden="true">📱</span> Changer mon numéro
        </button>
      )}
      <p>
        <strong>En cas d'urgence, appelez les secours.</strong>
      </p>
    </section>
  );
}

/**
 * Avant une action sensible (ADR-0022) : le patient reçoit un code par SMS au numéro de son
 * dossier, le saisit dans la page de connexion, puis revient à son action. Rien n'est envoyé sans
 * qu'il le demande.
 */
function ConfirmationSms(p: {
  action: 'payer' | 'partager';
  confirmer: () => void;
  retour: () => void;
}) {
  return (
    <section data-confirmation-sms>
      <h2>
        <span aria-hidden="true">🔐</span> Confirmer par SMS
      </h2>
      <p>
        {p.action === 'payer'
          ? 'Avant de payer, '
          : 'Avant de partager votre dossier ou d’inviter un proche, '}
        nous envoyons un code par SMS au numéro de votre dossier. Il protège votre compte si
        quelqu’un d’autre connaît votre mot de passe.
      </p>
      <p>Ne donnez ce code à personne, même pas à l’équipe.</p>
      <button class="principal" onClick={p.confirmer}>
        <span aria-hidden="true">📱</span> Recevoir le code
      </button>
      <button onClick={p.retour}>Retour</button>
      <p>
        Plus de téléphone ou plus de numéro ? Appelez l’équipe Mbolo Santé.{' '}
        <strong>En cas d'urgence, appelez les secours.</strong>
      </p>
    </section>
  );
}

/**
 * Changer le numéro du dossier (ADR-0023) : tout se passe dans Keycloak (code à l'ancien numéro,
 * nouveau numéro, code au nouveau numéro), puis l'application affiche le résultat. Le numéro ne
 * passe jamais par l'application.
 */
function ChangerNumero(p: { retour: () => void; photos: () => void }) {
  return (
    <section data-changer-numero>
      <h2>
        <span aria-hidden="true">📱</span> Changer mon numéro
      </h2>
      <p>Vous avez une nouvelle puce ? Il vous faut vos deux téléphones :</p>
      <ol>
        <li>un code arrive par SMS à votre numéro actuel ;</li>
        <li>vous écrivez votre nouveau numéro ;</li>
        <li>un autre code arrive à ce nouveau numéro.</li>
      </ol>
      <p>Votre ancien numéro recevra un message pour vous prévenir du changement.</p>
      <button class="principal" onClick={() => void lancerAction(ACTION_CHANGER_NUMERO)}>
        <span aria-hidden="true">📨</span> Recevoir le code
      </button>
      <h3>Vous avez perdu votre téléphone ?</h3>
      <p>
        Indiquez votre nouveau numéro, puis envoyez deux nouvelles photos. Une personne de l’équipe
        Mbolo Santé vérifiera que c’est bien vous avant de changer le numéro.
      </p>
      <button onClick={() => void lancerAction(ACTION_TELEPHONE_PERDU)}>
        <span aria-hidden="true">🆘</span> J’ai perdu mon téléphone
      </button>
      <button onClick={p.photos}>
        <span aria-hidden="true">📷</span> Envoyer mes photos (demande déjà faite)
      </button>
      <button onClick={p.retour}>Retour</button>
      <p>
        <strong>En cas d'urgence, appelez les secours.</strong>
      </p>
    </section>
  );
}

/** Écran chargé à la demande : il ne pèse rien à l'ouverture de l'application. */
function EcranVerification(p: { retour: () => void; perte?: boolean }) {
  const [Ecran, setEcran] =
    useState<ComponentType<{ jeton: string; retour: () => void; perte?: boolean }>>();
  const [echec, setEchec] = useState(false);
  useEffect(() => {
    import('./verification.js')
      .then((m) => setEcran(() => m.Verification))
      .catch(() => setEchec(true));
  }, []);
  if (echec) {
    return (
      <section>
        <p role="alert">Pas de réseau. Réessayez plus tard.</p>
        <button onClick={p.retour}>Retour</button>
      </section>
    );
  }
  return Ecran && jeton ? (
    <Ecran jeton={jeton} retour={p.retour} perte={p.perte === true} />
  ) : (
    <p aria-live="polite">Chargement…</p>
  );
}

/** Paiement d'une réservation (ADR-0017) : écran chargé à la demande. */
function EcranPaiement(p: {
  rendezVousId: string;
  retour: (message?: string) => void;
  confirmer: () => void;
}) {
  const [Ecran, setEcran] = useState<
    ComponentType<{
      jeton: string;
      rendezVousId: string;
      retour: (m?: string) => void;
      confirmer: () => void;
    }>
  >();
  const [echec, setEchec] = useState(false);
  useEffect(() => {
    import('./paiement.js').then((m) => setEcran(() => m.Paiement)).catch(() => setEchec(true));
  }, []);
  if (echec) {
    return (
      <section>
        <p role="alert">Pas de réseau. Réessayez plus tard.</p>
        <button onClick={() => p.retour()}>Retour</button>
      </section>
    );
  }
  return Ecran && jeton ? (
    <Ecran jeton={jeton} rendezVousId={p.rendezVousId} retour={p.retour} confirmer={p.confirmer} />
  ) : (
    <p aria-live="polite">Chargement…</p>
  );
}

/** Comptes-rendus et ordonnances : écran chargé à la demande. */
function EcranDocuments(p: { retour?: () => void; proche?: boolean }) {
  const [Ecran, setEcran] =
    useState<ComponentType<{ jeton: string; retour?: () => void; proche?: boolean }>>();
  const [echec, setEchec] = useState(false);
  useEffect(() => {
    import('./documents.js').then((m) => setEcran(() => m.Documents)).catch(() => setEchec(true));
  }, []);
  if (echec) {
    return (
      <section>
        <p role="alert">Pas de réseau. Réessayez plus tard.</p>
        {p.retour && <button onClick={p.retour}>Retour</button>}
      </section>
    );
  }
  return Ecran && jeton ? (
    <Ecran jeton={jeton} {...(p.retour ? { retour: p.retour } : {})} proche={p.proche === true} />
  ) : (
    <p aria-live="polite">Chargement…</p>
  );
}

/** Reçus et avoirs (ADR-0020) : écran chargé à la demande. */
function EcranRecus(p: { retour: () => void }) {
  const [Ecran, setEcran] = useState<ComponentType<{ jeton: string; retour: () => void }>>();
  const [echec, setEchec] = useState(false);
  useEffect(() => {
    import('./recus.js').then((m) => setEcran(() => m.Recus)).catch(() => setEchec(true));
  }, []);
  if (echec) {
    return (
      <section>
        <p role="alert">Pas de réseau. Réessayez plus tard.</p>
        <button onClick={p.retour}>Retour</button>
      </section>
    );
  }
  return Ecran && jeton ? (
    <Ecran jeton={jeton} retour={p.retour} />
  ) : (
    <p aria-live="polite">Chargement…</p>
  );
}

/** Partages du dossier et historique des accès : écran chargé à la demande. */
function EcranPartages(p: { retour: () => void; confirmer: () => void }) {
  const [Ecran, setEcran] = useState<
    ComponentType<{
      jeton: string;
      patientId: string;
      retour: () => void;
      confirmer: () => void;
    }>
  >();
  const [echec, setEchec] = useState(false);
  useEffect(() => {
    import('./partages.js').then((m) => setEcran(() => m.Partages)).catch(() => setEchec(true));
  }, []);
  const patientId = jeton ? String(revendications(jeton)['patient_id'] ?? '') : '';
  if (echec || !patientId) {
    return (
      <section>
        <p role="alert">Pas de réseau. Réessayez plus tard.</p>
        <button onClick={p.retour}>Retour</button>
      </section>
    );
  }
  return Ecran && jeton ? (
    <Ecran jeton={jeton} patientId={patientId} retour={p.retour} confirmer={p.confirmer} />
  ) : (
    <p aria-live="polite">Chargement…</p>
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
          .filter((r) => r.statut === 'prevu' || r.statut === 'a-payer')
          .sort((a, b) => a.debut.localeCompare(b.debut));
        // Hors ligne : seuls les rendez-vous confirmés sont gardés sur le téléphone.
        retenirRendezVous(
          localStorage,
          prevus.filter((r) => r.statut === 'prevu'),
        );
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
              {r.statut === 'a-payer' && (
                <p>
                  <span aria-hidden="true">⏳</span> En attente de paiement
                </p>
              )}
              <div class="actions">
                {r.statut === 'a-payer' ? (
                  <button
                    class="principal"
                    onClick={() => p.allerA({ nom: 'paiement', rendezVousId: r.id })}
                  >
                    <span aria-hidden="true">💳</span> Payer
                  </button>
                ) : (
                  <button
                    class="principal"
                    onClick={() => p.allerA({ nom: 'visio', rendezVous: r })}
                  >
                    <span aria-hidden="true">📹</span> Rejoindre
                  </button>
                )}
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
      <button onClick={() => p.allerA({ nom: 'documents' })}>
        <span aria-hidden="true">📄</span> Mes comptes-rendus et ordonnances
      </button>
      <button onClick={() => p.allerA({ nom: 'partages' })}>
        <span aria-hidden="true">🔒</span> Mes partages et accès
      </button>
      <button onClick={() => p.allerA({ nom: 'recus' })}>
        <span aria-hidden="true">🧾</span> Mes reçus
      </button>
      <button onClick={() => p.allerA({ nom: 'changer-numero', depuis: { nom: 'rendez-vous' } })}>
        <span aria-hidden="true">📱</span> Changer mon numéro
      </button>
    </section>
  );
}

function Creneaux(p: {
  praticienId: string;
  retour: (message?: string) => void;
  /** Réservation payante (ADR-0017) : le créneau est retenu, le paiement s'ouvre. */
  payer: (rendezVousId: string) => void;
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
              .then((r) =>
                r.statut === 'a-payer' ? p.payer(r.id) : p.retour('Rendez-vous réservé.'),
              )
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
