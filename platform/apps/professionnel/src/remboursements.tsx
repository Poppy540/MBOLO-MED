// « Remboursements à valider » (ADR-0017), rôle validation-remboursement (double authentification) :
// la plateforme a préparé le remboursement d'un paiement reçu pour un rendez-vous annulé ; la
// personne habilitée valide ou refuse, selon les règles du porteur de projet. Aucun texte libre ;
// ni le patient ni le numéro ne sont affichés. Chargé à la demande.
import { useEffect, useState } from 'preact/hooks';
import { appelReseau, creerTraducteur } from '@mbolo/client-web';
import { CONFIG } from './config.js';
import { frRemboursements } from './textes-fr-remboursements.js';

const t = creerTraducteur(frRemboursements, CONFIG.langue);

interface Remboursement {
  id: string;
  statut: string;
  montant: number;
  devise: string;
  prepareLe: string;
  operateur?: string;
}

class ErreurRemboursement extends Error {}

async function appeler<T>(
  jeton: string,
  methode: 'GET' | 'POST',
  chemin: string,
  corps?: unknown,
): Promise<T> {
  let r: Response;
  try {
    r = await appelReseau(`${CONFIG.apiPaiement}${chemin}`, {
      method: methode,
      headers: {
        authorization: `Bearer ${jeton}`,
        ...(corps !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    });
  } catch (e) {
    // Réseau coupé ou trop lent (délai dépassé) : message simple d'`appelReseau`.
    throw new ErreurRemboursement((e as Error).message);
  }
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { erreur?: string };
    throw new ErreurRemboursement(e.erreur ?? t('remb.indisponible'));
  }
  return (await r.json()) as T;
}

const montant = (valeur: number, devise: string) =>
  new Intl.NumberFormat(CONFIG.langue, {
    style: 'currency',
    currency: devise,
    maximumFractionDigits: 0,
  }).format(valeur);

export function Remboursements(p: {
  jeton: string;
  quand: (iso: string) => string;
  signaler: (m: string) => void;
}) {
  const [liste, setListe] = useState<Remboursement[]>();
  // Deux clics pour une décision : on choisit, puis on confirme (jamais de décision par erreur).
  const [choix, setChoix] = useState<{ id: string; decision: 'valide' | 'refuse' }>();

  const charger = () =>
    appeler<{ remboursements: Remboursement[] }>(p.jeton, 'GET', '/remboursements')
      .then((r) => setListe(r.remboursements))
      .catch((e: unknown) => p.signaler((e as Error).message));
  useEffect(() => void charger(), []);

  const decider = async () => {
    if (!choix) return;
    try {
      const r = await appeler<Remboursement>(
        p.jeton,
        'POST',
        `/remboursements/${choix.id}/decision`,
        { decision: choix.decision },
      );
      p.signaler(
        t(
          r.statut === 'effectue'
            ? 'remb.verse'
            : r.statut === 'valide'
              ? 'remb.valide'
              : 'remb.refuse',
        ),
      );
    } catch (e) {
      p.signaler((e as Error).message);
    }
    setChoix(undefined);
    await charger();
  };

  return (
    <section>
      <h2>
        <span aria-hidden="true">↩️</span> {t('remb.titre')}
      </h2>
      <p>{t('remb.explication')}</p>
      {liste === undefined ? (
        <p aria-live="polite">{t('remb.chargement')}</p>
      ) : liste.length === 0 ? (
        <p>{t('remb.aucun')}</p>
      ) : (
        <ul class="liste" aria-label={t('remb.titre')}>
          {liste.map((r) => (
            <li key={r.id} data-remboursement={r.id}>
              <strong>{montant(r.montant, r.devise)}</strong>
              {r.operateur && <span> — {r.operateur}</span>}
              <br />
              <small>{t('remb.prepareLe', { date: p.quand(r.prepareLe) })}</small>
              {choix?.id === r.id ? (
                <div class="actions">
                  <button class="principal" onClick={() => void decider()}>
                    {t(
                      choix.decision === 'valide'
                        ? 'remb.confirmerRemboursement'
                        : 'remb.confirmerRefus',
                    )}
                  </button>
                  <button onClick={() => setChoix(undefined)}>{t('remb.annuler')}</button>
                </div>
              ) : (
                <div class="actions">
                  <button onClick={() => setChoix({ id: r.id, decision: 'valide' })}>
                    {t('remb.valider')}
                  </button>
                  <button onClick={() => setChoix({ id: r.id, decision: 'refuse' })}>
                    {t('remb.refuser')}
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
