// Paiement d'une réservation par mobile money (ADR-0017). Chargé seulement à la demande (budget de
// l'ouverture). Le patient voit le montant et le temps qui reste, choisit l'opérateur et le numéro
// qui paie (le sien ou celui d'un proche), puis valide sur son téléphone. Le numéro n'est jamais
// gardé dans le navigateur ; le rendez-vous n'est confirmé que par le serveur.
import { useEffect, useState } from 'preact/hooks';
import { appelReseau, creerTraducteur, MOTIF_NIVEAU_INSUFFISANT, suivre } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { frPaiement } from './textes-fr-paiement.js';

const t = creerTraducteur(frPaiement, CONFIG.langue);

interface Reservation {
  id: string;
  statut: 'a-payer' | 'prevu' | 'annule';
  expireLe?: string;
  paiement?: { id: string; montant: number; devise: string };
}

type Etape =
  | { nom: 'chargement' }
  | { nom: 'saisie' }
  | { nom: 'attente'; operateur: string }
  | { nom: 'fin'; message: string };

class ErreurPaiement extends Error {
  /** Refus parce que le code SMS manque ou a plus de 15 minutes (ADR-0022). */
  niveauInsuffisant = false;
}

async function appeler<T>(
  jeton: string,
  methode: 'GET' | 'POST',
  url: string,
  corps?: unknown,
): Promise<T> {
  let r: Response;
  try {
    r = await appelReseau(url, {
      method: methode,
      headers: {
        authorization: `Bearer ${jeton}`,
        ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    });
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurPaiement((e as Error).message);
  }
  if (!r.ok) {
    // Messages des services, déjà en phrases simples ; sinon un message général.
    const e = (await r.json().catch(() => ({}))) as { erreur?: string; motif?: string };
    const x = new ErreurPaiement(e.erreur ?? t('paiement.indisponible'));
    x.niveauInsuffisant = r.status === 401 && e.motif === MOTIF_NIVEAU_INSUFFISANT;
    throw x;
  }
  return (await r.json()) as T;
}

const montant = (valeur: number, devise: string) =>
  new Intl.NumberFormat(CONFIG.langue, {
    style: 'currency',
    currency: devise,
    maximumFractionDigits: 0,
  }).format(valeur);

const minutesRestantes = (iso: string) =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));

export function Paiement(p: {
  jeton: string;
  rendezVousId: string;
  retour: (message?: string) => void;
  /** Redemande le code SMS, puis rouvre cet écran (ADR-0022). */
  confirmer: () => void;
}) {
  const [reservation, setReservation] = useState<Reservation>();
  const [etape, setEtape] = useState<Etape>({ nom: 'chargement' });
  const [erreur, setErreur] = useState<string>();
  const [operateur, setOperateur] = useState(CONFIG.operateurs[0]?.code ?? '');

  /** Le serveur dit où en est la réservation : confirmée, annulée, ou toujours à payer. */
  const verifier = async (): Promise<Reservation> => {
    const r = await appeler<Reservation>(
      p.jeton,
      'POST',
      `${CONFIG.api}/rendez-vous/${encodeURIComponent(p.rendezVousId)}/paiement`,
    );
    setReservation((avant) => {
      const paiement = r.paiement ?? avant?.paiement;
      return { ...r, ...(paiement ? { paiement } : {}) };
    });
    if (r.statut === 'prevu') {
      setEtape({ nom: 'fin', message: t('paiement.recu') });
    } else if (r.statut === 'annule') {
      setEtape({ nom: 'fin', message: t('paiement.delaiDepasse') });
    }
    return r;
  };

  useEffect(() => {
    verifier()
      .then((r) => {
        if (r.statut === 'a-payer') setEtape({ nom: 'saisie' });
      })
      .catch((e: unknown) => setEtape({ nom: 'fin', message: (e as Error).message }));
  }, []);

  // Pendant l'attente : le paiement est relu, puis le rendez-vous dès qu'il est payé ou refusé.
  // `suivre` : une requête à la fois, 3 s puis 10 s après la première minute, rien en arrière-plan
  // (le patient valide sur l'écran de son opérateur), vérification dès son retour.
  useEffect(() => {
    if (etape.nom !== 'attente' || !reservation?.paiement) return;
    const id = reservation.paiement.id;
    return suivre(async () => {
      const paiement = await appeler<{ statut: string }>(
        p.jeton,
        'GET',
        `${CONFIG.apiPaiement}/paiements/${id}`,
      );
      if (paiement.statut === 'echoue') {
        setErreur(t('paiement.echoue'));
        setEtape({ nom: 'saisie' });
        return true;
      }
      if (paiement.statut !== 'paye') return false;
      return (await verifier()).statut !== 'a-payer';
    });
  }, [etape.nom, reservation?.paiement?.id]);

  const payer = async (e: Event) => {
    e.preventDefault();
    const formulaire = e.currentTarget as HTMLFormElement;
    const numero = String(new FormData(formulaire).get('numero') ?? '');
    if (!reservation?.paiement) return;
    setErreur(undefined);
    try {
      await appeler(
        p.jeton,
        'POST',
        `${CONFIG.apiPaiement}/paiements/${reservation.paiement.id}/collecte`,
        {
          operateur,
          numero,
        },
      );
      // Le numéro n'est pas gardé : le champ est vidé dès l'envoi.
      formulaire.reset();
      setEtape({ nom: 'attente', operateur });
    } catch (x) {
      if (x instanceof ErreurPaiement && x.niveauInsuffisant) {
        formulaire.reset();
        return p.confirmer();
      }
      setErreur((x as Error).message);
    }
  };

  const nomOperateur = (code: string) =>
    CONFIG.operateurs.find((o) => o.code === code)?.nom ?? code;

  return (
    <section>
      <h2>
        <span aria-hidden="true">💳</span> {t('paiement.titre')}
      </h2>
      {erreur && (
        <p class="message" role="alert">
          {erreur}
        </p>
      )}
      {etape.nom === 'chargement' ? (
        <p aria-live="polite">{t('paiement.chargement')}</p>
      ) : etape.nom === 'fin' ? (
        <>
          <p role="status">{etape.message}</p>
          <button class="principal" onClick={() => p.retour(etape.message)}>
            {t('paiement.mesRendezVous')}
          </button>
        </>
      ) : (
        <>
          {reservation?.paiement && (
            <p>
              <strong data-montant>
                {montant(reservation.paiement.montant, reservation.paiement.devise)}
              </strong>
              {reservation.expireLe && (
                <> {t('paiement.delai', { nombre: minutesRestantes(reservation.expireLe) })}</>
              )}
            </p>
          )}
          {etape.nom === 'attente' ? (
            <p role="status" aria-live="polite">
              <span aria-hidden="true">📱</span>{' '}
              {t('paiement.validez', { operateur: nomOperateur(etape.operateur) })}
            </p>
          ) : (
            <form onSubmit={payer}>
              <fieldset>
                <legend>{t('paiement.operateur')}</legend>
                {CONFIG.operateurs.map((o) => (
                  <label key={o.code} class="choix">
                    <input
                      type="radio"
                      name="operateur"
                      value={o.code}
                      defaultChecked={o.code === operateur}
                      onChange={() => setOperateur(o.code)}
                    />{' '}
                    {o.nom}
                  </label>
                ))}
              </fieldset>
              <label>
                {t('paiement.numero')}
                <input
                  name="numero"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  required
                  placeholder={`+${CONFIG.indicatif} …`}
                />
              </label>
              <button class="principal" type="submit">
                <span aria-hidden="true">✅</span> {t('paiement.payer')}
              </button>
            </form>
          )}
          <button onClick={() => p.retour()}>{t('paiement.plusTard')}</button>
        </>
      )}
    </section>
  );
}
